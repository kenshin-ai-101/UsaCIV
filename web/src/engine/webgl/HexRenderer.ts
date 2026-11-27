/**
 * WebGL2 Flat 2D Tactile Hex Renderer — Exact Reference Terrain & 19 Data Lenses
 * Renders 18,284 flat equal-area 25 km hexagons (CONUS + AK + HI) at 60-120fps with:
 *  - Exact 12-class NLCD terrain pigments + 30% multi-cover blending + elevation dust + relief tint + NW hill-shading
 *  - Exact 19 Data Lens 6-stop ramps, log/linear scales, fixed domains, 60% NW hill-shading under lenses,
 *    #55534d missing-data fill, and cool-slate out-of-band dimming
 *  - Crisp zoom-adaptive hex grid hairlines
 */
import type { LensMeta, ThemeMode, WorldHexData } from '../../types/world';
import {
  BIOME_COLORS_DAY,
  COVER_RGB,
  DIM_SLATE_RGB255,
  NO_DATA_RGB255,
  desaturateRgb,
  elevColor255,
  getNullColor,
  hash01,
  lensNorm,
  mixRgb,
  parseHex255,
  sampleRamp255,
  shadeRgb,
  type Rgb255,
} from '../../features/lenses/lensConfig';
import { getWorldTopology } from '../hexTopology';
import type { MapCamera } from '../camera';

/** Shared scale factor so adjacent rounded-km hexes tile seamlessly with zero seam gaps
 *  while matching OverlayRenderer's Canvas2D outlines to sub-pixel precision. */
