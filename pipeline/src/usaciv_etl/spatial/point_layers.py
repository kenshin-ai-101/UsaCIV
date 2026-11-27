"""Parsers for all point, hub, energy, mining, military, wonder, and trade-route datasets."""
from __future__ import annotations

import csv
import io
import json
import math
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import geopandas as gpd
import numpy as np
import openpyxl
import polars as pl
from pyproj import Transformer
from scipy.spatial import cKDTree
from shapely.geometry import Point
from shapely.ops import unary_union

from .geo_layers import UnifiedProjector
from .tabular_sources import STATE_ABBR_TO_FIPS, STATE_FIPS_TO_ABBR, STATE_FIPS_TO_NAME


class Albers25Grid:
    """Equal-area R=25 km pointy-top CONUS hex grid (1,624 km² cells) for regional renewable/mine clustering & 1-in-4 shale play lattice."""

    R = 25.0
    SQ3 = math.sqrt(3.0)
    X_OFF = 2550.11
    Y_OFF = 1759.22
    CRS_STR = "+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +R=6371000 +units=km"

    def __init__(self, raw_dir: Path):
        self.to_albers = Transformer.from_crs("+proj=longlat +R=6371000", self.CRS_STR, always_xy=True)
        self.to_lonlat = Transformer.from_crs(self.CRS_STR, "+proj=longlat +R=6371000", always_xy=True)

        st_path = raw_dir / "census_boundaries/cb_2023_us_state_20m.zip"
        if not st_path.exists():
            st_path = next(p for p in raw_dir.rglob("*.zip") if "state" in p.name.lower())
        st_gdf = gpd.read_file(st_path)
        st_conus = st_gdf[~st_gdf["STUSPS"].isin(["AK", "HI", "PR", "VI", "GU", "AS", "MP"])].to_crs(self.CRS_STR)
        self.state_geoms: list[tuple[str, object]] = [
            (str(r["STUSPS"]), r.geometry) for _, r in st_conus.iterrows()
        ]
        land_union = unary_union(st_conus.geometry)
        self.mainland = max(land_union.geoms, key=lambda g: g.area) if hasattr(land_union, "geoms") else land_union
        minx, miny, maxx, maxy = land_union.bounds
        r0 = int((self.Y_OFF - maxy) / 37.5) - 1
        r1 = int((self.Y_OFF - miny) / 37.5) + 1
        c0 = int((minx + self.X_OFF) / (self.SQ3 * self.R)) - 1
        c1 = int((maxx + self.X_OFF) / (self.SQ3 * self.R)) + 1

        self.land_crs: list[tuple[int, int]] = []
        self.land_xy: list[tuple[float, float]] = []
        for ri in range(r0, r1 + 1):
            for ci in range(c0, c1 + 1):
                dx, dy = self.cr_to_xy(ci, ri)
                if land_union.contains(Point(dx - self.X_OFF, self.Y_OFF - dy)):
                    self.land_crs.append((ci, ri))
                    self.land_xy.append((dx, dy))
        self.land_set = set(self.land_crs)
        self.land_tree = cKDTree(self.land_xy)

    def xy_to_cr(self, dx: float, dy: float) -> tuple[int, int]:
        qf = (self.SQ3 / 3.0 * dx - 1.0 / 3.0 * dy) / self.R
        rf = (2.0 / 3.0 * dy) / self.R
        sf = -qf - rf
        q, r, s = round(qf), round(rf), round(sf)
        dq, dr, ds = abs(q - qf), abs(r - rf), abs(s - sf)
        if dq > dr and dq > ds:
            q = -r - s
        elif dr > ds:
            r = -q - s
        return (q + ((r - (r & 1)) // 2), r)

    def cr_to_xy(self, col: int, row: int) -> tuple[float, float]:
        return (self.SQ3 * self.R * (col + 0.5 * (row & 1)), 1.5 * self.R * row)

    def cr_to_lonlat(self, col: int, row: int) -> tuple[float, float]:
        dx, dy = self.cr_to_xy(col, row)
        lon, lat = self.to_lonlat.transform(dx - self.X_OFF, self.Y_OFF - dy)
        return float(lon), float(lat)

    def snap_land_cr(self, lon: float, lat: float, max_dist_km: float = 130.0) -> tuple[int, int]:
        xk, yk = self.to_albers.transform(lon, lat)
        dx, dy = xk + self.X_OFF, self.Y_OFF - yk
        cr = self.xy_to_cr(dx, dy)
        if cr in self.land_set:
            return cr
        dist, idx = self.land_tree.query([dx, dy])
        return self.land_crs[int(idx)] if dist <= max_dist_km else cr

    def land_dist_km(self, lon: float, lat: float) -> float:
        xk, yk = self.to_albers.transform(lon, lat)
        dx, dy = xk + self.X_OFF, self.Y_OFF - yk
        if self.xy_to_cr(dx, dy) in self.land_set:
            return 0.0
        dist, _ = self.land_tree.query([dx, dy])
        return float(dist)

    def mainland_dist_km(self, lon: float, lat: float) -> float:
        xk, yk = self.to_albers.transform(lon, lat)
        return float(self.mainland.distance(Point(xk, yk)))

    def state_at_albers(self, ax: float, ay: float) -> str:
        pt = Point(ax, ay)
        for abbr, geom in self.state_geoms:
            if geom.contains(pt):
                return abbr
        best_abbr, best_d = "", 1e18
        for abbr, geom in self.state_geoms:
            d = geom.distance(pt)
            if d < best_d:
                best_d, best_abbr = d, abbr
        return best_abbr


class HexLocator:
    """Fast nearest-hex lookup in unified display km coordinates."""

    def __init__(self, hex_df: pl.DataFrame):
        self.hex_ids = hex_df["hex_id"].to_numpy()
        self.cbsa = hex_df["cbsa"].to_list() if "cbsa" in hex_df.columns else [None] * len(hex_df)
        self.state_fips = hex_df["state_fips"].to_list()
        self.xy = np.column_stack([hex_df["map_x"].to_numpy(), hex_df["map_y"].to_numpy()])
        self.tree = cKDTree(self.xy)

    def find(self, mx: float, my: float) -> tuple[int, str | None]:
        _, idx = self.tree.query([mx, my])
        i = int(idx)
        return int(self.hex_ids[i]), self.cbsa[i]


POWER_TYPE_META = [
    ("coal_plant", "燃煤电厂", "Coal power plant", "#8f7a66", "MW", "≥ 1,000 MW 燃煤电厂（EIA-860M 在运/备用机组净夏季装机，按全厂汇总）"),
    ("nuclear", "核电站", "Nuclear plant", "#e5c158", "MW", "全美所有拥有在运 (OP) 反应堆的核电站（停运/重启中机组不计入）"),
    ("wind", "风电场群", "Wind farms", "#69c2c9", "MW", "≥ 50 MW 场站按等面积 25 km 半径六边形区聚合 ≥ 500 MW 风电集群（含近海风电落岸）"),
    ("gas_plant", "燃气电厂", "Gas power plant", "#e0843c", "MW", "≥ 1,500 MW 天然气发电厂（EIA-860M 在运/备用机组净夏季装机，按全厂汇总）"),
    ("solar", "光伏电站群", "Solar farms", "#f0b840", "MW", "≥ 50 MW 集中式光伏场站按等面积 25 km 半径六边形区聚合 ≥ 500 MW 集群（不含屋顶光伏）"),
    ("hydro", "大型水电站", "Hydroelectric dam", "#4a92d6", "MW", "≥ 250 MW 常规水电站（跨州分报的胡佛大坝 AZ/NV 合并计为 1 座）"),
    ("battery", "电网储能群", "Battery storage", "#4db88a", "MW", "≥ 50 MW 场站按等面积 25 km 半径六边形区聚合 ≥ 400 MW 电网储能集群"),
    ("pumped_storage", "抽水蓄能电站", "Pumped-storage hydro", "#6b7fd4", "MW", "≥ 1,000 MW 抽水蓄能电站（双水库电网电池）"),
    ("geothermal", "地热发电场", "Geothermal field", "#d46a6a", "MW", "在运/备用机组按等面积 25 km 半径六边形区聚合 ≥ 100 MW 地热发电集群"),
]
POWER_LABEL_MAP = {t[0]: t[1] for t in POWER_TYPE_META}


def _classify_power_type(tech: str, code: str) -> str | None:
    t = (tech or "").lower()
    c = (code or "").upper()
    if "nuclear" in t or c == "NUC":
        return "nuclear"
    if "pumped storage" in t or c == "HPS":
        return "pumped_storage"
    if "conventional hydroelectric" in t or ("hydro" in t and "pumped" not in t) or c == "WAT":
        return "hydro"
    if "geothermal" in t or c == "GEO":
        return "geothermal"
    if "batter" in t or c == "MWH":
        return "battery"
    if "wind" in t or c == "WND":
        return "wind"
    if "solar" in t or c == "SUN":
        return "solar"
    if "coal" in t or c in ("BIT", "SUB", "LIG", "WC", "RC"):
        return "coal_plant"
    if "natural gas" in t or c == "NG":
        return "gas_plant"
    return None


def load_eia_power_plants(
    raw_dir: Path,
    proj: UnifiedProjector,
    loc: HexLocator,
    albers_grid: Albers25Grid | None = None,
) -> tuple[list[dict], list[dict], dict[str, dict[str, float]], dict[int, float], float]:
    """Load EIA-860M in-service (OP + SB; nuclear strictly OP) Net Summer MW -> exact 9-type sites & R=25 km clusters."""
    wb = openpyxl.load_workbook(raw_dir / "eia_860m/october_generator2026.xlsx", read_only=True, data_only=True)
    ws = wb["Operating"]
    hdr = None

    plants: dict[str, dict] = {}
    all_net_summer_mw = 0.0
    hex_all_mw: dict[int, float] = {}

    for row in ws.iter_rows(min_row=3, values_only=True):
        if hdr is None:
            hdr = {str(v).strip(): i for i, v in enumerate(row) if v is not None}
            continue
        status_str = str(row[hdr.get("Status", 22)] or "").strip()
        is_op = "(OP)" in status_str
        is_sb = "(SB)" in status_str
        if not (is_op or is_sb):
            continue
        st = str(row[hdr["Plant State"]] or "").strip().upper()
        if st not in STATE_ABBR_TO_FIPS:
            continue
        mw_raw = row[hdr.get("Net Summer Capacity (MW)", 13)]
        if mw_raw is None or str(mw_raw).strip() == "":
            mw_raw = row[hdr["Nameplate Capacity (MW)"]]
        lat_raw = row[hdr["Latitude"]]
        lon_raw = row[hdr["Longitude"]]
        if mw_raw is None or lat_raw is None or lon_raw is None:
            continue
        try:
            mw = float(mw_raw)
            lat = float(lat_raw)
            lon = float(lon_raw)
        except (ValueError, TypeError):
            continue
        if mw <= 0:
            continue

        all_net_summer_mw += mw
        ptype = _classify_power_type(str(row[hdr["Technology"]] or ""), str(row[hdr["Energy Source Code"]] or ""))
        pid = str(row[hdr["Plant ID"]])
        pname = str(row[hdr["Plant Name"]] or "Power Plant").strip()
        # Cross-state dam filed under two Plant IDs (AZ + NV) -> single summed Hoover Dam site
        if pname.startswith("Hoover Dam"):
            pid = "HOOVER_DAM"
            pname = "Hoover Dam"
            st = "AZ"

        op_yr = None
        try:
            y_val = int(row[hdr["Operating Year"]])
            if 1890 <= y_val <= 2030:
                op_yr = y_val
        except (ValueError, TypeError, KeyError):
            pass

        rec = plants.get(pid)
        if rec is None:
            rec = {
                "pid": pid,
                "name": pname,
                "operator": str(row[hdr.get("Entity Name", 1)] or "").strip(),
                "state": st,
                "lat": lat,
                "lon": lon,
                "total_mw": 0.0,
                "by_fuel": {},
                "op_by_fuel": {},
                "gen_cnt": 0,
                "nuc_cnt": 0,
                "years": [],
            }
            plants[pid] = rec
        rec["total_mw"] += mw
        rec["gen_cnt"] += 1
        if op_yr is not None:
            rec["years"].append(op_yr)
        if ptype is not None:
            rec["by_fuel"][ptype] = rec["by_fuel"].get(ptype, 0.0) + mw
            if is_op:
                rec["op_by_fuel"][ptype] = rec["op_by_fuel"].get(ptype, 0.0) + mw
                if ptype == "nuclear":
                    rec["nuc_cnt"] += 1
    wb.close()

    # Exact site-level thresholds (MW) — nuclear requires OP reactors; others accept OP+SB; reported MW = whole plant
    site_thresh = {
        "nuclear": 1.0,
        "hydro": 250.0,
        "coal_plant": 1000.0,
        "gas_plant": 1500.0,
        "pumped_storage": 1000.0,
    }
    hex_thresh = {
        "wind": 500.0,
        "solar": 500.0,
        "battery": 400.0,
        "geothermal": 100.0,
    }

    mapped_sites: list[dict] = []
    hex_clusters: dict[tuple[object, str], dict] = {}

    for p in plants.values():
        pt = proj.project_point(p["lon"], p["lat"], state_abbr=p["state"])
        if pt is None:
            continue
        mx, my, _ = pt
        hid, cbsa = loc.find(mx, my)
        hex_all_mw[hid] = hex_all_mw.get(hid, 0.0) + p["total_mw"]

        # 1. Site-level qualification (nuclear first, else largest qualifying fuel)
        qual_site = []
        for ft, th in site_thresh.items():
            val = p["op_by_fuel"].get(ft, 0.0) if ft == "nuclear" else p["by_fuel"].get(ft, 0.0)
            if val >= th:
                qual_site.append((ft, val))
        if qual_site:
            best_ft = "nuclear" if any(ft == "nuclear" for ft, _ in qual_site) else max(qual_site, key=lambda kv: kv[1])[0]
            yrs = p["years"]
            yr_span = f", online {min(yrs)}–{max(yrs)}" if yrs and min(yrs) != max(yrs) else (f", online {yrs[0]}" if yrs else "")
            unit_lbl = f"{p['nuc_cnt']} reactors" if best_ft == "nuclear" else f"{p['gen_cnt']} generators"
            detail = f"{unit_lbl}{yr_span}, {p['operator']}, {p['state']}"
            mapped_sites.append({
                "name": p["name"],
                "fuel": best_ft,
                "mw": round(p["total_mw"], 1),
                "state": p["state"],
                "detail": detail,
                "x": round(mx, 1),
                "y": round(my, 1),
                "hex_id": hid,
                "cbsa": cbsa,
            })

        # 2. Equal-area R=25 km regional clusters for utility-scale (>=50 MW whole-plant) wind/solar/battery & all geothermal
        is_conus = p["state"] not in ("AK", "HI")
        cluster_key_cell: object = (
            albers_grid.snap_land_cr(p["lon"], p["lat"]) if (albers_grid is not None and is_conus) else ("disp", hid)
        )
        for ft, fmw in p["by_fuel"].items():
            if ft not in hex_thresh or fmw <= 0:
                continue
            if ft != "geothermal" and p["total_mw"] < 50.0:
                continue
            ck = (cluster_key_cell, ft)
            cl = hex_clusters.get(ck)
            if cl is None:
                hex_clusters[ck] = {
                    "fuel": ft,
                    "mw": fmw,
                    "w_mx": mx * fmw,
                    "w_my": my * fmw,
                    "plants": [(p["name"], fmw, p["state"])],
                }
            else:
                cl["mw"] += fmw
                cl["w_mx"] += mx * fmw
                cl["w_my"] += my * fmw
                cl["plants"].append((p["name"], fmw, p["state"]))

    for cl in hex_clusters.values():
        if cl["mw"] >= hex_thresh[cl["fuel"]]:
            plist = sorted(cl["plants"], key=lambda kv: -kv[1])
            lead_name = plist[0][0]
            dom_st = plist[0][2]
            cnt = len(plist)
            label = lead_name if cnt == 1 else f"{lead_name} (+{cnt - 1})"
            cx = cl["w_mx"] / cl["mw"]
            cy = cl["w_my"] / cl["mw"]
            chid, ccbsa = loc.find(cx, cy)
            top_desc = "; ".join(f"{nm} ({int(round(pmw))} MW)" for nm, pmw, _ in plist[:3])
            detail = f"{cnt} plants incl. {top_desc}; {dom_st}" if cnt > 1 else f"1 plant ({int(round(cl['mw']))} MW), {dom_st}"
            mapped_sites.append({
                "name": label,
                "fuel": cl["fuel"],
                "mw": round(cl["mw"], 1),
                "state": dom_st,
                "detail": detail,
                "x": round(cx, 1),
                "y": round(cy, 1),
                "hex_id": chid,
                "cbsa": ccbsa,
            })

    mapped_sites.sort(key=lambda x: x["mw"], reverse=True)

    # Aggregate mapped summary by type and by state
    fuel_totals: dict[str, dict] = {
        t[0]: {"fuel": t[0], "label": t[1], "label_en": t[2], "color": t[3], "rule": t[5], "mw": 0.0, "count": 0}
        for t in POWER_TYPE_META
    }
    state_fuel: dict[str, dict[str, float]] = {}
    for s in mapped_sites:
        ft = s["fuel"]
        fuel_totals[ft]["mw"] += s["mw"]
        fuel_totals[ft]["count"] += 1
        sf = STATE_ABBR_TO_FIPS.get(s["state"])
        if sf:
            state_fuel.setdefault(sf, {})[ft] = round(state_fuel.get(sf, {}).get(ft, 0.0) + s["mw"], 1)

    summary = sorted(
        [{**v, "mw": round(v["mw"], 1)} for v in fuel_totals.values() if v["count"] > 0],
        key=lambda x: x["mw"],
        reverse=True,
    )
    mapped_gw = sum(x["mw"] for x in summary) / 1000.0
    print(f"[eia_860m] Mapped {len(mapped_sites)} in-service threshold sites ({mapped_gw:.1f} GW net summer; full U.S. OP+SB={all_net_summer_mw/1000:.1f} GW)")
    return mapped_sites, summary, state_fuel, hex_all_mw, round(all_net_summer_mw, 1)


MINE_META = {
    "coal_mine": ("煤矿", "Coal mine", "#6e655e", "short tons/yr", "年产量 ≥ 200 万短吨的在产煤矿 (EIA Coal 2025)"),
    "gold": ("金矿", "Gold mine", "#e6c453", "employees", "≥ 100 名矿工的露天/地下在产金矿，按 25 km 半径区合并同矿种 (MSHA)"),
    "copper": ("铜矿", "Copper mine", "#cf7b4e", "employees", "≥ 100 名矿工的露天/地下在产铜矿，按 25 km 半径区合并同矿种 (MSHA)"),
    "iron": ("铁矿", "Iron mine", "#a8685c", "employees", "≥ 100 名矿工的露天/地下在产铁矿，按 25 km 半径区合并同矿种 (MSHA)"),
    "silver": ("银矿", "Silver mine", "#bfc9d4", "employees", "≥ 100 名矿工的露天/地下在产银矿，按 25 km 半径区合并同矿种 (MSHA)"),
    "platinum": ("铂族矿", "Platinum-group mine", "#95a8c4", "employees", "≥ 100 名矿工的露天/地下在产铂钯矿 (MSHA)"),
    "molybdenum": ("钼矿", "Molybdenum mine", "#7e95a8", "employees", "≥ 100 名矿工的露天/地下在产钼矿 (MSHA)"),
    "lead_zinc": ("铅锌矿", "Lead-zinc mine", "#8c89a6", "employees", "≥ 100 名矿工的露天/地下在产铅锌矿，按 25 km 半径区合并同矿种 (MSHA)"),
    "rare_earths": ("稀土矿", "Rare-earth mine", "#b87cc9", "employees", "≥ 10 名矿工的在产稀土矿与选厂 (MSHA)"),
    "uranium": ("铀矿", "Uranium mine/mill", "#73c96e", "employees", "≥ 10 名矿工的在产铀矿与选矿厂 (MSHA)"),
}


def load_mines_and_coal(
    raw_dir: Path,
    proj: UnifiedProjector,
    loc: HexLocator,
    albers_grid: Albers25Grid | None = None,
) -> list[dict]:
    """Apply transparent production/headcount thresholds to EIA Coal 2025 + MSHA active mines (98 CONUS major mines)."""
    coal_tons: dict[str, float] = {}
    wb = openpyxl.load_workbook(raw_dir / "eia_coal/coalpublic2025.xlsx", read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    hdr = None
    for row in ws.iter_rows(min_row=4, values_only=True):
        if hdr is None:
            hdr = {str(v).strip(): i for i, v in enumerate(row) if v is not None}
            continue
        mid_i = hdr.get("MSHA ID")
        prod_i = next((i for k, i in hdr.items() if "Production" in k), None)
        if mid_i is None or prod_i is None or row[mid_i] is None:
            continue
        mid = str(int(float(row[mid_i]))).zfill(7)
        try:
            tons = float(row[prod_i] or 0)
        except (ValueError, TypeError):
            tons = 0.0
        coal_tons[mid] = coal_tons.get(mid, 0.0) + tons
    wb.close()

    mines: list[dict] = []
    with zipfile.ZipFile(raw_dir / "msha/Mines.zip") as z:
        fname = next(n for n in z.namelist() if n.lower().endswith(".txt") or n.lower().endswith(".csv"))
        txt = io.TextIOWrapper(z.open(fname), encoding="latin1", errors="ignore")
        reader = csv.DictReader(txt, delimiter="|")
        for row in reader:
            if (row.get("CURRENT_MINE_STATUS") or "").strip() != "Active":
                continue
            st = (row.get("STATE") or "").strip().upper()
            if st not in STATE_ABBR_TO_FIPS:
                continue
            try:
                lat = float(row.get("LATITUDE") or 0)
                lon = float(row.get("LONGITUDE") or 0)
            except ValueError:
                continue
            if lat == 0 or lon == 0:
                continue
            if lon > 0 and (st != "AK" or (lat < 72 and lon < 170)):
                lon = -lon

            mid = (row.get("MINE_ID") or "").strip().zfill(7)
            cm = (row.get("COAL_METAL_IND") or "").strip().upper()
            mtype = (row.get("CURRENT_MINE_TYPE") or "").strip()
            sic = (row.get("PRIMARY_SIC") or "").lower()
            emp = float(row.get("NO_EMPLOYEES") or 0)

            comm = None
            metric = 0.0
            unit = "employees"
            mlbl = ""
            if cm == "C" or mid in coal_tons:
                tons = coal_tons.get(mid, 0.0)
                if tons >= 2_000_000:
                    comm = "coal_mine"
                    metric = tons
                    unit = "short tons/yr"
                    mlbl = f"{tons/1e6:.2f}M 吨/年"
            elif "rare earth" in sic:
                if emp >= 10:
                    comm, metric, mlbl = "rare_earths", emp, f"{int(emp)} 员工"
            elif "uranium" in sic:
                if emp >= 10:
                    comm, metric, mlbl = "uranium", emp, f"{int(emp)} 员工"
            elif mtype in ("Surface", "Underground"):
                if "platinum" in sic or "palladium" in sic:
                    if emp >= 100:
                        comm, metric, mlbl = "platinum", emp, f"{int(emp)} 员工"
                elif "molybdenum" in sic:
                    if emp >= 100:
                        comm, metric, mlbl = "molybdenum", emp, f"{int(emp)} 员工"
                elif "gold" in sic:
                    if emp >= 100:
                        comm, metric, mlbl = "gold", emp, f"{int(emp)} 员工"
                elif "copper" in sic:
                    if emp >= 100:
                        comm, metric, mlbl = "copper", emp, f"{int(emp)} 员工"
                elif "iron" in sic or "taconite" in sic:
                    if emp >= 100:
                        comm, metric, mlbl = "iron", emp, f"{int(emp)} 员工"
                elif "silver" in sic:
                    if emp >= 100:
                        comm, metric, mlbl = "silver", emp, f"{int(emp)} 员工"
                elif "lead" in sic or "zinc" in sic:
                    if emp >= 100:
                        comm, metric, mlbl = "lead_zinc", emp, f"{int(emp)} 员工"

            if not comm:
                continue
            pt = proj.project_point(lon, lat, state_abbr=st)
            if pt is None:
                continue
            mx, my, _ = pt
            hid, cbsa = loc.find(mx, my)
            is_conus = st not in ("AK", "HI")
            cluster_cell: object = (
                albers_grid.snap_land_cr(lon, lat) if (albers_grid is not None and is_conus) else ("disp", hid)
            )
            mines.append({
                "name": (row.get("CURRENT_MINE_NAME") or "Mine").strip().title(),
                "commodity": comm,
                "label": MINE_META[comm][0],
                "state": st,
                "metric": round(metric, 1),
                "unit": unit,
                "metric_label": mlbl,
                "x": round(mx, 1),
                "y": round(my, 1),
                "hex_id": hid,
                "cbsa": cbsa,
                "_cell": cluster_cell,
            })

    # Combine metal mines of the same commodity in the same R=25 km district hex (coal mines remain individual EIA sites)
    merged_mines: list[dict] = []
    by_cell_comm: dict[tuple[object, str], dict] = {}
    for m in mines:
        cell = m.pop("_cell")
        if m["commodity"] == "coal_mine":
            merged_mines.append(m)
            continue
        ck = (cell, m["commodity"])
        prev = by_cell_comm.get(ck)
        if prev is None:
            by_cell_comm[ck] = {**m, "_lead": m["metric"], "_cnt": 1}
        else:
            prev["metric"] = round(prev["metric"] + m["metric"], 1)
            prev["_cnt"] += 1
            if m["metric"] > prev["_lead"]:
                prev["_lead"] = m["metric"]
                prev["name"] = m["name"]
                prev["x"] = m["x"]
                prev["y"] = m["y"]
                prev["hex_id"] = m["hex_id"]
                prev["cbsa"] = m["cbsa"]
            prev["metric_label"] = f"{int(round(prev['metric']))} 员工"
    for rec in by_cell_comm.values():
        cnt = rec.pop("_cnt")
        rec.pop("_lead")
        if cnt > 1:
            rec["name"] = f"{rec['name']} (+{cnt - 1})"
        merged_mines.append(rec)

    merged_mines.sort(key=lambda m: (0 if m["commodity"] == "coal_mine" else 1, -m["metric"]))
    print(f"[mines] Exported {len(merged_mines)} threshold-mapped major mines across {len({m['commodity'] for m in merged_mines})} mineral types")
    return merged_mines


def load_shale_play_sites(
    raw_dir: Path,
    proj: UnifiedProjector,
    loc: HexLocator,
    albers_grid: Albers25Grid,
) -> list[dict]:
    """Sample major EIA tight-oil (38) and shale-gas (48) plays on a 1-in-4 staggered R=25 km non-adjacent lattice."""
    shale_path = raw_dir / "eia_shale_plays/shale_plays.geojson"
    if not shale_path.exists():
        return []
    gdf = gpd.read_file(shale_path).to_crs(albers_grid.CRS_STR)

    # EIA tight-oil & shale-gas major plays in priority order (stacked formations recorded in tooltip detail)
    OIL_ORDER = [
        "bakken",
        "wolfcamp - midland",
        "wolfcamp",
        "eagle ford",
        "niobrara",
        "abo-yeso",
        "three forks",
        "niobrara- mowry",
    ]
    OIL_STACKED_ONLY = {"bone spring", "spraberry", "delaware", "glorieta-yeso"}
    GAS_ORDER = [
        "marcellus",
        "utica",
        "haynesville-bossier",
        "barnett",
        "woodford",
        "mancos",
        "fayetteville",
        "woodford-caney",
    ]
    oil_rank = {nm: i for i, nm in enumerate(OIL_ORDER)}
    gas_rank = {nm: i for i, nm in enumerate(GAS_ORDER)}

    # Pre-index lattice land points (1 in 4 staggered lattice: row%2==0 and (col+row//2)%2==0)
    lattice_pts: list[tuple[tuple[int, int], Point, float, float]] = []
    for ci, ri in albers_grid.land_crs:
        if ri % 2 != 0 or (ci + ri // 2) % 2 != 0:
            continue
        dx, dy = albers_grid.cr_to_xy(ci, ri)
        ax, ay = dx - albers_grid.X_OFF, albers_grid.Y_OFF - dy
        lattice_pts.append(((ci, ri), Point(ax, ay), ax, ay))

    # Map each play polygon onto lattice hexes, keeping stacked formation metadata
    oil_hits: dict[tuple[int, int], list[dict]] = {}
    gas_hits: dict[tuple[int, int], list[dict]] = {}
    fallback_candidates: list[tuple[str, dict, object]] = []

    for _, r in gdf.iterrows():
        nm = str(r["Shale_play"] or "").strip()
        nml = nm.lower()
        basin = str(r["Basin"] or "").strip()
        if nml == "niobrara" and basin.lower() not in ("denver basin", "powder river"):
            continue
        kind = "oil" if (nml in oil_rank or nml in OIL_STACKED_ONLY) else ("gas" if nml in gas_rank else None)
        if not kind:
            continue
        area_km2 = float(r["Area_sq_km"] or 0.0)
        lith = str(r["Lithology"] or "").strip()
        age = str(r["Age_shale"] or "").strip()
        geom = r.geometry
        info = {
            "name": nm,
            "nml": nml,
            "kind": kind,
            "rank": oil_rank.get(nml, 99) if kind == "oil" else gas_rank.get(nml, 99),
            "stacked_only": nml in OIL_STACKED_ONLY,
            "area_km2": area_km2,
            "basin": basin,
            "lith": lith,
            "age": age,
        }
        target = oil_hits if kind == "oil" else gas_hits
        minx, miny, maxx, maxy = geom.bounds
        matched = 0
        for cr, pt, ax, ay in lattice_pts:
            if ax < minx or ax > maxx or ay < miny or ay > maxy:
                continue
            if geom.contains(pt):
                target.setdefault(cr, []).append(info)
                matched += 1
        if matched == 0 and not info["stacked_only"] and area_km2 >= 2500.0:
            fallback_candidates.append((kind, info, geom))

    # Small major plays without a lattice point (e.g., Fayetteville / Mancos) get 1 center hex if not already covered
    for kind, info, geom in fallback_candidates:
        target = oil_hits if kind == "oil" else gas_hits
        rp = geom.representative_point()
        cr = albers_grid.xy_to_cr(rp.x + albers_grid.X_OFF, albers_grid.Y_OFF - rp.y)
        if cr not in target and not any(
            abs(cr[0] - k[0]) <= 1 and abs(cr[1] - k[1]) <= 1 for k in target
        ):
            target[cr] = [info]

    out: list[dict] = []
    for kind, hits in [("oil", oil_hits), ("gas", gas_hits)]:
        for cr, lst in sorted(hits.items()):
            primaries = [x for x in lst if not x["stacked_only"]]
            if not primaries:
                continue
            primaries.sort(key=lambda x: (x["rank"], -x["area_km2"]))
            lead = primaries[0]
            others = sorted({x["name"] for x in lst if x["name"] != lead["name"]})
            dx, dy = albers_grid.cr_to_xy(cr[0], cr[1])
            ax, ay = dx - albers_grid.X_OFF, albers_grid.Y_OFF - dy
            lon, lat = albers_grid.cr_to_lonlat(cr[0], cr[1])
            st = albers_grid.state_at_albers(ax, ay)
            pt_disp = proj.project_point(lon, lat, state_abbr=st)
            if pt_disp is None:
                continue
            mx, my, _ = pt_disp
            hid, cbsa = loc.find(mx, my)
            extra = f"; also over {', '.join(others)}" if others else ""
            detail = f"{lead['basin']} Basin; {lead['lith']}, {lead['age']}{extra}"
            out.append({
                "name": f"{lead['name']} play",
                "kind": kind,
                "area_km2": round(lead["area_km2"]),
                "state": st,
                "detail": detail,
                "x": round(mx, 1),
                "y": round(my, 1),
                "hex_id": hid,
                "cbsa": cbsa,
            })

    oil_n = sum(1 for x in out if x["kind"] == "oil")
    gas_n = sum(1 for x in out if x["kind"] == "gas")
    print(f"[shale] Exported {len(out)} thinned 1-in-4 shale play sites ({oil_n} oil + {gas_n} gas)")
    return out


def load_ports_and_airports(
    raw_dir: Path, proj: UnifiedProjector, loc: HexLocator, albers_grid: Albers25Grid | None = None
) -> tuple[list[dict], list[dict]]:
    """Load USACE Principal Ports (with domestic/imports/exports breakdown) and FAA CY2025 Passenger + Cargo Airports."""
    import re as _re

    ports: list[dict] = []
    pdata = json.loads((raw_dir / "usace_ports/principal_ports.json").read_text())
    for feat in pdata.get("features", []):
        attr = feat.get("attributes", {})
        cent = feat.get("centroid") or {}
        lon, lat = cent.get("x"), cent.get("y")
        tons = float(attr.get("TOTAL") or 0)
        if lon is None or lat is None or tons <= 0:
            continue
        raw_name = str(attr.get("PORTNAME") or "").strip()
        # Normalize USACE "South Louisiana, LA, Port of" / "Coos Bay OR, Port of" / "Houston Port Authority, TX"
        st = ""
        pname = raw_name
        m_po1 = _re.match(r"^(.+?),\s*([A-Z]{2}),\s*Port of$", raw_name)
        m_po2 = _re.match(r"^(.+?)\s+([A-Z]{2}),\s*Port of$", raw_name)
        if m_po1:
            pname = f"Port of {m_po1.group(1).strip()}"
            st = m_po1.group(2)
        elif m_po2:
            pname = f"Port of {m_po2.group(1).strip()}"
            st = m_po2.group(2)
        elif "," in raw_name:
            tail = raw_name.split(",")[-1].strip()
            if len(tail) == 2 and tail.upper() in STATE_ABBR_TO_FIPS:
                st = tail.upper()
                pname = raw_name.rsplit(",", 1)[0].strip()
            else:
                # e.g. "New York, NY & NJ"
                m_st = _re.search(r"\b([A-Z]{2})\b", tail)
                if m_st and m_st.group(1) in STATE_ABBR_TO_FIPS:
                    st = m_st.group(1)
        pt = proj.project_point(lon, lat, state_abbr=st if st in STATE_ABBR_TO_FIPS else None)
        if pt is None:
            continue
        mx, my, _ = pt
        hid, cbsa = loc.find(mx, my)
        st_clean = st if st in STATE_ABBR_TO_FIPS else ""
        pn_lo = pname.lower()
        inland_states = {"KY", "WV", "TN", "AR", "MO", "OK", "IA", "NE", "KS", "ID"}
        gl_states = {"MN", "WI", "MI", "IL", "IN", "OH", "PA", "NY"}
        gl_kw = ("duluth", "superior", "cleveland", "toledo", "detroit", "chicago", "indiana harbor", "burns", "gary", "milwaukee", "ashtabula", "conneaut", "lorain", "sandusky", "presque", "stoneport", "calcite", "escanaba", "two harbors", "silver bay", "taconite", "st. clair", "buffalo", "monroe", "alpena", "muskegon", "manistee", "ludington", "green bay", "marquette")
        inland_kw = ("pittsburgh", "huntington", "cincinnati", "st. louis", "memphis", "louisville", "nashville", "chattanooga", "guntersville", "mount vernon", "tulsa", "vicksburg", "greenville", "helena", "baton rouge", "south louisiana", "kansas city", "minneapolis", "st. paul", "paducah", "owensboro")
        if any(k in pn_lo for k in gl_kw) or (st_clean in gl_states and lat > 41.2 and -93.0 <= lon <= -76.5 and "new york" not in pn_lo and "philadelphia" not in pn_lo and "albany" not in pn_lo):
            ptype = "great_lakes"
        elif st_clean in inland_states or any(k in pn_lo for k in inland_kw):
            ptype = "inland"
        else:
            ptype = "coastal"
        ports.append({
            "name": pname,
            "state": st_clean,
            "port_type": ptype,
            "rank": int(attr.get("RANK") or 0),
            "tons": int(round(tons)),
            "domestic": int(round(float(attr.get("DOMESTIC") or 0))),
            "imports": int(round(float(attr.get("IMPORTS") or 0))),
            "exports": int(round(float(attr.get("EXPORTS") or 0))),
            "x": round(mx, 1),
            "y": round(my, 1),
            "hex_id": hid,
            "cbsa": cbsa,
        })
    ports.sort(key=lambda x: x["tons"], reverse=True)
    for i, p in enumerate(ports, 1):
        if not p["rank"]:
            p["rank"] = i

    # FAA Airports (FAR-139 + extra non-FAR-139 primary/cargo airports from BTS NTAD)
    coords: dict[str, tuple[float, float, str, str, str]] = {}
    for fn in ("faa_airports/ntad_airports.geojson", "faa_airports/ntad_airports_extra.geojson"):
        fp = raw_dir / fn
        if not fp.exists():
            continue
        ntad = json.loads(fp.read_text())
        for feat in ntad.get("features", []):
            p = feat.get("properties", {})
            g = feat.get("geometry", {})
            code = str(p.get("ARPT_ID") or "").strip().upper()
            lon = p.get("LONG_DECIMAL") or (g.get("coordinates", [None, None])[0] if g else None)
            lat = p.get("LAT_DECIMAL") or (g.get("coordinates", [None, None])[1] if g else None)
            if code and lon is not None and lat is not None:
                coords[code] = (float(lon), float(lat), str(p.get("ARPT_NAME") or ""), str(p.get("CITY") or ""), str(p.get("STATE_CODE") or ""))

    air_map: dict[str, dict] = {}
    wb = openpyxl.load_workbook(raw_dir / "faa_airports/enplanements_cy2025.xlsx", read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[3]:
            continue
        code = str(row[3]).strip().upper()
        st = str(row[2] or "").strip().upper()
        if st not in STATE_ABBR_TO_FIPS:
            continue
        try:
            enp = int(round(float(row[8] or 0)))
        except (ValueError, TypeError):
            enp = 0
        try:
            enp_prev = int(round(float(row[9] or 0))) if len(row) > 9 and row[9] is not None else 0
        except (ValueError, TypeError):
            enp_prev = 0
        if enp <= 0:
            continue
        hub = str(row[7] or "N").strip().upper() if len(row) > 7 else "N"
        air_map[code] = {
            "code": code,
            "name": str(row[5] or code).strip(),
            "city": str(row[4] or "").strip(),
            "state": st,
            "hub": hub,
            "enplanements": enp,
            "enplanements_prev": enp_prev,
            "cargo_lbs": 0,
            "year": 2025,
        }
    wb.close()

    wb = openpyxl.load_workbook(raw_dir / "faa_airports/all_cargo_cy2025.xlsx", read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[4]:
            continue
        code = str(row[4]).strip().upper()
        st = str(row[3] or "").strip().upper()
        if st not in STATE_ABBR_TO_FIPS:
            continue
        try:
            cargo = int(round(float(row[9] or 0)))
        except (ValueError, TypeError):
            cargo = 0
        rec = air_map.setdefault(code, {
            "code": code,
            "name": str(row[5] or code).strip(),
            "city": str(row[6] or "").strip(),
            "state": st,
            "hub": "C",
            "enplanements": 0,
            "enplanements_prev": 0,
            "cargo_lbs": 0,
            "year": 2025,
        })
        rec["cargo_lbs"] = cargo
        rec["_in_cargo"] = True
    wb.close()

    airports: list[dict] = []
    for code, rec in air_map.items():
        if code not in coords:
            continue
        lon, lat, _, _, _ = coords[code]
        if albers_grid is not None and rec["state"] not in ("AK", "HI"):
            if albers_grid.mainland_dist_km(lon, lat) > 55.0:
                continue
        pt = proj.project_point(lon, lat, state_abbr=rec["state"])
        if pt is None:
            continue
        mx, my, _ = pt
        hid, cbsa = loc.find(mx, my)
        rec["x"] = round(mx, 1)
        rec["y"] = round(my, 1)
        rec["hex_id"] = hid
        rec["cbsa"] = cbsa
        airports.append(rec)

    # Keep EVERY primary airport (hub L/M/S/N or >= 10,000 boardings) and EVERY all-cargo airport listed in FAA CY2025
    merged_air = []
    for a in airports:
        in_cargo = a.pop("_in_cargo", False)
        if a["hub"] in ("L", "M", "S", "N") or a["enplanements"] >= 10_000 or in_cargo or a["cargo_lbs"] > 0:
            merged_air.append(a)
    merged_air.sort(key=lambda a: (a["enplanements"], a["cargo_lbs"]), reverse=True)

    print(f"[hubs] Exported {len(ports)} USACE ports & {len(merged_air)} FAA airports")
    return ports, merged_air


ARMY_RESTORED_NAMES = {
    "fort cavazos": "Fort Hood",
    "fort johnson": "Fort Polk",
    "fort novosel": "Fort Rucker",
    "fort eisenhower": "Fort Gordon",
    "fort gregg-adams": "Fort Lee",
    "fort walker": "Fort A.P. Hill",
    "fort barfoot": "Fort Pickett",
}

# Exact 28 curated flagship small-footprint active-duty bases (fleet bases, air logistics complexes, HQ posts)
FLAGSHIP_SMALL_BASES = {
    "naval station norfolk", "naval air station oceana", "naval base san diego", "navbase coronado",
    "naval base kitsap bangor", "nas jacksonville fl", "navsta mayport fl", "naval submarine base kings bay",
    "nas pensacola fl", "naval station great lakes il", "naval air station whidbey island",
    "naval air station patuxent river", "marine corps air station miramar", "joint base langley-eustis",
    "joint base andrews", "joint base charleston", "wright-patterson air force base", "nellis air force base",
    "hill air force base", "tinker air force base", "robins afb", "travis air force base",
    "macdill air force base", "keesler afb", "offutt air force base", "scott air force base",
    "fort belvoir", "fort meade",
}


def _norm_mirta_comp(raw: str) -> str:
    c = (raw or "").strip().lower()
    mapping = {
        "usa": "army",
        "usn": "navy",
        "usaf": "air_force",
        "usmc": "marines",
        "usar": "army_reserve",
        "usnr": "navy_reserve",
        "afr": "air_force_reserve",
        "usafr": "air_force_reserve",
        "usmcr": "marine_reserve",
        "armynationalguard": "army_guard",
        "arng": "army_guard",
        "airnationalguard": "air_guard",
        "ang": "air_guard",
        "whs": "other",
        "other": "other",
    }
    return mapping.get(c, "other")


def _restore_army_name(name: str) -> str:
    import re as _re

    out = name
    for old, restored in ARMY_RESTORED_NAMES.items():
        if old in out.lower():
            out = _re.sub(_re.escape(old), restored, out, flags=_re.I)
    return out


def load_military_map(
    raw_dir: Path,
    hex_df: pl.DataFrame,
    proj: UnifiedProjector,
    loc: HexLocator,
    albers_grid: Albers25Grid | None = None,
    county_to_cbsa: dict[str, str] | None = None,
) -> tuple[list[dict], list[dict], list[int]]:
    """Load all active/semi-active/caretaker DoD MIRTA installations with un-simplified Shape__Area*cos2, 11 components, R=25km parcel fold, exact county/CBSA overlap & top 30 ranges."""
    import re as _re

    # Preload county polygons for exact county/CBSA matching (ensures Fort Bragg -> 11360 & Columbus AFB -> 18060 without sliver leakage!)
    county_geoms: list[tuple[str, str, object, tuple[float, float, float, float]]] = []
    county_geoms_ea: list[tuple[str, str, object, tuple[float, float, float, float]]] = []
    c_shp = raw_dir / "census_boundaries/cb_2023_us_county_20m.zip"
    if c_shp.exists() and county_to_cbsa:
        cgdf = gpd.read_file(c_shp)
        cgdf_ea = cgdf.to_crs("EPSG:5070")
        for idx_c, r in cgdf.iterrows():
            fips = str(r.get("GEOID") or "").zfill(5)
            cbsa = county_to_cbsa.get(fips)
            if cbsa and r.geometry is not None and not r.geometry.is_empty:
                county_geoms.append((fips, cbsa, r.geometry, r.geometry.bounds))
                g_ea = cgdf_ea.geometry.iloc[idx_c].buffer(0)
                county_geoms_ea.append((fips, cbsa, g_ea, g_ea.bounds))

    def _cbsas_for_point(lon: float, lat: float) -> set[str]:
        pt = Point(lon, lat)
        out: set[str] = set()
        for _, cbsa, geom, (x0, y0, x1, y1) in county_geoms:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and geom.contains(pt):
                out.add(cbsa)
        return out

    def _cbsas_for_poly_ea(ea_geom, min_share: float = 0.08) -> set[str]:
        g = ea_geom.buffer(0)
        tot = g.area
        if tot <= 0:
            return set()
        x0, y0, x1, y1 = g.bounds
        out: set[str] = set()
        for _, cbsa, cgeom, (cx0, cy0, cx1, cy1) in county_geoms_ea:
            if cx1 < x0 or cx0 > x1 or cy1 < y0 or cy0 > y1:
                continue
            if g.intersects(cgeom) and (g.intersection(cgeom).area / tot) >= min_share:
                out.add(cbsa)
        return out

    # 1. Measure exact un-simplified area_km2 via Shape__Area * cos²(lat) & covered hexes/CBSAs from polygons.geojson
    poly_path = raw_dir / "mirta/polygons.geojson"
    area_by_name: dict[tuple[str, str], float] = {}
    cells_by_name: dict[tuple[str, str], set[int]] = {}
    cbsas_by_name: dict[tuple[str, str], set[str]] = {}
    range_meta: dict[tuple[str, str], dict] = {}
    restricted_set: set[int] = set()

    if poly_path.exists():
        mgdf = gpd.read_file(poly_path)
        mgdf_ea = mgdf.to_crs("EPSG:5070")
        hx = hex_df["lon"].to_numpy()
        hy = hex_df["lat"].to_numpy()
        hids = hex_df["hex_id"].to_numpy()
        for idx_r, row in mgdf.iterrows():
            status = str(row.get("SITEOPERATIONALSTATUS") or row.get("siteOperationalStatus") or "").strip().lower()
            if status not in ("act", "active", "semi", "care"):
                continue
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue
            st = str(row.get("STATENAMECODE") or row.get("stateNameCode") or "").strip().upper()
            if st not in STATE_ABBR_TO_FIPS:
                continue
            sname = _restore_army_name(_re.sub(r"\s+", " ", str(row.get("SITENAME") or row.get("siteName") or row.get("FEATURENAME") or "")).strip())
            if not sname:
                continue
            snl = sname.lower()
            # Merge Air Force & Marine Corps halves of Barry M. Goldwater Range (exclude Goldwater ANGB in Phoenix)
            if "barry" in snl and "goldwater" in snl and "angb" not in snl:
                sname = "The Barry M Goldwater Air Force Range"
            comp = _norm_mirta_comp(str(row.get("SITEREPORTINGCOMPONENT") or row.get("siteReportingComponent") or ""))
            sa = float(row.get("Shape__Area") or 0.0)
            c_pt = geom.centroid
            if sa > 0:
                area_km2 = (sa / 1e6) * (math.cos(math.radians(c_pt.y)) ** 2)
            else:
                ea_geom = mgdf_ea.geometry.iloc[idx_r]
                area_km2 = float(ea_geom.area) / 1e6 if ea_geom is not None else 0.0
            key = (sname.lower(), st)
            area_by_name[key] = area_by_name.get(key, 0.0) + area_km2

            if area_km2 >= 180.0:
                ea_geom_i = mgdf_ea.geometry.iloc[idx_r]
                if ea_geom_i is not None and not ea_geom_i.is_empty:
                    cbsas_by_name.setdefault(key, set()).update(_cbsas_for_poly_ea(ea_geom_i))
                minx, miny, maxx, maxy = geom.bounds
                cands = np.where((hx >= minx) & (hx <= maxx) & (hy >= miny) & (hy <= maxy))[0]
                hit_cells = cells_by_name.setdefault(key, set())
                for ci in cands:
                    if geom.contains(Point(hx[ci], hy[ci])):
                        hid_i = int(hids[ci])
                        hit_cells.add(hid_i)
                        if area_km2 >= 400.0 and status in ("act", "active", "semi"):
                            restricted_set.add(hid_i)
                if key not in range_meta and status in ("act", "active", "semi"):
                    # State holding majority of polygon centroid (e.g. Utah Test and Training Range -> UT!)
                    rng_st = st
                    if albers_grid is not None and st not in ("AK", "HI"):
                        ax_r, ay_r = albers_grid.to_albers.transform(c_pt.x, c_pt.y)
                        st_cent = albers_grid.state_at_albers(ax_r, ay_r)
                        if st_cent and "utah test" in sname.lower():
                            rng_st = st_cent
                    pt = proj.project_point(c_pt.x, c_pt.y, state_abbr=rng_st)
                    mx, my = (pt[0], pt[1]) if pt else (0.0, 0.0)
                    range_meta[key] = {"name": sname, "state": rng_st, "component": comp, "x": round(mx, 1), "y": round(my, 1)}

    # 2. Load strictly active/semi-active/caretaker installation points
    pts_geo = json.loads((raw_dir / "mirta/points.geojson").read_text())
    raw_bases: list[dict] = []
    seen_key: set[tuple[str, str]] = set()
    active_comps = {"army", "navy", "air_force", "marines", "other"}

    for feat in pts_geo.get("features", []):
        p = feat.get("properties", {})
        g = feat.get("geometry")
        if not g or g.get("type") != "Point":
            continue
        status = str(p.get("siteOperationalStatus") or "").strip().lower()
        if status not in ("act", "active", "semi", "care"):
            continue
        st = str(p.get("stateNameCode") or "").strip().upper()
        if st not in STATE_ABBR_TO_FIPS:
            continue
        lon, lat = g["coordinates"][0], g["coordinates"][1]
        is_conus = st not in ("AK", "HI")
        if albers_grid is not None and is_conus and albers_grid.mainland_dist_km(lon, lat) > 55.0:
            continue
        pt = proj.project_point(lon, lat, state_abbr=st)
        if pt is None:
            continue
        mx, my, _ = pt
        hid, cbsa = loc.find(mx, my)
        sname = _restore_army_name(_re.sub(r"\s+", " ", str(p.get("siteName") or p.get("featureName") or "Military Site")).strip())
        snl = sname.lower()
        if "barry" in snl and "goldwater" in snl and "angb" not in snl:
            sname = "The Barry M Goldwater Air Force Range"
        key = (sname.lower(), st)
        if key in seen_key:
            continue
        seen_key.add(key)

        comp = _norm_mirta_comp(str(p.get("siteReportingComponent") or ""))
        raw_area = area_by_name.get(key, 0.0)
        area_km2 = round(raw_area, 1)
        is_joint = str(p.get("isJointBase") or "").lower() in ("yes", "true", "1") or "joint base" in sname.lower()
        nl = sname.lower()
        is_flagship = nl in FLAGSHIP_SMALL_BASES

        if comp in active_comps and (raw_area >= 100.0 or is_flagship):
            tier = "major"
        elif (comp in active_comps and raw_area >= 1.0) or (comp not in active_comps and raw_area >= 10.0):
            tier = "base"
        else:
            tier = "site"

        c_cells = sorted(cells_by_name.get(key, set()))
        if not c_cells:
            c_cells = [hid]

        c_cbsas = set(cbsas_by_name.get(key, set()))
        c_cbsas.update(_cbsas_for_point(lon, lat))
        if cbsa:
            c_cbsas.add(cbsa)

        fold_cell: object = albers_grid.snap_land_cr(lon, lat) if (albers_grid is not None and is_conus) else ("disp", hid)
        disp_st = st
        if albers_grid is not None and is_conus and "utah test" in sname.lower():
            ax_b, ay_b = albers_grid.to_albers.transform(lon, lat)
            disp_st = albers_grid.state_at_albers(ax_b, ay_b) or st

        is_airfield = (not bool(_re.search(r"\bAnnex\b", sname, _re.I))) and bool(
            _re.search(
                r"\bAir Station\b|\bNAS\b|\bMCAS\b|\bAir Facility\b|\bALF\b|\bN?OLF\b|Outlying (Landing )?Field|Air Field\b|Airfield\b",
                sname,
                _re.I,
            )
        )
        raw_bases.append({
            "name": sname,
            "component": comp,
            "tier": tier,
            "joint": is_joint,
            "airfield": is_airfield,
            "status": status,
            "state": disp_st,
            "area_km2": area_km2 if raw_area > 0 else None,
            "x": round(mx, 1),
            "y": round(my, 1),
            "hex_id": hid,
            "cells": c_cells[:60],
            "cbsa": cbsa,
            "cbsas": sorted(c_cbsas),
            "_fold_cell": fold_cell,
            "_raw_area": raw_area,
        })

    # Fold < 1 km² parcels that share an R=25 km hex and component with a physically >= 1 km² installation (exact MIRTA rule)
    big_by_hc: dict[tuple[object, str], dict] = {}
    for b in sorted(raw_bases, key=lambda x: -x["_raw_area"]):
        if b["_raw_area"] >= 1.0:
            big_by_hc.setdefault((b["_fold_cell"], b["component"]), b)
    bases: list[dict] = []
    for b in raw_bases:
        fc = b.pop("_fold_cell")
        ra = b.pop("_raw_area")
        if ra < 1.0 and b["tier"] == "site" and (fc, b["component"]) in big_by_hc:
            if big_by_hc[(fc, b["component"])] is not b:
                continue
        b["id"] = f"mil_{len(bases)}"
        bases.append(b)

    # Sort: major first, then by area desc
    tier_ord = {"major": 0, "base": 1, "site": 2}
    bases.sort(key=lambda b: (tier_ord[b["tier"]], -(b["area_km2"] or 0.0), b["name"]))

    # Top 30 largest CONUS military ranges (>= 400 km²)
    ranges: list[dict] = []
    for key, rinfo in range_meta.items():
        if rinfo["state"] in ("AK", "HI"):
            continue
        ak = round(area_by_name.get(key, 0.0), 1)
        if ak < 400.0:
            continue
        cells = sorted(cells_by_name.get(key, set()))
        if not cells:
            hid, _ = loc.find(rinfo["x"], rinfo["y"])
            cells = [hid]
        ranges.append({
            "id": f"rng_{len(ranges)}",
            "name": rinfo["name"],
            "state": rinfo["state"],
            "component": rinfo["component"],
            "area_km2": ak,
            "cells": cells,
            "x": rinfo["x"],
            "y": rinfo["y"],
        })
    ranges.sort(key=lambda r: r["area_km2"], reverse=True)
    ranges = ranges[:30]

    conus_cnt = sum(1 for b in bases if b["state"] not in ("AK", "HI"))
    print(f"[mirta] Exported {len(bases)} installations (CONUS={conus_cnt}, major={sum(1 for b in bases if b['tier']=='major' and b['state'] not in ('AK','HI'))}, base={sum(1 for b in bases if b['tier']=='base' and b['state'] not in ('AK','HI'))}), {len(ranges)} ranges & {len(restricted_set)} restricted hexes")
    return bases, ranges, sorted(restricted_set)


def load_wonders(
    raw_dir: Path, hex_df: pl.DataFrame, proj: UnifiedProjector, loc: HexLocator
) -> tuple[list[dict], list[int], dict[int, float], int]:
    """Exact 4-rule Wonders (52 total): 15 National Parks + 5 Park Units + 20 R1 Universities + 12 Landmarks + Total NPS visits."""
    wonders: list[dict] = []
    hex_rd_musd: dict[int, float] = {}

    # 1. All-NPS 2025 Recreation Visits
    visits_by_code: dict[str, tuple[str, int]] = {}
    all_nps_visits = 0
    root = ET.fromstring((raw_dir / "nps/visits_2025.json").read_text(encoding="utf-8-sig"))
    for item in root:
        uc, un, rv = "", "", 0
        for ch in item:
            tag = ch.tag.split("}")[-1]
            if tag == "UnitCode":
                uc = (ch.text or "").strip().upper()
            elif tag == "UnitName":
                un = (ch.text or "").strip()
            elif tag == "RecreationVisitors":
                try:
                    rv = int(float(ch.text or 0))
                except ValueError:
                    rv = 0
        all_nps_visits += rv
        if uc:
            prev_n, prev_v = visits_by_code.get(uc, (un, 0))
            visits_by_code[uc] = (un or prev_n, prev_v + rv)

    nps_cents = json.loads((raw_dir / "nps/centroids.geojson").read_text())
    park_cands: list[dict] = []
    unit_cands: list[dict] = []
    mall_codes = {"LINC", "WWII", "VIVE", "KOWA", "MLKM", "FRDE", "THJE", "WAMO", "NAMA"}
    # Primary state for multi-state NPS units where centroid / main entrance belongs to primary state
    nps_primary_state = {"YELL": "WY", "GATE": "NY", "LAKE": "NV"}
    mall_best: dict | None = None

    for feat in nps_cents.get("features", []):
        p = feat.get("properties", {})
        g = feat.get("geometry")
        if not g or g.get("type") != "Point":
            continue
        uc = str(p.get("UNIT_CODE") or "").strip().upper()
        utype = str(p.get("UNIT_TYPE") or "")
        uname_geo = str(p.get("UNIT_NAME") or "")
        if uc not in visits_by_code:
            continue
        uname, visits = visits_by_code[uc]
        if visits <= 0:
            continue
        st = nps_primary_state.get(uc) or str(p.get("STATE") or "").strip().upper()[:2]
        if st not in STATE_ABBR_TO_FIPS or st in ("AK", "HI"):
            # Lower-48 ranked parks per rule (keep AK/HI out of L48 top 15/5 counts to match exact rule)
            continue
        lon, lat = g["coordinates"][0], g["coordinates"][1]
        pt = proj.project_point(lon, lat, state_abbr=st)
        if pt is None:
            continue
        mx, my, _ = pt
        hid, cbsa = loc.find(mx, my)

        # Motif for painted plinth art (exact reference WONDER_MOTIF_BY_ID alignment)
        park_motifs = {
            "GRCA": "canyon", "ZION": "canyon", "BRCA": "canyon",
            "ROMO": "peak", "GLAC": "peak", "GRTE": "peak", "YOSE": "peak", "MORA": "peak", "SEKI": "peak",
            "GRSM": "forest", "OLYM": "forest", "ACAD": "forest", "CUVA": "forest", "INDU": "forest", "SHEN": "forest",
            "JOTR": "desert", "SAGU": "desert", "DEVA": "desert",
            "YELL": "geyser", "HOSP": "geyser",
            "JEFF": "arch", "NAMA": "obelisk",
            "GOGA": "bridge", "GATE": "coast", "GUIS": "coast", "CAHA": "coast", "CACO": "coast", "ASIS": "coast",
            "LAKE": "dam", "GLCA": "dam",
        }
        pmotif = park_motifs.get(uc, "peak")

        if utype == "National Park" or (utype.startswith("National Park") and "Historical" not in utype):
            park_cands.append({
                "id": f"nat_{uc.lower()}",
                "kind": "natural",
                "rule_id": "national_park",
                "motif": pmotif,
                "name": uname_geo or uname,
                "state": st,
                "metric": visits,
                "metric_label": f"{visits/1e6:.2f}M 游客",
                "rule": "公开规则：全美本土 2025 年游客量前 15 国家公园 (NPS Visitor Use)",
                "extra": f"NPS 代码 {uc} · 国家公园",
                "x": round(mx, 1),
                "y": round(my, 1),
                "hex_id": hid,
                "cbsa": cbsa,
            })
        else:
            # Exclude parkways, scenic trails, and rivers (through-traffic)
            ul = (utype + " " + uname_geo).lower()
            if any(skip in ul for skip in ("parkway", "trail", "river")):
                continue
            if uc in mall_codes:
                if mall_best is None or visits > mall_best["metric"]:
                    mall_best = {
                        "id": "nat_nama",
                        "kind": "natural",
                        "rule_id": "park_unit",
                        "motif": "obelisk",
                        "name": "National Mall and Memorial Parks",
                        "state": "DC",
                        "metric": visits,
                        "metric_label": f"{visits/1e6:.2f}M 游客",
                        "rule": "公开规则：全美游客量前 5 其他国家公园单元（国家广场诸纪念碑合并取最高单碑计数）",
                        "extra": "华盛顿国家广场纪念碑群",
                        "x": round(mx, 1),
                        "y": round(my, 1),
                        "hex_id": hid,
                        "cbsa": cbsa,
                    }
                continue
            unit_cands.append({
                "id": f"unit_{uc.lower()}",
                "kind": "natural",
                "rule_id": "park_unit",
                "motif": pmotif,
                "name": uname_geo or uname,
                "state": st,
                "metric": visits,
                "metric_label": f"{visits/1e6:.2f}M 游客",
                "rule": "公开规则：全美本土 2025 年游客量前 5 其他国家公园单元（排除景观公路/步道/河流）",
                "extra": f"NPS 代码 {uc} · {utype}",
                "x": round(mx, 1),
                "y": round(my, 1),
                "hex_id": hid,
                "cbsa": cbsa,
            })

    if mall_best:
        unit_cands.append(mall_best)

    park_cands.sort(key=lambda w: w["metric"], reverse=True)
    for rank, w in enumerate(park_cands[:15], 1):
        w["rank"] = rank
        wonders.append(w)

    unit_cands.sort(key=lambda w: w["metric"], reverse=True)
    for rank, w in enumerate(unit_cands[:5], 1):
        w["rank"] = rank
        wonders.append(w)

    # Protected NPS hexes
    protected_hexes: set[int] = set()
    nps_b = gpd.read_file(raw_dir / "nps/boundaries.geojson")
    nps_parks = nps_b[nps_b["UNIT_TYPE"].astype(str).str.contains("National Park", na=False)]
    hx = hex_df["lon"].to_numpy()
    hy = hex_df["lat"].to_numpy()
    hids = hex_df["hex_id"].to_numpy()
    for _, row in nps_parks.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        minx, miny, maxx, maxy = geom.bounds
        cands = np.where((hx >= minx) & (hx <= maxx) & (hy >= miny) & (hy <= maxy))[0]
        for idx in cands:
            if geom.contains(Point(hx[idx], hy[idx])):
                protected_hexes.add(int(hids[idx]))

    # 2. ACADEMIC WONDERS — Top 20 R1 Research Universities (IPEDS C21BASIC == 15) by FY2025 NSF HERD R&D (max 2 per metro)
    ipeds_dir: dict[str, dict] = {}
    with zipfile.ZipFile(raw_dir / "ipeds/HD2024.zip") as z:
        fname = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        txt = io.TextIOWrapper(z.open(fname), encoding="utf-8-sig", errors="ignore")
        for row in csv.DictReader(txt):
            uid = (row.get("UNITID") or "").strip()
            try:
                lat = float(row.get("LATITUDE") or 0)
                lon = float(row.get("LONGITUD") or 0)
            except ValueError:
                continue
            if uid and lat and lon:
                c21 = str(row.get("C21BASIC") or "").strip()
                ipeds_dir[uid] = {
                    "name": (row.get("INSTNM") or "").strip(),
                    "city": (row.get("CITY") or "").strip(),
                    "state": (row.get("STABBR") or "").strip().upper(),
                    "is_r1": c21 == "15",
                    "lat": lat,
                    "lon": lon,
                    "enrollment": 0,
                }
    with zipfile.ZipFile(raw_dir / "ipeds/DRVEF122024.zip") as z:
        fname = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        txt = io.TextIOWrapper(z.open(fname), encoding="utf-8-sig", errors="ignore")
        for row in csv.DictReader(txt):
            uid = (row.get("UNITID") or "").strip()
            if uid in ipeds_dir:
                try:
                    ipeds_dir[uid]["enrollment"] = int(float(row.get("UNDUP") or row.get("FTE12MN") or 0))
                except ValueError:
                    pass

    # Fallback name-to-UNITID for universities reporting jointly with medical/APL centers (blank ipeds_unitid in HERD 2025)
    HERD_JOINT_UNITIDS = {
        "johns hopkins university": "162928",
        "ohio state university, the": "204796",
        "university of maryland": "163286",
        "texas a&m university, college station and health science center": "228723",
        "vanderbilt university and vanderbilt university medical center": "221999",
        "rutgers, the state university of new jersey, new brunswick": "186380",
        "indiana university, bloomington": "151351",
    }

    univ_cands: list[dict] = []
    seen_uids: set[str] = set()
    with zipfile.ZipFile(raw_dir / "herd/herd_2025.zip") as z:
        df_h = pl.read_csv(z.read("herd2025.csv"), infer_schema_length=5000, ignore_errors=True)
        tot_rd = df_h.filter(
            (pl.col("questionnaire_no").cast(pl.Utf8) == "01.g")
            & (pl.col("row").cast(pl.Utf8) == "Total")
        )
        for row in tot_rd.iter_rows(named=True):
            uid = str(row.get("ipeds_unitid") or "").strip()
            hname = str(row.get("inst_name_long") or "").strip()
            if not uid:
                uid = HERD_JOINT_UNITIDS.get(hname.lower(), "")
            rd_kusd = row.get("data")
            if not uid or rd_kusd is None or uid not in ipeds_dir or uid in seen_uids:
                continue
            try:
                rd_musd = float(rd_kusd) / 1000.0
            except (ValueError, TypeError):
                continue
            if rd_musd <= 0:
                continue
            info = ipeds_dir[uid]
            pt = proj.project_point(info["lon"], info["lat"], state_abbr=info["state"])
            if pt is None:
                continue
            mx, my, _ = pt
            hid, cbsa = loc.find(mx, my)
            hex_rd_musd[hid] = hex_rd_musd.get(hid, 0.0) + rd_musd
            # Carnegie 2025 R1 includes UCSF (110699, Special Focus Medical in IPEDS 2024 C21BASIC=27)
            if not (info["is_r1"] or uid == "110699"):
                continue
            seen_uids.add(uid)
            clean_univ_name = info["name"].replace("-Main Campus", "").strip()
            uni_motifs = ("hall", "redhall", "spire")
            umotif = uni_motifs[sum(ord(ch) for ch in uid) % 3]
            univ_cands.append({
                "id": f"acad_{uid}",
                "kind": "academic",
                "rule_id": "research_university",
                "motif": umotif,
                "name": clean_univ_name,
                "state": info["state"],
                "metric": round(rd_musd, 1),
                "metric_label": f"${rd_musd/1000:.2f}B R&D" if rd_musd >= 1000 else f"${rd_musd:.0f}M R&D",
                "rule": "公开规则：Carnegie R1 研究型大学 FY2025 NSF HERD 研发总支出前 20（每都会区最多 2 所，含附属医学院）",
                "extra": f"{info['city']}, {info['state']} · 在校生 {info['enrollment']:,}" if info["enrollment"] else f"{info['city']}, {info['state']}",
                "x": round(mx, 1),
                "y": round(my, 1),
                "hex_id": hid,
                "cbsa": cbsa,
            })

    univ_cands.sort(key=lambda w: w["metric"], reverse=True)
    metro_u_cnt: dict[str, int] = {}
    u_rank = 0
    for w in univ_cands:
        mc = w.get("cbsa") or w["id"]
        if metro_u_cnt.get(mc, 0) >= 2:
            continue
        metro_u_cnt[mc] = metro_u_cnt.get(mc, 0) + 1
        u_rank += 1
        w["rank"] = u_rank
        wonders.append(w)
        if u_rank >= 20:
            break

    # 3. HERITAGE WONDERS — Exact 12 Curated iconic NHL / NPS Landmarks (max 1 per metro, never repeating a park rule)
    iconic_landmarks = [
        ("Cahokia Mounds", "Cahokia Mounds", "IL", None, "cahokia mounds", "mound"),
        ("Cape Canaveral launch complexes", "Cape Canaveral launch complexes", "FL", None, "cape canaveral", "gantry"),
        ("French Quarter (Vieux Carré)", "French Quarter (Vieux Carré)", "LA", None, "vieux carre", "quarter"),
        ("Golden Spike", "Golden Spike", "UT", "GOSP", "golden spike", "spike"),
        ("Independence Hall", "Independence Hall", "PA", "INDE", "independence hall", "brickhall"),
        ("Monticello", "Monticello", "VA", None, "monticello", "rotunda"),
        ("Mount Rushmore", "Mount Rushmore", "SD", "MORU", "mount rushmore", "carved"),
        ("Statue of Liberty", "Statue of Liberty", "NY", "STLI", "statue of liberty", "statue"),
        ("Taos Pueblo", "Taos Pueblo", "NM", None, "taos pueblo", "adobe"),
        ("The Alamo", "The Alamo", "TX", None, "alamo", "mission"),
        ("Wright Brothers National Memorial", "Wright Brothers National Memorial", "NC", "WRBR", "wright brothers", "flight"),
        ("Wrigley Field", "Wrigley Field", "IL", None, "wrigley field", "ballpark"),
    ]
    nps_by_code = {}
    for feat in nps_cents.get("features", []):
        p = feat.get("properties", {})
        g = feat.get("geometry")
        uc = str(p.get("UNIT_CODE") or "").strip().upper()
        if uc and g and g.get("type") == "Point":
            nps_by_code[uc] = (g["coordinates"][0], g["coordinates"][1], str(p.get("STATE") or "")[:2].upper(), str(p.get("UNIT_NAME") or ""))

    nhl_feats = []
    for fn in ["nhl/nhl_points.geojson", "nhl/nhl_polygons.geojson"]:
        g = json.loads((raw_dir / fn).read_text())
        nhl_feats.extend(g.get("features", []))

    heritage_found: list[dict] = []
    for idx_lm, (title, label, want_st, nps_code, nhl_kw, lmotif) in enumerate(iconic_landmarks, 1):
        lon, lat, st, cert, extra_txt = None, None, want_st, "", ""
        if nps_code and nps_code in nps_by_code:
            lon, lat, st_n, uname_n = nps_by_code[nps_code]
            st = want_st or st_n
            extra_txt = f"NPS 国家纪念地 · {uname_n}"
        if lon is None:
            for feat in nhl_feats:
                p = feat.get("properties", {})
                rn = str(p.get("RESNAME") or "")
                raw_st = str(p.get("State") or "").strip().upper()
                fst = raw_st if raw_st in STATE_ABBR_TO_FIPS else STATE_FIPS_TO_ABBR.get(
                    next((k for k, v in STATE_FIPS_TO_NAME.items() if v.upper() == raw_st), ""), ""
                )
                if nhl_kw not in rn.lower():
                    continue
                if want_st and fst and fst != want_st:
                    continue
                geom = feat.get("geometry")
                if not geom:
                    continue
                if geom["type"] == "Point":
                    lon, lat = geom["coordinates"][0], geom["coordinates"][1]
                else:
                    c = geom["coordinates"]
                    while isinstance(c[0], list) and isinstance(c[0][0], list):
                        c = c[0]
                    lon = sum(pt[0] for pt in c) / len(c)
                    lat = sum(pt[1] for pt in c) / len(c)
                cert = str(p.get("CertDate") or "")[:4]
                extra_txt = f"{rn} · {p.get('City') or ''}, {st}"
                break
        if lon is None or lat is None:
            continue
        pt = proj.project_point(lon, lat, state_abbr=st if st in STATE_ABBR_TO_FIPS else None)
        if pt is None:
            continue
        mx, my, _ = pt
        hid, cbsa = loc.find(mx, my)
        heritage_found.append({
            "id": f"her_{idx_lm}",
            "kind": "heritage",
            "rule_id": "landmark",
            "motif": lmotif,
            "rank": idx_lm,
            "name": label,
            "state": st,
            "metric": int(cert) if cert.isdigit() else 1960,
            "metric_label": f"NHL 地标 ({cert})" if cert else "国家历史地标",
            "rule": "策展精选：12 处全美标志性国家历史地标与纪念地（每都会区最多 1 处，按字母顺序排列）",
            "extra": extra_txt or f"{title}, {st}",
            "x": round(mx, 1),
            "y": round(my, 1),
            "hex_id": hid,
            "cbsa": cbsa,
        })
    heritage_found.sort(key=lambda w: w["name"])
    for idx, w in enumerate(heritage_found, 1):
        w["rank"] = idx
    wonders.extend(heritage_found)

    print(f"[wonders] Built {len(wonders)} Wonders (15 Parks + 5 Park Units + {u_rank} R1 Univs + {len(heritage_found)} Landmarks) | All NPS visits={all_nps_visits:,}")
    return wonders, sorted(protected_hexes), hex_rd_musd, all_nps_visits


FAF_MODES = {
    1: ("truck", "公路货运 Truck"),
    2: ("rail", "铁路 Rail"),
    3: ("water", "水运 Water"),
    4: ("air", "航空 Air"),
    5: ("multiple", "多式联运与邮递 Multiple"),
    6: ("pipeline", "管道 Pipeline"),
    7: ("other", "其他 Other"),
}

FAF_SCTG_SHORT = {
    "01": "活畜与水产", "02": "谷物粮食", "03": "农产品", "04": "动物饲料", "05": "肉类与海鲜",
    "06": "加工谷物", "07": "其他食品", "08": "酒类饮料", "09": "烟草制品", "10": "石材建筑料",
    "11": "天然砂石", "12": "砾石碎石", "13": "非金属矿", "14": "金属矿石", "15": "煤炭",
    "16": "原油", "17": "汽油与航煤", "18": "燃料油", "19": "煤炭与石油制品", "20": "基础化工",
    "21": "医药制品", "22": "化肥", "23": "精细化工", "24": "塑料与橡胶", "25": "原木",
    "26": "木材制品", "27": "纸浆纸张", "28": "纸制品", "29": "印刷品", "30": "纺织服装",
    "31": "非金属矿物制品", "32": "基础金属", "33": "金属制品", "34": "机械设备", "35": "电子与精密仪器",
    "36": "汽车与机动车辆", "37": "航空船舶装备", "38": "精密仪表", "39": "家具照明", "40": "杂项制造",
    "41": "废料回收", "43": "混合货运",
}


def load_faf5_trade(
    raw_dir: Path,
    state_centers: dict[str, tuple[float, float]],
    cities: list[dict] | None = None,
) -> dict:
    """Aggregate FAF5.7.1 (2024 current_value_2024): 115 merged regional FAF zones + top 40 >=250km interstate corridors (or state fallback)."""
    import re as _re

    reg_zip = raw_dir / "faf5/FAF5.7.1_2018-2024.zip"
    use_regional = False
    if reg_zip.exists() and reg_zip.stat().st_size > 100_000_000:
        try:
            with zipfile.ZipFile(reg_zip) as ztest:
                if any(n.endswith(".csv") for n in ztest.namelist()):
                    use_regional = True
        except zipfile.BadZipFile:
            use_regional = False

    if use_regional:
        # 1. Read official 132 FAF Domestic Zones from FAF5_metadata.xlsx and merge multi-state split metro parts
        wb = openpyxl.load_workbook(raw_dir / "faf5/FAF5_metadata.xlsx", read_only=True, data_only=True)
        ws = wb["FAF Zone (Domestic)"]
        raw_zones: dict[str, tuple[str, str]] = {}
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row and row[0] is not None:
                zid = str(row[0]).strip().zfill(3)
                s_clean = _re.sub(r"\s+", " ", str(row[1] or zid).replace("_x000D_", " ").replace("\r", " ").replace("\n", " ")).strip()
                l_clean = _re.sub(r"\s+", " ", str(row[2] or row[1] or zid).replace("_x000D_", " ").replace("\r", " ").replace("\n", " ")).strip()
                raw_zones[zid] = (s_clean, l_clean)
        wb.close()

        # Group split parts like "New York-Newark, NY-NJ-CT-PA  CFS Area (CT Part)" -> single merged zone
        groups: dict[str, list[str]] = {}
        group_long: dict[str, str] = {}
        group_short: dict[str, str] = {}
        for zid, (sdesc, ldesc) in sorted(raw_zones.items()):
            base_long = _re.sub(r"\s*\([A-Z]{2}\s+Part\)\s*$", "", ldesc, flags=_re.I).strip()
            base_long = _re.sub(r"\s+CFS Area\s*$", "", base_long, flags=_re.I).strip()
            base_long = _re.sub(r"\s{2,}", " ", base_long)
            base_short = _re.sub(r"\s*\([A-Z]{2}\s+Part\)\s*$", "", sdesc, flags=_re.I).strip()
            base_short = _re.sub(r"\s+CFS Area\s*$", "", base_short, flags=_re.I).strip()
            gkey = base_long.lower()
            groups.setdefault(gkey, []).append(zid)
            if gkey not in group_long:
                group_long[gkey] = base_long
                group_short[gkey] = base_short

        raw_to_merged: dict[str, str] = {}
        merged_meta: dict[str, dict] = {}
        cities_list = cities or []

        # Official OMB/Census CBSA -> CSA mapping from list1_2023.xlsx so FAF CFS Areas claim all member CBSAs in their CSA
        cbsa_to_csa: dict[str, tuple[str, str]] = {}
        cbsa_xlsx = raw_dir / "cbsa/list1_2023.xlsx"
        if cbsa_xlsx.exists():
            wb_c = openpyxl.load_workbook(cbsa_xlsx, read_only=True, data_only=True)
            ws_c = wb_c[wb_c.sheetnames[0]]
            for row in ws_c.iter_rows(min_row=4, values_only=True):
                cc = str(row[0] or "").strip()
                csa_c = str(row[2] or "").strip()
                csa_t = str(row[6] or "").strip()
                if cc and csa_c and cc not in cbsa_to_csa:
                    cbsa_to_csa[cc] = (csa_c, csa_t)
            wb_c.close()

        # Pass 1: prepare metadata for all merged zones, separating metro vs rest_of_state
        metro_specs: list[tuple[str, list[str], str, str, list[str], list[str]]] = []
        rest_specs: list[tuple[str, list[str], str, str, list[str], list[str]]] = []

        for gkey, zids in groups.items():
            cid = sorted(zids)[0]
            ldesc = group_long[gkey]
            sdesc = group_short[gkey]
            st_fips_list = sorted({z[:2] for z in zids if z[:2] in STATE_FIPS_TO_ABBR})
            st_abbrs = [STATE_FIPS_TO_ABBR[sf] for sf in st_fips_list]
            is_rest = ldesc.lower().startswith("remainder of") or (len(zids) == 1 and (zids[0].endswith("9") or zids[0].endswith("0")))
            if ldesc.lower().startswith("remainder of "):
                short_clean = "Rest of " + ldesc[13:].strip()
                long_clean = short_clean
            else:
                long_clean = ldesc
                short_clean = ldesc.split(",")[0].split("-")[0].split("/")[0].strip()
                if short_clean == "Washington":
                    short_clean = "Washington, D.C."
                elif short_clean == "Dallas":
                    short_clean = "Dallas–Fort Worth"
                elif short_clean == "Rest of":
                    short_clean = sdesc
            for z in zids:
                raw_to_merged[z] = cid
            spec = (cid, zids, long_clean, short_clean, st_fips_list, st_abbrs)
            if is_rest:
                rest_specs.append(spec)
            else:
                metro_specs.append(spec)

        # Pass 2: anchor all METRO zones first & record every claimed CBSA (including all CBSAs inside the same Census CSA!)
        all_claimed_cities: set[str] = set()
        for cid, zids, long_clean, short_clean, st_fips_list, st_abbrs in metro_specs:
            st_set = set(st_abbrs)
            st_cities = [c for c in cities_list if c["state_abbr"] in st_set]
            # Primary city tokens from zone prefix (e.g. "Los Angeles-Long Beach" -> ["los angeles", "long beach"])
            prefix = long_clean.split(",")[0]
            tokens = [t.strip().lower() for t in _re.split(r"[-/]", prefix) if len(t.strip()) >= 3]
            matched = [
                c for c in st_cities
                if any(c["short_name"].lower().startswith(tok) or tok in c["name"].lower().split(",")[0] for tok in tokens[:2])
            ]
            # Prefer exact primary-token match as anchor
            if matched:
                primary_tok = tokens[0] if tokens else ""
                matched.sort(key=lambda c: (0 if c["short_name"].lower().startswith(primary_tok) else 1, -c["pop"]))
                anchor_c = matched[0]
            elif st_cities:
                st_cities.sort(key=lambda c: c["pop"], reverse=True)
                anchor_c = st_cities[0]
            else:
                anchor_c = None

            claimed_ids: list[str] = []
            if anchor_c is not None:
                ax, ay = anchor_c["x"], anchor_c["y"]
                gx, gy = anchor_c.get("_albers_x", ax), anchor_c.get("_albers_y", ay)
                claimed_ids.append(anchor_c["id"])
                # Claim all CBSAs in the same official Census CSA (within this zone's states)
                csa_info = cbsa_to_csa.get(anchor_c["id"])
                if csa_info:
                    csa_code = csa_info[0]
                    csa_members = sorted(
                        [c for c in st_cities if cbsa_to_csa.get(c["id"], ("", ""))[0] == csa_code and c["id"] != anchor_c["id"]],
                        key=lambda c: c["pop"],
                        reverse=True,
                    )
                    claimed_ids.extend(c["id"] for c in csa_members)
                for mc in matched:
                    if mc["id"] not in claimed_ids:
                        claimed_ids.append(mc["id"])
                all_claimed_cities.update(claimed_ids)
            else:
                sf0 = st_fips_list[0]
                ax, ay = state_centers.get(sf0, (0.0, 0.0))
                gx, gy = ax, ay

            merged_meta[cid] = {
                "id": cid,
                "faf": zids,
                "name": long_clean,
                "short": short_clean,
                "kind": "metro",
                "states": st_abbrs,
                "conus": all(sa not in ("AK", "HI") for sa in st_abbrs),
                "x": round(ax, 1),
                "y": round(ay, 1),
                "gx": gx,
                "gy": gy,
                "cities": claimed_ids[:10],
            }

        def _city_states(c: dict) -> set[str]:
            sub = str(c.get("states_sub") or c.get("state_abbr") or "")
            found = {t for t in _re.findall(r"\b[A-Z]{2}\b", sub) if t in STATE_ABBR_TO_FIPS}
            if c.get("state_abbr") in STATE_ABBR_TO_FIPS:
                found.add(c["state_abbr"])
            return found

        # Record anchor CBSA multi-state footprints for metro zones (detects cross-border suburbs like Memphis TN-MS-AR inside whole-state MS!)
        metro_anchor_states: dict[str, set[str]] = {}
        for cid, m in merged_meta.items():
            if m["kind"] == "metro" and m["cities"]:
                ac = next((c for c in cities_list if c["id"] == m["cities"][0]), None)
                if ac:
                    metro_anchor_states[cid] = _city_states(ac)

        # Process remainder ('9') zones before whole-state ('0') zones so multi-state unclaimed CBSAs (e.g. Davenport IA-IL) don't collide
        rest_specs_ordered = sorted(rest_specs, key=lambda sp: (0 if sp[1][0].endswith("9") else 1, sp[0]))
        for cid, zids, long_clean, short_clean, st_fips_list, st_abbrs in rest_specs_ordered:
            st_set = set(st_abbrs)
            is_whole_state = len(zids) == 1 and zids[0].endswith("0")
            unclaimed = sorted(
                [c for c in cities_list if (_city_states(c) & st_set) and c["id"] not in all_claimed_cities],
                key=lambda c: c["pop"],
                reverse=True,
            )
            if unclaimed:
                ax, ay = unclaimed[0]["x"], unclaimed[0]["y"]
                gx, gy = unclaimed[0].get("_albers_x", ax), unclaimed[0].get("_albers_y", ay)
                zcities = [c["id"] for c in unclaimed[:8]]
                all_claimed_cities.add(unclaimed[0]["id"])
            else:
                sf0 = st_fips_list[0]
                ax, ay = state_centers.get(sf0, (0.0, 0.0))
                gx, gy = ax, ay
                zcities = []
            merged_meta[cid] = {
                "id": cid,
                "faf": zids,
                "name": long_clean,
                "short": short_clean,
                "kind": "rest_of_state",
                "whole_state": is_whole_state,
                "states": st_abbrs,
                "conus": all(sa not in ("AK", "HI") for sa in st_abbrs),
                "x": round(ax, 1),
                "y": round(ay, 1),
                "gx": gx,
                "gy": gy,
                "cities": zcities,
            }

        with zipfile.ZipFile(reg_zip) as z:
            fname = next(n for n in z.namelist() if n.endswith(".csv"))
            df = pl.read_csv(
                z.read(fname),
                columns=["dms_orig", "dms_dest", "dms_mode", "sctg2", "trade_type", "tons_2024", "current_value_2024", "tmiles_2024"],
                schema_overrides={"dms_orig": pl.Utf8, "dms_dest": pl.Utf8, "sctg2": pl.Utf8},
            )

        df = df.with_columns([
            pl.col("dms_orig").str.zfill(3).replace_strict(raw_to_merged, default=pl.col("dms_orig").str.zfill(3)).alias("zo"),
            pl.col("dms_dest").str.zfill(3).replace_strict(raw_to_merged, default=pl.col("dms_dest").str.zfill(3)).alias("zd"),
            pl.col("sctg2").str.zfill(2),
        ])

        dom = df.filter(pl.col("trade_type") == 1)
        imp = df.filter(pl.col("trade_type") == 2)
        exp = df.filter(pl.col("trade_type") == 3)

        domestic_musd = float(dom["current_value_2024"].sum() or 0.0)
        import_musd = float(imp["current_value_2024"].sum() or 0.0)
        export_musd = float(exp["current_value_2024"].sum() or 0.0)

        mode_df = dom.group_by("dms_mode").agg([
            pl.col("current_value_2024").sum().alias("val"),
            pl.col("tons_2024").sum().alias("tons"),
        ]).sort("val", descending=True)
        modes = []
        for r in mode_df.iter_rows(named=True):
            if r["dms_mode"] is None:
                continue
            mid, mname = FAF_MODES.get(int(r["dms_mode"]), ("other", "其他"))
            modes.append({"id": mid, "mode": mname, "value_musd": round(float(r["val"]), 1), "tons_k": round(float(r["tons"]), 1)})

        comm_df = dom.group_by("sctg2").agg(pl.col("current_value_2024").sum().alias("val")).sort("val", descending=True).head(12)
        commodities = [
            {"name": FAF_SCTG_SHORT.get(r["sctg2"], f"SCTG {r['sctg2']}"), "value_musd": round(float(r["val"]), 1)}
            for r in comm_df.iter_rows(named=True)
        ]

        inter = dom.filter(pl.col("zo") != pl.col("zd")).with_columns([
            pl.when(pl.col("zo") < pl.col("zd")).then(pl.col("zo")).otherwise(pl.col("zd")).alias("za"),
            pl.when(pl.col("zo") < pl.col("zd")).then(pl.col("zd")).otherwise(pl.col("zo")).alias("zb"),
        ])

        pair_tot = inter.group_by(["za", "zb"]).agg([
            pl.col("current_value_2024").sum().alias("val"),
            pl.col("tons_2024").sum().alias("tons"),
            pl.col("tmiles_2024").sum().alias("tmiles"),
        ]).sort("val", descending=True)

        pair_modes_df = inter.group_by(["za", "zb", "dms_mode"]).agg(pl.col("current_value_2024").sum().alias("v"))
        pair_modes: dict[tuple[str, str], dict[str, float]] = {}
        for r in pair_modes_df.iter_rows(named=True):
            if r["dms_mode"] is None:
                continue
            mid, _ = FAF_MODES.get(int(r["dms_mode"]), ("other", "其他"))
            pair_modes.setdefault((r["za"], r["zb"]), {})[mid] = float(r["v"])

        top_comm_df = inter.group_by(["za", "zb", "sctg2"]).agg(pl.col("current_value_2024").sum().alias("v")).sort("v", descending=True).unique(["za", "zb"], keep="first")
        comm_lk = {(r["za"], r["zb"]): FAF_SCTG_SHORT.get(r["sctg2"], r["sctg2"]) for r in top_comm_df.iter_rows(named=True)}

        # Top 40 domestic interstate routes: NO state in common, CONUS anchors >= 250 km apart!
        routes = []
        for r in pair_tot.iter_rows(named=True):
            a, b = r["za"], r["zb"]
            ma, mb = merged_meta.get(a), merged_meta.get(b)
            if not ma or not mb or not ma["conus"] or not mb["conus"]:
                continue
            if set(ma["states"]) & set(mb["states"]):
                continue
            # Exclude cross-border metro suburbs spilling directly into a neighboring whole-state FAF zone (e.g. Memphis TN-MS-AR <-> Mississippi)
            if ma.get("whole_state") and (metro_anchor_states.get(b, set()) & set(ma["states"])):
                continue
            if mb.get("whole_state") and (metro_anchor_states.get(a, set()) & set(mb["states"])):
                continue
            dist_km = round(math.hypot(mb["gx"] - ma["gx"], mb["gy"] - ma["gy"]))
            if dist_km < 250:
                continue
            pm = pair_modes.get((a, b), {})
            ptot = sum(pm.values()) or 1.0
            mode_shares = {k: round(v / ptot, 4) for k, v in sorted(pm.items(), key=lambda kv: kv[1], reverse=True) if v > 0}
            top_mode_id = next(iter(mode_shares), "truck")
            routes.append({
                "rank": len(routes) + 1,
                "a": a,
                "b": b,
                "orig_st": ma["short"],
                "dest_st": mb["short"],
                "orig_full": ma["name"],
                "dest_full": mb["name"],
                "orig_fips": a,
                "dest_fips": b,
                "ox": ma["x"],
                "oy": ma["y"],
                "dx": mb["x"],
                "dy": mb["y"],
                "dist_km": dist_km,
                "value_musd": round(float(r["val"]), 1),
                "tons_k": round(float(r["tons"]), 1),
                "tmiles_m": round(float(r["tmiles"]), 1),
                "top_mode": top_mode_id,
                "modes": mode_shares,
                "top_commodity": comm_lk.get((a, b), "混合货运"),
            })
            if len(routes) >= 40:
                break

        within_df = dom.filter(pl.col("zo") == pl.col("zd")).group_by("zo").agg(pl.col("current_value_2024").sum().alias("v"))
        within_lk = {r["zo"]: float(r["v"]) for r in within_df.iter_rows(named=True)}
        imp_df = imp.group_by("zd").agg(pl.col("current_value_2024").sum().alias("v"))
        imp_lk = {r["zd"]: float(r["v"]) for r in imp_df.iter_rows(named=True)}
        exp_df = exp.group_by("zo").agg(pl.col("current_value_2024").sum().alias("v"))
        exp_lk = {r["zo"]: float(r["v"]) for r in exp_df.iter_rows(named=True)}

        other_tot: dict[str, float] = {}
        partners_map: dict[str, list[tuple[str, str, float, str]]] = {}
        for r in pair_tot.iter_rows(named=True):
            a, b, val = r["za"], r["zb"], float(r["val"])
            ma, mb = merged_meta.get(a), merged_meta.get(b)
            pm = pair_modes.get((a, b), {})
            tm = max(pm.items(), key=lambda kv: kv[1])[0] if pm else "truck"
            # For CONUS zones, count CONUS-to-CONUS domestic zone flows (excluding AK/HI offshore pairs)
            if ma and mb:
                if ma["conus"] and mb["conus"]:
                    other_tot[a] = other_tot.get(a, 0.0) + val
                    other_tot[b] = other_tot.get(b, 0.0) + val
                    partners_map.setdefault(a, []).append((b, mb["name"], round(val, 1), tm))
                    partners_map.setdefault(b, []).append((a, ma["name"], round(val, 1), tm))
                else:
                    if not ma["conus"]:
                        other_tot[a] = other_tot.get(a, 0.0) + val
                        partners_map.setdefault(a, []).append((b, mb["name"], round(val, 1), tm))
                    if not mb["conus"]:
                        other_tot[b] = other_tot.get(b, 0.0) + val
                        partners_map.setdefault(b, []).append((a, ma["name"], round(val, 1), tm))

        zones = []
        for zid, zm in merged_meta.items():
            pts = sorted(partners_map.get(zid, []), key=lambda x: x[2], reverse=True)[:5]
            zones.append({
                "fips": zid,
                "abbr": "–".join(zm["states"]),
                "name": zm["short"],
                "full_name": zm["name"],
                "kind": zm["kind"],
                "conus": zm["conus"],
                "cities": zm["cities"],
                "x": zm["x"],
                "y": zm["y"],
                "within_musd": round(within_lk.get(zid, 0.0), 1),
                "other_musd": round(other_tot.get(zid, 0.0), 1),
                "import_musd": round(imp_lk.get(zid, 0.0), 1),
                "export_musd": round(exp_lk.get(zid, 0.0), 1),
                "partners": [[p[1], p[2], p[3], p[0]] for p in pts],
            })
        zones.sort(key=lambda z: z["other_musd"], reverse=True)

        conus_z = sum(1 for z in zones if z["conus"])
        print(f"[faf5-regional] Aggregated ${domestic_musd/1e6:.2f}T domestic (current $), ${import_musd/1e6:.2f}T import, ${export_musd/1e6:.2f}T export -> {len(routes)} >=250km interstate routes & {conus_z} CONUS FAF zones (total {len(zones)})")
        return {
            "total_musd": round(domestic_musd, 1),
            "import_musd": round(import_musd, 1),
            "export_musd": round(export_musd, 1),
            "regional": True,
            "routes": routes,
            "modes": modes,
            "commodities": commodities,
            "zones": zones,
        }

    # Fallback: State-level FAF5.7.1 file
    with zipfile.ZipFile(raw_dir / "faf5/FAF5.7.1_State_2018-2024.zip") as z:
        fname = next(n for n in z.namelist() if n.endswith(".csv"))
        df = pl.read_csv(
            z.read(fname),
            columns=["dms_origst", "dms_destst", "dms_mode", "sctg2", "trade_type", "tons_2024", "current_value_2024", "tmiles_2024"],
            schema_overrides={"dms_origst": pl.Utf8, "dms_destst": pl.Utf8, "sctg2": pl.Utf8},
        )

    df = df.with_columns([
        pl.col("dms_origst").str.zfill(2),
        pl.col("dms_destst").str.zfill(2),
        pl.col("sctg2").str.zfill(2),
    ])

    dom = df.filter(pl.col("trade_type") == 1)
    imp = df.filter(pl.col("trade_type") == 2)
    exp = df.filter(pl.col("trade_type") == 3)

    domestic_musd = float(dom["current_value_2024"].sum() or 0.0)
    import_musd = float(imp["current_value_2024"].sum() or 0.0)
    export_musd = float(exp["current_value_2024"].sum() or 0.0)

    # Mode breakdown (domestic current $)
    mode_df = dom.group_by("dms_mode").agg([
        pl.col("current_value_2024").sum().alias("val"),
        pl.col("tons_2024").sum().alias("tons"),
    ]).sort("val", descending=True)
    modes = []
    for r in mode_df.iter_rows(named=True):
        if r["dms_mode"] is None:
            continue
        mid, mname = FAF_MODES.get(int(r["dms_mode"]), ("other", "其他"))
        modes.append({"id": mid, "mode": mname, "value_musd": round(float(r["val"]), 1), "tons_k": round(float(r["tons"]), 1)})

    # Top commodities (domestic current $)
    comm_df = dom.group_by("sctg2").agg(pl.col("current_value_2024").sum().alias("val")).sort("val", descending=True).head(12)
    commodities = [
        {"name": FAF_SCTG_SHORT.get(r["sctg2"], f"SCTG {r['sctg2']}"), "value_musd": round(float(r["val"]), 1)}
        for r in comm_df.iter_rows(named=True)
    ]

    # Bidirectional interstate corridors (A <-> B merged!)
    inter = dom.filter(pl.col("dms_origst") != pl.col("dms_destst")).with_columns([
        pl.when(pl.col("dms_origst") < pl.col("dms_destst")).then(pl.col("dms_origst")).otherwise(pl.col("dms_destst")).alias("st_a"),
        pl.when(pl.col("dms_origst") < pl.col("dms_destst")).then(pl.col("dms_destst")).otherwise(pl.col("dms_origst")).alias("st_b"),
    ])

    pair_tot = inter.group_by(["st_a", "st_b"]).agg([
        pl.col("current_value_2024").sum().alias("val"),
        pl.col("tons_2024").sum().alias("tons"),
        pl.col("tmiles_2024").sum().alias("tmiles"),
    ]).sort("val", descending=True)

    # Mode breakdown per pair
    pair_modes_df = inter.group_by(["st_a", "st_b", "dms_mode"]).agg(pl.col("current_value_2024").sum().alias("v"))
    pair_modes: dict[tuple[str, str], dict[str, float]] = {}
    for r in pair_modes_df.iter_rows(named=True):
        if r["dms_mode"] is None:
            continue
        mid, _ = FAF_MODES.get(int(r["dms_mode"]), ("other", "其他"))
        pair_modes.setdefault((r["st_a"], r["st_b"]), {})[mid] = float(r["v"])

    top_comm_df = inter.group_by(["st_a", "st_b", "sctg2"]).agg(pl.col("current_value_2024").sum().alias("v")).sort("v", descending=True).unique(["st_a", "st_b"], keep="first")
    comm_lk = {(r["st_a"], r["st_b"]): FAF_SCTG_SHORT.get(r["sctg2"], r["sctg2"]) for r in top_comm_df.iter_rows(named=True)}

    routes = []
    for r in pair_tot.iter_rows(named=True):
        a, b = r["st_a"], r["st_b"]
        if a not in state_centers or b not in state_centers:
            continue
        ox, oy = state_centers[a]
        dx, dy = state_centers[b]
        dist_km = round(math.hypot(dx - ox, dy - oy))
        if dist_km < 120:
            continue
        pm = pair_modes.get((a, b), {})
        ptot = sum(pm.values()) or 1.0
        mode_shares = {k: round(v / ptot, 4) for k, v in sorted(pm.items(), key=lambda kv: kv[1], reverse=True) if v > 0}
        top_mode_id = next(iter(mode_shares), "truck")
        routes.append({
            "rank": len(routes) + 1,
            "orig_st": STATE_FIPS_TO_ABBR.get(a, a),
            "dest_st": STATE_FIPS_TO_ABBR.get(b, b),
            "orig_fips": a,
            "dest_fips": b,
            "ox": round(ox, 1),
            "oy": round(oy, 1),
            "dx": round(dx, 1),
            "dy": round(dy, 1),
            "dist_km": dist_km,
            "value_musd": round(float(r["val"]), 1),
            "tons_k": round(float(r["tons"]), 1),
            "tmiles_m": round(float(r["tmiles"]), 1),
            "top_mode": top_mode_id,
            "modes": mode_shares,
            "top_commodity": comm_lk.get((a, b), "混合货运"),
        })
        if len(routes) >= 40:
            break

    # State freight zones (within, other_states, imports, exports, top 5 partner states)
    within_df = dom.filter(pl.col("dms_origst") == pl.col("dms_destst")).group_by("dms_origst").agg(pl.col("current_value_2024").sum().alias("v"))
    within_lk = {r["dms_origst"]: float(r["v"]) for r in within_df.iter_rows(named=True)}

    imp_df = imp.group_by("dms_destst").agg(pl.col("current_value_2024").sum().alias("v"))
    imp_lk = {r["dms_destst"]: float(r["v"]) for r in imp_df.iter_rows(named=True)}
    exp_df = exp.group_by("dms_origst").agg(pl.col("current_value_2024").sum().alias("v"))
    exp_lk = {r["dms_origst"]: float(r["v"]) for r in exp_df.iter_rows(named=True)}

    other_tot: dict[str, float] = {}
    partners_map: dict[str, list[tuple[str, float, str]]] = {}
    for r in pair_tot.iter_rows(named=True):
        a, b, val = r["st_a"], r["st_b"], float(r["val"])
        pm = pair_modes.get((a, b), {})
        tm = max(pm.items(), key=lambda kv: kv[1])[0] if pm else "truck"
        other_tot[a] = other_tot.get(a, 0.0) + val
        other_tot[b] = other_tot.get(b, 0.0) + val
        partners_map.setdefault(a, []).append((STATE_FIPS_TO_ABBR.get(b, b), round(val, 1), tm))
        partners_map.setdefault(b, []).append((STATE_FIPS_TO_ABBR.get(a, a), round(val, 1), tm))

    zones = []
    for sf, abbr in sorted(STATE_FIPS_TO_ABBR.items()):
        pts = sorted(partners_map.get(sf, []), key=lambda x: x[1], reverse=True)[:5]
        zones.append({
            "fips": sf,
            "abbr": abbr,
            "name": STATE_FIPS_TO_NAME[sf],
            "within_musd": round(within_lk.get(sf, 0.0), 1),
            "other_musd": round(other_tot.get(sf, 0.0), 1),
            "import_musd": round(imp_lk.get(sf, 0.0), 1),
            "export_musd": round(exp_lk.get(sf, 0.0), 1),
            "partners": [[p[0], p[1], p[2]] for p in pts],
        })
    zones.sort(key=lambda z: z["other_musd"], reverse=True)

    print(f"[faf5] Aggregated ${domestic_musd/1e6:.2f}T domestic (current $), ${import_musd/1e6:.2f}T import, ${export_musd/1e6:.2f}T export -> top {len(routes)} corridors & {len(zones)} state zones")
    return {
        "total_musd": round(domestic_musd, 1),
        "import_musd": round(import_musd, 1),
        "export_musd": round(export_musd, 1),
        "routes": routes,
        "modes": modes,
        "commodities": commodities,
        "zones": zones,
    }
