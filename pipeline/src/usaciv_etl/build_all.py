"""End-to-end Terra Americana ETL pipeline: 31 official U.S. datasets -> 6 compact frontend JSON bundles."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import polars as pl

from .grid.hex_grid import build_hex_grid_and_crosswalk
from .manifest import SOURCES
from .spatial.geo_layers import UnifiedProjector, build_vector_art_layers, compute_albers25_land_cover, sample_etopo, sample_nlcd
from .spatial.point_layers import (
    Albers25Grid,
    HexLocator,
    MINE_META,
    POWER_TYPE_META,
    load_eia_power_plants,
    load_faf5_trade,
    load_military_map,
    load_mines_and_coal,
    load_ports_and_airports,
    load_shale_play_sites,
    load_wonders,
)
from .spatial.tabular_sources import (
    BEA_SECTOR_LINES,
    C24030_IND_20,
    FEMA_TYPE_DEFS,
    INDUSTRY_LABELS_ZH,
    RELIGION_TRADITIONS,
    STATE_ABBR_TO_FIPS,
    STATE_FIPS_TO_ABBR,
    STATE_FIPS_TO_NAME,
    STATE_REGION,
    load_acs_1yr_metros,
    load_acs_5yr_counties,
    load_bea_gdp,
    load_bls_qcew,
    load_cbsa_delineation,
    load_cdc_places,
    load_fema_disasters,
    load_gazetteer_counties,
    load_military_state_tables,
    load_noaa_billions,
    load_pep_population,
    load_usrc_2020,
)

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PIPELINE_ROOT / "data_raw"
WORK_DIR = PIPELINE_ROOT / "data_work"
WEB_DATA_DIR = PIPELINE_ROOT.parent / "web/public/data"


DISTRICT_CATALOG = [
    {"id": "campus", "name": "研究学院", "name_en": "Research Campus", "color": "#29669C", "naics": ["5132", "5182", "5415", "5417", "3344", "6113"], "naics_label": "软件、半导体、科研与顶尖高校", "rule": "BLS QCEW 科技与科研行业区位商 (LQ >= 1.35) 或大型研究型高校群"},
    {"id": "foundry", "name": "汽车与重工城", "name_en": "Auto & Heavy Foundry", "color": "#B85636", "naics": ["3361", "3364", "331", "31_33"], "naics_label": "汽车、航空航天与重型制造", "rule": "BLS QCEW 汽车(3361)/航天(3364)/重工制造区位商 (LQ >= 1.35)"},
    {"id": "exchange", "name": "金融交易所", "name_en": "Financial Exchange", "color": "#C69128", "naics": ["5231", "524", "52"], "naics_label": "证券投行、保险与金融总部", "rule": "BLS QCEW 金融与证券保险行业区位商 (LQ >= 1.30)"},
    {"id": "refinery", "name": "能源精炼中心", "name_en": "Energy Refinery", "color": "#C97528", "naics": ["211", "2121", "3241", "2211"], "naics_label": "油气采掘、煤炭与石化精炼", "rule": "BLS QCEW 油气采掘(211)/石化精炼(3241)区位商 (LQ >= 1.50)"},
    {"id": "harbor", "name": "航运海港", "name_en": "Maritime Harbor", "color": "#267A8C", "naics": ["483", "4883"], "naics_label": "水运航运与深水港口吞吐", "rule": "USACE 头部港口吞吐或 BLS 水运港口区位商 (LQ >= 1.40)"},
    {"id": "aerohub", "name": "航空枢纽港", "name_en": "Aero-Hub", "color": "#4580B0", "naics": ["481", "4881"], "naics_label": "航空客运与大型货运枢纽", "rule": "FAA 大型客货枢纽或 BLS 航空业区位商 (LQ >= 1.40)"},
    {"id": "medical", "name": "医疗康养院区", "name_en": "Medical Pavilion", "color": "#317E5E", "naics": ["622", "621", "3254"], "naics_label": "旗舰医院、医药研发与康养", "rule": "BLS QCEW 医院(622)/制药(3254)高浓度聚集 (LQ >= 1.30)"},
    {"id": "promenade", "name": "娱乐观光长廊", "name_en": "Grand Promenade", "color": "#93456E", "naics": ["7132", "721", "713", "711", "512"], "naics_label": "影视演艺、文旅住宿与度假", "rule": "BLS QCEW 住宿(721)/演艺影视(512/711)/娱乐区位商 (LQ >= 1.35)"},
    {"id": "capitol", "name": "联邦/州府议政厅", "name_en": "Civic Capitol", "color": "#6E655B", "naics": ["921", "922", "928110"], "naics_label": "联邦与州公共治理机构", "rule": "BLS QCEW 公共行政(921)/国家安全机构区位商 (LQ >= 1.35)"},
    {"id": "bastion", "name": "军事要塞营地", "name_en": "Military Bastion", "color": "#5B6B7C", "naics": ["928110"], "naics_label": "DoD 现役军事基地与防务", "rule": "DoD MIRTA 大型驻军基地驻地或国家安全高集中度"},
]

# 27 Data Lenses = 19 original reference-aligned county/hex lenses + 8 high-signal incremental lenses
# (5 county-level from PEP/BEA/QCEW/ACS + 3 clearly badged state-level macro lenses from OLDCC/DMDC/NOAA)
# Tuple: (id, name, name_en, group, unit, format, ramp, higher_is, source_id, description, scale, domain, granularity)
LENS_SPECS = [
    # --- 19 Original Reference-Aligned Lenses (exact ramps, domains & scales preserved untouched) ---
    ("density", "人口密度", "Population Density", "people", "人 / km²", "dec1", "density", "neutral", "acs_5yr", "每平方公里陆地常住人口数（ACS B01003 按面积分配到 25 km 六边形）。对数色阶 [0.34, 390]。", "log", (0.34, 390.0), "county"),
    ("income", "家庭中位收入", "Median Household Income", "prosperity", "美元 / 年", "usd", "income", "good", "acs_5yr", "六边形所跨县的家庭中位年收入，按人口加权合成（ACS B19013）。", "linear", (41000.0, 110000.0), "county"),
    ("home", "房价中位数", "Median Home Value", "prosperity", "美元", "usd", "home", "neutral", "acs_5yr", "自有住房中位估值，按人口加权合成（ACS B25077）。对数色阶 [$89K, $690K]。", "log", (89000.0, 690000.0), "county"),
    ("poverty", "贫困率", "Poverty Rate", "prosperity", "人口占比", "pct", "poverty", "bad", "acs_5yr", "家庭收入低于联邦贫困线的人口占比（ACS B17001）。", "linear", (0.065, 0.30), "county"),
    ("age", "中位年龄", "Median Age", "people", "岁", "dec1", "age", "neutral", "acs_5yr", "常住人口中位年龄（ACS B01002），呈现老龄化与年轻增长带。", "linear", (31.0, 54.0), "county"),
    ("foreign_born", "外国出生人口", "Foreign-Born Share", "people", "人口占比", "pct", "foreign_born", "neutral", "acs_5yr", "出生在美国境外的常住人口占比（ACS B05012）。", "linear", (0.007, 0.25), "county"),
    ("bachelors", "本科及以上学历", "Bachelor's Degree+", "knowledge", "25岁+成人占比", "pct", "bachelors", "good", "acs_5yr", "25 岁及以上人口中拥有本科、硕士、专业或博士学位的比例（ACS B15003）。", "linear", (0.12, 0.51), "county"),
    ("broadband", "宽带普及率", "Broadband Access", "knowledge", "家庭占比", "pct", "broadband", "good", "acs_5yr", "拥有任意类型宽带互联网订阅的家庭占比（ACS B28002）。", "linear", (0.72, 0.95), "county"),
    ("commute", "平均单程通勤", "Mean Commute Time", "life", "分钟 / 单程", "min", "commute", "bad", "acs_5yr", "16 岁以上非居家办公劳动者的平均单程通勤时间（ACS B08013 ÷ B08303）。", "linear", (13.0, 33.0), "county"),
    ("homeownership", "住房自有率", "Homeownership Rate", "life", "自住占比", "pct", "homeownership", "neutral", "acs_5yr", "由房主自住的住房占全部已入住住房的比例（ACS B25003）。", "linear", (0.55, 0.84), "county"),
    ("uninsured", "无医保比例", "Uninsured Share", "life", "人口占比", "pct", "uninsured", "bad", "acs_5yr", "无任何医疗保险覆盖的平民人口占比（ACS B27010）。", "linear", (0.036, 0.22), "county"),
    ("forest", "森林覆盖率", "Forest Cover", "land", "陆地占比", "pct", "forest", "neutral", "nlcd", "六边形陆地中落叶林、常绿林与混交林的真实覆被占比（USGS NLCD）。", "linear", (0.0, 0.84), "county"),
    ("farmland", "农田与牧场", "Farmland & Pasture", "land", "陆地占比", "pct", "farmland", "neutral", "nlcd", "六边形陆地中耕地与牧草地的真实覆被占比（USGS NLCD 81 + 82）。", "linear", (0.0, 0.87), "county"),
    ("developed", "城镇建设用地", "Built-Up Intensity", "land", "陆地占比", "pct", "developed", "neutral", "nlcd", "六边形陆地中低/中/高密度建成区占比（USGS NLCD 22–24）。", "linear", (0.0, 0.27), "county"),
    ("faith", "宗教信徒率", "Religious Adherents", "faith", "人 / 百名居民", "dec1", "faith", "neutral", "usrc_2020", "2020 年美国宗教普查各教派信徒总数占当地总人口比例（每百人信徒数，ARDA RCMSCY20）。康州因旧县口径变更留白。", "linear", (0.0, 100.0), "county"),
    ("faith_tradition", "第一大宗教传统", "Largest Religious Tradition", "faith", "主导宗派", "cat", "cat", "neutral", "usrc_2020", "2020 年各县信徒人数最多的宗教传统（将后期圣徒教会从其他中独立拆分，ARDA RCMSCY20）。", "linear", (1.0, 7.0), "county"),
    ("amenities", "健康宜居指数", "Wellbeing / Amenities", "life", "指数 (100=全美均值)", "index", "amenities", "good", "cdc_places", "基于 CDC PLACES 2025 四项成人身心健康指标（心理困扰、抑郁、自评欠佳、缺乏运动）反向 Z-score 合成：100 为全美均值，+10 代表优于均值 1 个标准差。无数据州严格留白。", "linear", (85.0, 120.0), "county"),
    ("disasters", "FEMA 重大灾害", "Major Disasters (2000+)", "hazards", "独立重大灾害次数", "int", "disasters", "bad", "fema_declarations", "2000 年至今各县获批的独立联邦重大灾害（DR，不含生物/疫情）累计声明次数（OpenFEMA v2）。", "linear", (0.0, 18.0), "county"),
    ("veterans", "退伍军人占比", "Veterans Share", "people", "18岁+平民占比", "pct", "veterans", "neutral", "acs_5yr", "18 岁及以上平民人口中的退伍军人占比（ACS B21001）。", "linear", (0.034, 0.16), "county"),
    # --- 5 Incremental County-Level Lenses (PEP / BEA / QCEW / ACS) ---
    ("pop_growth", "人口增速 (2021–25)", "Population Growth (2021–25)", "people", "2021–25 累计增速", "pct_signed", "pop_growth", "neutral", "pep_population", "2021–2025 年县域常住人口累计变化率（Census PEP），红褐色为收缩、青绿色为阳光带扩张。", "linear", (-0.08, 0.08), "county"),
    ("gdp_per_cap", "人均真实 GDP", "Real GDP per Capita", "prosperity", "美元 / 人", "usd", "gdp_per_cap", "good", "bea_gdp", "县域真实现价 GDP 除以常住人口（BEA CAGDP2 2024），对数色阶 [$25K, $160K]。", "log", (25000.0, 160000.0), "county"),
    ("avg_wage", "平均年薪 (QCEW)", "Average Annual Wage", "prosperity", "美元 / 年", "usd", "avg_wage", "good", "bls_qcew", "县域全行业雇主发放的平均年薪（BLS QCEW），刻画单人就业薪酬极核。", "linear", (40000.0, 92000.0), "county"),
    ("affordability", "房价收入比", "Home Price-to-Income", "prosperity", "中位房价 ÷ 年收入", "ratio", "affordability", "bad", "acs_5yr", "自有住房中位估值与家庭中位年收入之比（ACS B25077 ÷ B19013），越高代表购房压力越大。", "linear", (1.6, 6.8), "county"),
    ("armed_forces_pct", "现役军人占比", "Active-Duty Share", "defense", "16岁+人口占比", "pct", "armed_forces_pct", "neutral", "acs_5yr", "16 岁及以上常住人口中现役武装部队成员占比（ACS B23025），对数色阶凸显驻军重镇。", "log", (0.0005, 0.04), "county"),
    # --- 3 Incremental State-Level Macro Lenses (OLDCC / DMDC / NOAA, explicitly badged as State-level) ---
    ("defense_pct_gdp", "国防支出占 GDP", "Defense Spending % GDP", "defense", "占州 GDP 占比", "pct", "defense_pct_gdp", "neutral", "oldcc_spending", "【州级口径】国防部合同与军职薪资总支出占所在州 GDP 比例（DoD OLDCC FY2024）。", "linear", (0.006, 0.075), "state"),
    ("mil_active_density", "现役驻军密度", "Active-Duty Personnel", "defense", "现役军人 / 万人", "dec1", "mil_active_density", "neutral", "dmdc_personnel", "【州级口径】每万名常住居民对应的现役驻军人数（DoD DMDC），对数色阶 [3, 180]。", "log", (3.0, 180.0), "state"),
    ("noaa_billion_cost", "NOAA 巨灾损失", "Billion-Dollar Disasters", "hazards", "十亿美元 (1980–2024)", "usd_b", "noaa_billion_cost", "bad", "noaa_billions", "【州级口径】1980–2024 年通胀调整后的十亿美元级气象气候巨灾累计损失（NOAA NCEI），对数色阶 [$3B, $260B]。", "log", (3.0, 260.0), "state"),
]

LAND_KEYS = ["forest", "crop", "pasture", "grass", "shrub", "wetland", "developed"]


def _round_or_none(v: float | None, nd: int = 2) -> float | None:
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    return round(float(v), nd)


def _short_city_name(title: str) -> str:
    base = title.split(",")[0].strip()
    primary = base.split("-")[0].strip()
    if "New York" in primary:
        return "New York"
    if "Minneapolis" in primary:
        return "Minneapolis"
    if "Dallas" in primary:
        return "Dallas–Fort Worth"
    if "Miami" in primary:
        return "Miami"
    if "Washington" in primary and ", DC" in title:
        return "Washington, D.C."
    if "San Francisco" in primary:
        return "San Francisco"
    if "Los Angeles" in primary:
        return "Los Angeles"
    if "Urban Honolulu" in primary:
        return "Honolulu"
    return primary


def run_build():
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Build 25 km hex grid + county crosswalk (cached in data_work)
    grid_parquet = WORK_DIR / "hex_grid.parquet"
    xwalk_parquet = WORK_DIR / "hex_county_xwalk.parquet"
    meta_json_path = WORK_DIR / "grid_meta.json"
    if grid_parquet.exists() and xwalk_parquet.exists() and meta_json_path.exists():
        print("[build_all] Reusing cached 25 km hex grid from data_work/")
        hex_df = pl.read_parquet(grid_parquet)
        xwalk_df = pl.read_parquet(xwalk_parquet)
        grid_meta = json.loads(meta_json_path.read_text())
    else:
        grid_meta = build_hex_grid_and_crosswalk(
            RAW_DIR / "census_boundaries/cb_2023_us_county_20m.zip",
            WORK_DIR,
        )
        hex_df = pl.read_parquet(grid_parquet)
        xwalk_df = pl.read_parquet(xwalk_parquet)

    # 2. Sample ETOPO1 relief, NLCD 7-class land cover, Natural Earth art layers + neighbor land, EIA shale
    hex_df = sample_etopo(hex_df, RAW_DIR)
    hex_df = sample_nlcd(hex_df, RAW_DIR)
    hex_df, art_layers = build_vector_art_layers(hex_df, grid_meta, RAW_DIR)

    # 3. Load all tabular datasets
    cbsa_info, county_to_cbsa = load_cbsa_delineation(RAW_DIR)
    gaz_counties = load_gazetteer_counties(RAW_DIR)
    acs5 = load_acs_5yr_counties(RAW_DIR)
    acs1_metros, acs1_states, us_bench = load_acs_1yr_metros(RAW_DIR)
    states_pep, cbsa_pep, county_pep, us_growth = load_pep_population(RAW_DIR)
    county_gdp, state_gdp, us_gdp_musd, us_gdp_by_industry = load_bea_gdp(RAW_DIR, acs5)
    qcew_totals, qcew_inds = load_bls_qcew(RAW_DIR)
    cdc_places = load_cdc_places(RAW_DIR)
    usrc = load_usrc_2020(RAW_DIR)
    fema_counties, fema_states, fema_summary = load_fema_disasters(RAW_DIR)
    noaa_timeline, noaa_states, noaa_national = load_noaa_billions(RAW_DIR)
    dmdc_states, oldcc_states, dmdc_national, oldcc_national = load_military_state_tables(RAW_DIR)

    # Attach CBSA code to every hex via dominant county FIPS
    dom_fips_list = hex_df["dom_fips"].to_list()
    hex_cbsa = [county_to_cbsa.get(f) for f in dom_fips_list]
    hex_df = hex_df.with_columns(pl.Series("cbsa", hex_cbsa, dtype=pl.Utf8))

    # 4. Aggregate county-level indicators onto 25 km hex grid
    n_hex = len(hex_df)
    xwalk_by_hex: list[list[tuple[str, float, float]]] = [[] for _ in range(n_hex)]
    for hid, fips, area_km2, county_share in zip(
        xwalk_df["hex_id"].to_list(),
        xwalk_df["fips"].to_list(),
        xwalk_df["area_km2"].to_list(),
        xwalk_df["county_share"].to_list(),
    ):
        xwalk_by_hex[hid].append((fips, area_km2, county_share))

    county_hex_ids: dict[str, list[int]] = {}
    for hid, parts in enumerate(xwalk_by_hex):
        for fips, _, _ in parts:
            county_hex_ids.setdefault(fips, []).append(hid)

    hex_pop = np.zeros(n_hex, dtype=np.float64)
    hex_gdp = np.zeros(n_hex, dtype=np.float64)
    hex_lenses: dict[str, list[float | None]] = {spec[0]: [None] * n_hex for spec in LENS_SPECS}

    nlcd_cols = {k: hex_df[f"nlcd_{k}"].to_numpy() for k in LAND_KEYS}
    nlcd_f = nlcd_cols["forest"]
    nlcd_a = hex_df["nlcd_farmland"].to_numpy()
    nlcd_d = nlcd_cols["developed"]
    land_km2_arr = hex_df["land_km2"].to_numpy()
    reg_arr = hex_df["region"].to_numpy()

    # Compute dominant land cover index per hex (0..6 = LAND_KEYS, 7 = other) & national L48 land cover averages
    dom_land = np.full(n_hex, 7, dtype=np.int32)
    l48_land_sums = {k: 0.0 for k in LAND_KEYS}
    l48_dom_counts = {k: 0 for k in LAND_KEYS}
    l48_land_cells = 0
    for hid in range(n_hex):
        vals_l = [0.0 if np.isnan(nlcd_cols[k][hid]) else float(nlcd_cols[k][hid]) for k in LAND_KEYS]
        tot_l = sum(vals_l)
        if tot_l > 0:
            bi = int(np.argmax(vals_l))
            dom_land[hid] = bi
            if reg_arr[hid] == 0:
                l48_land_cells += 1
                l48_dom_counts[LAND_KEYS[bi]] += 1
                for idx_k, k in enumerate(LAND_KEYS):
                    l48_land_sums[k] += vals_l[idx_k]

    land_national = {
        k: round(l48_land_sums[k] / max(1, l48_land_cells), 4) for k in LAND_KEYS
    }
    land_national["other"] = round(max(0.0, 1.0 - sum(land_national.values())), 4)
    land_national_dom_counts = {k: l48_dom_counts[k] for k in LAND_KEYS}

    pop_weighted_keys = [
        "income", "home", "poverty", "age", "foreign_born",
        "bachelors", "broadband", "commute", "homeownership", "uninsured", "veterans",
    ]
    acs5_key_map = {
        "income": "income", "home": "home", "poverty": "poverty", "age": "median_age",
        "foreign_born": "foreign_born", "bachelors": "bachelors", "broadband": "broadband",
        "commute": "commute", "homeownership": "homeownership", "uninsured": "uninsured", "veterans": "veterans",
    }

    for hid in range(n_hex):
        parts = xwalk_by_hex[hid]
        hex_lenses["forest"][hid] = None if np.isnan(nlcd_f[hid]) else round(float(nlcd_f[hid]), 4)
        hex_lenses["farmland"][hid] = None if np.isnan(nlcd_a[hid]) else round(float(nlcd_a[hid]), 4)
        hex_lenses["developed"][hid] = None if np.isnan(nlcd_d[hid]) else round(float(nlcd_d[hid]), 4)

        tot_p = 0.0
        tot_g = 0.0
        w_parts: list[tuple[str, float, float]] = []
        for fips, area_k, cshare in parts:
            cpop = (acs5.get(fips, {}).get("pop") or 0.0) * cshare
            cgdp = county_gdp.get(fips, 0.0) * cshare
            tot_p += cpop
            tot_g += cgdp
            w_parts.append((fips, max(cpop, 1e-3), cshare))

        hex_pop[hid] = tot_p
        hex_gdp[hid] = tot_g
        lkm2 = max(1.0, float(land_km2_arr[hid]))
        hex_lenses["density"][hid] = round(tot_p / lkm2, 2)

        for lkey in pop_weighted_keys:
            akey = acs5_key_map[lkey]
            num = 0.0
            den = 0.0
            for fips, w, _ in w_parts:
                val = acs5.get(fips, {}).get(akey)
                if val is not None:
                    num += val * w
                    den += w
            if den > 0:
                nd = 4 if lkey in ("poverty", "foreign_born", "bachelors", "broadband", "homeownership", "uninsured", "veterans") else (1 if lkey in ("age", "commute") else 0)
                hex_lenses[lkey][hid] = round(num / den, nd)

        # Amenities (CDC PLACES) — strictly null where absent
        am_num, am_den = 0.0, 0.0
        for fips, w, _ in w_parts:
            av = cdc_places.get(fips, {}).get("amenities")
            if av is not None:
                am_num += av * w
                am_den += w
        if am_den > 0:
            hex_lenses["amenities"][hid] = round(am_num / am_den, 1)

        # Disasters (FEMA)
        dis_num, dis_den = 0.0, 0.0
        for fips, w, _ in w_parts:
            dv = fema_counties.get(fips, {}).get("count", 0)
            dis_num += dv * w
            dis_den += w
        if dis_den > 0:
            hex_lenses["disasters"][hid] = round(dis_num / dis_den)

        # Faith & Largest Tradition (USRC 2020)
        f_num, f_den = 0.0, 0.0
        trad_sums = {t[0]: 0.0 for t in RELIGION_TRADITIONS}
        any_trad = False
        for fips, w, cshare in w_parts:
            ur = usrc.get(fips)
            if ur is None:
                continue
            if ur["faith_rate"] is not None:
                f_num += ur["faith_rate"] * w
                f_den += w
            for tid, cnt in ur["traditions"].items():
                trad_sums[tid] += cnt * cshare
                if cnt > 0:
                    any_trad = True
        if f_den > 0:
            hex_lenses["faith"][hid] = round(f_num / f_den, 1)
        if any_trad:
            hex_lenses["faith_tradition"][hid] = max(trad_sums.items(), key=lambda kv: kv[1])[0]

        # 5 Incremental County-Level Lenses (PEP Growth, BEA GDP/Cap, BLS QCEW Wage, Affordability, Active-Duty Share)
        pg_num, pg_den = 0.0, 0.0
        gpc_num, gpc_den = 0.0, 0.0
        wg_num, wg_den = 0.0, 0.0
        af_num, af_den = 0.0, 0.0
        mil_num, mil_den = 0.0, 0.0
        for fips, w, _ in w_parts:
            pgv = county_pep.get(fips, {}).get("pop_growth_pct")
            if pgv is not None:
                pg_num += pgv * w
                pg_den += w
            cpop_full = acs5.get(fips, {}).get("pop") or 0.0
            cgdp_full = county_gdp.get(fips)
            if cgdp_full is not None and cgdp_full > 0 and cpop_full > 0:
                gpc_num += ((cgdp_full * 1e6) / cpop_full) * w
                gpc_den += w
            wgv = qcew_totals.get(fips, {}).get("avg_wage")
            if wgv is not None and wgv > 0:
                wg_num += wgv * w
                wg_den += w
            a_rec = acs5.get(fips, {})
            inc_c = a_rec.get("income")
            hom_c = a_rec.get("home")
            if inc_c and hom_c and inc_c > 0:
                af_num += (hom_c / inc_c) * w
                af_den += w
            milv = a_rec.get("armed_forces_pct")
            if milv is not None:
                mil_num += milv * w
                mil_den += w
        if pg_den > 0:
            hex_lenses["pop_growth"][hid] = round(pg_num / pg_den, 4)
        if gpc_den > 0:
            hex_lenses["gdp_per_cap"][hid] = round(gpc_num / gpc_den)
        if wg_den > 0:
            hex_lenses["avg_wage"][hid] = round(wg_num / wg_den)
        if af_den > 0:
            hex_lenses["affordability"][hid] = round(af_num / af_den, 2)
        if mil_den > 0:
            hex_lenses["armed_forces_pct"][hid] = round(mil_num / mil_den, 4)

    # 5. Load all spatial point/hub/energy/mining/military/wonder/trade layers
    proj = UnifiedProjector(grid_meta)
    loc = HexLocator(hex_df)
    albers_grid = Albers25Grid(RAW_DIR)

    power_plants, power_by_fuel, state_power_fuel, hex_power_mw, all_power_mw = load_eia_power_plants(RAW_DIR, proj, loc, albers_grid)
    mines = load_mines_and_coal(RAW_DIR, proj, loc, albers_grid)
    shale_sites = load_shale_play_sites(RAW_DIR, proj, loc, albers_grid)
    ports, airports = load_ports_and_airports(RAW_DIR, proj, loc, albers_grid)
    military_bases, military_ranges, restricted_hex_ids = load_military_map(RAW_DIR, hex_df, proj, loc, albers_grid, county_to_cbsa)
    wonders, protected_hex_ids, hex_rd_musd, all_nps_visits = load_wonders(RAW_DIR, hex_df, proj, loc)

    # Exact R=25 km equal-area Lower-48 NLCD land cover (unbiased by coastal/border square windows)
    l48_land_nat, l48_land_by_state = compute_albers25_land_cover(RAW_DIR, albers_grid)
    if l48_land_nat:
        land_national = l48_land_nat

    # State centers
    st_arr = hex_df["state_fips"].to_list()
    mx_arr = hex_df["map_x"].to_numpy()
    my_arr = hex_df["map_y"].to_numpy()
    state_hexes: dict[str, list[int]] = {}
    for hid, sf in enumerate(st_arr):
        state_hexes.setdefault(sf, []).append(hid)

    state_centers: dict[str, tuple[float, float]] = {}
    for sf, hids in state_hexes.items():
        ws = np.maximum(hex_pop[hids], 1.0)
        state_centers[sf] = (float(np.average(mx_arr[hids], weights=ws)), float(np.average(my_arr[hids], weights=ws)))

    # 6. Compute Civ 6-Yields per hex (for tile inspection)
    elev_arr = hex_df["elev_m"].to_numpy()
    rcls_arr = hex_df["relief_cls"].to_numpy()
    river_arr = hex_df["has_river"].to_numpy()
    shale_arr = hex_df["has_shale"].to_numpy()

    y_food = np.zeros(n_hex, dtype=np.int32)
    y_prod = np.zeros(n_hex, dtype=np.int32)
    y_gold = np.zeros(n_hex, dtype=np.int32)
    y_sci = np.zeros(n_hex, dtype=np.int32)
    y_cul = np.zeros(n_hex, dtype=np.int32)
    y_faith = np.zeros(n_hex, dtype=np.int32)

    prot_set = set(protected_hex_ids)
    mine_hexes = {m["hex_id"] for m in mines}
    restricted_set = set(restricted_hex_ids)

    for i in range(n_hex):
        fm = 0.0 if np.isnan(nlcd_a[i]) else nlcd_a[i]
        fr = 0.0 if np.isnan(nlcd_f[i]) else nlcd_f[i]
        dv = 0.0 if np.isnan(nlcd_d[i]) else nlcd_d[i]
        y_food[i] = int(np.clip(round(1.0 + fm * 4.5 + river_arr[i] * 1.2 + (0.6 if elev_arr[i] < 600 else 0.0)), 0, 8))
        pwr_b = 2.0 if hex_power_mw.get(i, 0) >= 500 else (1.0 if hex_power_mw.get(i, 0) > 50 else 0.0)
        y_prod[i] = int(np.clip(round(0.8 + (1.4 if rcls_arr[i] >= 1 else 0.0) + fr * 1.6 + shale_arr[i] * 1.5 + (1.5 if i in mine_hexes else 0.0) + pwr_b + dv * 2.0), 0, 10))
        g_m = hex_gdp[i]
        y_gold[i] = int(np.clip(round(math.log10(max(1.0, g_m)) * 2.2), 0, 12)) if g_m > 1.0 else 0
        bach = hex_lenses["bachelors"][i] or 0.18
        rd_b = min(5.0, math.log10(1.0 + hex_rd_musd.get(i, 0.0)) * 1.8)
        y_sci[i] = int(np.clip(round(bach * 7.5 + rd_b), 0, 12))
        y_cul[i] = int(np.clip(round((3.5 if i in prot_set else 0.0) + dv * 4.5 + (0.8 if hex_pop[i] > 50000 else 0.0)), 0, 10))
        frate = hex_lenses["faith"][i]
        y_faith[i] = int(np.clip(round((frate / 16.0) if frate is not None else 0.0), 0, 8))

    # 7. Assemble all 524+ Metro/Micropolitan City Views
    ind_by_county = qcew_inds["by_county"]
    us_ind_jobs = qcew_inds["us_jobs"]
    us_tot_jobs = max(1, us_ind_jobs.get("10", 150_000_000))

    cbsa_hexes: dict[str, list[int]] = {}
    for hid, c in enumerate(hex_cbsa):
        if c:
            cbsa_hexes.setdefault(c, []).append(hid)

    ports_by_cbsa: dict[str, list[dict]] = {}
    for p in ports:
        if p["cbsa"]:
            ports_by_cbsa.setdefault(p["cbsa"], []).append(p)
    air_by_cbsa: dict[str, list[dict]] = {}
    for a in airports:
        if a["cbsa"]:
            air_by_cbsa.setdefault(a["cbsa"], []).append(a)
    mil_by_cbsa: dict[str, list[dict]] = {}
    for b in military_bases:
        b_cbsas = b.get("cbsas") or ([b["cbsa"]] if b.get("cbsa") else [])
        for mc in b_cbsas:
            mil_by_cbsa.setdefault(mc, []).append(b)
    mw_by_cbsa: dict[str, float] = {}
    for p in power_plants:
        if p["cbsa"]:
            mw_by_cbsa[p["cbsa"]] = mw_by_cbsa.get(p["cbsa"], 0.0) + p["mw"]

    cities: list[dict] = []
    trad_label_map = {t[0]: t[2] for t in RELIGION_TRADITIONS}

    for code, mrec in acs1_metros.items():
        info = cbsa_info.get(code, {})
        c_counties = info.get("counties", [])
        hids = list(cbsa_hexes.get(code, []))
        if not hids and c_counties:
            # Small single-county metros (e.g. Carson City, NV 16180) may own 0 dominant hexes: fall back to xwalk or nearest centroid hex!
            seen_h: set[int] = set()
            for cf in c_counties:
                for hh in county_hex_ids.get(cf, []):
                    if hh not in seen_h:
                        seen_h.add(hh)
                        hids.append(hh)
            if not hids:
                for cf in c_counties:
                    gz = gaz_counties.get(cf)
                    if gz and gz["lon"] and gz["lat"]:
                        pt = proj.project_point(gz["lon"], gz["lat"], state_abbr=gz["state_abbr"])
                        if pt is not None:
                            nh, _ = loc.find(pt[0], pt[1])
                            hids = [nh]
                            break
        if not hids:
            continue
        best_hid = max(hids, key=lambda h: hex_pop[h])
        cx, cy = float(mx_arr[best_hid]), float(my_arr[best_hid])
        reg = int(reg_arr[best_hid])

        m_gdp = sum(county_gdp.get(f, 0.0) for f in c_counties)
        m_gdp = m_gdp if m_gdp > 0 else float(hex_gdp[hids].sum())
        pop = mrec["pop"]

        # Exact county-summed veterans & armed forces & land_km2 & population-weighted ACS5/CDC/USRC/FEMA rollups (exact data.js formula!)
        vet_n = sum(acs5.get(f, {}).get("veterans_count") or 0.0 for f in c_counties)
        vet_d = sum(acs5.get(f, {}).get("veterans_base") or 0.0 for f in c_counties)
        af_n = sum(acs5.get(f, {}).get("armed_forces") or 0.0 for f in c_counties)
        af_d = sum(acs5.get(f, {}).get("armed_forces_base") or 0.0 for f in c_counties)
        c_land_km2 = sum(gaz_counties.get(f, {}).get("land_km2") or 0.0 for f in c_counties)
        af_share = (af_n / af_d) if af_d > 0 else 0.0
        vet_share = (vet_n / vet_d) if vet_d > 0 else None

        def county_wavg(getter) -> float | None:
            num = 0.0
            den = 0.0
            for cf in c_counties:
                cp = acs5.get(cf, {}).get("pop") or 0.0
                v = getter(cf)
                if v is not None and cp > 0:
                    num += v * cp
                    den += cp
            return (num / den) if den > 0 else None

        # Exact Garrison / Fortress classification (check bases in metro's counties/hexes or overlapping base cells!)
        hids_set = set(hids)
        m_bases = list(mil_by_cbsa.get(code, []))
        m_base_ids = {b["id"] for b in m_bases}
        for b in military_bases:
            if b["id"] not in m_base_ids and (b["hex_id"] in hids_set or any(ch in hids_set for ch in b.get("cells", []))):
                m_bases.append(b)
                m_base_ids.add(b["id"])
        qual_bases = [b for b in m_bases if b["tier"] in ("major", "base") and b["component"] not in ("army_guard", "air_guard")]
        has_range_hex = any(h in restricted_set for h in hids)
        garrison_tier = None
        garrison_naval = False
        if (qual_bases or has_range_hex) and (af_share >= 0.01 or (af_n >= 2000 and af_share >= 0.003)):
            garrison_tier = "fortress" if af_share >= 0.03 else "garrison"
            nav_score = sum(4 if b["tier"] == "major" else 1 for b in qual_bases if b["component"] in ("navy", "marines", "navy_reserve", "marine_reserve"))
            land_score = sum(4 if b["tier"] == "major" else 1 for b in qual_bases if b["component"] in ("army", "air_force", "army_reserve", "air_force_reserve"))
            garrison_naval = nav_score > land_score

        # QCEW employment, average annual pay & Location Quotients
        metro_tot_jobs = sum(qcew_totals.get(f, {}).get("jobs", 0) for f in c_counties)
        qcew_pay_num = sum((qcew_totals.get(f, {}).get("jobs", 0) * (qcew_totals.get(f, {}).get("avg_wage") or 0.0)) for f in c_counties)
        metro_qcew_pay = round(qcew_pay_num / metro_tot_jobs) if metro_tot_jobs > 0 else None
        metro_ind_jobs: dict[str, int] = {}
        metro_ind_wage_num: dict[str, float] = {}
        for f in c_counties:
            for naics, (emp, wage) in ind_by_county.get(f, {}).items():
                metro_ind_jobs[naics] = metro_ind_jobs.get(naics, 0) + emp
                metro_ind_wage_num[naics] = metro_ind_wage_num.get(naics, 0.0) + emp * wage

        dist_scores: list[tuple[float, dict]] = []
        for dspec in DISTRICT_CATALOG:
            did = dspec["id"]
            best_lq = 0.0
            best_jobs = 0
            best_wage = None
            note = ""

            if did == "harbor" and code in ports_by_cbsa:
                tp = ports_by_cbsa[code][0]
                if tp["tons"] >= 5_000_000:
                    best_lq = min(8.0, 1.5 + math.log10(tp["tons"] / 1e6) * 1.4)
                    best_jobs = metro_ind_jobs.get("4883", 0) + metro_ind_jobs.get("483", 0)
                    note = f"USACE 港口吞吐 {tp['tons']/1e6:.1f}M 吨/年 ({tp['name']})"
            elif did == "aerohub" and code in air_by_cbsa:
                ta = air_by_cbsa[code][0]
                if ta["enplanements"] >= 5_000_000 or ta["cargo_lbs"] >= 1_500_000_000:
                    best_lq = min(8.0, 1.5 + max(ta["enplanements"] / 12e6, ta["cargo_lbs"] / 5e9))
                    best_jobs = metro_ind_jobs.get("481", 0) + metro_ind_jobs.get("4881", 0)
                    note = f"FAA 枢纽 {ta['code']} · 客流 {ta['enplanements']/1e6:.1f}M / 货运 {ta['cargo_lbs']/1e9:.1f}B lbs"
            elif did == "bastion" and garrison_tier:
                tb = qual_bases[0] if qual_bases else (m_bases[0] if m_bases else None)
                ns_jobs = metro_ind_jobs.get("928110", 0)
                best_lq = 2.0 + min(5.0, af_share * 80.0)
                best_jobs = int(af_n) + ns_jobs
                note = f"{'核心要塞' if garrison_tier == 'fortress' else '驻军都会'}：{tb['name'] if tb else '驻军禁区'}（现役占比 {af_share*100:.1f}%）"

            if metro_tot_jobs >= 5000:
                for naics in dspec["naics"]:
                    mj = metro_ind_jobs.get(naics, 0)
                    uj = us_ind_jobs.get(naics, 0)
                    if mj < 400 or uj <= 0:
                        continue
                    lq = (mj / metro_tot_jobs) / (uj / us_tot_jobs)
                    if lq >= 1.28 and lq > best_lq:
                        best_lq = lq
                        best_jobs = mj
                        best_wage = round(metro_ind_wage_num.get(naics, 0) / mj)
                        note = f"NAICS {naics} 行业集中度为全美均值的 {lq:.2f}×（{mj:,} 岗位）"

            if best_lq >= 1.32:
                score = best_lq * (1.0 + 0.15 * math.log10(max(100, best_jobs)))
                dist_scores.append((score, {
                    "id": did,
                    "name": dspec["name"],
                    "lq": round(best_lq, 2),
                    "jobs": int(best_jobs),
                    "avg_wage": best_wage,
                    "note": note or dspec["rule"],
                }))

        dist_scores.sort(key=lambda t: t[0], reverse=True)
        top_dists = [d for _, d in dist_scores[:4]]
        if not top_dists:
            top_dists = [{
                "id": "exchange" if (mrec["median_income"] or 0) > 75000 else "medical",
                "name": "商业服务区" if (mrec["median_income"] or 0) > 75000 else "区域医疗中心",
                "lq": 1.1,
                "jobs": int(metro_tot_jobs * 0.12),
                "avg_wage": None,
                "note": "区域综合服务中心",
            }]

        sorted_hids = sorted(hids, key=lambda h: (mx_arr[h] - cx) ** 2 + (my_arr[h] - cy) ** 2)
        used_dh: set[int] = set()
        placed_districts = []
        for drec in top_dists:
            target_h = None
            if drec["id"] == "harbor" and code in ports_by_cbsa:
                target_h = ports_by_cbsa[code][0]["hex_id"]
            elif drec["id"] == "aerohub" and code in air_by_cbsa:
                target_h = air_by_cbsa[code][0]["hex_id"]
            elif drec["id"] == "bastion" and code in mil_by_cbsa:
                target_h = mil_by_cbsa[code][0]["hex_id"]
            if target_h is None or target_h in used_dh:
                for cand_h in sorted_hids:
                    if cand_h not in used_dh:
                        target_h = cand_h
                        break
            if target_h is None:
                target_h = best_hid
            used_dh.add(target_h)
            drec["hex_id"] = int(target_h)
            drec["x"] = round(float(mx_arr[target_h]), 1)
            drec["y"] = round(float(my_arr[target_h]), 1)
            placed_districts.append(drec)

        ws = np.maximum(hex_pop[hids], 1.0)
        def wavg_lens(lk: str) -> float | None:
            vals = [(hex_lenses[lk][h], ws[k]) for k, h in enumerate(hids) if hex_lenses[lk][h] is not None]
            return (sum(v * w for v, w in vals) / sum(w for _, w in vals)) if vals else None

        dom_trad_votes: dict[int, float] = {}
        for k, h in enumerate(hids):
            tv = hex_lenses["faith_tradition"][h]
            if tv is not None:
                dom_trad_votes[int(tv)] = dom_trad_votes.get(int(tv), 0.0) + ws[k]
        prim_trad = trad_label_map[max(dom_trad_votes.items(), key=lambda kv: kv[1])[0]] if dom_trad_votes else None

        pep = cbsa_pep.get(code, {})
        st_abbr = mrec["name"].split(",")[-1].strip().split("-")[0][:2] if "," in mrec["name"] else STATE_FIPS_TO_ABBR.get(hex_df["state_fips"][best_hid], "")
        st_sub = mrec["name"].split(",")[-1].strip() if "," in mrec["name"] else st_abbr

        city_yields = {
            "food": int(round(float(np.mean(y_food[hids])) * (1.2 + math.log10(max(1, len(hids)))))),
            "prod": int(round(float(np.mean(y_prod[hids])) * (1.4 + math.log10(max(1, len(hids)))))),
            "gold": max(1, int(round(m_gdp / 1000.0))),
            "sci": int(round((mrec["workforce"]["stem_share"] * 120 if mrec["workforce"] else 10) + sum(hex_rd_musd.get(h, 0) for h in hids) / 60.0)),
            "cul": int(round(max(2, math.log10(max(10000, pop)) * 3.5 + sum(1 for h in hids if h in prot_set) * 4))),
            "faith": int(round((wavg_lens("faith") or 40.0) * 0.25)),
        }

        wf = mrec["workforce"] or us_bench["workforce"]
        wf_out = {**wf, "industries": mrec["industries"]}
        cz_ex = mrec.get("citizens_extra") or {}
        top_dist = placed_districts[0] if placed_districts else None
        q_dist_cnt = len([d for d in dist_scores])

        # Population-weighted county rollups (matching exact data.js ROLLUP formula!)
        c_bach5 = county_wavg(lambda f: acs5.get(f, {}).get("bachelors"))
        c_bb = county_wavg(lambda f: acs5.get(f, {}).get("broadband"))
        c_own = county_wavg(lambda f: acs5.get(f, {}).get("homeownership"))
        c_unins = county_wavg(lambda f: acs5.get(f, {}).get("uninsured"))
        c_pov = county_wavg(lambda f: acs5.get(f, {}).get("poverty"))
        c_age5 = county_wavg(lambda f: acs5.get(f, {}).get("median_age"))
        c_fb5 = county_wavg(lambda f: acs5.get(f, {}).get("foreign_born"))
        c_comm = county_wavg(lambda f: acs5.get(f, {}).get("commute"))
        c_amen = county_wavg(lambda f: cdc_places.get(f, {}).get("amenities"))
        c_faith = county_wavg(lambda f: usrc.get(f, {}).get("faith_rate"))
        c_dis = county_wavg(lambda f: fema_counties.get(f, {}).get("count", 0))

        cities.append({
            "id": code,
            "name": mrec["name"],
            "short_name": _short_city_name(mrec["name"]),
            "state_abbr": st_abbr,
            "states_sub": st_sub,
            "region": reg,
            "is_metro": bool(info.get("is_metro", True)),
            "x": round(cx, 1),
            "y": round(cy, 1),
            "pop": pop,
            "density": round(pop / max(1.0, c_land_km2), 1) if c_land_km2 > 0 else None,
            "land_km2": round(c_land_km2, 1) if c_land_km2 > 0 else None,
            "employed": mrec["employed"],
            "unemployment": mrec["unemployment"],
            "pop_growth_pct": pep.get("pop_growth_pct"),
            "nat_change": pep.get("nat_change"),
            "dom_mig": pep.get("dom_mig"),
            "intl_mig": pep.get("intl_mig"),
            "gdp_musd": round(m_gdp, 1),
            "gdp_per_cap": round((m_gdp * 1e6) / pop) if pop > 0 else None,
            "median_income": _round_or_none(mrec["median_income"], 0),
            "median_home": _round_or_none(mrec["median_home"], 0),
            "median_rent": _round_or_none(mrec["median_rent"], 0),
            "rent_burden": mrec["rent_burden"],
            "bachelors_pct": _round_or_none(c_bach5 if c_bach5 is not None else mrec["bachelors_pct"], 4),
            "bachelors_1yr": mrec["bachelors_pct"],
            "broadband_pct": _round_or_none(c_bb if c_bb is not None else wavg_lens("broadband"), 4),
            "homeownership_pct": _round_or_none(c_own if c_own is not None else wavg_lens("homeownership"), 4),
            "uninsured_pct": _round_or_none(c_unins if c_unins is not None else wavg_lens("uninsured"), 4),
            "poverty_pct": _round_or_none(c_pov if c_pov is not None else wavg_lens("poverty"), 4),
            "median_age": _round_or_none(mrec["median_age"] if mrec["median_age"] is not None else c_age5, 1),
            "median_age_5yr": _round_or_none(c_age5, 1),
            "foreign_born_pct": _round_or_none(c_fb5 if c_fb5 is not None else mrec["foreign_born_pct"], 4),
            "foreign_born_1yr": mrec["foreign_born_pct"],
            "commute_min": _round_or_none(c_comm if c_comm is not None else wavg_lens("commute"), 1),
            "amenities": _round_or_none(c_amen if c_amen is not None else wavg_lens("amenities"), 1),
            "disasters": _round_or_none(c_dis if c_dis is not None else wavg_lens("disasters"), 0),
            "faith_rate": _round_or_none(c_faith if c_faith is not None else wavg_lens("faith"), 1),
            "primary_tradition": prim_trad,
            "veterans": int(round(vet_n)),
            "veterans_pct": _round_or_none(vet_share, 4),
            "armed_forces": int(round(af_n)),
            "armed_forces_pct": _round_or_none(af_share, 4),
            "garrison_tier": garrison_tier,
            "garrison_naval": garrison_naval,
            "installations_count": len(m_bases),
            "energy_mw": round(mw_by_cbsa.get(code, 0.0), 1),
            "qcew_jobs": metro_tot_jobs if metro_tot_jobs > 0 else None,
            "qcew_pay": metro_qcew_pay,
            "n_districts": q_dist_cnt,
            "top_lq": top_dist["lq"] if top_dist else None,
            "city_type": top_dist["name"] if (top_dist and q_dist_cnt > 0) else None,
            "citizens_extra": cz_ex,
            "yields": city_yields,
            "yields_workers": mrec["yields_workers"],
            "jobs": mrec["jobs"],
            "hex_ids": hids,
            "primary_district": placed_districts[0]["id"],
            "districts": placed_districts,
            "workforce": wf_out,
            "peers": [],
        })

    cities.sort(key=lambda c: c["pop"], reverse=True)
    # Attach exact Census Gazetteer population-weighted Albers coordinates (km) for geodesic FAF5 corridor distance (>=250 km)
    for c in cities:
        c_cos = cbsa_info.get(c["id"], {}).get("counties", [])
        num_lon, num_lat, den_p = 0.0, 0.0, 0.0
        for cf in c_cos:
            gz = gaz_counties.get(cf)
            cp = acs5.get(cf, {}).get("pop") or 1.0
            if gz and gz.get("lon") and gz.get("lat"):
                num_lon += gz["lon"] * cp
                num_lat += gz["lat"] * cp
                den_p += cp
        if den_p > 0 and c["state_abbr"] not in ("AK", "HI"):
            ax_c, ay_c = albers_grid.to_albers.transform(num_lon / den_p, num_lat / den_p)
            c["_albers_x"] = float(ax_c)
            c["_albers_y"] = float(ay_c)
    trade_data = load_faf5_trade(RAW_DIR, state_centers, cities)
    for c in cities:
        c.pop("_albers_x", None)
        c.pop("_albers_y", None)

    for i, c in enumerate(cities):
        lp = math.log10(max(1000, c["pop"]))
        lg = math.log10(max(100, c["gdp_musd"] or 100))
        dists_p = []
        for j, o in enumerate(cities):
            if i == j:
                continue
            d = abs(lp - math.log10(max(1000, o["pop"]))) * 1.4 + abs(lg - math.log10(max(100, o["gdp_musd"] or 100)))
            dists_p.append((d, o["id"]))
        dists_p.sort(key=lambda t: t[0])
        c["peers"] = [pid for _, pid in dists_p[:5]]

    # 8. Assemble all 51 States (50 states + DC)
    cities_by_state: dict[str, list[dict]] = {}
    for c in cities:
        cities_by_state.setdefault(c["state_abbr"], []).append(c)

    counties_by_state: dict[str, list[str]] = {}
    for fips in acs5.keys():
        counties_by_state.setdefault(fips[:2], []).append(fips)

    states_out: list[dict] = []
    for sf in sorted(STATE_FIPS_TO_ABBR.keys()):
        abbr = STATE_FIPS_TO_ABBR[sf]
        hids = state_hexes.get(sf, [])
        if not hids:
            continue
        ws = np.maximum(hex_pop[hids], 1.0)
        def st_wavg(lk: str) -> float | None:
            vals = [(hex_lenses[lk][h], ws[k]) for k, h in enumerate(hids) if hex_lenses[lk][h] is not None]
            return (sum(v * w for v, w in vals) / sum(w for _, w in vals)) if vals else None

        pep = states_pep.get(sf, {})
        sgdp = state_gdp.get(sf, {"gdp_musd": 0.0, "sectors": {}})
        sa1 = acs1_states.get(sf, {})
        pop = sa1.get("pop") or pep.get("pop_2025") or int(round(hex_pop[hids].sum()))
        gdp_m = sgdp["gdp_musd"] or float(hex_gdp[hids].sum())
        sx, sy = state_centers[sf]
        d_m = dmdc_states.get(sf, {})
        o_m = oldcc_states.get(sf, {})
        nb = noaa_states.get(sf, {})
        fm = fema_states.get(abbr, {})

        # Exact county sums & pop-weighted county rollups for state (exact data.js formula!)
        scos = counties_by_state.get(sf, [])
        def st_cwavg(getter) -> float | None:
            num, den = 0.0, 0.0
            for cf in scos:
                cp = acs5.get(cf, {}).get("pop") or 0.0
                v = getter(cf)
                if v is not None and cp > 0:
                    num += v * cp
                    den += cp
            return (num / den) if den > 0 else None

        s_vet_n = sum(acs5.get(f, {}).get("veterans_count") or 0.0 for f in scos)
        s_vet_d = sum(acs5.get(f, {}).get("veterans_base") or 0.0 for f in scos)
        s_af_n = sum(acs5.get(f, {}).get("armed_forces") or 0.0 for f in scos)
        s_af_d = sum(acs5.get(f, {}).get("armed_forces_base") or 0.0 for f in scos)
        s_land_km2 = sum(gaz_counties.get(f, {}).get("land_km2") or 0.0 for f in scos)
        s_inst_cnt = sum(1 for b in military_bases if b["state"] == abbr)

        # 7-class NLCD land cover: exact R=25km equal-area L48 hexes for Lower-48 states (empty for DC); raster average for AK/HI
        if abbr in ("AK", "HI"):
            s_land_cover: dict[str, float] = {}
            for lk in LAND_KEYS:
                arr_k = nlcd_cols[lk][hids]
                valid_k = arr_k[~np.isnan(arr_k)]
                s_land_cover[lk] = round(float(np.mean(valid_k)), 4) if valid_k.size > 0 else 0.0
        elif l48_land_by_state:
            s_land_cover = dict(l48_land_by_state.get(abbr, {}))
        else:
            s_land_cover = {}
            for lk in LAND_KEYS:
                arr_k = nlcd_cols[lk][hids]
                valid_k = arr_k[~np.isnan(arr_k)]
                s_land_cover[lk] = round(float(np.mean(valid_k)), 4) if valid_k.size > 0 else 0.0

        # ALL 20 BEA sectors (key + zh name + musd)
        sectors = sorted(
            [{"key": k, "name": INDUSTRY_LABELS_ZH.get(k, k), "musd": round(v, 1)} for k, v in sgdp.get("sectors", {}).items()],
            key=lambda x: x["musd"],
            reverse=True,
        )

        states_out.append({
            "fips": sf,
            "abbr": abbr,
            "name": STATE_FIPS_TO_NAME[sf],
            "region_name": STATE_REGION.get(sf, "West"),
            "x": round(sx, 1),
            "y": round(sy, 1),
            "pop": pop,
            "density": round(pop / max(1.0, s_land_km2), 1) if s_land_km2 > 0 else None,
            "land_km2": round(s_land_km2, 1),
            "employed": sa1.get("employed"),
            "unemployment": sa1.get("unemployment"),
            "pop_growth_pct": pep.get("pop_growth_pct"),
            "gdp_musd": round(gdp_m, 1),
            "gdp_per_cap": round((gdp_m * 1e6) / max(1, pop)),
            "median_income": _round_or_none(sa1.get("median_income") or st_wavg("income"), 0),
            "median_home": _round_or_none(sa1.get("median_home") or st_wavg("home"), 0),
            "median_rent": _round_or_none(sa1.get("median_rent"), 0),
            "rent_burden": sa1.get("rent_burden"),
            "bachelors_pct": _round_or_none(st_cwavg(lambda f: acs5.get(f, {}).get("bachelors")) or sa1.get("bachelors_pct"), 4),
            "broadband_pct": _round_or_none(st_cwavg(lambda f: acs5.get(f, {}).get("broadband")), 4),
            "poverty_pct": _round_or_none(st_cwavg(lambda f: acs5.get(f, {}).get("poverty")), 4),
            "homeownership_pct": _round_or_none(st_cwavg(lambda f: acs5.get(f, {}).get("homeownership")), 4),
            "uninsured_pct": _round_or_none(st_cwavg(lambda f: acs5.get(f, {}).get("uninsured")), 4),
            "median_age": _round_or_none(st_cwavg(lambda f: acs5.get(f, {}).get("median_age")), 1),
            "foreign_born_pct": _round_or_none(st_cwavg(lambda f: acs5.get(f, {}).get("foreign_born")), 4),
            "commute_min": _round_or_none(st_cwavg(lambda f: acs5.get(f, {}).get("commute")), 1),
            "amenities": _round_or_none(st_cwavg(lambda f: cdc_places.get(f, {}).get("amenities")), 1),
            "disasters": _round_or_none(st_cwavg(lambda f: fema_counties.get(f, {}).get("count", 0)), 1),
            "fema_total": fm.get("total", 0),
            "fema_by_type": fm.get("by_type", {}),
            "faith_rate": _round_or_none(st_cwavg(lambda f: usrc.get(f, {}).get("faith_rate")), 1),
            "installations_count": s_inst_cnt,
            "veterans": int(round(s_vet_n)),
            "veterans_pct": _round_or_none(s_vet_n / s_vet_d if s_vet_d > 0 else st_wavg("veterans"), 4),
            "armed_forces": int(round(s_af_n)),
            "armed_forces_pct": _round_or_none(s_af_n / s_af_d if s_af_d > 0 else 0.0, 4),
            "yields": {
                "food": int(round(float(y_food[hids].sum()) / 12.0)),
                "prod": int(round(float(y_prod[hids].sum()) / 12.0)),
                "gold": max(1, int(round(gdp_m / 1000.0))),
                "sci": int(round(float(y_sci[hids].sum()) / 10.0)),
                "cul": int(round(float(y_cul[hids].sum()) / 10.0)),
                "faith": int(round(float(y_faith[hids].sum()) / 12.0)),
            },
            "yields_workers": sa1.get("yields_workers", {}),
            "jobs": sa1.get("jobs", {}),
            "gdp_by_sector": sectors,
            "land_cover": s_land_cover,
            "power_mw_by_fuel": {k: round(v, 1) for k, v in state_power_fuel.get(sf, {}).items()},
            "defense_spending_musd": o_m.get("spending_musd"),
            "defense_contracts_musd": o_m.get("contracts_musd"),
            "defense_payroll_musd": o_m.get("payroll_musd"),
            "defense_grants_musd": o_m.get("grants_musd"),
            "defense_per_resident": o_m.get("per_resident"),
            "defense_pct_gdp": o_m.get("pct_gdp"),
            "defense_top_vendors": o_m.get("top_vendors", []),
            "defense_top_counties": o_m.get("top_counties", []),
            "military_active": d_m.get("active"),
            "military_reserve": d_m.get("reserve"),
            "military_civilian": d_m.get("civilian"),
            "military_total": d_m.get("total"),
            "military_by_branch": d_m.get("by_branch", {}),
            "noaa_billion_events": nb.get("events"),
            "noaa_billion_cost_busd": nb.get("cost_busd"),
            "top_cities": [c["id"] for c in cities_by_state.get(abbr, [])[:8]],
        })

    # Populate 3 State-Level Macro Lenses (OLDCC Defense % GDP, DMDC Active Troops per 10K, NOAA Billion-Dollar Disasters)
    st_out_by_fips = {s["fips"]: s for s in states_out}
    for hid, sf in enumerate(st_arr):
        so = st_out_by_fips.get(sf)
        if not so:
            continue
        dp = so.get("defense_pct_gdp")
        if dp is not None:
            hex_lenses["defense_pct_gdp"][hid] = round(float(dp), 4)
        ma = so.get("military_active")
        spop = so.get("pop") or 0
        if ma is not None and spop > 0:
            hex_lenses["mil_active_density"][hid] = round((float(ma) / float(spop)) * 10000.0, 1)
        nc = so.get("noaa_billion_cost_busd")
        if nc is not None:
            hex_lenses["noaa_billion_cost"][hid] = round(float(nc), 1)

    # 9. Assemble 3,144-County Explorer Table
    explorer_columns = [
        {"key": "pop", "label": "总人口", "unit": "人", "format": "int", "group": "人口", "source_id": "acs_5yr", "numeric": True},
        {"key": "density", "label": "人口密度", "unit": "人/km²", "format": "dec1", "group": "人口", "source_id": "acs_5yr", "numeric": True},
        {"key": "land_km2", "label": "陆地面积", "unit": "km²", "format": "int", "group": "地理与能源", "source_id": "census_gazetteer", "numeric": True},
        {"key": "pop_growth", "label": "人口增速 (2021-25)", "unit": "%", "format": "pct", "group": "人口", "source_id": "pep_population", "numeric": True},
        {"key": "income", "label": "家庭中位收入", "unit": "$", "format": "usd", "group": "经济与住房", "source_id": "acs_5yr", "numeric": True},
        {"key": "home", "label": "房价中位数", "unit": "$", "format": "usd", "group": "经济与住房", "source_id": "acs_5yr", "numeric": True},
        {"key": "affordability", "label": "房价收入比", "unit": "倍", "format": "dec1", "group": "经济与住房", "source_id": "acs_5yr", "numeric": True},
        {"key": "gdp_musd", "label": "真实 GDP", "unit": "$M", "format": "usd_m", "group": "经济与住房", "source_id": "bea_gdp", "numeric": True},
        {"key": "gdp_per_cap", "label": "人均 GDP", "unit": "$", "format": "usd", "group": "经济与住房", "source_id": "bea_gdp", "numeric": True},
        {"key": "avg_wage", "label": "平均年薪 (QCEW)", "unit": "$", "format": "usd", "group": "经济与住房", "source_id": "bls_qcew", "numeric": True},
        {"key": "poverty", "label": "贫困率", "unit": "%", "format": "pct", "group": "经济与住房", "source_id": "acs_5yr", "numeric": True},
        {"key": "bachelors", "label": "本科及以上学历", "unit": "%", "format": "pct", "group": "科技与知识", "source_id": "acs_5yr", "numeric": True},
        {"key": "broadband", "label": "宽带普及率", "unit": "%", "format": "pct", "group": "科技与知识", "source_id": "acs_5yr", "numeric": True},
        {"key": "amenities", "label": "健康宜居指数", "unit": "指数", "format": "index", "group": "生活与健康", "source_id": "cdc_places", "numeric": True},
        {"key": "mhlth", "label": "心理困扰比例", "unit": "%", "format": "pct", "group": "生活与健康", "source_id": "cdc_places", "numeric": True},
        {"key": "loneliness", "label": "孤独感比例", "unit": "%", "format": "pct", "group": "生活与健康", "source_id": "cdc_places", "numeric": True},
        {"key": "commute", "label": "平均通勤时长", "unit": "分钟", "format": "dec1", "group": "生活与健康", "source_id": "acs_5yr", "numeric": True},
        {"key": "homeownership", "label": "住房自有率", "unit": "%", "format": "pct", "group": "生活与健康", "source_id": "acs_5yr", "numeric": True},
        {"key": "uninsured", "label": "无医保比例", "unit": "%", "format": "pct", "group": "生活与健康", "source_id": "acs_5yr", "numeric": True},
        {"key": "age", "label": "中位年龄", "unit": "岁", "format": "dec1", "group": "人口", "source_id": "acs_5yr", "numeric": True},
        {"key": "foreign_born", "label": "外国出生占比", "unit": "%", "format": "pct", "group": "人口", "source_id": "acs_5yr", "numeric": True},
        {"key": "veterans", "label": "退伍军人占比", "unit": "%", "format": "pct", "group": "国防与兵源", "source_id": "acs_5yr", "numeric": True},
        {"key": "armed_forces_pct", "label": "现役军人占比", "unit": "%", "format": "pct", "group": "国防与兵源", "source_id": "acs_5yr", "numeric": True},
        {"key": "faith_rate", "label": "宗教信徒率", "unit": "/百人", "format": "dec1", "group": "信仰与灾害", "source_id": "usrc_2020", "numeric": True},
        {"key": "disasters", "label": "FEMA 重大灾害数", "unit": "次", "format": "int", "group": "信仰与灾害", "source_id": "fema_declarations", "numeric": True},
        {"key": "forest", "label": "森林覆被率", "unit": "%", "format": "pct", "group": "地理与能源", "source_id": "nlcd", "numeric": True},
        {"key": "farmland", "label": "农田覆被率", "unit": "%", "format": "pct", "group": "地理与能源", "source_id": "nlcd", "numeric": True},
        {"key": "developed", "label": "建成区占比", "unit": "%", "format": "pct", "group": "地理与能源", "source_id": "nlcd", "numeric": True},
        {"key": "elev_m", "label": "平均海拔", "unit": "米", "format": "int", "group": "地理与能源", "source_id": "etopo", "numeric": True},
        {"key": "power_mw", "label": "电力装机容量", "unit": "MW", "format": "int", "group": "地理与能源", "source_id": "eia_860m", "numeric": True},
    ]

    county_rows: list[dict] = []
    tot_veterans_us = 0
    for fips, a in acs5.items():
        tot_veterans_us += int(round(a.get("veterans_count") or 0))
        hids = county_hex_ids.get(fips, [])
        if not hids:
            continue
        gaz = gaz_counties.get(fips, {})
        st = fips[:2]
        pop = a.get("pop") or 0.0
        lkm2 = gaz.get("land_km2") or float(land_km2_arr[hids].sum())
        cgdp = county_gdp.get(fips)
        qc = qcew_totals.get(fips, {})
        ur = usrc.get(fips)
        cpep = county_pep.get(fips, {})
        cdc = cdc_places.get(fips, {})
        fc = fema_counties.get(fips, {})

        cf = np.nanmean(nlcd_f[hids]) if not np.all(np.isnan(nlcd_f[hids])) else np.nan
        ca = np.nanmean(nlcd_a[hids]) if not np.all(np.isnan(nlcd_a[hids])) else np.nan
        cd = np.nanmean(nlcd_d[hids]) if not np.all(np.isnan(nlcd_d[hids])) else np.nan
        ce = float(np.mean(elev_arr[hids]))
        cmw = sum(hex_power_mw.get(h, 0.0) for h in hids)
        cx_c = float(np.mean(mx_arr[hids]))
        cy_c = float(np.mean(my_arr[hids]))

        dom_t_lbl = None
        if ur and ur.get("traditions"):
            best_tid = max(ur["traditions"].items(), key=lambda kv: kv[1])[0]
            if ur["traditions"][best_tid] > 0:
                dom_t_lbl = trad_label_map[best_tid]

        inc_v = a.get("income")
        hom_v = a.get("home")
        aff_v = round(hom_v / inc_v, 2) if (hom_v and inc_v and inc_v > 0) else None

        county_rows.append({
            "fips": fips,
            "name": gaz.get("name", fips),
            "state": STATE_FIPS_TO_ABBR.get(st, ""),
            "cbsa": county_to_cbsa.get(fips),
            "region_name": STATE_REGION.get(st, "West"),
            "x": round(cx_c, 1),
            "y": round(cy_c, 1),
            "hex_ids": hids,
            "pop": int(round(pop)),
            "land_km2": round(lkm2, 1),
            "density": round(pop / max(1.0, lkm2), 1),
            "pop_growth": cpep.get("pop_growth_pct"),
            "income": _round_or_none(inc_v, 0),
            "home": _round_or_none(hom_v, 0),
            "affordability": aff_v,
            "gdp_musd": _round_or_none(cgdp, 1),
            "gdp_per_cap": round((cgdp * 1e6) / pop) if (cgdp and pop > 0) else None,
            "avg_wage": _round_or_none(qc.get("avg_wage"), 0),
            "poverty": _round_or_none(a.get("poverty"), 4),
            "bachelors": _round_or_none(a.get("bachelors"), 4),
            "broadband": _round_or_none(a.get("broadband"), 4),
            "amenities": cdc.get("amenities"),
            "mhlth": cdc.get("mhlth"),
            "loneliness": cdc.get("loneliness"),
            "commute": _round_or_none(a.get("commute"), 1),
            "homeownership": _round_or_none(a.get("homeownership"), 4),
            "uninsured": _round_or_none(a.get("uninsured"), 4),
            "age": _round_or_none(a.get("median_age"), 1),
            "foreign_born": _round_or_none(a.get("foreign_born"), 4),
            "veterans": _round_or_none(a.get("veterans"), 4),
            "veterans_count": int(round(a.get("veterans_count") or 0)),
            "armed_forces": int(round(a.get("armed_forces") or 0)),
            "armed_forces_pct": _round_or_none(a.get("armed_forces_pct"), 4),
            "faith_rate": ur["faith_rate"] if ur else None,
            "faith_tradition": dom_t_lbl,
            "disasters": fc.get("count", 0),
            "fema_top_type": fc.get("top_type"),
            "fema_last_date": fc.get("last_date", ""),
            "fema_by_type": fc.get("by_type", {}),
            "forest": _round_or_none(None if np.isnan(cf) else float(cf), 4),
            "farmland": _round_or_none(None if np.isnan(ca) else float(ca), 4),
            "developed": _round_or_none(None if np.isnan(cd) else float(cd), 4),
            "elev_m": int(round(ce)),
            "power_mw": int(round(cmw)),
        })
    county_rows.sort(key=lambda r: r["pop"], reverse=True)

    # 10. Compute Lens metadata with exact domains, log/linear scales & granularity for all 27 lenses
    lenses_meta = []
    for (lid, name, name_en, grp, unit, fmt, ramp, hi, src_id, desc, scale, dom, gran) in LENS_SPECS:
        vals = [v for v in hex_lenses[lid] if v is not None]
        if lid == "faith_tradition":
            lenses_meta.append({
                "id": lid, "name": name, "name_en": name_en, "group": grp, "unit": unit,
                "format": fmt, "ramp": ramp, "scale": scale, "domain": [1, 7], "granularity": gran,
                "higher_is": hi, "source_id": src_id, "description": desc,
                "p02": 1, "p98": 7, "min": 1, "max": 7, "median": 1,
                "categorical": True,
                "categories": [{"id": t[0], "key": t[1], "label": t[2], "color": t[3]} for t in RELIGION_TRADITIONS],
            })
        else:
            arr = np.array(vals, dtype=np.float64)
            med = float(np.percentile(arr, 50))
            d0, d1 = float(dom[0]), float(dom[1])
            lenses_meta.append({
                "id": lid, "name": name, "name_en": name_en, "group": grp, "unit": unit,
                "format": fmt, "ramp": ramp, "scale": scale, "domain": [d0, d1], "granularity": gran,
                "higher_is": hi, "source_id": src_id, "description": desc,
                "p02": round(d0, 4),
                "p98": round(d1, 4),
                "min": round(float(arr.min()), 4),
                "max": round(float(arr.max()), 4),
                "median": round(med, 4),
            })

    # 11. National Summary & Reconciliation Audit
    tot_pop_us = int(round(us_bench.get("pop") or sum(s["pop"] for s in states_out)))
    mapped_power_mw = sum(x["mw"] for x in power_by_fuel)
    clean_mw = sum(x["mw"] for x in power_by_fuel if x["fuel"] in ("nuclear", "solar", "wind", "hydro", "battery", "pumped_storage", "geothermal"))

    oldcc_national["pct_gdp"] = round((oldcc_national["total_musd"] / max(1.0, us_gdp_musd)), 4)
    oldcc_national["per_resident"] = round((oldcc_national["total_musd"] * 1e6) / max(1, tot_pop_us))

    gdp_ind_ordered = sorted(
        [{"key": k, "name": INDUSTRY_LABELS_ZH.get(k, k), "musd": v} for k, v in us_gdp_by_industry.items()],
        key=lambda x: x["musd"],
        reverse=True,
    )

    nation_summary = {
        "population": tot_pop_us,
        "employed": us_bench.get("employed") or 0,
        "unemployment": us_bench.get("unemployment") or 0.0488,
        "growth": us_growth,
        "growth_years": [2021, 2025],
        "gdp_musd": round(us_gdp_musd, 1),
        "gdp_per_cap": round((us_gdp_musd * 1e6) / max(1, tot_pop_us)),
        "gdp_by_industry": gdp_ind_ordered,
        "jobs": us_bench.get("jobs", {}),
        "industry_labels": INDUSTRY_LABELS_ZH,
        "real_yields": {
            "food": us_bench["yields_workers"]["food"],
            "production": us_bench["yields_workers"]["production"],
            "gold": round(us_gdp_musd * 1e6),
            "science": us_bench["yields_workers"]["science"],
            "culture": us_bench["yields_workers"]["culture"],
        },
        "power_mw": round(mapped_power_mw, 1),
        "power_all_mw": all_power_mw,
        "power_sites_count": len(power_plants),
        "clean_power_pct": round(clean_mw / max(1.0, mapped_power_mw), 4),
        "median_income": round(us_bench.get("median_income") or 84780),
        "median_rent": round(us_bench.get("median_rent") or 1557),
        "home_value": round(us_bench.get("home_value") or 371100),
        "rent_burden": us_bench.get("rent_burden") or 0.2204,
        "bachelors_pct": round(us_bench.get("bachelors_pct") or 0.372, 4),
        "stem_share": us_bench["workforce"]["stem_share"],
        "stem_one_in": us_bench["workforce"]["stem_one_in"],
        "avg_amenities": 100.0,
        "park_visits": all_nps_visits,
        "veterans_total": tot_veterans_us,
        "military_national": dmdc_national,
        "defense_national": oldcc_national,
        "noaa_national": noaa_national,
        "fema_national": fema_summary,
        "land_national": land_national,
        "land_dom_counts": land_national_dom_counts,
        "total_metros": len(cities),
        "conus_metros": sum(1 for c in cities if c["state_abbr"] not in ("AK", "HI")),
        "total_counties": len(county_rows),
        "conus_counties": sum(1 for r in county_rows if r["state"] not in ("AK", "HI")),
        "total_hexes": n_hex,
        "total_wonders": len(wonders),
        "fema_states_all": fema_states,
        "yields": {
            "food": int(y_food.sum()),
            "prod": int(y_prod.sum()),
            "gold": int(round(us_gdp_musd / 1000.0)),
            "sci": int(y_sci.sum()),
            "cul": int(y_cul.sum()),
            "faith": int(y_faith.sum()),
        },
    }

    # --- AUTOMATED DATA QUALITY & RECONCILIATION AUDIT ---
    print("\n================ V3 STATISTICAL RECONCILIATION AUDIT ================")
    print(f"  U.S. Pop: {tot_pop_us:,} | Employed: {nation_summary['employed']:,} | Unemp: {nation_summary['unemployment']*100:.2f}% | Growth 21-25: {us_growth*100:+.2f}%")
    print(f"  Real Yields: Food={nation_summary['real_yields']['food']:,} | Prod={nation_summary['real_yields']['production']:,} | GDP=${us_gdp_musd/1e6:.2f}T | Sci={nation_summary['real_yields']['science']:,} | Cul={nation_summary['real_yields']['culture']:,}")
    print(f"  Top 3 BEA Industries: " + ", ".join(f"{x['name']} ${x['musd']/1e6:.2f}T ({x['musd']/us_gdp_musd*100:.1f}%)" for x in gdp_ind_ordered[:3]))
    print(f"  Energy Mapped: {mapped_power_mw/1000:.1f} GW across {len(power_plants)} sites | Mines: {len(mines)} | Shale hexes: {int(shale_arr.sum())}")
    print(f"  Military: Active={dmdc_national.get('active',0):,} + Guard/Res={dmdc_national.get('guard_reserve',0):,} | Defense=${oldcc_national['total_musd']/1e3:.1f}B ({oldcc_national['pct_gdp']*100:.2f}% GDP) | Veterans={tot_veterans_us:,} | Garrisons={sum(1 for c in cities if c['garrison_tier'])}")
    print(f"  Commerce: Domestic=${trade_data['total_musd']/1e6:.2f}T | Import=${trade_data['import_musd']/1e6:.2f}T | Export=${trade_data['export_musd']/1e6:.2f}T")
    print(f"  Culture: {len(wonders)} Wonders | NPS Visits={all_nps_visits:,} | NOAA={noaa_national['events']} events (${noaa_national['cost_busd']:.1f}B) | FEMA={fema_summary['total']} DRs")
    print(f"  Land (L48): Forest={land_national['forest']*100:.1f}% | Crop={land_national['crop']*100:.1f}% | Pasture={land_national['pasture']*100:.1f}% | Built-up={land_national['developed']*100:.1f}%")
    print("=====================================================================\n")

    def _sanitize(o: object) -> object:
        if isinstance(o, float):
            return None if (math.isnan(o) or math.isinf(o)) else o
        if isinstance(o, dict):
            return {k: _sanitize(v) for k, v in o.items()}
        if isinstance(o, list):
            return [_sanitize(v) for v in o]
        return o

    def write_json(name: str, obj: object):
        p = WEB_DATA_DIR / name
        txt = json.dumps(_sanitize(obj), separators=(",", ":"), ensure_ascii=False, allow_nan=False)
        p.write_text(txt, encoding="utf-8")
        print(f"  [export] {name:18s} -> {len(txt.encode('utf-8')) / 1e6:6.2f} MB")

    meta_out = {
        "bounds_km": grid_meta["bounds_km"],
        "insets": grid_meta["insets"],
        "hex_count": n_hex,
        "hex_radius_km": grid_meta["hex_radius_km"],
        "nation": nation_summary,
        "sources": [
            {
                "id": s.id,
                "category": s.category,
                "title": s.title,
                "publisher": s.publisher,
                "homepage": s.homepage,
                "vintage": s.vintage,
                "used_for": s.used_for,
                "files_count": len(s.files),
            }
            for s in SOURCES
        ],
        "lenses": lenses_meta,
        "district_catalog": [{k: v for k, v in d.items() if k != "naics"} for d in DISTRICT_CATALOG],
        "mine_catalog": [
            {"id": k, "label": v[0], "label_en": v[1], "color": v[2], "unit": v[3], "rule": v[4]}
            for k, v in MINE_META.items()
        ],
        "fema_types": [{"id": t[0], "label": t[1]} for t in FEMA_TYPE_DEFS],
    }

    def _pct_int(col_arr: np.ndarray) -> list[int]:
        return [0 if np.isnan(v) else int(round(float(v) * 100.0)) for v in col_arr]

    world_hex_out = {
        "n": n_hex,
        "x": [round(float(v), 1) for v in mx_arr],
        "y": [round(float(v), 1) for v in my_arr],
        "r": [round(float(v), 2) for v in hex_df["map_r"].to_numpy()],
        "reg": [int(v) for v in reg_arr],
        "lon": [round(float(v), 1) for v in hex_df["lon"].to_numpy()],
        "lat": [round(float(v), 1) for v in hex_df["lat"].to_numpy()],
        "elev": [int(round(float(v))) for v in elev_arr],
        "emax": [int(round(float(v))) for v in hex_df["elev_max"].to_numpy()],
        "rcls": [int(v) for v in rcls_arr],
        "biome": [int(v) for v in hex_df["biome"].to_numpy()],
        "cover": [int(v) for v in hex_df["cover"].to_numpy()],
        "pct": {
            "f": _pct_int(nlcd_cols["forest"]),
            "c": _pct_int(nlcd_cols["crop"]),
            "p": _pct_int(nlcd_cols["pasture"]),
            "g": _pct_int(nlcd_cols["grass"]),
            "s": _pct_int(nlcd_cols["shrub"]),
            "w": _pct_int(nlcd_cols["wetland"]),
            "d": _pct_int(nlcd_cols["developed"]),
        },
        "dom_land": [int(v) for v in dom_land],
        "river": [int(v) for v in river_arr],
        "shale": [int(v) for v in shale_arr],
        "fips": dom_fips_list,
        "st": st_arr,
        "cbsa": hex_cbsa,
        "yields": {
            "food": y_food.tolist(),
            "prod": y_prod.tolist(),
            "gold": y_gold.tolist(),
            "sci": y_sci.tolist(),
            "cul": y_cul.tolist(),
            "faith": y_faith.tolist(),
        },
        "lenses": hex_lenses,
    }

    layers_out = {
        "neighbor_land": art_layers.get("neighbor_land", []),
        "state_borders": art_layers["state_borders"],
        "rivers": art_layers["rivers"],
        "lakes": art_layers["lakes"],
        "roads_primary": art_layers["roads_primary"],
        "roads_secondary": art_layers["roads_secondary"],
        "rail_main": art_layers["rail_main"],
        "shale_plays": art_layers["shale_plays"],
        "shale_sites": shale_sites,
        "power_plants": power_plants,
        "power_by_fuel": power_by_fuel,
        "mines": mines,
        "ports": ports,
        "airports": airports,
        "military_bases": military_bases,
        "military_ranges": military_ranges,
        "restricted_hex_ids": restricted_hex_ids,
        "wonders": wonders,
        "protected_hex_ids": protected_hex_ids,
        "trade": trade_data,
        "noaa_timeline": noaa_timeline,
    }

    write_json("meta.json", meta_out)
    write_json("world_hex.json", world_hex_out)
    write_json("cities.json", cities)
    write_json("states.json", states_out)
    write_json("layers.json", layers_out)
    write_json("counties.json", {"columns": explorer_columns, "rows": county_rows})
    from .spatial.global_military import build_global_military
    build_global_military(RAW_DIR, WEB_DATA_DIR)
    print("[build_all] DONE! All 7 reconciled real-data frontend bundles written to web/public/data/")


if __name__ == "__main__":
    run_build()
