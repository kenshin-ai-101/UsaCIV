/**
 * WebGL2 2.5D Tactile Relief Hex Renderer — Upgraded for Midnight Cartography & Daylight Atlas
 * Renders 18,284 extruded 25 km hex prisms (CONUS + AK + HI) at 60-120fps with NW sun hillshade,
 * rich jewel-toned lens ramps, histogram drag-slice filtering, and advisor terrain-dimming mode.
 */
import type { LensMeta, ThemeMode, WorldHexData } from '../../types/world';
import {
  BIOME_COLORS_DAY,
  BIOME_COLORS_MIDNIGHT,
  getNullColor,
  hexToRgb01,
  sampleRamp,
} from '../../features/lenses/lensConfig';
import type { MapCamera } from '../camera';

const VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_topMask;
layout(location = 2) in float a_shade;

layout(location = 3) in vec3 a_instXYR;
layout(location = 4) in float a_instElev;
layout(location = 5) in vec3 a_instCol;
layout(location = 6) in float a_instHi;

uniform vec2 u_camCenter;
uniform float u_camScale;
uniform vec2 u_viewport;
uniform float u_extrudeScale;

out vec3 v_color;
out float v_hi;
out float v_topMask;
out float v_edgeDist;

void main() {
  float rad = a_instXYR.z * 0.996;
  float lift = a_instElev * u_extrudeScale * a_topMask;
  vec2 worldPos = a_instXYR.xy + a_pos * rad + vec2(0.0, lift);

  vec2 screenPx = vec2(
    (worldPos.x - u_camCenter.x) * u_camScale + u_viewport.x * 0.5,
    (u_camCenter.y - worldPos.y) * u_camScale + u_viewport.y * 0.5
  );
  vec2 ndc = vec2(
    (screenPx.x / u_viewport.x) * 2.0 - 1.0,
    1.0 - (screenPx.y / u_viewport.y) * 2.0
  );

  gl_Position = vec4(ndc, 0.0, 1.0);

  float light = a_shade;
  if (a_topMask > 0.5) {
    light += clamp(a_instElev * 0.0085, 0.0, 0.10);
  }
  v_color = a_instCol * light;
  v_hi = a_instHi;
  v_topMask = a_topMask;
  v_edgeDist = length(a_pos);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec3 v_color;
in float v_hi;
in float v_topMask;
in float v_edgeDist;

uniform float u_isMidnight;
uniform float u_dimAll;

out vec4 outColor;

void main() {
  vec3 col = v_color;

  // Delicate tactile hex edge bevel on top face
  if (v_topMask > 0.5 && v_edgeDist > 0.92) {
    float rim = smoothstep(0.92, 1.0, v_edgeDist);
    col *= (1.0 - rim * (u_isMidnight > 0.5 ? 0.14 : 0.08));
  }

  if (u_dimAll > 0.5 && v_hi < 0.5) {
    vec3 base = u_isMidnight > 0.5 ? vec3(0.09, 0.13, 0.18) : vec3(0.84, 0.82, 0.77);
    col = mix(col, base, 0.48);
  }

  if (v_hi < -0.5) {
    vec3 fog = u_isMidnight > 0.5 ? vec3(0.07, 0.11, 0.16) : vec3(0.84, 0.82, 0.77);
    col = mix(col, fog, 0.66);
  } else if (v_hi > 1.5) {
    col = mix(col, vec3(1.0, 0.92, 0.62), 0.34);
  } else if (v_hi > 0.5) {
    col = mix(col, vec3(1.0, 0.96, 0.80), u_isMidnight > 0.5 ? 0.22 : 0.14);
  }
  outColor = vec4(col, 1.0);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || 'Shader compile error');
  }
  return sh;
}

