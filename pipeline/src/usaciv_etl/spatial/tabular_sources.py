"""Parsers for all tabular federal & academic sources (ACS 1yr/5yr, PEP, BEA, BLS QCEW, CDC, USRC, FEMA, NOAA, DMDC, OLDCC)."""
from __future__ import annotations

import csv
import io
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import openpyxl
import polars as pl

STATE_FIPS_TO_ABBR: dict[str, str] = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
    "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL",
    "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
    "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
    "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
    "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
    "55": "WI", "56": "WY",
}
STATE_ABBR_TO_FIPS = {v: k for k, v in STATE_FIPS_TO_ABBR.items()}
STATE_FIPS_TO_NAME: dict[str, str] = {
    "01": "Alabama", "02": "Alaska", "04": "Arizona", "05": "Arkansas", "06": "California",
    "08": "Colorado", "09": "Connecticut", "10": "Delaware", "11": "District of Columbia",
    "12": "Florida", "13": "Georgia", "15": "Hawaii", "16": "Idaho", "17": "Illinois",
    "18": "Indiana", "19": "Iowa", "20": "Kansas", "21": "Kentucky", "22": "Louisiana",
    "23": "Maine", "24": "Maryland", "25": "Massachusetts", "26": "Michigan", "27": "Minnesota",
    "28": "Mississippi", "29": "Missouri", "30": "Montana", "31": "Nebraska", "32": "Nevada",
    "33": "New Hampshire", "34": "New Jersey", "35": "New Mexico", "36": "New York",
    "37": "North Carolina", "38": "North Dakota", "39": "Ohio", "40": "Oklahoma", "41": "Oregon",
    "42": "Pennsylvania", "44": "Rhode Island", "45": "South Carolina", "46": "South Dakota",
    "47": "Tennessee", "48": "Texas", "49": "Utah", "50": "Vermont", "51": "Virginia",
    "53": "Washington", "54": "West Virginia", "55": "Wisconsin", "56": "Wyoming",
}
STATE_NAME_TO_FIPS = {v.upper(): k for k, v in STATE_FIPS_TO_NAME.items()}

STATE_REGION: dict[str, str] = {
    "09": "Northeast", "23": "Northeast", "25": "Northeast", "33": "Northeast", "34": "Northeast",
    "36": "Northeast", "42": "Northeast", "44": "Northeast", "50": "Northeast",
    "17": "Midwest", "18": "Midwest", "19": "Midwest", "20": "Midwest", "26": "Midwest",
    "27": "Midwest", "29": "Midwest", "31": "Midwest", "38": "Midwest", "39": "Midwest",
    "46": "Midwest", "55": "Midwest",
    "01": "South", "05": "South", "10": "South", "11": "South", "12": "South", "13": "South",
    "21": "South", "22": "South", "24": "South", "28": "South", "37": "South", "40": "South",
    "45": "South", "47": "South", "48": "South", "51": "South", "54": "South",
    "02": "West", "04": "West", "06": "West", "08": "West", "15": "West", "16": "West",
    "30": "West", "32": "West", "35": "West", "41": "West", "49": "West", "53": "West", "56": "West",
}


def _clean_acs_num(v: str | None) -> float | None:
    if v is None:
        return None
    s = v.strip()
    if not s or s in (".", "-", "**", "***", "N", "(X)"):
        return None
    try:
        x = float(s)
        # Census sentinel missing values are negative huge numbers like -666666666
        if x < -1e6:
            return None
        return x
    except ValueError:
        return None


def _read_acs_table_filtered(path: Path, prefix: str, keep_cols: list[str]) -> dict[str, dict[str, float | None]]:
    """Fast streaming parser for Census pipe-delimited ACS .dat files, filtering by GEO_ID prefix (e.g. '0500000US')."""
    out: dict[str, dict[str, float | None]] = {}
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        header = f.readline().strip().split("|")
        col_idx = {c: i for i, c in enumerate(header)}
        want = [(c, col_idx[c]) for c in keep_cols if c in col_idx]
        for line in f:
            if not line.startswith(prefix):
                continue
            parts = line.rstrip("\n").split("|")
            gid = parts[0]
            key = gid[len(prefix):]
            row: dict[str, float | None] = {}
            for cname, idx in want:
                row[cname] = _clean_acs_num(parts[idx]) if idx < len(parts) else None
            out[key] = row
    return out


