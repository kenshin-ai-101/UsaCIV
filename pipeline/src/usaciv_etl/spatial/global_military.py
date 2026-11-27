"""Global U.S. Overseas Military Bases & Personnel ETL builder (Forensic-Audited V2).

Combines three real public datasets into `web/public/data/global_military.json`:
1. DoD FY2024 Base Structure Report (geocoded via The US Base Project): verified overseas &
   U.S. territory installations with audited coordinates, branch, PRV ($M), acres, owned/leased
   buildings, and sq ft.
2. DoD DMDC Location Country Report (Sep 2026): strictly separates permanent military base hosts
   and deployed military missions from State Department Embassy Security / Defense Attaché staff
   (eliminating misleading markers on non-garrison nations such as China, Russia, India, Brazil).
3. Natural Earth 1:50m Admin-0 Countries & Major Lakes: crisp high-detail world chart vectors,
   official DoD Unified Command Plan (UCP) Combatant Commands, U.S. Navy Numbered Fleets,
   strategic maritime chokepoints, and great-circle projection arcs.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import openpyxl
from shapely.geometry import Point, shape

PIPELINE_ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = PIPELINE_ROOT / "data_raw"
WEB_DATA_DIR = PIPELINE_ROOT.parent / "web/public/data"

US51_LOWER = {
    s.lower()
    for s in [
        "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
        "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
        "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
        "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
        "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
        "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
        "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
        "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
        "Washington", "West Virginia", "Wisconsin", "Wyoming",
    ]
}

# Verified coordinate corrections for geocoding typos discovered by spatial point-in-polygon audit
# Format: (country_raw_lower, site_lower) -> (lat, lon, override_country_raw | None, approx_flag, audit_note)
BSR_COORD_FIXES: dict[tuple[str, str], tuple[float, float, str | None, bool, str]] = {
    # Swapped lat/lon in source spreadsheet (47.42, 29.70 landed in Ukraine!)
    ("kuwait", "camp buehring"): (29.6990, 47.4202, None, False, "Corrected swapped lat/lon from source table"),
    # Mis-geocoded to Andersen AFB Guam (13.56, 144.92) instead of Iwo Jima
    ("japan", "iwo jima-3181"): (24.7840, 141.3230, None, False, "Corrected to Iwo Jima Airfield"),
    # Mis-geocoded to Hokkaido Sea (44.31, 141.66) instead of Okinawa White Beach Naval Facility
    ("japan", "white beach"): (26.2980, 127.9120, None, False, "Corrected to White Beach Naval Facility, Okinawa"),
    # Mis-geocoded to Spain (37.75, -0.97) instead of Gyeonggi-do, South Korea
    ("korea, south", "camp morse"): (37.0680, 127.0480, None, True, "Corrected invalid Spain coordinate to Gyeonggi-do area"),
    # Missing negative longitude sign (+8.0 landed in Sardinia, Italy instead of Lajes/Azores)
    ("portugal", "caldeira ammunition storage area"): (38.7600, -27.0900, None, True, "Corrected missing west longitude to Terceira/Azores"),
    ("portugal", "villa nova globecom annex"): (38.7600, -27.0900, None, True, "Corrected missing west longitude to Terceira/Azores"),
    # Dandan is in Saipan, Northern Mariana Islands (15.134, 145.736)
    ("guam", "dandan"): (15.1341, 145.7356, "Northern Mariana Islands", False, "Located on Saipan, Northern Mariana Islands"),
}

# Sites excluded from active overseas bases layer (transparently documented in methodology):
# - Csl Agadez (Niger): U.S. formally withdrew & handed over Air Base 201 in Aug 2024
# - Kobi Sho Range 6084 & Sekibi Sho Range 6085: zero-asset ($0M, 0 bldgs) unused historic uninhabited islet range entries
BSR_EXCLUDED: set[tuple[str, str]] = {
    ("niger", "csl agadez"),
    ("japan", "kobi sho range 6084"),
    ("japan", "sekibi sho range 6085"),
}

# Non-BSR countries with documented permanent U.S. military missions/rotational commands in DMDC
# (as distinct from diplomatic Embassy Marine Security Guards / Defense Attachés)
DEPLOYED_MISSION_COUNTRIES: dict[str, tuple[str, str]] = {
    "Saudi Arabia": ("驻沙特军事训练团与苏丹王子空军基地任务", "USMTM & Prince Sultan AB air mission"),
    "Egypt": ("西奈半岛多国部队与观察员团 (MFO)", "Sinai Multinational Force & Observers (MFO)"),
    "Hungary": ("帕帕空军基地北约重型空运联队 (SAC)", "NATO Heavy Airlift Wing, Pápa AB"),
}

# Official DoD Unified Command Plan (UCP) Combatant Commands
COCOM_SPECS: list[dict[str, Any]] = [
    {
        "id": "INDOPACOM",
        "name_zh": "印太司令部",
        "name_en": "INDOPACOM",
        "hq_zh": "夏威夷·史密斯营",
        "hq_en": "Camp H.M. Smith, HI",
        "subtitle_zh": "太平洋 · 印度洋 · 东亚与大洋洲",
        "subtitle_en": "Indo-Pacific, East Asia & Oceania",
        "color": "#4FA8E8",
        "box": [66.0, -36.0, 178.0, 48.0],
        "label_lon": 146.0,
        "label_lat": 4.0,
    },
    {
        "id": "EUCOM",
        "name_zh": "欧洲司令部",
        "name_en": "EUCOM",
        "hq_zh": "德国·斯图加特",
        "hq_en": "Stuttgart, Germany",
        "subtitle_zh": "欧洲大陆 · 北大西洋与地中海",
        "subtitle_en": "Europe, North Atlantic & Mediterranean",
        "color": "#7BA85C",
        "box": [-32.0, 32.0, 45.0, 72.0],
        "label_lon": 15.0,
        "label_lat": 58.0,
    },
    {
        "id": "CENTCOM",
        "name_zh": "中央司令部",
        "name_en": "CENTCOM",
        "hq_zh": "佛罗里达·麦克迪尔 / 卡塔尔前沿",
        "hq_en": "MacDill AFB / Al Udeid Fwd",
        "subtitle_zh": "中东 · 波斯湾 · 红海与埃及/以色列",
        "subtitle_en": "Middle East, Persian Gulf, Egypt & Israel",
        "color": "#E09B42",
        "box": [25.0, 12.0, 70.0, 40.0],
        "label_lon": 56.0,
        "label_lat": 32.5,
    },
    {
        "id": "AFRICOM",
        "name_zh": "非洲司令部",
        "name_en": "AFRICOM",
        "hq_zh": "德国·斯图加特 / 吉布提前沿",
        "hq_en": "Stuttgart / Camp Lemonnier",
        "subtitle_zh": "非洲大陆（除埃及）· 非洲之角与南大西洋",
        "subtitle_en": "Africa (excl. Egypt) & South Atlantic",
        "color": "#D46A56",
        "box": [-20.0, -32.0, 52.0, 34.0],
        "label_lon": 18.0,
        "label_lat": -4.0,
    },
    {
        "id": "SOUTHCOM",
        "name_zh": "南方司令部",
        "name_en": "SOUTHCOM",
        "hq_zh": "佛罗里达·多拉",
        "hq_en": "Doral, FL",
        "subtitle_zh": "中南美洲 · 关塔那摩与加勒比海",
        "subtitle_en": "Latin America & Caribbean Basin",
        "color": "#C47BB8",
        "box": [-98.0, -45.0, -34.0, 24.0],
        "label_lon": -62.0,
        "label_lat": -14.0,
    },
    {
        "id": "NORTHCOM",
        "name_zh": "北方司令部",
        "name_en": "NORTHCOM",
        "hq_zh": "科罗拉多·彼得森基地",
        "hq_en": "Peterson SFB, CO",
        "subtitle_zh": "北美 · 格陵兰北极 · 巴哈马与波多黎各",
        "subtitle_en": "North America, Greenland Arctic & U.S. Caribbean",
        "color": "#7C9BB8",
        "box": [-138.0, 15.0, -45.0, 78.0],
        "label_lon": -96.0,
        "label_lat": 58.0,
    },
]

# Official U.S. Navy Numbered Fleets (real HQ & ocean AOR markers)
NAVY_FLEETS: list[dict[str, Any]] = [
    {"id": "2nd", "name_en": "U.S. 2ND FLEET", "name_zh": "美海军第二舰队", "hq_en": "Norfolk, VA · N. Atlantic & Arctic", "hq_zh": "诺福克 · 北大西洋与北极", "cocom": "NORTHCOM", "lon": -52.0, "lat": 37.5},
    {"id": "3rd", "name_en": "U.S. 3RD FLEET", "name_zh": "美海军第三舰队", "hq_en": "San Diego, CA · E. & Central Pacific", "hq_zh": "圣迭戈 · 东/中太平洋", "cocom": "INDOPACOM", "lon": -144.0, "lat": 26.0},
    {"id": "4th", "name_en": "U.S. 4TH FLEET", "name_zh": "美海军第四舰队", "hq_en": "Mayport, FL · Caribbean & S. America", "hq_zh": "梅波特 · 加勒比与南美两洋", "cocom": "SOUTHCOM", "lon": -38.0, "lat": -16.0},
    {"id": "5th", "name_en": "U.S. 5TH FLEET", "name_zh": "美海军第五舰队", "hq_en": "Manama, Bahrain · Gulf & Arabian Sea", "hq_zh": "巴林 · 波斯湾/红海/阿拉伯海", "cocom": "CENTCOM", "lon": 60.5, "lat": 15.5},
    {"id": "6th", "name_en": "U.S. 6TH FLEET", "name_zh": "美海军第六舰队", "hq_en": "Naples, Italy · Mediterranean & E. Atlantic", "hq_zh": "那不勒斯 · 地中海与东大西洋", "cocom": "EUCOM", "lon": -16.5, "lat": 33.5},
    {"id": "7th", "name_en": "U.S. 7TH FLEET", "name_zh": "美海军第七舰队", "hq_en": "Yokosuka, Japan · W. Pacific & Indian Ocean", "hq_zh": "横须贺 · 西太平洋与印度洋", "cocom": "INDOPACOM", "lon": 146.5, "lat": 24.5},
]

# Global Strategic Maritime Chokepoints
CHOKEPOINTS: list[dict[str, Any]] = [
    {"id": "giuk", "name_en": "GIUK Gap", "name_zh": "GIUK 缺口", "lon": -24.0, "lat": 62.5},
    {"id": "gibraltar", "name_en": "Strait of Gibraltar", "name_zh": "直布罗陀海峡", "lon": -5.6, "lat": 35.95},
    {"id": "suez", "name_en": "Suez Canal", "name_zh": "苏伊士运河", "lon": 32.35, "lat": 30.5},
    {"id": "bab_el_mandeb", "name_en": "Bab el-Mandeb", "name_zh": "曼德海峡", "lon": 43.35, "lat": 12.6},
    {"id": "hormuz", "name_en": "Strait of Hormuz", "name_zh": "霍尔木兹海峡", "lon": 56.3, "lat": 26.55},
    {"id": "malacca", "name_en": "Strait of Malacca", "name_zh": "马六甲海峡", "lon": 101.2, "lat": 2.4},
    {"id": "panama", "name_en": "Panama Canal", "name_zh": "巴拿马运河", "lon": -79.7, "lat": 9.1},
    {"id": "miyako", "name_en": "First Island Chain", "name_zh": "宫古/巴士海峡", "lon": 124.8, "lat": 23.0},
]

# Country -> (canonical_name, cocom [official UCP], region, optional fallback (lat, lon))
COUNTRY_OVERRIDES: dict[str, tuple[str, str, str, tuple[float, float] | None]] = {
    "japan": ("Japan", "INDOPACOM", "Pacific Ocean", (36.2, 138.2)),
    "korea, south": ("South Korea", "INDOPACOM", "Pacific Ocean", (36.5, 127.8)),
    "south korea": ("South Korea", "INDOPACOM", "Pacific Ocean", (36.5, 127.8)),
    "guam": ("Guam", "INDOPACOM", "Pacific Ocean", (13.44, 144.79)),
    "diego garcia": ("Diego Garcia (BIOT)", "INDOPACOM", "Indian Ocean", (-7.31, 72.41)),
    "british indian ocean territory": ("Diego Garcia (BIOT)", "INDOPACOM", "Indian Ocean", (-7.31, 72.41)),
    "marshall islands": ("Marshall Islands", "INDOPACOM", "Pacific Ocean", (8.72, 167.73)),
    "northern mariana islands": ("Northern Mariana Islands", "INDOPACOM", "Pacific Ocean", (15.18, 145.75)),
    "american samoa": ("American Samoa", "INDOPACOM", "Pacific Ocean", (-14.31, -170.70)),
    "wake island": ("Wake Island", "INDOPACOM", "Pacific Ocean", (19.28, 166.65)),
    "johnston atoll": ("Johnston Atoll", "INDOPACOM", "Pacific Ocean", (16.73, -169.53)),
    "australia": ("Australia", "INDOPACOM", "Pacific & Indian Oceans", (-25.27, 133.77)),
    "singapore": ("Singapore", "INDOPACOM", "Indian & Pacific Gateway", (1.35, 103.82)),
    "germany": ("Germany", "EUCOM", "Europe", (51.16, 10.45)),
    "italy": ("Italy", "EUCOM", "Mediterranean / Europe", (41.87, 12.57)),
    "united kingdom": ("United Kingdom", "EUCOM", "Atlantic / Europe", (54.0, -2.5)),
    "spain": ("Spain", "EUCOM", "Atlantic / Mediterranean", (40.46, -3.75)),
    "turkey": ("Turkey", "EUCOM", "Eastern Mediterranean", (38.96, 35.24)),
    "belgium": ("Belgium", "EUCOM", "Europe", (50.50, 4.47)),
    "netherlands": ("Netherlands", "EUCOM", "Europe", (52.13, 5.29)),
    "poland": ("Poland", "EUCOM", "Europe", (51.92, 19.15)),
    "greece": ("Greece", "EUCOM", "Mediterranean", (39.07, 21.82)),
    "romania": ("Romania", "EUCOM", "Black Sea / Europe", (45.94, 24.97)),
    "bulgaria": ("Bulgaria", "EUCOM", "Black Sea / Europe", (42.73, 25.49)),
    "hungary": ("Hungary", "EUCOM", "Europe", (47.36, 17.50)),
    "portugal": ("Portugal (incl. Azores)", "EUCOM", "Atlantic Ocean", (38.76, -27.09)),
    "norway": ("Norway", "EUCOM", "Arctic / North Atlantic", (60.47, 8.47)),
    "iceland": ("Iceland", "EUCOM", "North Atlantic", (64.96, -19.02)),
    "cyprus": ("Cyprus", "EUCOM", "Eastern Mediterranean", (35.13, 33.43)),
    # Official UCP: Greenland transferred to USNORTHCOM
    "greenland": ("Greenland", "NORTHCOM", "Arctic Ocean", (76.53, -68.71)),
    "israel": ("Israel", "CENTCOM", "Eastern Mediterranean", (31.05, 34.85)),
    "bahrain": ("Bahrain", "CENTCOM", "Persian Gulf", (26.07, 50.55)),
    "kuwait": ("Kuwait", "CENTCOM", "Persian Gulf", (29.31, 47.48)),
    "qatar": ("Qatar", "CENTCOM", "Persian Gulf", (25.35, 51.18)),
    "united arab emirates": ("United Arab Emirates", "CENTCOM", "Persian Gulf", (23.42, 53.85)),
    "saudi arabia": ("Saudi Arabia", "CENTCOM", "Middle East", (24.06, 47.58)),
    "jordan": ("Jordan", "CENTCOM", "Middle East", (30.59, 36.24)),
    "oman": ("Oman", "CENTCOM", "Arabian Sea / Indian Ocean", (21.51, 55.92)),
    "egypt": ("Egypt", "CENTCOM", "Red Sea / Suez", (28.50, 34.00)),
    "djibouti": ("Djibouti", "AFRICOM", "Horn of Africa / Red Sea", (11.55, 43.15)),
    "kenya": ("Kenya", "AFRICOM", "East Africa / Indian Ocean", (-0.02, 37.91)),
    "saint helena, ascension, and tristan da cunha": ("Ascension Island (UK)", "AFRICOM", "South Atlantic Ocean", (-7.94, -14.36)),
    "saint helena": ("Ascension Island (UK)", "AFRICOM", "South Atlantic Ocean", (-7.94, -14.36)),
    "guantanamo bay naval base": ("Cuba (Guantanamo Bay)", "SOUTHCOM", "Caribbean Sea", (19.92, -75.14)),
    "cuba": ("Cuba (Guantanamo Bay)", "SOUTHCOM", "Caribbean Sea", (19.92, -75.14)),
    "honduras": ("Honduras", "SOUTHCOM", "Central America", (14.38, -87.62)),
    "el salvador": ("El Salvador", "SOUTHCOM", "Central America", (13.44, -89.06)),
    "curacao": ("Curacao", "SOUTHCOM", "Caribbean Sea", (12.19, -68.96)),
    "peru": ("Peru", "SOUTHCOM", "South America", (-12.05, -77.04)),
    "puerto rico": ("Puerto Rico", "NORTHCOM", "Caribbean / Atlantic", (18.22, -66.59)),
    "virgin islands, u.s.": ("U.S. Virgin Islands", "NORTHCOM", "Caribbean / Atlantic", (18.34, -64.90)),
    "virgin islands": ("U.S. Virgin Islands", "NORTHCOM", "Caribbean / Atlantic", (18.34, -64.90)),
    "canada": ("Canada", "NORTHCOM", "North America / Arctic", (56.13, -106.35)),
    "bahamas, the": ("The Bahamas", "NORTHCOM", "Atlantic / Caribbean", (24.71, -77.77)),
}

FLAGSHIP_HUB_KEYWORDS = [
    "Kadena AB",
    "Andersen AFB",
    "Diego Garcia",
    "Camp Humphreys",
    "MCAS Iwakuni",
    "Thule AB",
    "Yokosuka",
    "Misawa AB",
    "NAVBASE Guam",
    "Guantanamo Bay",
    "Yokota AB",
    "Kwajalein Atoll",
    "Osan AFB",
    "Ramstein AB",
    "Al Udeid",
    "RAF Lakenheath",
    "Incirlik AB",
    "NS Rota",
    "NSA Bahrain",
    "Camp Lemonnier",
    "Ascension",
    "NAS Sigonella",
    "Aviano AB",
    "NSA Souda Bay",
    "Grindavik",
    "Lajes Field",
    "Soto Cano",
    "Darwin",
    "NAVCOMMSTA H E Holt",
    "Changi",
    "Wake Island",
    "Camp Arifjan",
    "Camp Buehring",
    "Al Dhafra",
    "Muwaffaq Salti",
    "Deveselu",
    "Redzikowo",
    "AUTEC Main Base",
    "Fort Buchanan",
    "Grafenwoehr",
    "Spangdahlem",
    "Sasebo",
    "White Beach",
]

OCEAN_LABELS = [
    {"id": "pacific_w", "name_en": "WESTERN PACIFIC", "name_zh": "西太平洋", "lon": 156.0, "lat": 14.0, "size": "lg"},
    {"id": "pacific_e", "name_en": "PACIFIC OCEAN", "name_zh": "太平洋", "lon": -132.0, "lat": -8.0, "size": "lg"},
    {"id": "atlantic_n", "name_en": "NORTH ATLANTIC", "name_zh": "北大西洋", "lon": -40.0, "lat": 30.0, "size": "lg"},
    {"id": "atlantic_s", "name_en": "SOUTH ATLANTIC", "name_zh": "南大西洋", "lon": -18.0, "lat": -26.0, "size": "md"},
    {"id": "indian", "name_en": "INDIAN OCEAN", "name_zh": "印度洋", "lon": 78.0, "lat": -20.0, "size": "lg"},
    {"id": "arctic", "name_en": "ARCTIC OCEAN", "name_zh": "北冰洋", "lon": -8.0, "lat": 75.0, "size": "md"},
    {"id": "med", "name_en": "Mediterranean Sea", "name_zh": "地中海", "lon": 18.0, "lat": 35.0, "size": "sm"},
    {"id": "gulf", "name_en": "Persian Gulf", "name_zh": "波斯湾", "lon": 51.8, "lat": 26.8, "size": "sm"},
    {"id": "caribbean", "name_en": "Caribbean Sea", "name_zh": "加勒比海", "lon": -75.0, "lat": 15.0, "size": "sm"},
    {"id": "scs", "name_en": "South China Sea", "name_zh": "南海", "lon": 114.5, "lat": 13.0, "size": "sm"},
    {"id": "arabian", "name_en": "Arabian Sea", "name_zh": "阿拉伯海", "lon": 64.0, "lat": 13.0, "size": "sm"},
]

PROJECTION_ARCS = [
    # Trans-Atlantic & Arctic
    {"id": "arc_eu_ramstein", "from_name": "Joint Base McGuire / Dover", "from_lon": -75.5, "from_lat": 39.1, "to_name": "Ramstein AB (EUCOM)", "to_lon": 7.60, "to_lat": 49.44, "cocom": "EUCOM"},
    {"id": "arc_eu_rota", "from_name": "Naval Station Norfolk", "from_lon": -76.3, "from_lat": 36.9, "to_name": "NS Rota / 6th Fleet", "to_lon": -6.34, "to_lat": 36.64, "cocom": "EUCOM"},
    {"id": "arc_eu_lakenheath", "from_name": "Joint Base McGuire / Dover", "from_lon": -75.5, "from_lat": 39.1, "to_name": "RAF Lakenheath (UK)", "to_lon": 0.56, "to_lat": 52.41, "cocom": "EUCOM"},
    {"id": "arc_arctic_pituffik", "from_name": "Peterson SFB (NORTHCOM)", "from_lon": -104.7, "from_lat": 38.8, "to_name": "Pituffik / Thule AB (Arctic)", "to_lon": -68.71, "to_lat": 76.53, "cocom": "NORTHCOM"},
    {"id": "arc_cent_udeid", "from_name": "Ramstein Air Bridge", "from_lon": 7.60, "from_lat": 49.44, "to_name": "Al Udeid / Bahrain (CENTCOM)", "to_lon": 51.32, "to_lat": 25.12, "cocom": "CENTCOM"},
    {"id": "arc_cent_kuwait", "from_name": "Incirlik / Med Corridor", "from_lon": 35.44, "from_lat": 36.99, "to_name": "Camp Arifjan & Buehring (Kuwait)", "to_lon": 47.42, "to_lat": 29.70, "cocom": "CENTCOM"},
    {"id": "arc_af_djibouti", "from_name": "NAS Sigonella (Med)", "from_lon": 14.92, "from_lat": 37.40, "to_name": "Camp Lemonnier (AFRICOM)", "to_lon": 43.15, "to_lat": 11.55, "cocom": "AFRICOM"},
    {"id": "arc_af_ascension", "from_name": "Patrick SFB, FL", "from_lon": -80.6, "from_lat": 28.2, "to_name": "Ascension Island (S. Atlantic)", "to_lon": -14.36, "to_lat": -7.94, "cocom": "AFRICOM"},
    {"id": "arc_so_gtmo", "from_name": "SOUTHCOM Miami / Key West", "from_lon": -80.2, "from_lat": 25.8, "to_name": "NS Guantanamo Bay", "to_lon": -75.14, "to_lat": 19.92, "cocom": "SOUTHCOM"},
    {"id": "arc_so_honduras", "from_name": "SOUTHCOM Miami", "from_lon": -80.2, "from_lat": 25.8, "to_name": "Soto Cano AB (Honduras)", "to_lon": -87.62, "to_lat": 14.38, "cocom": "SOUTHCOM"},
    # Trans-Pacific (Westbound across ±180° dateline)
    {"id": "arc_pac_hawaii", "from_name": "San Diego / Travis AFB", "from_lon": -117.2, "from_lat": 32.7, "to_name": "Pearl Harbor–Hickam (INDOPACOM HQ)", "to_lon": -157.95, "to_lat": 21.35, "cocom": "INDOPACOM"},
    {"id": "arc_pac_guam", "from_name": "Pearl Harbor–Hickam", "from_lon": -157.95, "from_lat": 21.35, "to_name": "Guam (Andersen & NAVBASE)", "to_lon": 144.85, "to_lat": 13.52, "cocom": "INDOPACOM"},
    {"id": "arc_pac_yokosuka", "from_name": "Pearl Harbor–Hickam", "from_lon": -157.95, "from_lat": 21.35, "to_name": "Yokosuka / Yokota (7th Fleet)", "to_lon": 139.67, "to_lat": 35.28, "cocom": "INDOPACOM"},
    {"id": "arc_pac_kadena", "from_name": "Guam Hub", "from_lon": 144.85, "from_lat": 13.52, "to_name": "Kadena AB (Okinawa)", "to_lon": 127.77, "to_lat": 26.35, "cocom": "INDOPACOM"},
    {"id": "arc_pac_humphreys", "from_name": "Yokosuka / Yokota", "from_lon": 139.67, "from_lat": 35.28, "to_name": "Camp Humphreys (South Korea)", "to_lon": 127.01, "to_lat": 36.97, "cocom": "INDOPACOM"},
    {"id": "arc_pac_darwin", "from_name": "Guam Hub", "from_lon": 144.85, "from_lat": 13.52, "to_name": "RAAF Darwin / Exmouth (Australia)", "to_lon": 130.90, "to_lat": -12.41, "cocom": "INDOPACOM"},
    {"id": "arc_io_diego", "from_name": "Singapore / Guam", "from_lon": 103.82, "from_lat": 1.35, "to_name": "NAVSUPPFAC Diego Garcia (Indian Ocean)", "to_lon": 72.41, "to_lat": -7.31, "cocom": "INDOPACOM"},
]


def _normalize_branch(comp: str) -> str:
    c = comp.lower()
    if "reserve" in c or "guard" in c:
        return "reserve_guard"
    if "marine" in c:
        return "marines"
    if "navy" in c:
        return "navy"
    if "air force" in c:
        return "air_force"
    return "army"


def _infer_cocom(country: str, continent: str, lat: float, lon: float) -> tuple[str, str]:
    ov = COUNTRY_OVERRIDES.get(country.lower())
    if ov:
        return ov[1], ov[2]
    cont = (continent or "").lower()
    if cont == "europe":
        return "EUCOM", "Europe"
    if cont == "africa":
        return "AFRICOM", "Africa"
    if cont == "south america":
        return "SOUTHCOM", "South America"
    if cont == "oceania":
        return "INDOPACOM", "Pacific Ocean"
    if cont == "north america":
        return ("SOUTHCOM", "Central America & Caribbean") if lat < 23.0 else ("NORTHCOM", "North America")
    if cont == "asia":
        return ("CENTCOM", "Middle East & Central Asia") if lon < 68.0 else ("INDOPACOM", "Indo-Pacific")
    return "INDOPACOM", "Global"


def _canonical_country(raw: str) -> str:
    key = raw.strip().lower()
    if key in COUNTRY_OVERRIDES:
        return COUNTRY_OVERRIDES[key][0]
    return raw.strip().title() if raw.isupper() else raw.strip()


def _simplify_world_land(ne_path: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """High-detail Natural Earth 1:50m world countries (crisp coastlines & strategic islands)."""
    raw = json.loads(ne_path.read_text(encoding="utf-8"))
    features_out: list[dict[str, Any]] = []
    lookup: dict[str, dict[str, Any]] = {}

    keep_small = {"Singapore", "Bahrain", "Guam", "Puerto Rico", "Malta", "Cyprus", "Luxembourg", "Kuwait", "Qatar", "Djibouti", "Hong Kong"}

    for feat in raw.get("features", []):
        props = feat.get("properties", {})
        admin = str(props.get("ADMIN") or props.get("NAME") or "").strip()
        name = str(props.get("NAME") or admin).strip()
        iso2 = str(props.get("ISO_A2") or "").strip()
        if iso2 == "-99":
            iso2 = str(props.get("ISO_A2_EH") or "").strip()
        continent = str(props.get("CONTINENT") or "").strip()
        if admin == "Antarctica" or continent == "Antarctica":
            continue

        geom = shape(feat["geometry"])
        rep = geom.representative_point()
        rep_lat, rep_lon = round(float(rep.y), 2), round(float(rep.x), 2)

        # Crisp 0.09° simplification preserves Okinawa, Guam, Cyprus, Sicily, Crete, UK, Japan, Caribbean
        simp = geom.simplify(0.09, preserve_topology=True)
        polys_raw = [simp] if simp.geom_type == "Polygon" else list(simp.geoms) if simp.geom_type == "MultiPolygon" else []
        rings: list[list[list[float]]] = []
        for poly in polys_raw:
            if poly.area < 0.012 and admin not in keep_small:
                continue
            coords = [[round(float(x), 2), round(float(y), 2)] for x, y in poly.exterior.coords if float(y) >= -58.5]
            if len(coords) >= 4:
                rings.append(coords)

        cocom, region = _infer_cocom(admin, continent, rep_lat, rep_lon)
        rec = {
            "iso2": iso2,
            "name": name,
            "admin": admin,
            "continent": continent,
            "cocom": cocom,
            "region": region,
            "lat": rep_lat,
            "lon": rep_lon,
            "is_us": admin == "United States of America",
            "polys": rings,
        }
        if rings:
            features_out.append(rec)

        for key in {admin.lower(), name.lower(), str(props.get("NAME_LONG") or "").strip().lower(), str(props.get("SOVEREIGNT") or "").strip().lower()}:
            if key and key not in lookup:
                lookup[key] = rec

    return features_out, lookup


def _simplify_world_lakes(lakes_path: Path) -> list[list[list[float]]]:
    """Major world lakes (Great Lakes, Caspian, Baikal, Victoria, etc.) from Natural Earth 1:50m."""
    if not lakes_path.exists():
        return []
    raw = json.loads(lakes_path.read_text(encoding="utf-8"))
    rings: list[list[list[float]]] = []
    for feat in raw.get("features", []):
        sr = feat.get("properties", {}).get("scalerank", 9)
        if sr is not None and sr > 2:
            continue
        geom = shape(feat["geometry"]).simplify(0.10, preserve_topology=True)
        polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms) if geom.geom_type == "MultiPolygon" else []
        for poly in polys:
            if poly.area < 0.12:
                continue
            coords = [[round(float(x), 2), round(float(y), 2)] for x, y in poly.exterior.coords]
            if len(coords) >= 4:
                rings.append(coords)
    return rings


def build_global_military(raw_dir: Path = RAW_DIR, out_dir: Path = WEB_DATA_DIR) -> dict[str, Any]:
    ne_path = raw_dir / "natural_earth/ne_50m_admin_0_countries.geojson"
    lakes_path = raw_dir / "natural_earth/ne_50m_lakes.geojson"
    bsr_path = raw_dir / "overseas_bases/bsr_fy24_lat_long.xlsx"
    dmdc_path = raw_dir / "dmdc/location_2609.xlsx"

    world_land, ne_lookup = _simplify_world_land(ne_path)
    world_lakes = _simplify_world_lakes(lakes_path)

    # 1. Load FY2024 Base Structure Report (audited overseas & U.S. territory installations)
    wb_bsr = openpyxl.load_workbook(bsr_path, read_only=True, data_only=True)
    ws_bsr = wb_bsr.active
    rows_bsr = list(ws_bsr.iter_rows(values_only=True))

    bases: list[dict[str, Any]] = []
    bsr_country_agg: dict[str, dict[str, Any]] = {}
    missing_coord_count = 0
    excluded_count = 0
    fixed_coord_count = 0

    for idx, r in enumerate(rows_bsr[1:], start=1):
        cs = str(r[0] or "").strip()
        if not cs or cs.lower() in US51_LOWER:
            continue
        site = str(r[1] or "").strip()
        comp = str(r[2] or "").strip()
        key_pair = (cs.lower(), site.lower())

        if key_pair in BSR_EXCLUDED:
            excluded_count += 1
            continue

        raw_note = str(r[16] or "").strip()
        approx_coord = ("no discoverable" in raw_note.lower()) or ("approximate" in raw_note.lower()) or ("no location" in raw_note.lower())
        audit_note = ""

        if key_pair in BSR_COORD_FIXES:
            lat, lon, ov_cs, fx_approx, audit_note = BSR_COORD_FIXES[key_pair]
            if ov_cs:
                cs = ov_cs
            approx_coord = approx_coord or fx_approx
            fixed_coord_count += 1
        else:
            try:
                lat = float(r[3])
                lon = float(r[4])
                if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
                    missing_coord_count += 1
                    continue
            except Exception:
                missing_coord_count += 1
                continue

        city = str(r[5] or "").strip()
        if city.lower() in {"unknown", "none", "n/a"}:
            city = ""
        bldgs_owned = int(round(float(r[6] or 0)))
        bldgs_leased = int(round(float(r[8] or 0)))
        bldgs_other = int(round(float(r[10] or 0)))
        bldgs = bldgs_owned + bldgs_leased + bldgs_other
        sqft = int(round(float(r[7] or 0) + float(r[9] or 0) + float(r[11] or 0)))
        acres = round(float(r[13] or 0), 1)
        prv_musd = round(float(r[14] or 0), 1)

        canon_country = _canonical_country(cs)
        ne_hit = ne_lookup.get(cs.lower()) or ne_lookup.get(canon_country.lower())
        cocom, region = _infer_cocom(cs, ne_hit["continent"] if ne_hit else "", lat, lon)
        branch = _normalize_branch(comp)

        is_flagship = (not approx_coord) and (
            prv_musd >= 1500.0 or any(kw.lower() in site.lower() for kw in FLAGSHIP_HUB_KEYWORDS)
        )
        tier = "hub" if is_flagship else ("major" if (prv_musd >= 200.0 or acres >= 500.0) else "site")
        clean_note = audit_note or ("" if "no discoverable" in raw_note.lower() else raw_note[:140])

        bases.append({
            "id": f"ovb_{idx}",
            "name": site,
            "country": canon_country,
            "country_raw": cs,
            "city": city,
            "component": comp,
            "branch": branch,
            "cocom": cocom,
            "region": region,
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "prv_musd": prv_musd,
            "acres": acres,
            "buildings": bldgs,
            "bldgs_owned": bldgs_owned,
            "bldgs_leased": bldgs_leased,
            "sqft": sqft,
            "approx_coord": approx_coord,
            "note": clean_note,
            "tier": tier,
        })

        agg = bsr_country_agg.setdefault(canon_country, {"count": 0, "prv_musd": 0.0, "lat_sum": 0.0, "lon_sum": 0.0})
        agg["count"] += 1
        agg["prv_musd"] += prv_musd
        agg["lat_sum"] += lat
        agg["lon_sum"] += lon

    bases.sort(key=lambda b: (-b["prv_musd"], -b["acres"], b["name"]))

    # 2. Load DMDC Overseas Personnel — STRICTLY separate Military Base/Mission Hosts from Embassy Security/Attachés!
    wb_dmdc = openpyxl.load_workbook(dmdc_path, read_only=True, data_only=True)
    ws_dmdc = wb_dmdc.active
    rows_dmdc = list(ws_dmdc.iter_rows(values_only=True))

    us_tot_idx = next(i for i, r in enumerate(rows_dmdc) if r and any("UNITED STATES TOTAL" in str(x).upper() for x in r if x))
    ov_tot_idx = next(i for i, r in enumerate(rows_dmdc) if r and any("OVERSEAS TOTAL" in str(x).upper() for x in r if x))
    ov_tot_row = rows_dmdc[ov_tot_idx]

    def _int(val: Any) -> int:
        return int(round(float(val))) if isinstance(val, (int, float)) and not math.isnan(float(val)) else 0

    overseas_total_active = _int(ov_tot_row[8])
    overseas_total_reserve = _int(ov_tot_row[16])
    civ_tot_col = next((ci for ci in range(len(rows_dmdc[5]) - 1, 16, -1) if str(rows_dmdc[5][ci] or "").strip().upper() == "TOTAL"), 22)
    overseas_total_civilian = _int(ov_tot_row[civ_tot_col]) if len(ov_tot_row) > civ_tot_col else 0

    countries_map: dict[str, dict[str, Any]] = {}
    unassigned_active = 0
    unassigned_reserve = 0
    unassigned_civilian = 0
    embassy_only_countries = 0
    embassy_only_active = 0
    embassy_only_reserve = 0
    embassy_only_civilian = 0

    for i in range(us_tot_idx + 1, ov_tot_idx):
        r = rows_dmdc[i]
        raw_name = str(r[1] or r[0] or "").strip()
        if not raw_name:
            continue
        army = _int(r[2])
        navy = _int(r[3])
        marines = _int(r[4])
        air_force = _int(r[5])
        space_force = _int(r[6])
        coast_guard = _int(r[7])
        active = _int(r[8])
        reserve = _int(r[16])
        civilian = _int(r[civ_tot_col]) if len(r) > civ_tot_col else 0
        total = active + reserve + civilian

        if raw_name.upper().startswith("ZZ-"):
            unassigned_active += active
            unassigned_reserve += reserve
            unassigned_civilian += civilian
            continue

        if total == 0:
            continue

        canon = _canonical_country(raw_name)
        has_bsr = canon in bsr_country_agg
        is_mission = canon in DEPLOYED_MISSION_COUNTRIES

        # CRITICAL ACCURACY FILTER:
        # Exclude non-garrison nations whose DMDC counts are strictly Embassy Marine Security Guards (MSG) / Defense Attachés
        # (e.g. China, Russia, India, Brazil, France, Mexico, Vietnam, South Africa, etc.)
        if not has_bsr and not is_mission:
            embassy_only_countries += 1
            embassy_only_active += active
            embassy_only_reserve += reserve
            embassy_only_civilian += civilian
            continue

        ov = COUNTRY_OVERRIDES.get(raw_name.lower()) or COUNTRY_OVERRIDES.get(canon.lower())
        ne_hit = ne_lookup.get(raw_name.lower()) or ne_lookup.get(canon.lower())

        lat: float | None = None
        lon: float | None = None
        if ov and ov[3] is not None:
            lat, lon = ov[3]
        elif has_bsr:
            a = bsr_country_agg[canon]
            lat = round(a["lat_sum"] / a["count"], 2)
            lon = round(a["lon_sum"] / a["count"], 2)
        elif ne_hit:
            lat, lon = ne_hit["lat"], ne_hit["lon"]

        cocom, region = _infer_cocom(raw_name, ne_hit["continent"] if ne_hit else "", lat or 0.0, lon or 0.0)
        iso2 = ne_hit["iso2"] if ne_hit else ""
        presence_type = "base_host" if has_bsr else "deployed_mission"
        mission_note_zh, mission_note_en = DEPLOYED_MISSION_COUNTRIES.get(canon, ("", ""))

        existing = countries_map.get(canon)
        if existing:
            existing["active"] += active
            existing["reserve"] += reserve
            existing["civilian"] += civilian
            existing["total"] += total
            existing["by_branch"]["army"] += army
            existing["by_branch"]["navy"] += navy
            existing["by_branch"]["marines"] += marines
            existing["by_branch"]["air_force"] += air_force
            existing["by_branch"]["space_force"] += space_force
            existing["by_branch"]["coast_guard"] += coast_guard
        else:
            bsr_info = bsr_country_agg.get(canon, {"count": 0, "prv_musd": 0.0})
            countries_map[canon] = {
                "name": canon,
                "iso2": iso2,
                "cocom": cocom,
                "region": region,
                "presence_type": presence_type,
                "mission_note_zh": mission_note_zh,
                "mission_note_en": mission_note_en,
                "lat": lat,
                "lon": lon,
                "active": active,
                "reserve": reserve,
                "civilian": civilian,
                "total": total,
                "by_branch": {
                    "army": army,
                    "navy": navy,
                    "marines": marines,
                    "air_force": air_force,
                    "space_force": space_force,
                    "coast_guard": coast_guard,
                },
                "base_count": bsr_info["count"],
                "prv_musd": round(bsr_info["prv_musd"], 1),
            }

    # Include any BSR territory/atoll with bases that has 0 separate DMDC rows (e.g., Wake Island, Johnston Atoll, Curacao)
    for canon, bsr_info in bsr_country_agg.items():
        if canon not in countries_map:
            ov = COUNTRY_OVERRIDES.get(canon.lower())
            lat = round(bsr_info["lat_sum"] / bsr_info["count"], 2)
            lon = round(bsr_info["lon_sum"] / bsr_info["count"], 2)
            ne_hit = ne_lookup.get(canon.lower())
            cocom, region = _infer_cocom(canon, ne_hit["continent"] if ne_hit else "", lat, lon)
            countries_map[canon] = {
                "name": canon,
                "iso2": ne_hit["iso2"] if ne_hit else "",
                "cocom": cocom,
                "region": region,
                "presence_type": "base_host",
                "mission_note_zh": "",
                "mission_note_en": "",
                "lat": ov[3][0] if (ov and ov[3]) else lat,
                "lon": ov[3][1] if (ov and ov[3]) else lon,
                "active": 0,
                "reserve": 0,
                "civilian": 0,
                "total": 0,
                "by_branch": {"army": 0, "navy": 0, "marines": 0, "air_force": 0, "space_force": 0, "coast_guard": 0},
                "base_count": bsr_info["count"],
                "prv_musd": round(bsr_info["prv_musd"], 1),
            }

    countries = sorted(countries_map.values(), key=lambda c: (-c["active"], -c["base_count"], -c["prv_musd"], c["name"]))

    # Annotate ONLY genuine military base host / deployed mission countries on world_land!
    by_iso2 = {c["iso2"]: c for c in countries if c["iso2"]}
    by_name_l = {c["name"].lower(): c for c in countries}
    # Explicitly ensure Cuba's mainland is NOT colored as a U.S. ally/host (only Guantanamo Bay enclave has a base)
    for feat in world_land:
        if feat["admin"] == "Cuba":
            feat["active"] = 0
            feat["base_count"] = 0
            feat["is_host"] = False
        else:
            c = by_iso2.get(feat["iso2"]) or by_name_l.get(feat["name"].lower()) or by_name_l.get(feat["admin"].lower())
            feat["active"] = c["active"] if c else 0
            feat["base_count"] = c["base_count"] if c else 0
            feat["is_host"] = bool(c)
        del feat["admin"]
        del feat["region"]

    # 3. Pre-aggregate Combatant Command (COCOM) summary cards
    cocom_summary = []
    for sp in COCOM_SPECS:
        cid = sp["id"]
        c_bases = [b for b in bases if b["cocom"] == cid]
        c_countries = [c for c in countries if c["cocom"] == cid]
        cocom_summary.append({
            **sp,
            "base_count": len(c_bases),
            "hub_count": sum(1 for b in c_bases if b["tier"] == "hub"),
            "prv_musd": round(sum(b["prv_musd"] for b in c_bases), 1),
            "active_troops": sum(c["active"] for c in c_countries),
            "total_personnel": sum(c["total"] for c in c_countries),
            "country_count": len(c_countries),
        })

    host_active_total = sum(c["active"] for c in countries)
    host_reserve_total = sum(c["reserve"] for c in countries)
    host_civilian_total = sum(c["civilian"] for c in countries)

    out = {
        "summary": {
            "total_bases": len(bases),
            "missing_coord_bases": missing_coord_count,
            "excluded_bases": excluded_count,
            "fixed_coord_bases": fixed_coord_count,
            "base_countries": len(bsr_country_agg),
            "host_countries": len(countries),
            "total_prv_musd": round(sum(b["prv_musd"] for b in bases), 1),
            "total_acres": round(sum(b["acres"] for b in bases), 1),
            "host_active": host_active_total,
            "host_reserve": host_reserve_total,
            "host_civilian": host_civilian_total,
            "overseas_active": overseas_total_active,
            "overseas_reserve": overseas_total_reserve,
            "overseas_civilian": overseas_total_civilian,
            "embassy_only_countries": embassy_only_countries,
            "embassy_only_active": embassy_only_active,
            "unassigned_active": unassigned_active,
            "unassigned_reserve": unassigned_reserve,
            "unassigned_civilian": unassigned_civilian,
            "as_of_dmdc": "September 30, 2026",
            "as_of_bsr": "FY2024",
        },
        "cocoms": cocom_summary,
        "fleets": NAVY_FLEETS,
        "chokepoints": CHOKEPOINTS,
        "ocean_labels": OCEAN_LABELS,
        "projection_arcs": PROJECTION_ARCS,
        "bases": bases,
        "countries": countries,
        "world_land": world_land,
        "world_lakes": world_lakes,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "global_military.json"
    txt = json.dumps(out, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    out_path.write_text(txt, encoding="utf-8")

    # Self-verify: confirm ZERO China/Russia/Ukraine/Spain-mislocated entries remain!
    china_feat = next((f for f in world_land if f["name"] == "China"), None)
    russia_feat = next((f for f in world_land if f["name"] == "Russia"), None)
    assert china_feat and not china_feat["is_host"] and china_feat["active"] == 0, "China must NOT be marked as host!"
    assert russia_feat and not russia_feat["is_host"] and russia_feat["active"] == 0, "Russia must NOT be marked as host!"
    assert not any(c["name"] in {"China", "Russia", "India", "Brazil", "France", "Vietnam"} for c in countries), "Embassy-only nations leaked!"

    print(
        f"[global_military] Exported {out_path.name} ({len(txt.encode('utf-8')) / 1e3:.1f} KB) | "
        f"{len(bases)} active overseas bases ({fixed_coord_count} coord fixes, {excluded_count} excluded) | "
        f"{len(countries)} host nations/territories ({host_active_total:,} active) | "
        f"{embassy_only_countries} embassy-only countries excluded from map ({embassy_only_active:,} MSG/attachés) | "
        f"{len(world_land)} crisp world polygons + {len(world_lakes)} major lakes"
    )
    return out


if __name__ == "__main__":
    build_global_military()