function buildHexPrismGeometry(): { data: Float32Array; vertexCount: number } {
  const verts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i + 30);
    verts.push([Math.cos(ang), Math.sin(ang)]);
  }

  const out: number[] = [];
  const pushV = (x: number, y: number, top: number, shade: number) => {
    out.push(x, y, top, shade);
  };

  const walls: [number, number, number][] = [
    [3, 4, 0.76],
    [4, 5, 0.60],
    [5, 0, 0.66],
    [2, 3, 0.84],
  ];
  for (const [iA, iB, shade] of walls) {
    const [ax, ay] = verts[iA];
    const [bx, by] = verts[iB];
    pushV(ax, ay, 1, shade);
    pushV(bx, by, 1, shade);
    pushV(bx, by, 0, shade * 0.9);
    pushV(ax, ay, 1, shade);
    pushV(bx, by, 0, shade * 0.9);
    pushV(ax, ay, 0, shade * 0.9);
  }

  for (let i = 0; i < 6; i++) {
    const [ax, ay] = verts[i];
    const [bx, by] = verts[(i + 1) % 6];
    const sA = 1.0 + (-ax * 0.035 + ay * 0.045);
    const sB = 1.0 + (-bx * 0.035 + by * 0.045);
    pushV(0, 0, 1, 1.03);
    pushV(ax, ay, 1, sA);
    pushV(bx, by, 1, sB);
  }

  return { data: new Float32Array(out), vertexCount: out.length / 4 };
}

