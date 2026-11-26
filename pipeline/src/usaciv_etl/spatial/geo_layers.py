"""Spatial sampling & vector projection onto the unified CONUS + AK/HI 25 km hex map."""
from __future__ import annotations

import json
import math
from pathlib import Path

import geopandas as gpd
import numpy as np
import polars as pl
import pyproj
import rasterio
from scipy.spatial import cKDTree
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Polygon, Point

from ..grid.hex_grid import CRS_AK, CRS_CONUS, CRS_HI, CONUS_FIPS

# Transformers from WGS84 (lon, lat) -> native Albers (meters)
_T_CONUS = pyproj.Transformer.from_crs("EPSG:4326", CRS_CONUS, always_xy=True)
_T_AK = pyproj.Transformer.from_crs("EPSG:4326", CRS_AK, always_xy=True)
_T_HI = pyproj.Transformer.from_crs("EPSG:4326", CRS_HI, always_xy=True)


class UnifiedProjector:
    """Projects any WGS84 (lon, lat) or geometry into our unified CONUS + AK/HI display km plane."""

    def __init__(self, grid_meta: dict):
        self.insets = grid_meta.get("insets", {})
        self.ak = self.insets.get("AK")
        self.hi = self.insets.get("HI")

    def classify_region(self, lon: float, lat: float, state_abbr: str | None = None, state_fips: str | None = None) -> int | None:
        if state_fips == "02" or state_abbr == "AK":
            return 1
        if state_fips == "15" or state_abbr == "HI":
            return 2
        if state_fips in CONUS_FIPS:
            return 0
        # Fallback by geographic bounding box
        if 18.0 <= lat <= 23.0 and -161.5 <= lon <= -154.0:
            return 2
        if 50.0 <= lat <= 72.5 and (-180.0 <= lon <= -129.0 or 170.0 <= lon <= 180.0):
            return 1
        if 23.5 <= lat <= 50.0 and -126.0 <= lon <= -65.0:
            return 0
        return None

    def project_point(self, lon: float, lat: float, state_abbr: str | None = None, state_fips: str | None = None) -> tuple[float, float, int] | None:
        reg = self.classify_region(lon, lat, state_abbr, state_fips)
        if reg is None:
            return None
        if reg == 0:
            xm, ym = _T_CONUS.transform(lon, lat)
            return xm / 1000.0, ym / 1000.0, 0
        if reg == 1 and self.ak:
            xm, ym = _T_AK.transform(lon, lat)
            nx, ny = xm / 1000.0, ym / 1000.0
            if nx < -1750 or nx > 1550 or ny < 350 or ny > 2450:
                return None
            mx = self.ak["origin_x"] + (nx - self.ak["native_min_x"]) * self.ak["scale"]
            my = self.ak["origin_y"] + (ny - self.ak["native_min_y"]) * self.ak["scale"]
            return mx, my, 1
        if reg == 2 and self.hi:
            xm, ym = _T_HI.transform(lon, lat)
            nx, ny = xm / 1000.0, ym / 1000.0
            if nx < -400 or nx > 300 or ny < 500 or ny > 1100:
                return None
            mx = self.hi["origin_x"] + (nx - self.hi["native_min_x"]) * self.hi["scale"]
            my = self.hi["origin_y"] + (ny - self.hi["native_min_y"]) * self.hi["scale"]
            return mx, my, 2
        return None


