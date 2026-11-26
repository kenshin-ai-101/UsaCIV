import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  BIOME_COLORS_DAY,
  BIOME_COLORS_MIDNIGHT,
  hexToRgb01,
  sampleRamp,
} from '../features/lenses/lensConfig';
import type { MapCamera } from '../engine/camera';
import type { LensMeta, WorldHexData, WorldMeta } from '../types/world';

interface MinimapProps {
  world: WorldHexData;
  meta: WorldMeta;
  activeLens: LensMeta | null;
  cameraRef: React.MutableRefObject<MapCamera>;
  camTick: number;
  onJump: (wx: number, wy: number) => void;
}

export const Minimap: React.FC<MinimapProps> = ({ world, meta, activeLens, cameraRef, camTick, onJump }) => {
  const { minimapOpen, toggleMinimap, theme, mode } = useAppStore();
  const [dockExpanded, setDockExpanded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 216;
  const H = 132;

  const isLeftDock = mode === 'advisor' || mode === 'explorer';
  const isExpanded = isLeftDock ? dockExpanded : minimapOpen;

  useEffect(() => {
    if (!isLeftDock) setDockExpanded(false);
  }, [isLeftDock]);

  useEffect(() => {
    if (!isExpanded) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const [bx0, by0, bx1, by1] = meta.bounds_km;
    const sx = (wx: number) => ((wx - bx0) / (bx1 - bx0)) * (W - 12) + 6;
    const sy = (wy: number) => ((by1 - wy) / (by1 - by0)) * (H - 12) + 6;

    ctx.fillStyle = theme === 'daylight' ? '#BFD6E2' : '#0E1F33';
    ctx.fillRect(0, 0, W, H);

    // Live-colored minimap reflecting Terrain OR Active Lens!
    const biomes = theme === 'daylight' ? BIOME_COLORS_DAY : BIOME_COLORS_MIDNIGHT;
    const lVals = activeLens ? world.lenses[activeLens.id] : null;
    const span = activeLens ? Math.max(1e-9, activeLens.p98 - activeLens.p02) : 1;
    const catMap = new Map<number, [number, number, number]>();
    if (activeLens?.categorical && activeLens.categories) {
      for (const c of activeLens.categories) catMap.set(c.id, hexToRgb01(c.color));
    }

    for (let i = 0; i < world.n; i += 2) {
      let rgb: [number, number, number];
      if (!activeLens || !lVals) {
        rgb = biomes[world.biome[i]] ?? biomes[0];
      } else {
        const v = lVals[i];
        if (v == null) rgb = [0.22, 0.25, 0.3];
        else if (activeLens.categorical) rgb = catMap.get(Math.round(v)) ?? [0.4, 0.4, 0.4];
        else rgb = sampleRamp(activeLens.ramp, (v - activeLens.p02) / span);
      }
      ctx.fillStyle = `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;
      ctx.fillRect(sx(world.x[i]), sy(world.y[i]), 2, 2);
    }

    // Viewport rectangle
    const cam = cameraRef.current;
    const [wx0, wy1] = cam.screenToWorld(0, 0);
    const [wx1, wy0] = cam.screenToWorld(cam.width, cam.height);
    const rx0 = sx(wx0), ry0 = sy(wy1);
    const rw = Math.max(8, sx(wx1) - rx0);
    const rh = Math.max(6, sy(wy0) - ry0);
    ctx.strokeStyle = '#F2C96B';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx0, ry0, rw, rh);
    ctx.fillStyle = 'rgba(242, 201, 107, 0.12)';
    ctx.fillRect(rx0, ry0, rw, rh);
  }, [isExpanded, world, meta, activeLens, theme, camTick, cameraRef]);

  // Smoothly shift right when left Advisor / Explorer dock is open!
  const leftOffset = isLeftDock ? 'left-[468px]' : 'left-3';
  const handleToggle = () => {
    if (isLeftDock) setDockExpanded((v) => !v);
    else toggleMinimap();
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const [bx0, by0, bx1, by1] = meta.bounds_km;
    const wx = bx0 + ((px - 6) / (W - 12)) * (bx1 - bx0);
    const wy = by1 - ((py - 6) / (H - 12)) * (by1 - by0);
    onJump(wx, wy);
  };

  return (
    <div className={`fixed bottom-3 ${leftOffset} z-20 hidden lg:block transition-all duration-200`}>
      {isExpanded ? (
        <div className="atlas-panel-brass rounded-lg overflow-hidden">
          <div className="relative">
            <canvas
              ref={canvasRef}
              onClick={handleClick}
              style={{ width: W, height: H }}
              className="block cursor-crosshair"
            />
            <button
              onClick={handleToggle}
              className="absolute top-1.5 right-1.5 p-1 rounded bg-black/50 text-amber-200 hover:bg-black/75 cursor-pointer"
              title="折叠小地图"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleToggle}
          className="atlas-panel-brass px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" style={{ color: 'var(--brass)' }} /> 小地图
        </button>
      )}
    </div>
  );
};