def load_cbsa_delineation(raw_dir: Path) -> tuple[dict[str, dict], dict[str, str]]:
    """Return (cbsa_info_by_code, county_fips_to_cbsa_code)."""
    wb = openpyxl.load_workbook(raw_dir / "cbsa/list1_2023.xlsx", read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    cbsa_info: dict[str, dict] = {}
    county_to_cbsa: dict[str, str] = {}
    header_found = False
    for row in ws.iter_rows(values_only=True):
        if not header_found:
            if row and row[0] == "CBSA Code":
                header_found = True
            continue
        if not row or not row[0]:
            continue
        code = str(row[0]).strip().zfill(5)
        title = str(row[3] or "").strip()
        kind = str(row[4] or "").strip()
        st_fips = str(row[9] or "").strip().zfill(2)
        cnty_fips = str(row[10] or "").strip().zfill(3)
        if st_fips not in STATE_FIPS_TO_ABBR:
            continue
        fips = st_fips + cnty_fips
        county_to_cbsa[fips] = code
        if code not in cbsa_info:
            cbsa_info[code] = {
                "cbsa": code,
                "title": title,
                "is_metro": "Metropolitan" in kind,
                "counties": [],
                "states": set(),
            }
        cbsa_info[code]["counties"].append(fips)
        cbsa_info[code]["states"].add(st_fips)
    wb.close()
    for info in cbsa_info.values():
        info["states"] = sorted(info["states"])
    print(f"[cbsa] Loaded {len(cbsa_info)} CBSAs covering {len(county_to_cbsa)} counties")
    return cbsa_info, county_to_cbsa


def load_gazetteer_counties(raw_dir: Path) -> dict[str, dict]:
    """Load Census 2024 County Gazetteer (authoritative name, state, land_km2, lat, lon)."""
    out: dict[str, dict] = {}
    with zipfile.ZipFile(raw_dir / "census_gazetteer/2024_Gaz_counties_national.zip") as z:
        fname = next(n for n in z.namelist() if n.endswith(".txt"))
        txt = io.TextIOWrapper(z.open(fname), encoding="utf-8", errors="ignore")
        reader = csv.DictReader(txt, delimiter="\t")
        for row in reader:
            row_clean = {k.strip(): (v.strip() if v else "") for k, v in row.items() if k}
            fips = row_clean.get("GEOID", "").zfill(5)
            st = fips[:2]
            if st not in STATE_FIPS_TO_ABBR:
                continue
            out[fips] = {
                "fips": fips,
                "name": row_clean.get("NAME", fips),
                "state_abbr": row_clean.get("USPS", STATE_FIPS_TO_ABBR[st]),
                "state_fips": st,
                "land_km2": float(row_clean.get("ALAND_SQMI", 0) or 0) * 2.589988,
                "lat": float(row_clean.get("INTPTLAT", 0) or 0),
                "lon": float(row_clean.get("INTPTLONG", 0) or 0),
            }
    print(f"[gazetteer] Loaded {len(out)} counties")
    return out


def load_acs_5yr_counties(raw_dir: Path) -> dict[str, dict]:
    """Parse all 14 ACS 5-year tables for all ~3,143 U.S. counties."""
    d = raw_dir / "acs_5yr"
    pfx = "0500000US"

    t_pop = _read_acs_table_filtered(d / "b01003.dat", pfx, ["B01003_E001"])
    t_age = _read_acs_table_filtered(d / "b01002.dat", pfx, ["B01002_E001"])
    t_fb = _read_acs_table_filtered(d / "b05012.dat", pfx, ["B05012_E001", "B05012_E003"])
    t_cmin = _read_acs_table_filtered(d / "b08013.dat", pfx, ["B08013_E001"])
    t_cwrk = _read_acs_table_filtered(d / "b08303.dat", pfx, ["B08303_E001"])
    t_edu = _read_acs_table_filtered(d / "b15003.dat", pfx, ["B15003_E001", "B15003_E022", "B15003_E023", "B15003_E024", "B15003_E025"])
    t_pov = _read_acs_table_filtered(d / "b17001.dat", pfx, ["B17001_E001", "B17001_E002"])
    t_inc = _read_acs_table_filtered(d / "b19013.dat", pfx, ["B19013_E001"])
    t_vet = _read_acs_table_filtered(d / "b21001.dat", pfx, ["B21001_E001", "B21001_E002"])
    t_lab = _read_acs_table_filtered(d / "b23025.dat", pfx, ["B23025_E001", "B23025_E003", "B23025_E004", "B23025_E005", "B23025_E006"])
    t_own = _read_acs_table_filtered(d / "b25003.dat", pfx, ["B25003_E001", "B25003_E002"])
    t_hom = _read_acs_table_filtered(d / "b25077.dat", pfx, ["B25077_E001"])
    # B27010: No health insurance coverage lines across 4 age groups are E017, E033, E050, E066
    t_ins = _read_acs_table_filtered(d / "b27010.dat", pfx, ["B27010_E001", "B27010_E017", "B27010_E033", "B27010_E050", "B27010_E066"])
    t_bb = _read_acs_table_filtered(d / "b28002.dat", pfx, ["B28002_E001", "B28002_E004"])

    counties: dict[str, dict] = {}
    for fips, prow in t_pop.items():
        if len(fips) != 5 or fips[:2] not in STATE_FIPS_TO_ABBR:
            continue
        pop = prow.get("B01003_E001")
        def ratio(num: float | None, den: float | None) -> float | None:
            if num is None or den is None or den <= 0:
                return None
            return num / den

        edu_r = t_edu.get(fips, {})
        edu_deg = sum(edu_r.get(f"B15003_E0{k}") or 0.0 for k in (22, 23, 24, 25)) if edu_r.get("B15003_E001") else None
        ins_r = t_ins.get(fips, {})
        unins_n = sum(ins_r.get(f"B27010_E0{k}") or 0.0 for k in (17, 33, 50, 66)) if ins_r.get("B27010_E001") else None
        vet_r = t_vet.get(fips, {})
        lab_r = t_lab.get(fips, {})

        counties[fips] = {
            "pop": pop,
            "median_age": t_age.get(fips, {}).get("B01002_E001"),
            "foreign_born": ratio(t_fb.get(fips, {}).get("B05012_E003"), t_fb.get(fips, {}).get("B05012_E001")),
            "commute": ratio(t_cmin.get(fips, {}).get("B08013_E001"), t_cwrk.get(fips, {}).get("B08303_E001")),
            "bachelors": ratio(edu_deg, edu_r.get("B15003_E001")),
            "poverty": ratio(t_pov.get(fips, {}).get("B17001_E002"), t_pov.get(fips, {}).get("B17001_E001")),
            "income": t_inc.get(fips, {}).get("B19013_E001"),
            "veterans": ratio(vet_r.get("B21001_E002"), vet_r.get("B21001_E001")),
            "veterans_count": vet_r.get("B21001_E002"),
            "veterans_base": vet_r.get("B21001_E001"),
            "armed_forces": lab_r.get("B23025_E006"),
            "armed_forces_base": lab_r.get("B23025_E001"),
            "armed_forces_pct": ratio(lab_r.get("B23025_E006"), lab_r.get("B23025_E001")),
            "employed": lab_r.get("B23025_E004"),
            "unemp_rate": ratio(lab_r.get("B23025_E005"), lab_r.get("B23025_E003")),
            "homeownership": ratio(t_own.get(fips, {}).get("B25003_E002"), t_own.get(fips, {}).get("B25003_E001")),
            "home": t_hom.get(fips, {}).get("B25077_E001"),
            "uninsured": ratio(unins_n, ins_r.get("B27010_E001")),
            "broadband": ratio(t_bb.get(fips, {}).get("B28002_E004"), t_bb.get(fips, {}).get("B28002_E001")),
        }

    print(f"[acs_5yr] Parsed {len(counties)} counties across 14 ACS tables")
    return counties


def _parse_c24010_workforce(row: dict[str, float | None]) -> dict | None:
    """Translate ACS C24010 occupation counts into our 8-group workforce + 16-Meeple Isotype Cohort."""
    tot = row.get("C24010_E001")
    if not tot or tot <= 0:
        return None

    def g(k: str) -> float:
        return row.get(k) or 0.0

    # Male + Female mirror lines (offset +36):
    # E004/E040: Management, business, and financial
    # E007/E043: Computer, engineering, and science (STEM!)
    # E011/E047: Education, legal, community service, arts, media
    # E015/E051: Healthcare practitioners & technical + E020/E056: Healthcare support
    # E019/E055 minus E020/E056: Service occupations (food, protective, grounds, personal)
    # E027/E063: Sales and office
    # E031/E067: Farming, fishing, and forestry
    # E032/E068 + E033/E069 + E035/E071: Construction, maintenance, and production
    # E036/E072 + E037/E073: Transportation and material moving
    stem = g("C24010_E007") + g("C24010_E043")
    biz = g("C24010_E004") + g("C24010_E040")
    edu = g("C24010_E011") + g("C24010_E047")
    med = g("C24010_E015") + g("C24010_E051") + g("C24010_E020") + g("C24010_E056")
    srv_raw = max(0.0, (g("C24010_E019") + g("C24010_E055")) - (g("C24010_E020") + g("C24010_E056")))
    sales_off = g("C24010_E027") + g("C24010_E063")
    agri = g("C24010_E031") + g("C24010_E067")
    mfg = g("C24010_E032") + g("C24010_E068") + g("C24010_E033") + g("C24010_E069") + g("C24010_E035") + g("C24010_E071")
    trans = g("C24010_E036") + g("C24010_E072") + g("C24010_E037") + g("C24010_E073")

    raw_groups = [
        ("stem", "STEM 科技工程", stem / tot),
        ("biz", "商管与金融", biz / tot),
        ("med", "医疗健康", med / tot),
        ("mfg", "制造与建造", mfg / tot),
        ("edu", "教育与文创", edu / tot),
        ("trans", "交通与物流", trans / tot),
        ("srv", "商业销售与服务", (srv_raw + sales_off) / tot),
        ("agri", "农林渔牧", agri / tot),
    ]
    # Normalize shares strictly to 1.0 and allocate exactly 16 meeples via Hamilton / largest-remainder method
    ssum = sum(s for _, _, s in raw_groups) or 1.0
    norm = [(gid, lbl, s / ssum) for gid, lbl, s in raw_groups]
    exact = [s * 16.0 for _, _, s in norm]
    floors = [int(np.floor(x)) for x in exact]
    rem = 16 - sum(floors)
    order = sorted(range(len(norm)), key=lambda i: exact[i] - floors[i], reverse=True)
    for k in range(rem):
        floors[order[k]] += 1

    stem_share = stem / tot
    return {
        "total_workers": int(round(tot)),
        "stem_share": round(stem_share, 4),
        "stem_one_in": max(1, int(round(1.0 / max(stem_share, 0.005)))),
        "groups": [
            {"id": norm[i][0], "label": norm[i][1], "share": round(norm[i][2], 4), "meeples": floors[i]}
            for i in range(len(norm))
        ],
    }


C24030_IND_20 = [
    ("agriculture", "农林渔牧", "Agriculture, forestry, fishing & hunting", "C24030_E004", "C24030_E031"),
    ("mining", "采矿与油气", "Mining, quarrying, oil & gas", "C24030_E005", "C24030_E032"),
    ("construction", "建筑业", "Construction", "C24030_E006", "C24030_E033"),
    ("manufacturing", "制造业", "Manufacturing", "C24030_E007", "C24030_E034"),
    ("wholesale", "批发贸易", "Wholesale trade", "C24030_E008", "C24030_E035"),
    ("retail", "零售贸易", "Retail trade", "C24030_E009", "C24030_E036"),
    ("transportation", "交通与仓储", "Transportation & warehousing", "C24030_E011", "C24030_E038"),
    ("utilities", "公用事业", "Utilities", "C24030_E012", "C24030_E039"),
    ("information", "信息与软件", "Information", "C24030_E013", "C24030_E040"),
    ("finance", "金融与保险", "Finance & insurance", "C24030_E015", "C24030_E042"),
    ("real_estate", "房地产与租赁", "Real estate", "C24030_E016", "C24030_E043"),
    ("professional", "专业与科研服务", "Professional, scientific & technical", "C24030_E018", "C24030_E045"),
    ("management", "企业总部管理", "Management of companies", "C24030_E019", "C24030_E046"),
    ("admin", "行政与支持服务", "Administrative & waste services", "C24030_E020", "C24030_E047"),
    ("education", "教育服务", "Educational services", "C24030_E022", "C24030_E049"),
    ("health", "医疗与社会救助", "Health care & social assistance", "C24030_E023", "C24030_E050"),
    ("arts", "文化艺术娱乐", "Arts, entertainment & recreation", "C24030_E025", "C24030_E052"),
    ("accommodation", "住宿与餐饮", "Accommodation & food services", "C24030_E026", "C24030_E053"),
    ("other", "其他服务业", "Other services", "C24030_E027", "C24030_E054"),
    ("public_admin", "公共行政", "Public administration", "C24030_E028", "C24030_E055"),
]

INDUSTRY_LABELS_ZH = {k: zh for k, zh, _, _, _ in C24030_IND_20}
INDUSTRY_LABELS_ZH["government"] = "政府与公共部门"


def _parse_c24030_jobs(ind_r: dict[str, float | None]) -> tuple[int, dict[str, int], dict[str, int], list[dict]]:
    """Return (employed_total, jobs_by_20_key, yields_workers, top_industries_list)."""
    emp = int(round((ind_r.get("C24030_E002") or 0.0) + (ind_r.get("C24030_E029") or 0.0)))
    if emp <= 0:
        emp = int(round(ind_r.get("C24030_E001") or 0.0))
    jobs: dict[str, int] = {}
    ind_list: list[dict] = []
    for key, zh, _en, mc, fc in C24030_IND_20:
        v = int(round((ind_r.get(mc) or 0.0) + (ind_r.get(fc) or 0.0)))
        jobs[key] = v
        if emp > 0:
            ind_list.append({"key": key, "name": zh, "share": round(v / emp, 4), "workers": v})
    ind_list.sort(key=lambda x: x["workers"], reverse=True)
    yields_w = {
        "food": jobs.get("agriculture", 0),
        "production": jobs.get("manufacturing", 0) + jobs.get("construction", 0) + jobs.get("mining", 0),
        "science": jobs.get("professional", 0) + jobs.get("information", 0),
        "culture": jobs.get("arts", 0),
    }
    return emp, jobs, yields_w, ind_list


def load_acs_1yr_metros(raw_dir: Path) -> tuple[dict[str, dict], dict[str, dict], dict]:
    """Parse ACS 2025 1-year estimates for all 524+ CBSAs, all 51 States/DC, and U.S. national benchmark."""
    d = raw_dir / "acs_1yr"
    geo_names: dict[str, str] = {}
    with (d / "Geos20251YR.txt").open("r", encoding="utf-8", errors="ignore") as f:
        hdr = f.readline().strip().split("|")
        i_sl = hdr.index("SUMLEVEL")
        i_gid = hdr.index("GEO_ID")
        i_name = hdr.index("NAME")
        for line in f:
            parts = line.rstrip("\n").split("|")
            if len(parts) > i_name and parts[i_sl] == "310":
                gid = parts[i_gid]
                if gid.startswith("310M700US") or gid.startswith("3100000US"):
                    code = gid[-5:]
                    geo_names[code] = parts[i_name]

    cbsa_pfx = "310M700US"
    with (d / "b01003.dat").open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if line.startswith("310"):
                cbsa_pfx = line.split("|")[0][:-5]
                break

    occ_cols = [
        "C24010_E001", "C24010_E004", "C24010_E007", "C24010_E011", "C24010_E015",
        "C24010_E019", "C24010_E020", "C24010_E027", "C24010_E031", "C24010_E032",
        "C24010_E033", "C24010_E035", "C24010_E036", "C24010_E037",
        "C24010_E040", "C24010_E043", "C24010_E047", "C24010_E051",
        "C24010_E055", "C24010_E056", "C24010_E063", "C24010_E067", "C24010_E068",
        "C24010_E069", "C24010_E071", "C24010_E072", "C24010_E073",
    ]
    ind_cols = ["C24030_E001", "C24030_E002", "C24030_E029"] + [c for _, _, _, m, fm in C24030_IND_20 for c in (m, fm)]

    def load_for_prefix(pfx: str):
        age_cols = ["B01001_E001"] + [f"B01001_E{k:03d}" for k in (3,4,5,6,7,8,9,10,11,12,20,21,22,23,24,25,27,28,29,30,31,32,33,34,35,36,44,45,46,47,48,49)]
        return {
            "pop": _read_acs_table_filtered(d / "b01003.dat", pfx, ["B01003_E001"]),
            "age": _read_acs_table_filtered(d / "b01002.dat", pfx, ["B01002_E001"]),
            "age_grp": _read_acs_table_filtered(d / "b01001.dat", pfx, age_cols),
            "fb": _read_acs_table_filtered(d / "b05002.dat", pfx, ["B05002_E001", "B05002_E003", "B05002_E013"]),
            "comm": _read_acs_table_filtered(d / "c08301.dat", pfx, ["C08301_E001", "C08301_E003", "C08301_E008", "C08301_E009", "C08301_E011"]),
            "inc": _read_acs_table_filtered(d / "b19013.dat", pfx, ["B19013_E001"]),
            "lab": _read_acs_table_filtered(d / "b23025.dat", pfx, ["B23025_E003", "B23025_E004", "B23025_E005"]),
            "rent": _read_acs_table_filtered(d / "b25064.dat", pfx, ["B25064_E001"]),
            "home": _read_acs_table_filtered(d / "b25077.dat", pfx, ["B25077_E001"]),
            "edu": _read_acs_table_filtered(d / "c15003.dat", pfx, ["C15003_E001", "C15003_E015", "C15003_E016", "C15003_E017", "C15003_E018"]),
            "occ": _read_acs_table_filtered(d / "c24010.dat", pfx, occ_cols),
            "ind": _read_acs_table_filtered(d / "c24030.dat", pfx, ind_cols),
        }

    mdata = load_for_prefix(cbsa_pfx)
    sdata = load_for_prefix("0400000US")
    usdata = load_for_prefix("0100000")  # key = "US"

    def _unemp(lab_r: dict[str, float | None]) -> float | None:
        clf = lab_r.get("B23025_E003")
        un = lab_r.get("B23025_E005")
        if clf and clf > 0 and un is not None:
            return round(un / clf, 4)
        return None

    us_wf = _parse_c24010_workforce(usdata["occ"].get("US", {}))
    us_emp, us_jobs, us_yields_w, _ = _parse_c24030_jobs(usdata["ind"].get("US", {}))
    us_edu_r = usdata["edu"].get("US", {})
    us_bdeg = None
    if us_edu_r.get("C15003_E001"):
        b_sum = sum(us_edu_r.get(f"C15003_E0{k}") or 0.0 for k in (15, 16, 17, 18))
        us_bdeg = b_sum / us_edu_r["C15003_E001"]
    us_inc = usdata["inc"].get("US", {}).get("B19013_E001")
    us_rent = usdata["rent"].get("US", {}).get("B25064_E001")
    us_home = usdata["home"].get("US", {}).get("B25077_E001")

    us_bench = {
        "pop": usdata["pop"].get("US", {}).get("B01003_E001"),
        "employed": us_emp,
        "unemployment": _unemp(usdata["lab"].get("US", {})),
        "median_income": us_inc,
        "median_rent": us_rent,
        "home_value": us_home,
        "rent_burden": round((us_rent * 12.0) / us_inc, 4) if (us_rent and us_inc and us_inc > 0) else None,
        "bachelors_pct": us_bdeg,
        "workforce": us_wf,
        "jobs": us_jobs,
        "yields_workers": us_yields_w,
    }

    states_acs1: dict[str, dict] = {}
    for sf, prow in sdata["pop"].items():
        if sf not in STATE_FIPS_TO_ABBR:
            continue
        pop = prow.get("B01003_E001")
        inc = sdata["inc"].get(sf, {}).get("B19013_E001")
        rent = sdata["rent"].get(sf, {}).get("B25064_E001")
        home = sdata["home"].get(sf, {}).get("B25077_E001")
        emp, jobs, yields_w, _ = _parse_c24030_jobs(sdata["ind"].get(sf, {}))
        edu_r = sdata["edu"].get(sf, {})
        edu_pct = (sum(edu_r.get(f"C15003_E0{k}") or 0.0 for k in (15, 16, 17, 18)) / edu_r["C15003_E001"]) if edu_r.get("C15003_E001") else None
        states_acs1[sf] = {
            "pop": int(round(pop)) if pop else None,
            "employed": emp,
            "unemployment": _unemp(sdata["lab"].get(sf, {})),
            "median_income": inc,
            "median_rent": rent,
            "median_home": home,
            "rent_burden": round((rent * 12.0) / inc, 4) if (rent and inc and inc > 0) else None,
            "bachelors_pct": round(edu_pct, 4) if edu_pct is not None else None,
            "jobs": jobs,
            "yields_workers": yields_w,
        }

    metros: dict[str, dict] = {}
    for code, prow in mdata["pop"].items():
        pop = prow.get("B01003_E001")
        if not pop or pop <= 0:
            continue
        name = geo_names.get(code, "")
        if ", PR" in name:
            continue
        fb_r = mdata["fb"].get(code, {})
        fb_pct = (fb_r.get("B05002_E013") / fb_r["B05002_E001"]) if (fb_r.get("B05002_E013") is not None and fb_r.get("B05002_E001")) else None
        in_state_pct = (fb_r.get("B05002_E003") / fb_r["B05002_E001"]) if (fb_r.get("B05002_E003") is not None and fb_r.get("B05002_E001")) else None
        edu_r = mdata["edu"].get(code, {})
        edu_pct = None
        grad_pct = None
        if edu_r.get("C15003_E001") and edu_r["C15003_E001"] > 0:
            edu_pct = sum(edu_r.get(f"C15003_E0{k}") or 0.0 for k in (15, 16, 17, 18)) / edu_r["C15003_E001"]
            grad_pct = sum(edu_r.get(f"C15003_E0{k}") or 0.0 for k in (16, 17, 18)) / edu_r["C15003_E001"]
        ag_r = mdata["age_grp"].get(code, {})
        ag_tot = ag_r.get("B01001_E001") or 0.0
        cz_child = round(sum(ag_r.get(f"B01001_E{k:03d}") or 0.0 for k in (3,4,5,6,27,28,29,30)) / ag_tot, 4) if ag_tot > 0 else None
        cz_young = round(sum(ag_r.get(f"B01001_E{k:03d}") or 0.0 for k in (7,8,9,10,11,12,31,32,33,34,35,36)) / ag_tot, 4) if ag_tot > 0 else None
        cz_elder = round(sum(ag_r.get(f"B01001_E{k:03d}") or 0.0 for k in (20,21,22,23,24,25,44,45,46,47,48,49)) / ag_tot, 4) if ag_tot > 0 else None
        cm_r = mdata["comm"].get(code, {})
        cm_tot = cm_r.get("C08301_E001") or 0.0
        cz_drove = round((cm_r.get("C08301_E003") or 0.0) / cm_tot, 4) if cm_tot > 0 else None
        cz_transit = round((cm_r.get("C08301_E008") or 0.0) / cm_tot, 4) if cm_tot > 0 else None
        cz_walk = round((cm_r.get("C08301_E009") or 0.0) / cm_tot, 4) if cm_tot > 0 else None
        cz_home = round((cm_r.get("C08301_E011") or 0.0) / cm_tot, 4) if cm_tot > 0 else None

        wf = _parse_c24010_workforce(mdata["occ"].get(code, {}))
        emp, jobs, yields_w, industries = _parse_c24030_jobs(mdata["ind"].get(code, {}))
        inc = mdata["inc"].get(code, {}).get("B19013_E001")
        rent = mdata["rent"].get(code, {}).get("B25064_E001")

        metros[code] = {
            "id": code,
            "name": name,
            "pop": int(round(pop)),
            "employed": emp,
            "unemployment": _unemp(mdata["lab"].get(code, {})),
            "median_age": mdata["age"].get(code, {}).get("B01002_E001"),
            "foreign_born_pct": round(fb_pct, 4) if fb_pct is not None else None,
            "median_income": inc,
            "median_rent": rent,
            "rent_burden": round((rent * 12.0) / inc, 4) if (rent and inc and inc > 0) else None,
            "median_home": mdata["home"].get(code, {}).get("B25077_E001"),
            "bachelors_pct": round(edu_pct, 4) if edu_pct is not None else None,
            "workforce": wf,
            "jobs": jobs,
            "yields_workers": yields_w,
            "industries": industries[:8],
            "citizens_extra": {
                "cz_child": cz_child,
                "cz_young": cz_young,
                "cz_elder": cz_elder,
                "cz_drove_alone": cz_drove,
                "cz_transit": cz_transit,
                "cz_walk": cz_walk,
                "cz_home": cz_home,
                "cz_graduate": round(grad_pct, 4) if grad_pct is not None else None,
                "cz_born_in_state": round(in_state_pct, 4) if in_state_pct is not None else None,
            },
        }

    print(f"[acs_1yr] Parsed {len(metros)} CBSAs, {len(states_acs1)} states (U.S. emp={us_emp:,}, unemp={us_bench['unemployment']*100:.2f}%, sci={us_yields_w['science']:,})")
    return metros, states_acs1, us_bench


def load_pep_population(raw_dir: Path) -> tuple[dict[str, dict], dict[str, dict], dict[str, dict], float]:
    """Load Census PEP Vintage 2025 growth (2021-2025 July-1 estimates) & migration for states, CBSAs, counties, and U.S."""
    d = raw_dir / "pep"
    states_pep: dict[str, dict] = {}
    us_growth = 0.0292
    with (d / "NST-EST2025-ALLDATA.csv").open("r", encoding="latin1") as f:
        for row in csv.DictReader(f):
            sf = row.get("STATE", "").zfill(2)
            p21 = float(row.get("POPESTIMATE2021") or 0)
            p25 = float(row.get("POPESTIMATE2025") or 0)
            if sf == "00" and (row.get("NAME") or "").strip().lower() == "united states" and p21 > 0:
                us_growth = round((p25 - p21) / p21, 4)
            elif sf in STATE_FIPS_TO_ABBR:
                states_pep[sf] = {
                    "pop_2025": int(round(p25)),
                    "pop_growth_pct": round((p25 - p21) / p21, 4) if p21 > 0 else None,
                    "nat_change": int(round(sum(float(row.get(f"NATURALCHG{y}") or 0) for y in range(2021, 2026)))),
                    "dom_mig": int(round(sum(float(row.get(f"DOMESTICMIG{y}") or 0) for y in range(2021, 2026)))),
                    "intl_mig": int(round(sum(float(row.get(f"INTERNATIONALMIG{y}") or 0) for y in range(2021, 2026)))),
                }

    cbsa_pep: dict[str, dict] = {}
    with (d / "cbsa-est2025-alldata.csv").open("r", encoding="latin1") as f:
        for row in csv.DictReader(f):
            if row.get("STCOU", "").strip() != "" or row.get("MDIV", "").strip() != "":
                continue
            code = row.get("CBSA", "").strip().zfill(5)
            p21 = float(row.get("POPESTIMATE2021") or 0)
            p25 = float(row.get("POPESTIMATE2025") or 0)
            if p21 > 0 and p25 > 0:
                cbsa_pep[code] = {
                    "pop_2025": int(round(p25)),
                    "pop_growth_pct": round((p25 - p21) / p21, 4),
                    "nat_change": int(round(sum(float(row.get(f"NATURALCHG{y}") or 0) for y in range(2021, 2026)))),
                    "dom_mig": int(round(sum(float(row.get(f"DOMESTICMIG{y}") or 0) for y in range(2021, 2026)))),
                    "intl_mig": int(round(sum(float(row.get(f"INTERNATIONALMIG{y}") or 0) for y in range(2021, 2026)))),
                }

    county_pep: dict[str, dict] = {}
    co_file = d / "co-est2025-alldata.csv"
    if co_file.exists():
        with co_file.open("r", encoding="latin1") as f:
            for row in csv.DictReader(f):
                if row.get("SUMLEV") != "050":
                    continue
                fips = row.get("STATE", "").zfill(2) + row.get("COUNTY", "").zfill(3)
                p21 = float(row.get("POPESTIMATE2021") or 0)
                p25 = float(row.get("POPESTIMATE2025") or 0)
                if p21 > 0:
                    county_pep[fips] = {
                        "pop_2025": int(round(p25)),
                        "pop_growth_pct": round((p25 - p21) / p21, 4),
                        "net_mig": int(round(sum(float(row.get(f"NETMIG{y}") or 0) for y in range(2021, 2026)))),
                    }

    print(f"[pep] Loaded 2021-2025 growth: U.S.={us_growth*100:+.2f}%, {len(states_pep)} states, {len(cbsa_pep)} CBSAs, {len(county_pep)} counties")
    return states_pep, cbsa_pep, county_pep, us_growth


BEA_SECTOR_LINES: dict[int, tuple[str, str]] = {
    3: ("agriculture", "农林渔牧"),
    6: ("mining", "采矿与油气"),
    10: ("utilities", "公用事业"),
    11: ("construction", "建筑业"),
    12: ("manufacturing", "制造业"),
    34: ("wholesale", "批发贸易"),
    35: ("retail", "零售贸易"),
    36: ("transportation", "交通与仓储"),
    45: ("information", "信息与软件"),
    51: ("finance", "金融与保险"),
    56: ("real_estate", "房地产与租赁"),
    60: ("professional", "专业与科研服务"),
    64: ("management", "企业总部管理"),
    65: ("admin", "行政与支持服务"),
    69: ("education", "教育服务"),
    70: ("health", "医疗与社会救助"),
    76: ("arts", "文化艺术娱乐"),
    79: ("accommodation", "住宿与餐饮"),
    82: ("other", "其他服务业"),
    83: ("government", "政府与公共部门"),
}


# Exact 23 BEA Virginia combined county + independent city statistical areas (CAGDP2 51901–51958)
BEA_VA_COMBINED: dict[str, list[str]] = {
    "51901": ["51003", "51540"],
    "51903": ["51005", "51580"],
    "51907": ["51015", "51790", "51820"],
    "51911": ["51031", "51680"],
    "51913": ["51035", "51640"],
    "51918": ["51053", "51570", "51730"],
    "51919": ["51059", "51600", "51610"],
    "51921": ["51069", "51840"],
    "51923": ["51081", "51595"],
    "51929": ["51089", "51690"],
    "51931": ["51095", "51830"],
    "51933": ["51121", "51750"],
    "51939": ["51143", "51590"],
    "51941": ["51149", "51670"],
    "51942": ["51153", "51683", "51685"],
    "51944": ["51161", "51775"],
    "51945": ["51163", "51530", "51678"],
    "51947": ["51165", "51660"],
    "51949": ["51175", "51620"],
    "51951": ["51177", "51630"],
    "51953": ["51191", "51520"],
    "51955": ["51195", "51720"],
    "51958": ["51199", "51735"],
}


def load_bea_gdp(raw_dir: Path, acs5: dict[str, dict] | None = None) -> tuple[dict[str, float], dict[str, dict], float, dict[str, float]]:
    """Load BEA CAGDP2 (2024): county GDP ($M) incl. Virginia 519xx population-split areas, state GDP + 20 sectors, US total + 20 sectors."""
    county_gdp_musd: dict[str, float] = {}
    va_combined_musd: dict[str, float] = {}
    state_gdp: dict[str, dict] = {}
    us_gdp_musd = 0.0
    us_sectors_musd: dict[str, float] = {}

    with zipfile.ZipFile(raw_dir / "bea_gdp/CAGDP2.zip") as z:
        fname = next(n for n in z.namelist() if "ALL_AREAS" in n and n.endswith(".csv"))
        txt = io.TextIOWrapper(z.open(fname), encoding="latin1")
        for row in csv.DictReader(txt):
            gfips = row["GeoFIPS"].strip().strip('"')
            lc_str = (row.get("LineCode") or "").strip()
            if not lc_str.isdigit():
                continue
            lc = int(lc_str)
            val_str = (row.get("2024") or "").strip()
            if not val_str or val_str in ("(D)", "(NA)", "(L)"):
                continue
            try:
                musd = float(val_str) / 1000.0
            except ValueError:
                continue

            if gfips == "00000":
                if lc == 1:
                    us_gdp_musd = musd
                elif lc in BEA_SECTOR_LINES:
                    us_sectors_musd[BEA_SECTOR_LINES[lc][0]] = round(musd, 1)
            elif len(gfips) == 5 and gfips.endswith("000") and gfips[:2] in STATE_FIPS_TO_ABBR:
                sf = gfips[:2]
                st_rec = state_gdp.setdefault(sf, {"gdp_musd": 0.0, "sectors": {}})
                if lc == 1:
                    st_rec["gdp_musd"] = musd
                elif lc in BEA_SECTOR_LINES:
                    st_rec["sectors"][BEA_SECTOR_LINES[lc][0]] = round(musd, 1)
            elif len(gfips) == 5 and not gfips.endswith("000") and gfips[:2] in STATE_FIPS_TO_ABBR:
                if lc == 1:
                    if gfips in BEA_VA_COMBINED:
                        va_combined_musd[gfips] = musd
                    else:
                        county_gdp_musd[gfips] = musd

    # Distribute BEA Virginia combined county+city areas across member Census FIPS by population (sum stays 100% exact inside a CBSA!)
    for bfips, tot_m in va_combined_musd.items():
        members = BEA_VA_COMBINED[bfips]
        pops = [(m, max(1.0, float((acs5 or {}).get(m, {}).get("pop") or 1.0))) for m in members]
        ptot = sum(p for _, p in pops) or 1.0
        for m, p in pops:
            county_gdp_musd[m] = tot_m * (p / ptot)

    print(f"[bea_gdp] Loaded US GDP=${us_gdp_musd/1e6:.2f}T ({len(us_sectors_musd)} industries), {len(state_gdp)} states, {len(county_gdp_musd)} counties (incl. {len(va_combined_musd)} VA combined areas)")
    return county_gdp_musd, state_gdp, us_gdp_musd, us_sectors_musd


def load_bls_qcew(raw_dir: Path) -> tuple[dict[str, dict], dict[str, dict[str, dict]]]:
    """Load BLS QCEW 2025 annual averages: total county employment/wages + industry jobs per county/CBSA."""
    d = raw_dir / "bls_qcew"
    county_total: dict[str, dict] = {}
    # industry_by_county[fips][naics] = (jobs, avg_annual_wage)
    ind_by_county: dict[str, dict[str, tuple[int, float]]] = {}
    us_ind_jobs: dict[str, int] = {}

    for csv_path in sorted(d.glob("*.csv")):
        code = csv_path.stem
        # Pick own_code=0 (Total Covered) for government/all-industry/universities, own_code=5 (Private) for private industries
        prefer_own = "0" if code in ("10", "6113", "622", "921", "922", "928110", "22", "2211") else "5"
        with csv_path.open("r", encoding="utf-8", errors="ignore") as f:
            reader = csv.DictReader(f)
            for row in reader:
                af = row["area_fips"].strip('"')
                own = row["own_code"].strip('"')
                if own != prefer_own:
                    continue
                if row.get("disclosure_code", "").strip('"') == "N":
                    continue
                try:
                    emp = int(float(row["annual_avg_emplvl"] or 0))
                    wage = float(row["avg_annual_pay"] or 0)
                except ValueError:
                    continue
                if af == "US000":
                    us_ind_jobs[code] = emp
                elif len(af) == 5 and af.isdigit() and not af.endswith("000") and not af.endswith("999"):
                    if af[:2] not in STATE_FIPS_TO_ABBR:
                        continue
                    if code == "10":
                        county_total[af] = {"jobs": emp, "avg_wage": wage}
                    elif emp > 0:
                        ind_by_county.setdefault(af, {})[code] = (emp, wage)

    print(f"[bls_qcew] Parsed {len(county_total)} county totals and {len(us_ind_jobs)} NAICS national benchmarks")
    return county_total, {"by_county": ind_by_county, "us_jobs": us_ind_jobs}


def load_cdc_places(raw_dir: Path) -> dict[str, dict]:
    """Compute CDC PLACES Wellbeing/Amenities index + raw mhlth & loneliness shares per county. Never imputed!"""
    path = raw_dir / "cdc_places/places_county_gis.csv"
    cols = ["mhlth_adjprev", "depression_adjprev", "ghlth_adjprev", "lpa_adjprev"]
    records: list[tuple[str, list[float], float | None]] = []
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for row in csv.DictReader(f):
            fips = (row.get("countyfips") or "").strip().zfill(5)
            if len(fips) != 5 or fips[:2] not in STATE_FIPS_TO_ABBR:
                continue
            vals = []
            ok = True
            for c in cols:
                s = (row.get(c) or "").strip()
                if not s:
                    ok = False
                    break
                try:
                    vals.append(float(s))
                except ValueError:
                    ok = False
                    break
            lone_s = (row.get("loneliness_adjprev") or "").strip()
            lone = None
            if lone_s:
                try:
                    lone = round(float(lone_s) / 100.0, 4)
                except ValueError:
                    lone = None
            if ok:
                records.append((fips, vals, lone))

    # Compute Z-score mean & std over CONUS counties (excluding AK 02 / HI 15) so L48 Amenities index matches exact CONUS benchmark
    conus_rows = [r[1] for r in records if r[0][:2] not in ("02", "15")]
    ref_mat = np.array(conus_rows if conus_rows else [r[1] for r in records], dtype=np.float64)
    mat = np.array([r[1] for r in records], dtype=np.float64)
    means = ref_mat.mean(axis=0)
    stds = ref_mat.std(axis=0)
    z = (mat - means) / np.where(stds > 0, stds, 1.0)
    idx = 100.0 - 10.0 * z.mean(axis=1)
    out = {
        records[i][0]: {
            "amenities": round(float(idx[i]), 1),
            "mhlth": round(float(records[i][1][0]) / 100.0, 4),
            "loneliness": records[i][2],
        }
        for i in range(len(records))
    }
    print(f"[cdc_places] Computed Wellbeing/Amenities + mhlth/loneliness for {len(out)} counties")
    return out


RELIGION_TRADITIONS = [
    (1, "evangelical", "福音派新教", "#C96A4B", "EVANADH_2020"),
    (2, "catholic", "天主教", "#3D73A8", "CATHADH_2020"),
    (3, "mainline", "主流新教", "#C9A145", "MPRTADH_2020"),
    (4, "black_prot", "非裔新教", "#8F5991", "BPRTADH_2020"),
    (5, "lds", "后期圣徒教会", "#4E947C", "LDSADH_2020"),
    (6, "orthodox", "东正教", "#5B6FA8", "ORTHADH_2020"),
    (7, "other", "其他宗教传统", "#8A8175", "OTHADH_2020"),
]


def load_usrc_2020(raw_dir: Path) -> dict[str, dict]:
    """Parse 2020 U.S. Religion Census RCMSCY20.xlsx via fast XML reader (avoids openpyxl synchVertical quirk)."""
    path = raw_dir / "usrc_2020/RCMSCY20.xlsx"
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    need_cols = {"FIPS", "POP2020", "TOTADH_2020"} | {t[4] for t in RELIGION_TRADITIONS}

    def col_letters_to_idx(ref: str) -> int:
        letters = "".join(ch for ch in ref if ch.isalpha())
        idx = 0
        for ch in letters:
            idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
        return idx - 1

    with zipfile.ZipFile(path) as z:
        ss_xml = ET.fromstring(z.read("xl/sharedStrings.xml"))
        strings = ["".join(t.text or "" for t in si.findall(".//s:t", ns)) for si in ss_xml.findall("s:si", ns)]

        out: dict[str, dict] = {}
        col_map: dict[int, str] = {}
        with z.open("xl/worksheets/sheet1.xml") as sf:
            for event, elem in ET.iterparse(sf, events=("end",)):
                if elem.tag != f"{{{ns['s']}}}row":
                    continue
                rnum = int(elem.attrib.get("r", "0"))
                if rnum == 1:
                    for c in elem.findall("s:c", ns):
                        ci = col_letters_to_idx(c.attrib["r"])
                        v = c.find("s:v", ns)
                        if v is None or v.text is None:
                            continue
                        name = strings[int(v.text)] if c.attrib.get("t") == "s" else v.text
                        if name in need_cols:
                            col_map[ci] = name
                else:
                    rec: dict[str, str] = {}
                    for c in elem.findall("s:c", ns):
                        ci = col_letters_to_idx(c.attrib["r"])
                        if ci not in col_map:
                            continue
                        v = c.find("s:v", ns)
                        if v is None or v.text is None:
                            continue
                        rec[col_map[ci]] = strings[int(v.text)] if c.attrib.get("t") == "s" else v.text
                    raw_fips = rec.get("FIPS", "").strip()
                    if raw_fips:
                        try:
                            fips = str(int(float(raw_fips))).zfill(5)
                        except ValueError:
                            fips = raw_fips.zfill(5)
                        if len(fips) == 5 and fips[:2] in STATE_FIPS_TO_ABBR:
                            pop = float(rec.get("POP2020") or 0)
                            tot_adh = float(rec.get("TOTADH_2020") or 0)
                            # Subtract LDS from OTHADH if OTHADH includes LDS (in ARDA RCMSCY20, OTHADH includes LDS)
                            lds = float(rec.get("LDSADH_2020") or 0)
                            oth_raw = float(rec.get("OTHADH_2020") or 0)
                            oth = max(0.0, oth_raw - lds)
                            counts = {
                                1: float(rec.get("EVANADH_2020") or 0),
                                2: float(rec.get("CATHADH_2020") or 0),
                                3: float(rec.get("MPRTADH_2020") or 0),
                                4: float(rec.get("BPRTADH_2020") or 0),
                                5: lds,
                                6: float(rec.get("ORTHADH_2020") or 0),
                                7: oth,
                            }
                            out[fips] = {
                                "pop2020": pop,
                                "adherents": tot_adh,
                                "faith_rate": round((tot_adh / pop) * 100.0, 1) if (pop > 0 and tot_adh > 0) else None,
                                "traditions": counts,
                            }
                elem.clear()

    print(f"[usrc_2020] Parsed 2020 U.S. Religion Census for {len(out)} counties")
    return out


FEMA_TYPE_DEFS = [
    ("hurricane", "飓风与热带风暴", {"Hurricane", "Tropical Storm", "Tropical Depression", "Typhoon"}),
    ("flood", "洪水与滑坡", {"Flood", "Dam/Levee Break", "Mud/Landslide"}),
    ("fire", "山火", {"Fire"}),
    ("severe_storm", "强风暴与龙卷风", {"Severe Storm", "Severe Storm(s)", "Tornado", "Straight-Line Winds"}),
    ("winter", "冬季风暴与冰冻", {"Winter Storm", "Snowstorm", "Severe Ice Storm", "Freezing"}),
    ("other", "其他灾害（地震/海啸等）", set()),
]


def _classify_fema_type(itype: str) -> str:
    s = (itype or "").strip()
    for tid, _, names in FEMA_TYPE_DEFS:
        if s in names:
            return tid
    return "other"


def load_fema_disasters(raw_dir: Path) -> tuple[dict[str, dict], dict[str, dict], dict]:
    """Count unique FEMA Major Disaster (DR) declarations since 2000 by 6 types for counties, states, and recent 12 months."""
    d = raw_dir / "fema"
    # Historical FIPS crosswalk (Shannon Co SD -> Oglala Lakota Co SD; Bedford City VA -> Bedford Co VA) + CT planning regions
    ct_map: dict[str, set[str]] = {
        "46113": {"46102"},
        "51515": {"51019"},
    }
    xw_path = d / "ct_crosswalk.xlsx"
    if xw_path.exists():
        wb = openpyxl.load_workbook(xw_path, read_only=True, data_only=True)
        ws = wb[wb.sheetnames[0]]
        hdr = None
        for row in ws.iter_rows(values_only=True):
            if not hdr:
                hdr = [str(x or "").upper() for x in row]
                continue
            if len(row) >= 4 and row[0] and row[1] and row[3]:
                st_c = str(row[0]).strip().zfill(2)
                old_c = str(row[1]).strip().zfill(3)
                new_c = str(row[3]).strip().zfill(3)
                if st_c == "09" and old_c.isdigit() and new_c.isdigit():
                    ct_map.setdefault(st_c + old_c, set()).add(st_c + new_c)
        wb.close()

    by_county_dr: dict[str, set[str]] = {}
    by_county_types: dict[str, dict[str, int]] = {}
    by_county_last: dict[str, str] = {}

    by_state_dr: dict[str, set[str]] = {}
    by_state_types: dict[str, dict[str, int]] = {}

    dr_meta: dict[str, dict] = {}
    max_date = ""

    for p in sorted(d.glob("page_*.csv")):
        if p.stat().st_size < 100:
            continue
        with p.open("r", encoding="utf-8", errors="ignore") as f:
            for row in csv.DictReader(f):
                dtype = (row.get("declarationType") or "DR").strip().upper()
                itype = (row.get("incidentType") or "Other").strip()
                if dtype != "DR" or itype.lower() == "biological":
                    continue
                st = (row.get("fipsStateCode") or "").strip().zfill(2)
                co = (row.get("fipsCountyCode") or "").strip().zfill(3)
                st_abbr = (row.get("state") or STATE_FIPS_TO_ABBR.get(st, "")).strip().upper()
                dr = (row.get("disasterNumber") or "").strip()
                ddate = (row.get("declarationDate") or "")[:10]
                title = (row.get("declarationTitle") or itype).strip()
                if not dr:
                    continue
                if ddate > max_date:
                    max_date = ddate
                tcat = _classify_fema_type(itype)

                # State-level unique DRs (including territories for national total, filtered by STATE_FIPS_TO_ABBR for states)
                if st_abbr:
                    s_set = by_state_dr.setdefault(st_abbr, set())
                    if dr not in s_set:
                        s_set.add(dr)
                        st_td = by_state_types.setdefault(st_abbr, {})
                        st_td[tcat] = st_td.get(tcat, 0) + 1

                dm = dr_meta.setdefault(dr, {
                    "disaster": dr, "date": ddate, "state": st_abbr, "type": tcat,
                    "incident_type": itype, "title": title, "areas": 0, "counties": set(), "statewide": False,
                })
                dm["areas"] += 1
                if co == "000":
                    dm["statewide"] = True
                    continue
                if st not in STATE_FIPS_TO_ABBR:
                    continue
                fips = st + co
                targets = ct_map.get(fips, {fips})
                for tf in targets:
                    dm["counties"].add(tf)
                    s = by_county_dr.setdefault(tf, set())
                    if dr not in s:
                        s.add(dr)
                        td = by_county_types.setdefault(tf, {})
                        td[tcat] = td.get(tcat, 0) + 1
                    if ddate > by_county_last.get(tf, ""):
                        by_county_last[tf] = ddate

    county_out = {
        fips: {
            "count": len(drs),
            "by_type": by_county_types.get(fips, {}),
            "top_type": max(by_county_types[fips].items(), key=lambda kv: kv[1])[0] if by_county_types.get(fips) else "other",
            "last_date": by_county_last.get(fips, ""),
        }
        for fips, drs in by_county_dr.items()
    }
    state_out = {
        abbr: {
            "total": len(drs),
            "by_type": by_state_types.get(abbr, {}),
        }
        for abbr, drs in by_state_dr.items()
    }
    nat_by_type: dict[str, int] = {}
    nat_total = 0
    for rec in state_out.values():
        nat_total += rec["total"]
        for k, v in rec["by_type"].items():
            nat_by_type[k] = nat_by_type.get(k, 0) + v

    # Recent ~12 months relative to max_date
    cutoff = f"{int(max_date[:4]) - 1}{max_date[4:]}" if len(max_date) == 10 else "2024-01-01"
    recent = sorted(
        [
            {
                "disaster": m["disaster"],
                "date": m["date"],
                "state": m["state"],
                "type": m["type"],
                "incident_type": m["incident_type"],
                "title": m["title"],
                "areas": m["areas"],
                "statewide": m["statewide"],
                "counties": sorted(m["counties"])[:80],
            }
            for m in dr_meta.values()
            if m["date"] >= cutoff
        ],
        key=lambda x: x["date"],
        reverse=True,
    )[:80]

    fema_summary = {
        "total": nat_total,
        "by_type": nat_by_type,
        "as_of": max_date,
        "recent": recent,
    }
    print(f"[fema] Counted {nat_total} unique DRs across {len(county_out)} counties & {len(state_out)} states/terr (recent={len(recent)} to {max_date})")
    return county_out, state_out, fema_summary


def load_noaa_billions(raw_dir: Path) -> tuple[list[dict], dict[str, dict], dict]:
    """Parse NOAA NCEI Billion-Dollar Disasters (1980-2024): annual timeline, state cost/freq, national totals & costliest."""
    d = raw_dir / "noaa_billions"
    by_year: dict[int, dict] = {}
    all_events: list[dict] = []
    tot_cost_musd = 0.0
    tot_deaths = 0
    with (d / "events.csv").open("r", encoding="utf-8", errors="ignore") as f:
        lines = [ln for ln in f if ln.strip()]
    start = next((i for i, ln in enumerate(lines) if ln.startswith("Name,")), 2)
    for row in csv.DictReader(lines[start:]):
        bdate = (row.get("Begin Date") or "").strip()
        if len(bdate) < 4 or not bdate[:4].isdigit():
            continue
        yr = int(bdate[:4])
        cost = float(row.get("CPI-Adjusted Cost") or row.get("Total CPI-Adjusted Cost (Millions of Dollars)") or 0)
        deaths = int(float(row.get("Deaths") or 0))
        etype = (row.get("Disaster") or "Weather").strip()
        name = (row.get("Name") or "Event").strip()
        tot_cost_musd += cost
        tot_deaths += deaths
        all_events.append({
            "name": name,
            "type": etype,
            "begin": f"{bdate[:4]}-{bdate[4:6]}-{bdate[6:8]}" if len(bdate) >= 8 else bdate,
            "cost_busd": round(cost / 1000.0, 2),
            "deaths": deaths,
        })
        rec = by_year.setdefault(yr, {"year": yr, "count": 0, "cost_musd": 0.0, "types": {}})
        rec["count"] += 1
        rec["cost_musd"] += cost
        rec["types"][etype] = rec["types"].get(etype, 0) + 1

    timeline = [
        {
            "year": yr,
            "count": r["count"],
            "cost_busd": round(r["cost_musd"] / 1000.0, 2),
            "top_type": max(r["types"].items(), key=lambda kv: kv[1])[0],
        }
        for yr, r in sorted(by_year.items())
    ]
    all_events.sort(key=lambda e: e["cost_busd"], reverse=True)
    noaa_national = {
        "events": len(all_events),
        "cost_busd": round(tot_cost_musd / 1000.0, 1),
        "deaths": tot_deaths,
        "years": [timeline[0]["year"], timeline[-1]["year"]] if timeline else [1980, 2024],
        "costliest": all_events[:12],
    }

    state_stats: dict[str, dict] = {}
    with (d / "state_cost.csv").open("r", encoding="utf-8", errors="ignore") as f:
        lines = [ln for ln in f if ln.strip()]
    st_start = next((i for i, ln in enumerate(lines) if ln.lower().startswith("state,")), 1)
    for row in csv.DictReader(lines[st_start:]):
        abbr = (row.get("state") or "").strip().upper()
        sf = STATE_ABBR_TO_FIPS.get(abbr)
        if not sf:
            continue
        tot_musd = sum(float(v or 0) for k, v in row.items() if k and k.lower() != "state" and str(v).replace(".", "", 1).isdigit())
        state_stats[sf] = {"cost_busd": round(tot_musd / 1000.0, 2), "events": 0}

    with (d / "state_freq.csv").open("r", encoding="utf-8", errors="ignore") as f:
        lines = [ln for ln in f if ln.strip()]
    fr_start = next((i for i, ln in enumerate(lines) if ln.lower().startswith("state,")), 1)
    for row in csv.DictReader(lines[fr_start:]):
        abbr = (row.get("state") or "").strip().upper()
        sf = STATE_ABBR_TO_FIPS.get(abbr)
        if not sf:
            continue
        cnt = sum(int(float(v or 0)) for k, v in row.items() if k and k.lower() not in ("state", "year") and str(v).replace(".", "", 1).isdigit())
        rec = state_stats.setdefault(sf, {"cost_busd": 0.0, "events": 0})
        rec["events"] += cnt

    print(f"[noaa_billions] Parsed {noaa_national['events']} events (${noaa_national['cost_busd']:.1f}B, {tot_deaths:,} deaths) across {len(timeline)} years & {len(state_stats)} states")
    return timeline, state_stats, noaa_national


def load_military_state_tables(raw_dir: Path) -> tuple[dict[str, dict], dict[str, dict], dict, dict]:
    """Parse full DMDC personnel (state + US total) & OLDCC FY2024 contracts/payroll/grants/vendors/counties."""
    def iv(row, idx: int) -> int:
        try:
            return int(round(float(row[idx] or 0)))
        except (ValueError, TypeError, IndexError):
            return 0

    def fv(row, idx: int) -> float:
        try:
            return float(row[idx] or 0)
        except (ValueError, TypeError, IndexError):
            return 0.0

    # 1. DMDC
    dmdc: dict[str, dict] = {}
    dmdc_national: dict = {}
    wb = openpyxl.load_workbook(raw_dir / "dmdc/location_2609.xlsx", read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    for row in ws.iter_rows(min_row=7, values_only=True):
        loc0 = str(row[0] or "").strip().upper()
        st_name = str(row[1] or "").strip().upper()
        if "UNITED STATES TOTAL" in loc0:
            dmdc_national = {
                "active": iv(row, 8),
                "guard_reserve": iv(row, 16),
                "civilian": iv(row, 22),
                "total": iv(row, 23),
                "active_by_branch": {
                    "Army": iv(row, 2), "Navy": iv(row, 3), "Marine Corps": iv(row, 4),
                    "Air Force": iv(row, 5), "Space Force": iv(row, 6), "Coast Guard": iv(row, 7),
                },
            }
            # Stop immediately after U.S. summary row so foreign rows (e.g., EUROPE | GEORGIA) never overwrite U.S. states!
            break
        sf = STATE_NAME_TO_FIPS.get(st_name)
        if not sf:
            continue
        dmdc[sf] = {
            "active": iv(row, 8),
            "reserve": iv(row, 16),
            "civilian": iv(row, 22),
            "total": iv(row, 23),
            "by_branch": {
                "陆军 Army": iv(row, 2),
                "海军 Navy": iv(row, 3),
                "陆战队 USMC": iv(row, 4),
                "空军 Air Force": iv(row, 5),
                "太空军 Space Force": iv(row, 6),
                "海岸警卫 USCG": iv(row, 7),
            },
        }
    wb.close()

    # 2. OLDCC FY2024 (15.All Stats + 3.Top Defense Vendors + 2.Contract Spending by Cnty)
    oldcc: dict[str, dict] = {}
    wb = openpyxl.load_workbook(raw_dir / "oldcc/spending_fy2024.xlsx", read_only=True, data_only=True)
    if "15.All Stats, FY2024" in wb.sheetnames:
        ws = wb["15.All Stats, FY2024"]
        for row in ws.iter_rows(min_row=5, values_only=True):
            st_raw = str(row[0] or "").strip().upper()
            sf = STATE_NAME_TO_FIPS.get(st_raw)
            if not sf:
                continue
            contracts = fv(row, 1)
            grants = fv(row, 3)
            payroll = fv(row, 8)
            total = fv(row, 10)
            pct_gdp = fv(row, 12)
            per_res = fv(row, 15)
            oldcc[sf] = {
                "contracts_musd": round(contracts / 1e6, 1),
                "grants_musd": round(grants / 1e6, 1),
                "payroll_musd": round(payroll / 1e6, 1),
                "spending_musd": round(total / 1e6, 1),
                "pct_gdp": round(pct_gdp, 4),
                "per_resident": round(per_res),
                "top_vendors": [],
                "top_counties": [],
            }
    if "3.Top Defense Vendors" in wb.sheetnames:
        ws = wb["3.Top Defense Vendors"]
        for row in ws.iter_rows(min_row=5, values_only=True):
            sf = STATE_NAME_TO_FIPS.get(str(row[0] or "").strip().upper())
            if sf and sf in oldcc and row[1] and len(oldcc[sf]["top_vendors"]) < 5:
                oldcc[sf]["top_vendors"].append({
                    "name": str(row[1]).strip(),
                    "contracts_musd": round(fv(row, 2) / 1e6, 1),
                })
    if "2.Contract Spending by Cnty" in wb.sheetnames:
        ws = wb["2.Contract Spending by Cnty"]
        for row in ws.iter_rows(min_row=5, values_only=True):
            sf = STATE_NAME_TO_FIPS.get(str(row[0] or "").strip().upper())
            if sf and sf in oldcc and row[1] and len(oldcc[sf]["top_counties"]) < 6:
                oldcc[sf]["top_counties"].append({
                    "name": str(row[1]).strip(),
                    "contracts_musd": round(fv(row, 2) / 1e6, 1),
                })
    wb.close()

    tot_spend = sum(v["spending_musd"] for v in oldcc.values())
    tot_con = sum(v["contracts_musd"] for v in oldcc.values())
    tot_pay = sum(v["payroll_musd"] for v in oldcc.values())
    tot_gr = sum(v["grants_musd"] for v in oldcc.values())
    oldcc_national = {
        "total_musd": round(tot_spend, 1),
        "contracts_musd": round(tot_con, 1),
        "payroll_musd": round(tot_pay, 1),
        "grants_musd": round(tot_gr, 1),
    }

    print(f"[military_tables] DMDC={len(dmdc)} states (US active={dmdc_national.get('active',0):,}), OLDCC={len(oldcc)} states (US=${tot_spend/1e3:.1f}B)")
    return dmdc, oldcc, dmdc_national, oldcc_national