def sample_etopo(hex_df: pl.DataFrame, raw_dir: Path) -> pl.DataFrame:
    """Attach mean elevation (m) and local relief std (m) from NOAA ETOPO1 CSV grids."""
    etopo_files = [
        raw_dir / "etopo/etopo_conus.csv",
        raw_dir / "etopo/etopo_ak.csv",
        raw_dir / "etopo/etopo_hi.csv",
    ]
    pts_lon, pts_lat, pts_alt = [], [], []
    for fp in etopo_files:
        if not fp.exists():
            continue
        # ERDDAP CSV has 2 header rows: column names + units
        df = pl.read_csv(fp, skip_rows_after_header=1, infer_schema_length=1000)
        pts_lat.append(df["latitude"].cast(pl.Float64).to_numpy())
        pts_lon.append(df["longitude"].cast(pl.Float64).to_numpy())
        pts_alt.append(df["altitude"].cast(pl.Float64).to_numpy())

    if not pts_alt:
        print("[etopo] WARNING: no ETOPO1 files found, setting elevation to 0")
        return hex_df.with_columns([
            pl.lit(0.0).alias("elev_m"),
            pl.lit(0.0).alias("relief_m"),
            pl.lit(0).alias("relief_cls"),
        ])

    all_lon = np.concatenate(pts_lon)
    all_lat = np.concatenate(pts_lat)
    all_alt = np.concatenate(pts_alt)

    # Convert to unit sphere 3D coords for fast accurate nearest-neighbor k=9 sampling
    def to_xyz(lon_deg: np.ndarray, lat_deg: np.ndarray) -> np.ndarray:
        lr = np.radians(lon_deg)
        pr = np.radians(lat_deg)
        cp = np.cos(pr)
        return np.column_stack([cp * np.cos(lr), cp * np.sin(lr), np.sin(pr)])

    tree = cKDTree(to_xyz(all_lon, all_lat))
    hex_xyz = to_xyz(hex_df["lon"].to_numpy(), hex_df["lat"].to_numpy())
    _, idxs = tree.query(hex_xyz, k=9)
    neigh = all_alt[idxs]
    # Clamp slight negative coastal bathymetry to 0 for land hexes
    elev_mean = np.maximum(0.0, np.mean(neigh, axis=1))
    elev_range = np.ptp(neigh, axis=1)  # local peak-to-valley relief in meters

    # Relief classification: 0 = Flat/Plains, 1 = Hills/Highlands, 2 = Mountains, 3 = Alpine Peaks
    relief_cls = np.zeros(len(elev_mean), dtype=np.int32)
    relief_cls[(elev_range >= 220) | (elev_mean >= 900)] = 1
    relief_cls[(elev_range >= 580) | (elev_mean >= 1900)] = 2
    relief_cls[(elev_mean >= 2750) | ((elev_mean >= 2200) & (elev_range >= 900))] = 3

    print(f"[etopo] Sampled {len(all_alt):,} elevation points -> max hex elev {elev_mean.max():.0f}m, mountains={(relief_cls >= 2).sum():,}")
    return hex_df.with_columns([
        pl.Series("elev_m", np.round(elev_mean, 1)),
        pl.Series("relief_m", np.round(elev_range, 1)),
        pl.Series("relief_cls", relief_cls),
    ])