export const HEX_DRAW_SCALE = 1.004;

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
  // Matches reference map.js: grid hairlines appear once Rpx > 11 (camScale > ~0.44) up to 0.14 alpha
  vec2 p = abs(v_localPos);
  float edgeFrac = max(p.x, p.x * 0.5 + p.y * 0.86602540378) / 0.86602540378;
  float fw = max(fwidth(edgeFrac), 0.001);
  float zoomVis = smoothstep(0.36, 0.82, u_camScale);
  float edgeLine = smoothstep(1.0 - fw * 1.15, 1.0 - fw * 0.15, edgeFrac) * zoomVis;
  float edgeStrength = u_isMidnight > 0.5 ? 0.14 : 0.11;
  col *= (1.0 - edgeLine * edgeStrength);

  if (u_dimAll > 0.5 && v_hi < 0.5) {
    vec3 base = u_isMidnight > 0.5 ? vec3(0.09, 0.13, 0.18) : vec3(0.84, 0.82, 0.77);
    col = mix(col, base, 0.48);
  }

  if (v_hi < -0.5) {
    vec3 fog = u_isMidnight > 0.5 ? vec3(0.10, 0.13, 0.17) : vec3(0.84, 0.82, 0.77);
    col = mix(col, fog, 0.62);
  } else if (v_hi > 1.5) {
    col = mix(col, vec3(1.0, 0.94, 0.72), 0.16);
  } else if (v_hi > 0.5) {
    col = mix(col, vec3(1.0, 0.96, 0.80), u_isMidnight > 0.5 ? 0.18 : 0.12);
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

// Reference PCT_COVER mapping: forest=3, crop=7, pasture=6, grass=5, shrub=4, wetland=8, developed=9
const PCT_MIX_COLS: { key: keyof NonNullable<WorldHexData['pct']>; rgb: Rgb255 }[] = [
  { key: 'f', rgb: COVER_RGB[3]! },
  { key: 'c', rgb: COVER_RGB[7]! },
  { key: 'p', rgb: COVER_RGB[6]! },
  { key: 'g', rgb: COVER_RGB[5]! },
  { key: 's', rgb: COVER_RGB[4]! },
  { key: 'w', rgb: COVER_RGB[8]! },
  { key: 'd', rgb: COVER_RGB[9]! },
];

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
  private shadeK: Float32Array = new Float32Array(0);

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

    // Precompute O(N) 6-neighbor NW hill-shading
    const topo = getWorldTopology(world);
    this.shadeK = topo.shadeK;

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

    const isDay = theme === 'daylight';
    const nullRgb255: Rgb255 = isDay
      ? getNullColor('daylight').map((v) => v * 255) as Rgb255
      : NO_DATA_RGB255;
    const lensVals = lens ? world.lenses[lens.id] : null;
    const catMap = new Map<number, Rgb255>();
    if (lens?.categorical && lens.categories) {
      for (const c of lens.categories) catMap.set(c.id, parseHex255(c.color));
    }

    const coverArr = world.cover;
    const pct = world.pct;
    const shadeK = this.shadeK;

    for (let i = 0; i < n; i++) {
      let c255: Rgb255;

      if (!lens || !lensVals) {
        // Exact reference landRGB + terrainRGB algorithm
        const cv = coverArr ? coverArr[i] : 0;
        const elev = world.elev[i];
        const rel = world.rcls[i];

        if (cv > 0 && COVER_RGB[cv]) {
          c255 = [...COVER_RGB[cv]!] as Rgb255;
          if (pct) {
            let tot = 0;
            let mr = 0;
            let mg = 0;
            let mb = 0;
            for (let k = 0; k < PCT_MIX_COLS.length; k++) {
              const entry = PCT_MIX_COLS[k];
              const p = pct[entry.key]?.[i] || 0;
              if (!p) continue;
              tot += p;
              mr += entry.rgb[0] * p;
              mg += entry.rgb[1] * p;
              mb += entry.rgb[2] * p;
            }
            if (tot > 0) c255 = mixRgb(c255, [mr / tot, mg / tot, mb / tot], 0.3);
          }
          // Subtle high-elevation dusty tint
          const dustT = Math.max(0, Math.min(1, (elev - 300) / 2800));
          if (dustT > 0) c255 = mixRgb(c255, [176, 160, 128], dustT * 0.28);
        } else {
          // Fallback to elevation color or Daylight legacy biome
          c255 = elevColor255(elev);
        }

        // Relief rock/snow tinting
        if (rel >= 2) {
          c255 = mixRgb(c255, rel === 3 ? [200, 204, 208] : [128, 116, 102], rel === 3 ? 0.45 : 0.32);
        } else if (rel === 1) {
          c255 = shadeRgb(c255, -0.05);
        }

        // Deterministic organic jitter + NW hill-shading
        const sk = shadeK[i] || 0;
        c255 = shadeRgb(c255, (hash01(i, 7) - 0.5) * 0.08 + sk);

        // Optional Daylight theme: softly lift toward warm WPA parchment while keeping full relief contrast
        if (isDay) {
          const dayB = BIOME_COLORS_DAY[world.biome[i]] ?? BIOME_COLORS_DAY[0];
          c255 = mixRgb(c255, [dayB[0] * 255, dayB[1] * 255, dayB[2] * 255], 0.28);
        }
      } else {
        // Exact reference applyLens algorithm (log/linear scale, 6-stop ramp, #55534d NO_DATA, cool-slate out-of-band, 60% NW hill-shading)
        const v = lensVals[i];
        if (v === null || v === undefined || Number.isNaN(v)) {
          c255 = nullRgb255;
        } else if (lens.categorical) {
          c255 = catMap.get(Math.round(v)) ?? nullRgb255;
        } else {
          const tv = lensNorm(lens, v);
          c255 = sampleRamp255(lens.ramp, tv);
        }

        if (bandSlice) {
          const inBand =
            v !== null &&
            v !== undefined &&
            !Number.isNaN(v) &&
            (lens.categorical ? Math.round(v) === bandSlice[0] : v >= bandSlice[0] && v <= bandSlice[1]);
          if (!inBand) {
            const dimTarget: Rgb255 = isDay ? [216, 212, 202] : DIM_SLATE_RGB255;
            c255 = mixRgb(desaturateRgb(c255, 0.92), dimTarget, 0.66);
          }
        }

        // Keep 60% of NW hill-shading underneath every data lens!
        const sk = shadeK[i] || 0;
        if (sk !== 0) c255 = shadeRgb(c255, sk * 0.6);
      }

      this.colData[i * 3] = Math.max(0, Math.min(1, c255[0] / 255));
      this.colData[i * 3 + 1] = Math.max(0, Math.min(1, c255[1] / 255));
      this.colData[i * 3 + 2] = Math.max(0, Math.min(1, c255[2] / 255));
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