export class HexRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vertexCount = 0;
  private instanceCount = 0;
  private order: Int32Array = new Int32Array(0);

  private colBuf: WebGLBuffer;
  private hiBuf: WebGLBuffer;
  private colData: Float32Array = new Float32Array(0);
  private hiData: Float32Array = new Float32Array(0);

  private uCamCenter: WebGLUniformLocation;
  private uCamScale: WebGLUniformLocation;
  private uViewport: WebGLUniformLocation;
  private uExtrudeScale: WebGLUniformLocation;
  private uIsMidnight: WebGLUniformLocation;
  private uDimAll: WebGLUniformLocation;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is required');
    this.gl = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'Program link error');
    }
    this.prog = prog;

    this.uCamCenter = gl.getUniformLocation(prog, 'u_camCenter')!;
    this.uCamScale = gl.getUniformLocation(prog, 'u_camScale')!;
    this.uViewport = gl.getUniformLocation(prog, 'u_viewport')!;
    this.uExtrudeScale = gl.getUniformLocation(prog, 'u_extrudeScale')!;
    this.uIsMidnight = gl.getUniformLocation(prog, 'u_isMidnight')!;
    this.uDimAll = gl.getUniformLocation(prog, 'u_dimAll')!;

    this.vao = gl.createVertexArray()!;
    this.colBuf = gl.createBuffer()!;
    this.hiBuf = gl.createBuffer()!;

    gl.bindVertexArray(this.vao);
    const geom = buildHexPrismGeometry();
    this.vertexCount = geom.vertexCount;
    const geomBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, geomBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geom.data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);
  }

  loadWorld(world: WorldHexData) {
    const gl = this.gl;
    const n = world.n;
    this.instanceCount = n;

    const idx = Array.from({ length: n }, (_, i) => i);
    idx.sort((a, b) => world.y[b] - world.y[a] || world.x[a] - world.x[b]);
    this.order = new Int32Array(idx);

    const xyr = new Float32Array(n * 3);
    const elev = new Float32Array(n);
    this.colData = new Float32Array(n * 3);
    this.hiData = new Float32Array(n);

    for (let drawPos = 0; drawPos < n; drawPos++) {
      const i = this.order[drawPos];
      xyr[drawPos * 3] = world.x[i];
      xyr[drawPos * 3 + 1] = world.y[i];
      xyr[drawPos * 3 + 2] = world.r[i];

      const em = Math.max(0, world.elev[i]);
      const regScale = world.reg[i] === 1 ? 0.42 : 1.0;
      elev[drawPos] = (1.2 + Math.pow(em / 3400, 1.15) * 16.0) * regScale;
    }

    gl.bindVertexArray(this.vao);

    const xyrBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, xyrBuf);
    gl.bufferData(gl.ARRAY_BUFFER, xyr, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    const elevBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, elevBuf);
    gl.bufferData(gl.ARRAY_BUFFER, elev, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(4, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.colData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(5, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.hiBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.hiData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(6, 1);

    gl.bindVertexArray(null);
  }

  updateColors(world: WorldHexData, lens: LensMeta | null, theme: ThemeMode, bandSlice: [number, number] | null) {
    const n = this.instanceCount;
    if (n === 0) return;
    const biomes = theme === 'daylight' ? BIOME_COLORS_DAY : BIOME_COLORS_MIDNIGHT;
    const nullCol = getNullColor(theme);
    const lensVals = lens ? world.lenses[lens.id] : null;
    const catMap = new Map<number, [number, number, number]>();
    if (lens?.categorical && lens.categories) {
      for (const c of lens.categories) catMap.set(c.id, hexToRgb01(c.color));
    }
    const span = lens ? Math.max(1e-9, lens.p98 - lens.p02) : 1;

    for (let drawPos = 0; drawPos < n; drawPos++) {
      const i = this.order[drawPos];
      let rgb: [number, number, number];

      if (!lens || !lensVals) {
        const b = biomes[world.biome[i]] ?? biomes[0];
        // Subtle painterly elevation variation & snowy mountain crests
        const e = world.elev[i];
        // Deterministic micro-texture noise so large plains/forests look hand-painted, not flat plastic
        const jitter = (((i * 2654435761) >>> 24) / 255 - 0.5) * 0.045;
        let r = b[0] + jitter;
        let g = b[1] + jitter;
        let bl = b[2] + jitter * 0.7;

        if (e > 2100) {
          const snowT = Math.min(0.7, (e - 2100) / 1450);
          const peak = theme === 'daylight' ? [0.95, 0.93, 0.90] : [0.85, 0.85, 0.84];
          r = r + (peak[0] - r) * snowT;
          g = g + (peak[1] - g) * snowT;
          bl = bl + (peak[2] - bl) * snowT;
        }
        rgb = [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, bl))];
      } else {
        const v = lensVals[i];
        if (v === null || v === undefined || Number.isNaN(v)) {
          rgb = nullCol;
        } else if (lens.categorical) {
          rgb = catMap.get(Math.round(v)) ?? nullCol;
        } else {
          const t = (v - lens.p02) / span;
          rgb = sampleRamp(lens.ramp, t);
        }
      }

      if (lens && lensVals && bandSlice) {
        const v = lensVals[i];
        const inBand =
          v !== null && v !== undefined && (lens.categorical ? Math.round(v) === bandSlice[0] : v >= bandSlice[0] && v <= bandSlice[1]);
        if (!inBand) {
          const bg = theme === 'daylight' ? [0.85, 0.83, 0.78] : [0.09, 0.13, 0.19];
          rgb = [rgb[0] * 0.22 + bg[0] * 0.78, rgb[1] * 0.22 + bg[1] * 0.78, rgb[2] * 0.22 + bg[2] * 0.78];
        }
      }

      this.colData[drawPos * 3] = rgb[0];
      this.colData[drawPos * 3 + 1] = rgb[1];
      this.colData[drawPos * 3 + 2] = rgb[2];
    }

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colData);
  }

  updateHighlights(highlightSet: Set<number> | null, hoveredHex: number) {
    const n = this.instanceCount;
    if (n === 0) return;
    const hasFilter = highlightSet !== null && highlightSet.size > 0;
    for (let drawPos = 0; drawPos < n; drawPos++) {
      const hexId = this.order[drawPos];
      if (hexId === hoveredHex) this.hiData[drawPos] = 2.0;
      else if (hasFilter) this.hiData[drawPos] = highlightSet!.has(hexId) ? 1.0 : -1.0;
      else this.hiData[drawPos] = 0.0;
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.hiBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.hiData);
  }

  render(camera: MapCamera, theme: ThemeMode, dpr: number, dimAll = false) {
    const gl = this.gl;
    const pw = Math.round(camera.width * dpr);
    const ph = Math.round(camera.height * dpr);
    if (gl.canvas.width !== pw || gl.canvas.height !== ph) {
      gl.canvas.width = pw;
      gl.canvas.height = ph;
    }

    gl.viewport(0, 0, pw, ph);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.instanceCount === 0) return;

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uCamCenter, camera.cx, camera.cy);
    gl.uniform1f(this.uCamScale, camera.scale);
    gl.uniform2f(this.uViewport, camera.width, camera.height);
    gl.uniform1f(this.uExtrudeScale, 1.0);
    gl.uniform1f(this.uIsMidnight, theme === 'midnight' ? 1.0 : 0.0);
    gl.uniform1f(this.uDimAll, dimAll ? 1.0 : 0.0);

    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, this.instanceCount);
    gl.bindVertexArray(null);
  }
}