def sample_nlcd(hex_df: pl.DataFrame, raw_dir: Path) -> pl.DataFrame:
    """Sample NLCD land cover rasters (L48 2021, AK 2016, HI 2001) into 7+ fractional shares per hex."""
    n = len(hex_df)
    forest = np.full(n, np.nan, dtype=np.float64)
    crop = np.full(n, np.nan, dtype=np.float64)
    pasture = np.full(n, np.nan, dtype=np.float64)
    farmland = np.full(n, np.nan, dtype=np.float64)
    developed = np.full(n, np.nan, dtype=np.float64)
    wetland = np.full(n, np.nan, dtype=np.float64)
    shrub = np.full(n, np.nan, dtype=np.float64)
    grass = np.full(n, np.nan, dtype=np.float64)
    barren = np.full(n, np.nan, dtype=np.float64)
    ice = np.full(n, np.nan, dtype=np.float64)
    water = np.full(n, np.nan, dtype=np.float64)

    region_tifs = [
        (0, raw_dir / "nlcd/nlcd_l48_2km.tif"),
        (1, raw_dir / "nlcd/nlcd_ak_4km.tif"),
        (2, raw_dir / "nlcd/nlcd_hi_1km.tif"),
    ]

    reg_arr = hex_df["region"].to_numpy()
    lon_arr = hex_df["lon"].to_numpy()
    lat_arr = hex_df["lat"].to_numpy()

    for reg_id, tif_path in region_tifs:
        if not tif_path.exists():
            continue
        mask_idx = np.where(reg_arr == reg_id)[0]
        if len(mask_idx) == 0:
            continue
        with rasterio.open(tif_path) as src:
            arr = src.read(1)
            tf = pyproj.Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
            xs, ys = tf.transform(lon_arr[mask_idx], lat_arr[mask_idx])
            # Window half-width in pixels corresponding to ~12.5 km radius
            px_w = abs(src.transform.a)
            px_h = abs(src.transform.e)
            hw_x = max(1, int(round(12500.0 / max(px_w, 100.0))))
            hw_y = max(1, int(round(12500.0 / max(px_h, 100.0))))
            h_img, w_img = arr.shape

            for k, hi in enumerate(mask_idx):
                row_c, col_c = src.index(xs[k], ys[k])
                r0 = max(0, row_c - hw_y)
                r1 = min(h_img, row_c + hw_y + 1)
                c0 = max(0, col_c - hw_x)
                c1 = min(w_img, col_c + hw_x + 1)
                if r0 >= r1 or c0 >= c1:
                    continue
                patch = arr[r0:r1, c0:c1]
                valid = patch[(patch > 0) & (patch < 250)]
                if valid.size == 0:
                    continue
                # Land-only denominator (excluding open water 11) for land shares
                land = valid[valid != 11]
                tot_all = float(valid.size)
                water[hi] = float(np.sum(valid == 11)) / tot_all
                if land.size == 0:
                    forest[hi] = crop[hi] = pasture[hi] = farmland[hi] = developed[hi] = wetland[hi] = shrub[hi] = grass[hi] = barren[hi] = ice[hi] = 0.0
                    continue
                tot = float(land.size)
                forest[hi] = float(np.sum(np.isin(land, [41, 42, 43]))) / tot
                crop[hi] = float(np.sum(land == 82)) / tot
                pasture[hi] = float(np.sum(land == 81)) / tot
                farmland[hi] = crop[hi] + pasture[hi]
                developed[hi] = float(np.sum(np.isin(land, [22, 23, 24]))) / tot
                wetland[hi] = float(np.sum(np.isin(land, [90, 95]))) / tot
                shrub[hi] = float(np.sum(np.isin(land, [51, 52]))) / tot
                # Grassland includes NLCD 21 (developed open space: lawns, parks) + 71-74
                grass[hi] = float(np.sum(np.isin(land, [21, 71, 72, 73, 74]))) / tot
                barren[hi] = float(np.sum(land == 31)) / tot
                ice[hi] = float(np.sum(land == 12)) / tot

        print(f"[nlcd] Sampled region {reg_id} ({len(mask_idx):,} hexes) from {tif_path.name}")

    # Assign primary biome code for tactile terrain rendering:
    # 0=Grassland/Plains, 1=Farmland, 2=Forest, 3=Desert/Shrub, 4=Wetland, 5=Urban, 6=Tundra/Alpine, 7=Water/Marsh
    elev_arr = hex_df["elev_m"].to_numpy()
    biome = np.zeros(n, dtype=np.int32)
    for i in range(n):
        f = 0.0 if np.isnan(forest[i]) else forest[i]
        a = 0.0 if np.isnan(farmland[i]) else farmland[i]
        d = 0.0 if np.isnan(developed[i]) else developed[i]
        w = 0.0 if np.isnan(wetland[i]) else wetland[i]
        s = 0.0 if np.isnan(shrub[i]) else shrub[i]
        g = 0.0 if np.isnan(grass[i]) else grass[i]
        b = 0.0 if np.isnan(barren[i]) else barren[i]
        ic = 0.0 if np.isnan(ice[i]) else ice[i]
        wt = 0.0 if np.isnan(water[i]) else water[i]

        if wt > 0.72:
            biome[i] = 7
        elif d >= 0.24:
            biome[i] = 5
        elif ic >= 0.12 or (elev_arr[i] >= 2850) or (reg_arr[i] == 1 and lat_arr[i] > 66.5 and f < 0.2):
            biome[i] = 6
        elif w >= 0.28:
            biome[i] = 4
        elif f >= 0.36 and f >= a and f >= s:
            biome[i] = 2
        elif a >= 0.34 and a >= s:
            biome[i] = 1
        elif (s + b) >= 0.42:
            biome[i] = 3
        elif g >= 0.25 or a >= 0.18:
            biome[i] = 0
        else:
            # Dominant fallback
            scores = [g, a, f, s + b, w, d, ic]
            biome[i] = int(np.argmax(scores))

    return hex_df.with_columns([
        pl.Series("nlcd_forest", np.round(forest, 4)),
        pl.Series("nlcd_crop", np.round(crop, 4)),
        pl.Series("nlcd_pasture", np.round(pasture, 4)),
        pl.Series("nlcd_farmland", np.round(farmland, 4)),
        pl.Series("nlcd_grass", np.round(grass, 4)),
        pl.Series("nlcd_shrub", np.round(shrub, 4)),
        pl.Series("nlcd_wetland", np.round(wetland, 4)),
        pl.Series("nlcd_developed", np.round(developed, 4)),
        pl.Series("nlcd_water", np.round(water, 4)),
        pl.Series("biome", biome),
    ])


