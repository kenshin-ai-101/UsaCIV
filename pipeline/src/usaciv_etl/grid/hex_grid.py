"""25 km equal-area hexagonal grid builder for CONUS (EPSG:5070), Alaska (EPSG:3338), and Hawaii."""
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import numpy as np
import polars as pl
import pyproj
from shapely.geometry import Polygon
from shapely.strtree import STRtree

SQRT3 = math.sqrt(3.0)
HEX_SPACING_KM = 25.0
HEX_RADIUS_KM = HEX_SPACING_KM / SQRT3  # ~14.4337567 km (center-to-vertex for pointy-top)
HEX_AREA_KM2 = 1.5 * SQRT3 * HEX_RADIUS_KM * HEX_RADIUS_KM  # 541.265877 km^2

CRS_CONUS = "EPSG:5070"
CRS_AK = "EPSG:3338"
CRS_HI = "+proj=aea +lat_1=8 +lat_2=18 +lat_0=13 +lon_0=-157 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs"

# Inset display transforms into CONUS km coordinate plane (refined dynamically from state bounds)
# Display coordinates have y pointing NORTH (up); renderer flips y to screen space.
@dataclass(frozen=True)
class RegionSpec:
    region_id: int
    code: str
    crs: str
    state_fips_set: frozenset[str]
    display_scale: float
    # Target anchor (min_x, min_y) of transformed bounding box in CONUS km plane
    inset_origin: tuple[float, float] | None = None
    # Optional clip bounds in native CRS km (e.g., trim distant empty Aleutian water)
    clip_km: tuple[float, float, float, float] | None = None


CONUS_FIPS = frozenset({
    "01", "04", "05", "06", "08", "09", "10", "11", "12", "13",
    "16", "17", "18", "19", "20", "21", "22", "23", "24", "25",
    "26", "27", "28", "29", "30", "31", "32", "33", "34", "35",
    "36", "37", "38", "39", "40", "41", "42", "44", "45", "46",
    "47", "48", "49", "50", "51", "53", "54", "55", "56",
})

REGIONS = [
    RegionSpec(
        region_id=0,
        code="CONUS",
        crs=CRS_CONUS,
        state_fips_set=CONUS_FIPS,
        display_scale=1.0,
        inset_origin=None,
    ),
    RegionSpec(
        region_id=1,
        code="AK",
        crs=CRS_AK,
        state_fips_set=frozenset({"02"}),
        display_scale=0.35,
        # Placed cleanly in bottom-left Pacific Ocean pocket below CA
        inset_origin=(-2380.0, 120.0),
        clip_km=(-1750.0, 350.0, 1550.0, 2450.0),
    ),
    RegionSpec(
        region_id=2,
        code="HI",
        crs=CRS_HI,
        state_fips_set=frozenset({"15"}),
        display_scale=1.0,
        # Placed cleanly right next to Alaska inset with crisp brass frame margin, well west of South Texas
        inset_origin=(-1155.0, 140.0),
        clip_km=(-400.0, 500.0, 300.0, 1100.0),
    ),
]


def pointy_hex_polygon(cx_m: float, cy_m: float, r_m: float) -> Polygon:
    pts = []
    for i in range(6):
        ang = math.radians(60 * i - 30)
        pts.append((cx_m + r_m * math.cos(ang), cy_m + r_m * math.sin(ang)))
    return Polygon(pts)


