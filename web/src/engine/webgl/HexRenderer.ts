/**
 * WebGL2 Flat 2D Tactile Hex Renderer — Midnight Cartography & Daylight Atlas
 * Renders 18,284 flat equal-area 25 km hexagons (CONUS + AK + HI) at 60-120fps with crisp
 * true-hex edge hairlines, jewel-toned lens ramps, histogram drag-slice filtering,
 * and advisor terrain-dimming mode.
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

/** Shared scale factor so adjacent rounded-km hexes tile seamlessly with zero seam gaps
 *  while matching OverlayRenderer's Canvas2D outlines to sub-pixel precision. */
export const HEX_DRAW_SCALE = 1.003;

const VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;

layout(location = 1) in vec3 a_instXYR;
layout(location = 2) in vec3 a_instCol;
layout(location = 3) in float a_instHi;

uniform vec2 u_camCenter;
uniform float u_camScale;
uniform vec2 u_viewport;
uniform vec2 u_physViewport;
uniform float u_dpr;

out vec3 v_color;
out float v_hi;
out vec2 v_localPos;

void main() {
  float rad = a_instXYR.z * ${HEX_DRAW_SCALE.toFixed(4)};
  vec2 worldPos = a_instXYR.xy + a_pos * rad;

  vec2 screenPx = vec2(
    (worldPos.x - u_camCenter.x) * u_camScale + u_viewport.x * 0.5,
    (u_camCenter.y - worldPos.y) * u_camScale + u_viewport.y * 0.5
  );
  vec2 physPx = screenPx * u_dpr;
  vec2 ndc = vec2(
    (physPx.x / u_physViewport.x) * 2.0 - 1.0,
    1.0 - (physPx.y / u_physViewport.y) * 2.0
  );

  gl_Position = vec4(ndc, 0.0, 1.0);

  v_color = a_instCol;
  v_hi = a_instHi;
  v_localPos = a_pos;
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec3 v_color;
in float v_hi;
in vec2 v_localPos;

uniform float u_isMidnight;
uniform float u_dimAll;
uniform float u_camScale;

out vec4 outColor;

void main() {
  vec3 col = v_color;

  // Exact pointy-top hex edge distance (0 at center, 1.0 along all 6 straight edges)
  vec2 p = abs(v_localPos);
  float edgeFrac = max(p.x, p.x * 0.5 + p.y * 0.86602540378) / 0.86602540378;
  float fw = max(fwidth(edgeFrac), 0.001);
  // Crisp, flat 1px hex grid hairline that fades smoothly when zoomed far out
  float zoomVis = smoothstep(0.20, 0.58, u_camScale);
  float edgeLine = smoothstep(1.0 - fw * 1.15, 1.0 - fw * 0.15, edgeFrac) * zoomVis;
  float edgeStrength = u_isMidnight > 0.5 ? 0.14 : 0.11;
  col *= (1.0 - edgeLine * edgeStrength);

  if (u_dimAll > 0.5 && v_hi < 0.5) {
    vec3 base = u_isMidnight > 0.5 ? vec3(0.09, 0.13, 0.18) : vec3(0.84, 0.82, 0.77);
    col = mix(col, base, 0.48);
  }

  if (v_hi < -0.5) {
    vec3 fog = u_isMidnight > 0.5 ? vec3(0.07, 0.11, 0.16) : vec3(0.84, 0.82, 0.77);
    col = mix(col, fog, 0.66);
  } else if (v_hi > 1.5) {
    col = mix(col, vec3(1.0, 0.94, 0.72), 0.18);
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

function buildFlatHexGeometry(): { data: Float32Array; vertexCount: number } {
  const verts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i - 30);
    verts.push([Math.cos(ang), Math.sin(ang)]);
  }

  const out: number[] = [];
  for (let i = 0; i < 6; i++) {
    const [ax, ay] = verts[i];
    const [bx, by] = verts[(i + 1) % 6];
    out.push(0, 0, ax, ay, bx, by);
  }

  return { data: new Float32Array(out), vertexCount: out.length / 2 };
}

export class HexRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vertexCount = 0;
  private instanceCount = 0;

  private colBuf: WebGLBuffer;
  private hiBuf: WebGLBuffer;
  private colData: Float32Array = new Float32Array(0);
  private hiData: Float32Array = new Float32Array(0);

  private uCamCenter: WebGLUniformLocation;
  private uCamScale: WebGLUniformLocation;
  private uViewport: WebGLUniformLocation;
  private uPhysViewport: WebGLUniformLocation;
  private uDpr: WebGLUniformLocation;
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
    this.uPhysViewport = gl.getUniformLocation(prog, 'u_physViewport')!;
    this.uDpr = gl.getUniformLocation(prog, 'u_dpr')!;
    this.uIsMidnight = gl.getUniformLocation(prog, 'u_isMidnight')!;
    this.uDimAll = gl.getUniformLocation(prog, 'u_dimAll')!;

    this.vao = gl.createVertexArray()!;
    this.colBuf = gl.createBuffer()!;
    this.hiBuf = gl.createBuffer()!;

    gl.bindVertexArray(this.vao);
    const geom = buildFlatHexGeometry();
    this.vertexCount = geom.vertexCount;
    const geomBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, geomBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geom.data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
  }

  loadWorld(world: WorldHexData) {
    const gl = this.gl;
    const n = world.n;
    this.instanceCount = n;

    const xyr = new Float32Array(n * 3);
    this.colData = new Float32Array(n * 3);
    this.hiData = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      xyr[i * 3] = world.x[i];
      xyr[i * 3 + 1] = world.y[i];
      xyr[i * 3 + 2] = world.r[i];
    }

    gl.bindVertexArray(this.vao);

    const xyrBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, xyrBuf);
    gl.bufferData(gl.ARRAY_BUFFER, xyr, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.colData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.hiBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.hiData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

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

    for (let i = 0; i < n; i++) {
      let rgb: [number, number, number];

      if (!lens || !lensVals) {
        const b = biomes[world.biome[i]] ?? biomes[0];
        const e = world.elev[i];
        // Subtle deterministic tile variation so broad plains & forests feel organic while staying flat
        const jitter = (((i * 2654435761) >>> 24) / 255 - 0.5) * 0.04;
        let r = b[0] + jitter;
        let g = b[1] + jitter;
        let bl = b[2] + jitter * 0.7;

        if (e > 2100) {
          const snowT = Math.min(0.68, (e - 2100) / 1450);
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

      this.colData[i * 3] = rgb[0];
      this.colData[i * 3 + 1] = rgb[1];
      this.colData[i * 3 + 2] = rgb[2];
    }

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colData);
  }

  updateHighlights(highlightSet: Set<number> | null, hoveredHex: number) {
    const n = this.instanceCount;
    if (n === 0) return;
    const hasFilter = highlightSet !== null && highlightSet.size > 0;
    for (let i = 0; i < n; i++) {
      if (i === hoveredHex) this.hiData[i] = 2.0;
      else if (hasFilter) this.hiData[i] = highlightSet!.has(i) ? 1.0 : -1.0;
      else this.hiData[i] = 0.0;
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
    gl.uniform2f(this.uPhysViewport, pw, ph);
    gl.uniform1f(this.uDpr, dpr);
    gl.uniform1f(this.uIsMidnight, theme === 'midnight' ? 1.0 : 0.0);
    gl.uniform1f(this.uDimAll, dimAll ? 1.0 : 0.0);

    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, this.instanceCount);
    gl.bindVertexArray(null);
  }
}