def compute_albers25_land_cover(raw_dir: Path, albers_grid) -> tuple[dict[str, float], dict[str, dict[str, float]]]:
    """Sample NLCD 2021 Lower-48 raster on exact R=25 km equal-area CONUS land hexes for unbiased state & national land cover."""
    tif_path = raw_dir / "nlcd/nlcd_l48_2km.tif"
    keys = ["forest", "crop", "pasture", "grass", "shrub", "wetland", "developed"]
    if not tif_path.exists():
        return {}, {}
    st_sums: dict[str, np.ndarray] = {}
    st_cnt: dict[str, int] = {}
    tot_sum = np.zeros(7, dtype=np.float64)
    tot_cnt = 0
    with rasterio.open(tif_path) as src:
        arr = src.read(1)
        tf = pyproj.Transformer.from_crs(albers_grid.CRS_STR, src.crs, always_xy=True)
        px_w = abs(src.transform.a)
        R_m = 25000.0
        r_px = max(1, int(math.ceil(R_m / max(px_w, 100.0))))
        yy, xx = np.mgrid[-r_px : r_px + 1, -r_px : r_px + 1]
        dx_m = np.abs(xx * px_w)
        dy_m = np.abs(yy * px_w)
        # Exact pointy-top R=25 km hexagon interior mask (no oversized circular spillover into neighboring states!)
        circ = (dx_m <= R_m * math.sqrt(3.0) / 2.0) & (dy_m + dx_m / math.sqrt(3.0) <= R_m)
        h_img, w_img = arr.shape
        # Assign each R=25 km hex to the state holding the largest land area inside the hexagon polygon (eliminates DE border-tip artifact!)
        angles = [math.radians(60.0 * k + 30.0) for k in range(6)]
        st_geoms_b = [(abbr, g, g.bounds) for abbr, g in albers_grid.state_geoms]
        for ci, ri in albers_grid.land_crs:
            dx, dy = albers_grid.cr_to_xy(ci, ri)
            ax, ay = dx - albers_grid.X_OFF, albers_grid.Y_OFF - dy
            hp = Polygon([(ax + albers_grid.R * math.cos(a), ay + albers_grid.R * math.sin(a)) for a in angles])
            hx0, hy0, hx1, hy1 = hp.bounds
            best_a, st = 0.0, ""
            for abbr, g, (gx0, gy0, gx1, gy1) in st_geoms_b:
                if gx1 < hx0 or gx0 > hx1 or gy1 < hy0 or gy0 > hy1:
                    continue
                if g.intersects(hp):
                    ar = g.intersection(hp).area
                    if ar > best_a:
                        best_a, st = ar, abbr
            if not st:
                st = albers_grid.state_at_albers(ax, ay)
            sx, sy = tf.transform(ax, ay)
            rc, cc = src.index(sx, sy)
            if rc - r_px < 0 or rc + r_px >= h_img or cc - r_px < 0 or cc + r_px >= w_img:
                patch = arr[max(0, rc - r_px) : min(h_img, rc + r_px + 1), max(0, cc - r_px) : min(w_img, cc + r_px + 1)]
                valid = patch[(patch > 0) & (patch < 250)]
            else:
                patch = arr[rc - r_px : rc + r_px + 1, cc - r_px : cc + r_px + 1][circ]
                valid = patch[(patch > 0) & (patch < 250)]
            land = valid[valid != 11]
            if land.size == 0:
                continue
            t = float(land.size)
            vec = np.array(
                [
                    float(np.sum(np.isin(land, [41, 42, 43]))) / t,
                    float(np.sum(land == 82)) / t,
                    float(np.sum(land == 81)) / t,
                    float(np.sum(np.isin(land, [21, 71, 72, 73, 74]))) / t,
                    float(np.sum(np.isin(land, [51, 52]))) / t,
                    float(np.sum(np.isin(land, [90, 95]))) / t,
                    float(np.sum(np.isin(land, [22, 23, 24]))) / t,
                ],
                dtype=np.float64,
            )
            tot_sum += vec
            tot_cnt += 1
            if st not in st_sums:
                st_sums[st] = vec.copy()
                st_cnt[st] = 1
            else:
                st_sums[st] += vec
                st_cnt[st] += 1

    nat = {keys[i]: round(float(tot_sum[i] / max(1, tot_cnt)), 4) for i in range(7)}
    nat["other"] = round(max(0.0, 1.0 - sum(nat.values())), 4)
    by_state = {
        st: {keys[i]: round(float(v[i] / st_cnt[st]), 4) for i in range(7)}
        for st, v in st_sums.items()
        if st_cnt[st] > 0
    }
    print(f"[nlcd-r25] Computed exact R=25km NLCD land cover across {tot_cnt:,} L48 hexes & {len(by_state)} states")
    return nat, by_state