def build_hex_grid_and_crosswalk(
    county_shp_zip: Path,
    out_dir: Path,
) -> dict:
    """Build 25 km hex grid across CONUS + AK + HI and exact county-to-hex area crosswalk."""
    out_dir.mkdir(parents=True, exist_ok=True)
    counties_wgs84 = gpd.read_file(f"zip://{county_shp_zip}")
    # Keep only 50 states + DC
    valid_states = CONUS_FIPS | {"02", "15"}
    counties_wgs84 = counties_wgs84[counties_wgs84["STATEFP"].isin(valid_states)].copy()
    counties_wgs84["fips"] = counties_wgs84["STATEFP"].str.zfill(2) + counties_wgs84["COUNTYFP"].str.zfill(3)

    all_hex_rows: list[dict] = []
    all_xwalk_rows: list[dict] = []
    inset_boxes: dict[str, dict] = {}
    hex_id_counter = 0

    r_m = HEX_RADIUS_KM * 1000.0
    dx_m = SQRT3 * r_m  # 25,000 m
    dy_m = 1.5 * r_m    # 21,650.635 m

    for spec in REGIONS:
        sub = counties_wgs84[counties_wgs84["STATEFP"].isin(spec.state_fips_set)].to_crs(spec.crs).copy()
        if sub.empty:
            continue

        # Fix invalid geometries cleanly
        sub["geometry"] = sub.geometry.buffer(0)

        # Optionally clip distant uninhabited Aleutian / NW Hawaiian islands to keep inset compact
        if spec.clip_km is not None:
            minx_k, miny_k, maxx_k, maxy_k = spec.clip_km
            clip_box = Polygon([
                (minx_k * 1000, miny_k * 1000),
                (maxx_k * 1000, miny_k * 1000),
                (maxx_k * 1000, maxy_k * 1000),
                (minx_k * 1000, maxy_k * 1000),
            ])
            clipped_geoms = sub.geometry.intersection(clip_box)
            sub = sub[~clipped_geoms.is_empty].copy()
            sub["geometry"] = clipped_geoms[~clipped_geoms.is_empty]

        sub = sub.reset_index(drop=True)
        minx, miny, maxx, maxy = sub.total_bounds
        pad = r_m * 1.2
        r_min = int(math.floor((miny - pad) / dy_m))
        r_max = int(math.ceil((maxy + pad) / dy_m))

        geoms = list(sub.geometry.values)
        fips_arr = list(sub["fips"].values)
        state_arr = list(sub["STATEFP"].values)
        county_areas = np.array([g.area for g in geoms], dtype=np.float64)
        tree = STRtree(geoms)

        # Transformer native CRS -> WGS84 for exact lat/lon of each hex center
        to_wgs = pyproj.Transformer.from_crs(spec.crs, "EPSG:4326", always_xy=True)

        region_hexes: list[dict] = []
        for row_idx in range(r_min, r_max + 1):
            cy_m = row_idx * dy_m
            x_offset = (dx_m * 0.5) if (row_idx & 1) else 0.0
            c_min = int(math.floor((minx - pad - x_offset) / dx_m))
            c_max = int(math.ceil((maxx + pad - x_offset) / dx_m))
            for col_idx in range(c_min, c_max + 1):
                cx_m = col_idx * dx_m + x_offset
                hpoly = pointy_hex_polygon(cx_m, cy_m, r_m)
                cand_idxs = tree.query(hpoly, predicate="intersects")
                if len(cand_idxs) == 0:
                    continue

                intersections: list[tuple[int, float]] = []
                total_land_m2 = 0.0
                for ci in cand_idxs:
                    inter = hpoly.intersection(geoms[ci])
                    if inter.is_empty:
                        continue
                    a = float(inter.area)
                    if a > 1e4:  # > 0.01 km^2
                        intersections.append((int(ci), a))
                        total_land_m2 += a

                # Keep hex if at least 2% of its area overlaps US land (keeps narrow coastal/HI islands!)
                land_frac = total_land_m2 / (HEX_AREA_KM2 * 1e6)
                if land_frac < 0.02:
                    continue

                # Dominant county & state
                intersections.sort(key=lambda t: t[1], reverse=True)
                dom_ci = intersections[0][0]
                dom_fips = fips_arr[dom_ci]
                dom_state = state_arr[dom_ci]

                lon, lat = to_wgs.transform(cx_m, cy_m)
                # Axial coordinates (pointy-top odd-r -> axial)
                q = col_idx - (row_idx - (row_idx & 1)) // 2
                r_ax = row_idx

                hid = hex_id_counter
                hex_id_counter += 1

                region_hexes.append({
                    "hex_id": hid,
                    "region": spec.region_id,
                    "q": q,
                    "r": r_ax,
                    "native_x_km": cx_m / 1000.0,
                    "native_y_km": cy_m / 1000.0,
                    "lon": float(lon),
                    "lat": float(lat),
                    "land_frac": float(min(1.0, land_frac)),
                    "land_km2": float(total_land_m2 / 1e6),
                    "dom_fips": dom_fips,
                    "state_fips": dom_state,
                })

                for ci, area_m2 in intersections:
                    all_xwalk_rows.append({
                        "hex_id": hid,
                        "fips": fips_arr[ci],
                        "area_km2": area_m2 / 1e6,
                        "hex_share": area_m2 / total_land_m2,
                        "county_share": area_m2 / max(1.0, county_areas[ci]),
                    })

        # Compute display (map_x_km, map_y_km) in unified CONUS display plane
        if not region_hexes:
            continue

        xs = np.array([h["native_x_km"] for h in region_hexes])
        ys = np.array([h["native_y_km"] for h in region_hexes])

        if spec.inset_origin is None:
            # CONUS: identity transform
            for h in region_hexes:
                h["map_x"] = h["native_x_km"]
                h["map_y"] = h["native_y_km"]
                h["map_r"] = HEX_RADIUS_KM
        else:
            ox, oy = spec.inset_origin
            sc = spec.display_scale
            min_nx, min_ny = float(xs.min()), float(ys.min())
            max_nx, max_ny = float(xs.max()), float(ys.max())
            for h in region_hexes:
                h["map_x"] = ox + (h["native_x_km"] - min_nx) * sc
                h["map_y"] = oy + (h["native_y_km"] - min_ny) * sc
                h["map_r"] = HEX_RADIUS_KM * sc

            pad_k = HEX_RADIUS_KM * sc * 2.2
            inset_boxes[spec.code] = {
                "region_id": spec.region_id,
                "code": spec.code,
                "scale": sc,
                "native_min_x": min_nx,
                "native_min_y": min_ny,
                "origin_x": ox,
                "origin_y": oy,
                "box": [
                    round(ox - pad_k, 1),
                    round(oy - pad_k, 1),
                    round(ox + (max_nx - min_nx) * sc + pad_k, 1),
                    round(oy + (max_ny - min_ny) * sc + pad_k, 1),
                ],
            }

        all_hex_rows.extend(region_hexes)
        print(f"[hex_grid] {spec.code}: {len(region_hexes):,} hexes generated")

    hex_df = pl.DataFrame(all_hex_rows)
    xwalk_df = pl.DataFrame(all_xwalk_rows)

    # Normalize county_share per county so sum == 1.0 (handles tiny clipped slivers cleanly)
    xwalk_df = xwalk_df.with_columns(
        (pl.col("area_km2") / pl.col("area_km2").sum().over("fips")).alias("county_share")
    )

    hex_df.write_parquet(out_dir / "hex_grid.parquet")
    xwalk_df.write_parquet(out_dir / "hex_county_xwalk.parquet")

    import json
    meta = {
        "total_hexes": len(hex_df),
        "by_region": {
            "CONUS": int((hex_df["region"] == 0).sum()),
            "AK": int((hex_df["region"] == 1).sum()),
            "HI": int((hex_df["region"] == 2).sum()),
        },
        "counties_covered": int(xwalk_df["fips"].n_unique()),
        "hex_spacing_km": HEX_SPACING_KM,
        "hex_radius_km": HEX_RADIUS_KM,
        "hex_area_km2": HEX_AREA_KM2,
        "bounds_km": [
            round(float(hex_df["map_x"].min()) - 40.0, 1),
            round(float(hex_df["map_y"].min()) - 40.0, 1),
            round(float(hex_df["map_x"].max()) + 40.0, 1),
            round(float(hex_df["map_y"].max()) + 40.0, 1),
        ],
        "insets": inset_boxes,
    }
    (out_dir / "grid_meta.json").write_text(json.dumps(meta, indent=2))
    print(f"[hex_grid] Total: {meta['total_hexes']:,} hexes covering {meta['counties_covered']:,} counties")
    return meta