def _extract_lines_projected(gdf: gpd.GeoDataFrame, proj: UnifiedProjector, simplify_km: float = 2.0, min_pts: int = 2) -> list[list[list[float]]]:
    """Project LineString/MultiLineString geometries to compact rounded [[x,y], ...] polylines in display km."""
    polylines: list[list[list[float]]] = []
    # Split into CONUS, AK, HI by centroid
    for geom in gdf.geometry:
        if geom is None or geom.is_empty:
            continue
        lines = list(geom.geoms) if isinstance(geom, MultiLineString) else ([geom] if isinstance(geom, LineString) else [])
        for ln in lines:
            coords = list(ln.coords)
            if len(coords) < 2:
                continue
            mid = coords[len(coords) // 2]
            reg = proj.classify_region(mid[0], mid[1])
            if reg is None:
                continue
            pts = []
            for lon, lat in coords:
                p = proj.project_point(lon, lat)
                if p is not None and p[2] == reg:
                    pts.append((p[0], p[1]))
            if len(pts) < min_pts:
                continue
            ls = LineString(pts).simplify(simplify_km, preserve_topology=False)
            if isinstance(ls, LineString) and len(ls.coords) >= min_pts:
                polylines.append([[round(x, 1), round(y, 1)] for x, y in ls.coords])
    return polylines


def build_vector_art_layers(
    hex_df: pl.DataFrame,
    grid_meta: dict,
    raw_dir: Path,
) -> tuple[pl.DataFrame, dict]:
    """Build rivers, lakes, state borders, roads, rail, and shale basin overlays in display km."""
    proj = UnifiedProjector(grid_meta)
    art: dict = {
        "neighbor_land": [],
        "state_borders": [],
        "rivers": [],
        "lakes": [],
        "roads_primary": [],
        "roads_secondary": [],
        "rail_main": [],
        "shale_hex_ids": [],
        "shale_plays": [],
    }

    # 0. Neighboring countries (Canada/Mexico/Cuba/Bahamas) for darkened geographic context
    nat_countries = raw_dir / "natural_earth/ne_50m_admin_0_countries.geojson"
    if nat_countries.exists():
        cgdf = gpd.read_file(nat_countries)
        for _, row in cgdf.iterrows():
            iso = str(row.get("ISO_A3") or row.get("ADM0_A3") or "")
            if iso not in ("CAN", "MEX", "CUB", "BHS"):
                continue
            geom = row.geometry
            polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else ([geom] if isinstance(geom, Polygon) else [])
            for poly in polys:
                if poly.area < 0.08:
                    continue
                pts = []
                for lon, lat in poly.exterior.coords:
                    if not (-138 <= lon <= -52 and 14 <= lat <= 64):
                        continue
                    xm, ym = _T_CONUS.transform(lon, lat)
                    pts.append((xm / 1000.0, ym / 1000.0))
                if len(pts) >= 4:
                    simp = LineString(pts).simplify(8.0, preserve_topology=False)
                    if len(simp.coords) >= 4:
                        art["neighbor_land"].append([[round(x, 1), round(y, 1)] for x, y in simp.coords])

    # 1. State boundaries (clean crisp vector polylines for CONUS, AK, HI)
    st_zip = raw_dir / "census_boundaries/cb_2023_us_state_20m.zip"
    if st_zip.exists():
        st_gdf = gpd.read_file(f"zip://{st_zip}")
        st_gdf = st_gdf[st_gdf["STATEFP"].isin(CONUS_FIPS | {"02", "15"})]
        for _, row in st_gdf.iterrows():
            sfips = row["STATEFP"]
            geom = row.geometry
            polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else ([geom] if isinstance(geom, Polygon) else [])
            for poly in polys:
                if poly.area < 0.015:  # skip microscopic coastal rocks
                    continue
                pts = []
                for lon, lat in poly.exterior.coords:
                    p = proj.project_point(lon, lat, state_fips=sfips)
                    if p is not None:
                        pts.append((p[0], p[1]))
                if len(pts) >= 4:
                    simp = LineString(pts).simplify(2.5 if sfips != "15" else 1.0, preserve_topology=False)
                    if len(simp.coords) >= 4:
                        art["state_borders"].append({
                            "fips": sfips,
                            "abbr": row.get("STUSPS", ""),
                            "pts": [[round(x, 1), round(y, 1)] for x, y in simp.coords],
                        })
        print(f"[geo_layers] Projected {len(art['state_borders'])} state border rings")

    # 2. Natural Earth 1:50m Rivers & Fresh-Water hex tagging
    riv_path = raw_dir / "natural_earth/ne_50m_rivers_lake_centerlines.geojson"
    has_river = np.zeros(len(hex_df), dtype=np.int8)
    if riv_path.exists():
        riv_gdf = gpd.read_file(riv_path)
        art["rivers"] = _extract_lines_projected(riv_gdf, proj, simplify_km=3.0)
        # Mark hexes within 18 km of any major river vertex (Fresh Water bonus!)
        river_pts = [pt for line in art["rivers"] for pt in line]
        if river_pts:
            rtree = cKDTree(np.array(river_pts, dtype=np.float64))
            hxy = np.column_stack([hex_df["map_x"].to_numpy(), hex_df["map_y"].to_numpy()])
            dists, _ = rtree.query(hxy)
            has_river[dists <= 18.0] = 1
        print(f"[geo_layers] Projected {len(art['rivers'])} river polylines, {int(has_river.sum()):,} fresh-water hexes")

    # 3. Natural Earth 1:50m Lakes (Great Lakes & major inland lakes)
    lake_path = raw_dir / "natural_earth/ne_50m_lakes.geojson"
    if lake_path.exists():
        lk_gdf = gpd.read_file(lake_path)
        for _, row in lk_gdf.iterrows():
            geom = row.geometry
            polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else ([geom] if isinstance(geom, Polygon) else [])
            for poly in polys:
                c = poly.centroid
                reg = proj.classify_region(c.x, c.y)
                if reg is None:
                    continue
                pts = []
                for lon, lat in poly.exterior.coords:
                    p = proj.project_point(lon, lat)
                    if p is not None and p[2] == reg:
                        pts.append((p[0], p[1]))
                if len(pts) >= 4:
                    simp = LineString(pts).simplify(2.5, preserve_topology=False)
                    if len(simp.coords) >= 4:
                        art["lakes"].append({
                            "name": row.get("name", ""),
                            "pts": [[round(x, 1), round(y, 1)] for x, y in simp.coords],
                        })
        print(f"[geo_layers] Projected {len(art['lakes'])} lakes")

    # 4. Natural Earth 1:10m Roads (Interstates & Major Highways)
    roads_path = raw_dir / "natural_earth/ne_10m_roads.geojson"
    if roads_path.exists():
        rd = gpd.read_file(roads_path)
        if "sov_a3" in rd.columns:
            rd = rd[rd["sov_a3"] == "USA"]
        interstates = rd[rd["type"].isin(["Major Highway", "Beltway"]) | (rd.get("expressway", 0) == 1)]
        secondary = rd[rd["type"] == "Secondary Highway"]
        art["roads_primary"] = _extract_lines_projected(interstates, proj, simplify_km=4.0)
        art["roads_secondary"] = _extract_lines_projected(secondary, proj, simplify_km=5.0)
        print(f"[geo_layers] Roads: {len(art['roads_primary'])} primary, {len(art['roads_secondary'])} secondary")

    # 5. Natural Earth 1:10m Railroads
    rail_path = raw_dir / "natural_earth/ne_10m_railroads.geojson"
    if rail_path.exists():
        rr = gpd.read_file(rail_path)
        # Filter to US bounds quickly before projecting
        rr = rr.cx[-179:-65, 18:72]
        if "scalerank" in rr.columns:
            rr = rr[rr["scalerank"] <= 7]
        art["rail_main"] = _extract_lines_projected(rr, proj, simplify_km=4.5)
        print(f"[geo_layers] Rail lines: {len(art['rail_main'])}")

    # 6. EIA Shale Oil & Gas Plays -> tag CONUS hexes for geological stipple overlay
    shale_path = raw_dir / "eia_shale_plays/shale_plays.geojson"
    has_shale = np.zeros(len(hex_df), dtype=np.int8)
    shale_name = [""] * len(hex_df)
    if shale_path.exists():
        sh = gpd.read_file(shale_path).to_crs(CRS_CONUS)
        sh["geometry"] = sh.geometry.buffer(0)
        conus_mask = hex_df["region"].to_numpy() == 0
        hx = hex_df["native_x_km"].to_numpy() * 1000.0
        hy = hex_df["native_y_km"].to_numpy() * 1000.0
        name_col = next((c for c in ["Shale_play", "Basin", "NAME", "Play"] if c in sh.columns), None)
        for _, row in sh.iterrows():
            poly = row.geometry
            if poly is None or poly.is_empty:
                continue
            pname = str(row[name_col]) if name_col and row[name_col] else "Shale Basin"
            minx, miny, maxx, maxy = poly.bounds
            cands = np.where(conus_mask & (hx >= minx) & (hx <= maxx) & (hy >= miny) & (hy <= maxy))[0]
            hit_ids = []
            for idx in cands:
                if poly.contains(Point(hx[idx], hy[idx])):
                    has_shale[idx] = 1
                    if not shale_name[idx]:
                        shale_name[idx] = pname
                    hit_ids.append(int(hex_df["hex_id"][int(idx)]))
            if hit_ids:
                art["shale_plays"].append({"name": pname, "hex_count": len(hit_ids)})
        art["shale_hex_ids"] = [int(hex_df["hex_id"][int(i)]) for i in np.where(has_shale == 1)[0]]
        print(f"[geo_layers] EIA Shale Plays tagged {len(art['shale_hex_ids']):,} oil/gas hexes across {len(art['shale_plays'])} plays")

    hex_df = hex_df.with_columns([
        pl.Series("has_river", has_river),
        pl.Series("has_shale", has_shale),
        pl.Series("shale_play", shale_name),
    ])
    return hex_df, art
