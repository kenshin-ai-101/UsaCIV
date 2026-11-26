"""Catalog of all 31 official U.S. public data sources and direct open download URLs."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SourceFile:
    rel_path: str
    url: str
    optional: bool = False


@dataclass(frozen=True)
class DataSourceSpec:
    id: str
    category: str
    title: str
    publisher: str
    homepage: str
    vintage: str
    used_for: str
    files: tuple[SourceFile, ...] = field(default_factory=tuple)


ACS_1YR_TABLES = [
    "b01001", "b01002", "b01003", "b05002",
    "b19013", "b19025", "b23025", "b25064", "b25077",
    "c08301", "c15003", "c24010", "c24030",
]

ACS_5YR_TABLES = [
    "b01002", "b01003", "b05012", "b08013", "b08303",
    "b15003", "b17001", "b19013", "b21001", "b23025",
    "b25003", "b25077", "b27010", "b28002",
]

QCEW_INDUSTRIES = [
    "10",      # Total, all industries
    "211",     # Oil and gas extraction
    "2121",    # Coal mining
    "22",      # Utilities
    "2211",    # Power generation & supply
    "31_33",   # Manufacturing
    "3241",    # Petroleum and coal products manufacturing
    "3254",    # Pharmaceutical and medicine manufacturing
    "331",     # Primary metal manufacturing
    "3344",    # Semiconductor & electronic component mfg
    "3361",    # Motor vehicle manufacturing
    "3364",    # Aerospace product and parts manufacturing
    "481",     # Air transportation
    "483",     # Water transportation
    "4881",    # Support activities for air transportation
    "4883",    # Support activities for water transportation
    "512",     # Motion picture & sound recording
    "5132",    # Software publishers
    "516",     # Broadcasting & content providers
    "5182",    # Computing infrastructure & data processing
    "52",      # Finance and insurance
    "5231",    # Securities & commodity contracts
    "524",     # Insurance carriers
    "5415",    # Computer systems design & related services
    "5417",    # Scientific R&D services
    "6113",    # Colleges, universities, and professional schools
    "621",     # Ambulatory health care services
    "622",     # Hospitals
    "711",     # Performing arts, spectator sports
    "713",     # Amusement, gambling, and recreation
    "7132",    # Gambling industries
    "721",     # Accommodation
    "921",     # Executive, legislative & general govt
    "922",     # Justice, public order, and safety
    "928110",  # National security
]


SOURCES: list[DataSourceSpec] = [
    # 1. ACS 1-Year (Metros / Micros)
    DataSourceSpec(
        id="acs_1yr",
        category="people",
        title="American Community Survey, 1-Year Estimates (Metros)",
        publisher="U.S. Census Bureau",
        homepage="https://www.census.gov/programs-surveys/acs",
        vintage="ACS 2025 1-year",
        used_for="524 metro/micropolitan city metrics, occupation workforce (16-Meeple Citizens), resident industries",
        files=tuple(
            [
                SourceFile(
                    "acs_1yr/Geos20251YR.txt",
                    "https://www2.census.gov/programs-surveys/acs/summary_file/2025/table-based-SF/documentation/Geos20251YR.txt",
                )
            ]
            + [
                SourceFile(
                    f"acs_1yr/{t}.dat",
                    f"https://www2.census.gov/programs-surveys/acs/summary_file/2025/table-based-SF/data/1YRData/acsdt1y2025-{t}.dat",
                )
                for t in ACS_1YR_TABLES
            ]
        ),
    ),
    # 2. ACS 5-Year (Counties)
    DataSourceSpec(
        id="acs_5yr",
        category="people",
        title="American Community Survey, 5-Year Estimates (Counties)",
        publisher="U.S. Census Bureau",
        homepage="https://www.census.gov/programs-surveys/acs",
        vintage="ACS 2024 5-year",
        used_for="12 hex lenses (density, income, home value, poverty, age, foreign-born, degrees, broadband, commute, homeownership, uninsured, veterans) & county explorer",
        files=tuple(
            [
                SourceFile(
                    "acs_5yr/Geos20245YR.txt",
                    "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/documentation/Geos20245YR.txt",
                )
            ]
            + [
                SourceFile(
                    f"acs_5yr/{t}.dat",
                    f"https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-{t}.dat",
                )
                for t in ACS_5YR_TABLES
            ]
        ),
    ),
    # 3. BEA GDP by County & Industry
    DataSourceSpec(
        id="bea_gdp",
        category="economy",
        title="GDP by County and Industry (CAGDP2)",
        publisher="U.S. Bureau of Economic Analysis (BEA)",
        homepage="https://apps.bea.gov/regional/downloadzip.htm",
        vintage="BEA CAGDP2, 2024",
        used_for="Gold yield (real GDP), county & metro GDP totals, industry breakdown for Economy advisor",
        files=(
            SourceFile("bea_gdp/CAGDP2.zip", "https://apps.bea.gov/regional/zip/CAGDP2.zip"),
        ),
    ),
    # 4. BLS QCEW
    DataSourceSpec(
        id="bls_qcew",
        category="economy",
        title="Quarterly Census of Employment and Wages (Annual Averages)",
        publisher="U.S. Bureau of Labor Statistics (BLS)",
        homepage="https://www.bls.gov/cew/",
        vintage="BLS QCEW 2025 annual averages",
        used_for="Industry Location Quotients (LQ) driving all 10 specialized city Districts",
        files=tuple(
            SourceFile(
                f"bls_qcew/{code}.csv",
                f"https://data.bls.gov/cew/data/api/2025/a/industry/{code}.csv",
            )
            for code in QCEW_INDUSTRIES
        ),
    ),
    # 5. CBSA Delineation
    DataSourceSpec(
        id="cbsa_delineation",
        category="geo",
        title="Core Based Statistical Area (CBSA) Delineation Files",
        publisher="U.S. Census Bureau / OMB (Bulletin 23-01)",
        homepage="https://www.census.gov/geographies/reference-files/time-series/demo/metro-micro/delineation-files.html",
        vintage="July 2023 delineations",
        used_for="County-to-CBSA mapping defining the hex territory of all 524+ metro/micro cities",
        files=(
            SourceFile(
                "cbsa/list1_2023.xlsx",
                "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx",
            ),
            SourceFile(
                "cbsa/list2_2023.xlsx",
                "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list2_2023.xlsx",
            ),
        ),
    ),
    # 6. CDC PLACES
    DataSourceSpec(
        id="cdc_places",
        category="people",
        title="PLACES: Local Data for Better Health (County Data)",
        publisher="Centers for Disease Control and Prevention (CDC)",
        homepage="https://www.cdc.gov/places/",
        vintage="CDC PLACES 2025 release",
        used_for="Wellbeing / Amenities hex lens & city happiness (4 age-adjusted adult health indicators)",
        files=(
            SourceFile(
                "cdc_places/places_county_gis.csv",
                "https://data.cdc.gov/resource/i46a-9kgh.csv?$limit=5000",
            ),
        ),
    ),
    # 7. Census Cartographic Boundaries
    DataSourceSpec(
        id="census_boundaries",
        category="geo",
        title="Cartographic Boundary Files (States & Counties, 1:20M)",
        publisher="U.S. Census Bureau",
        homepage="https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html",
        vintage="2023 cartographic boundaries",
        used_for="County-to-25km hex spatial crosswalk and state/county borders (CONUS, AK, HI)",
        files=(
            SourceFile(
                "census_boundaries/cb_2023_us_county_20m.zip",
                "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_20m.zip",
            ),
            SourceFile(
                "census_boundaries/cb_2023_us_state_20m.zip",
                "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_20m.zip",
            ),
        ),
    ),
    # 8. Census Gazetteer
    DataSourceSpec(
        id="census_gazetteer",
        category="geo",
        title="Gazetteer Files (Metro Areas, Counties, Places)",
        publisher="U.S. Census Bureau",
        homepage="https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html",
        vintage="2024 Gazetteer",
        used_for="Authoritative land/water areas and internal coordinates for metros & counties",
        files=(
            SourceFile(
                "census_gazetteer/2024_Gaz_cbsa_national.zip",
                "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_cbsa_national.zip",
            ),
            SourceFile(
                "census_gazetteer/2024_Gaz_counties_national.zip",
                "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip",
            ),
            SourceFile(
                "census_gazetteer/2024_Gaz_place_national.zip",
                "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_place_national.zip",
            ),
        ),
    ),
    # 9. DMDC Personnel
    DataSourceSpec(
        id="dmdc_personnel",
        category="military",
        title="Military & DoD Civilian Personnel by Duty State and Service",
        publisher="U.S. Department of Defense (DMDC)",
        homepage="https://dwp.dmdc.osd.mil/dwp/app/dod-data-reports/workforce-reports",
        vintage="DMDC, Sept 30, 2026",
        used_for="Active-duty, reserve & civilian headcounts by state and service branch (Military advisor)",
        files=(
            SourceFile(
                "dmdc/location_2609.xlsx",
                "https://dwp.dmdc.osd.mil/dwp/api/download?fileName=DMDC_Website_Location_Report_2609.xlsx&groupName=milRegionCountry",
            ),
        ),
    ),
    # 10. EIA-860M Power Plants
    DataSourceSpec(
        id="eia_860m",
        category="energy",
        title="Preliminary Monthly Electric Generator Inventory (EIA-860M)",
        publisher="U.S. Energy Information Administration (EIA)",
        homepage="https://www.eia.gov/electricity/data/eia860m/",
        vintage="EIA-860M, October 2026",
        used_for="Power plant diamond beacons (nuclear, solar, wind, hydro, gas, coal, storage) & Energy advisor",
        files=(
            SourceFile(
                "eia_860m/october_generator2026.xlsx",
                "https://www.eia.gov/electricity/data/eia860m/xls/october_generator2026.xlsx",
            ),
        ),
    ),
    # 11. EIA Coal
    DataSourceSpec(
        id="eia_coal",
        category="energy",
        title="Historical Detailed Coal Production Data (Mine Level)",
        publisher="U.S. Energy Information Administration (EIA) / MSHA",
        homepage="https://www.eia.gov/coal/data.php",
        vintage="EIA Coal Production 2025",
        used_for="Coal strategic resource mine tonnage rankings",
        files=(
            SourceFile(
                "eia_coal/coalpublic2025.xlsx",
                "https://www.eia.gov/coal/data/public/xls/coalpublic2025.xlsx",
            ),
        ),
    ),
    # 12. EIA Shale Plays
    DataSourceSpec(
        id="eia_shale_plays",
        category="energy",
        title="Tight Oil and Shale Gas Plays, Lower 48 States",
        publisher="U.S. Energy Information Administration (U.S. Energy Atlas)",
        homepage="https://atlas.eia.gov/datasets/eia::tight-oil-and-shale-gas-plays-lower-48-states",
        vintage="EIA Shale Plays (Lower 48)",
        used_for="Geological stipple strata overlay for major oil & shale gas basins",
        files=(
            SourceFile(
                "eia_shale_plays/shale_plays.geojson",
                "https://services7.arcgis.com/FGr1D95XCGALKXqM/arcgis/rest/services/TightOil_ShaleGas_Plays_Lower48_EIA/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&maxAllowableOffset=0.02&f=geojson",
            ),
        ),
    ),
    # 13. ETOPO1 Relief (CONUS + AK + HI)
    DataSourceSpec(
        id="etopo",
        category="geo",
        title="ETOPO1 Global Relief Model",
        publisher="NOAA National Centers for Environmental Information (ERDDAP)",
        homepage="https://www.ncei.noaa.gov/products/etopo-global-relief-model",
        vintage="ETOPO1, 1 arc-min sampled",
        used_for="Hex elevation, relief classification, and 2.5D physical extrusion height (CONUS, AK, HI)",
        files=(
            SourceFile(
                "etopo/etopo_conus.csv",
                "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv?altitude%5B(22):5:(52)%5D%5B(-128):5:(-64)%5D",
            ),
            SourceFile(
                "etopo/etopo_ak.csv",
                "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv?altitude%5B(51):8:(72)%5D%5B(-179):8:(-129)%5D",
                optional=True,
            ),
            SourceFile(
                "etopo/etopo_hi.csv",
                "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv?altitude%5B(18):3:(23)%5D%5B(-161):3:(-154)%5D",
                optional=True,
            ),
        ),
    ),
    # 14. FAA Airports
    DataSourceSpec(
        id="faa_airports",
        category="economy",
        title="FAA Passenger Enplanements, All-Cargo & NASR Locations",
        publisher="Federal Aviation Administration (FAA) & BTS NTAD",
        homepage="https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger",
        vintage="FAA CY2025 enplanements & all-cargo",
        used_for="Aero-Hub icons, passenger & air cargo throughput, Commerce advisor",
        files=(
            SourceFile(
                "faa_airports/enplanements_cy2025.xlsx",
                "https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger/arp-cy2025-commercial-service-enplanements.xlsx",
            ),
            SourceFile(
                "faa_airports/all_cargo_cy2025.xlsx",
                "https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger/ARP-CY2025-all-cargo-airports.xlsx",
            ),
            SourceFile(
                "faa_airports/ntad_airports.geojson",
                "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Aviation_Facilities/FeatureServer/0/query?where=FAR_139_TYPE_CODE+%3C%3E+%27%27&outFields=ARPT_ID%2CICAO_ID%2CARPT_NAME%2CCITY%2CSTATE_CODE%2CCOUNTY_NAME%2CSITE_TYPE_CODE%2CFAR_139_TYPE_CODE%2CLAT_DECIMAL%2CLONG_DECIMAL&outSR=4326&f=geojson",
            ),
        ),
    ),
    # 15. FAF5 Freight Analysis Framework
    DataSourceSpec(
        id="faf5",
        category="economy",
        title="Freight Analysis Framework (FAF5.7.1, 2018-2024)",
        publisher="FHWA & BTS (Oak Ridge National Laboratory)",
        homepage="https://faf.ornl.gov/faf5/",
        vintage="FAF5.7.1, 2024",
        used_for="Top interstate freight trade routes (value, tonnage, mode, commodity) & Commerce advisor",
        files=(
            SourceFile(
                "faf5/FAF5.7.1_State_2018-2024.zip",
                "https://faf.ornl.gov/faf5/Data/Download_Files/FAF5.7.1_State_2018-2024.zip",
            ),
            SourceFile(
                "faf5/FAF5_metadata.xlsx",
                "https://faf.ornl.gov/faf5/data/FAF5_metadata.xlsx",
            ),
        ),
    ),
    # 16. OpenFEMA Disasters
    DataSourceSpec(
        id="fema_declarations",
        category="hazards",
        title="OpenFEMA Disaster Declarations Summaries (v2)",
        publisher="Federal Emergency Management Agency (FEMA)",
        homepage="https://www.fema.gov/openfema-data-page/disaster-declarations-summaries-v2",
        vintage="OpenFEMA declarations (2000-2026)",
        used_for="Disasters hex lens (county major DR count since 2000) & hazard composition",
        files=(
            SourceFile(
                "fema/ct_crosswalk.xlsx",
                "https://www2.census.gov/geo/docs/reference/ct_change/ct_cou_to_cousub_crosswalk.xlsx",
            ),
            SourceFile(
                "fema/page_00.csv",
                "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries.csv?$filter=declarationDate%20ge%20'2000-01-01'%20and%20declarationType%20eq%20'DR'%20and%20incidentType%20ne%20'Biological'&$select=disasterNumber,state,declarationType,declarationDate,incidentType,declarationTitle,fipsStateCode,fipsCountyCode,designatedArea&$orderby=id&$top=10000&$skip=0",
            ),
            SourceFile(
                "fema/page_01.csv",
                "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries.csv?$filter=declarationDate%20ge%20'2000-01-01'%20and%20declarationType%20eq%20'DR'%20and%20incidentType%20ne%20'Biological'&$select=disasterNumber,state,declarationType,declarationDate,incidentType,declarationTitle,fipsStateCode,fipsCountyCode,designatedArea&$orderby=id&$top=10000&$skip=10000",
            ),
            SourceFile(
                "fema/page_02.csv",
                "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries.csv?$filter=declarationDate%20ge%20'2000-01-01'%20and%20declarationType%20eq%20'DR'%20and%20incidentType%20ne%20'Biological'&$select=disasterNumber,state,declarationType,declarationDate,incidentType,declarationTitle,fipsStateCode,fipsCountyCode,designatedArea&$orderby=id&$top=10000&$skip=20000",
            ),
            SourceFile(
                "fema/page_03.csv",
                "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries.csv?$filter=declarationDate%20ge%20'2000-01-01'%20and%20declarationType%20eq%20'DR'%20and%20incidentType%20ne%20'Biological'&$select=disasterNumber,state,declarationType,declarationDate,incidentType,declarationTitle,fipsStateCode,fipsCountyCode,designatedArea&$orderby=id&$top=10000&$skip=30000",
                optional=True,
            ),
        ),
    ),
    # 17. NSF HERD
    DataSourceSpec(
        id="herd",
        category="wonders",
        title="Higher Education Research and Development (HERD) Survey",
        publisher="National Science Foundation (NCSES)",
        homepage="https://ncses.nsf.gov/explore-data/microdata/higher-education-research-development",
        vintage="NSF HERD FY2025",
        used_for="Science yield & open-rule ranking of Academic Wonders by R&D spending",
        files=(
            SourceFile(
                "herd/herd_2025.zip",
                "https://ncses.nsf.gov/821/assets/0/files/higher_education_r_and_d_2025.zip",
            ),
        ),
    ),
    # 18. NCES IPEDS
    DataSourceSpec(
        id="ipeds",
        category="wonders",
        title="IPEDS Institutional Characteristics (HD) & Enrollment (DRVEF12)",
        publisher="U.S. Department of Education (NCES)",
        homepage="https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx",
        vintage="IPEDS 2024-25",
        used_for="University coordinates, student enrollment, Campus districts & Academic Wonder placement",
        files=(
            SourceFile("ipeds/HD2024.zip", "https://nces.ed.gov/ipeds/datacenter/data/HD2024.zip"),
            SourceFile("ipeds/DRVEF122024.zip", "https://nces.ed.gov/ipeds/datacenter/data/DRVEF122024.zip"),
        ),
    ),
    # 19. DoD MIRTA
    DataSourceSpec(
        id="mirta",
        category="military",
        title="Military Installations, Ranges and Training Areas (MIRTA)",
        publisher="U.S. Department of Defense (OASD EI&E DISDI)",
        homepage="https://www.acq.osd.mil/eie/imr/rpid/disdi/",
        vintage="DoD MIRTA FY2025",
        used_for="Military Bastions/Forts, restricted range tiles, Encampment city districts",
        files=(
            SourceFile(
                "mirta/points.geojson",
                "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/MIRTA_Points_A_view/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson",
            ),
            SourceFile(
                "mirta/polygons.geojson",
                "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/MIRTA_Polygons_A_view/FeatureServer/0/query?where=1%3D1&outFields=siteName,component,stateNameCode,featureDescription,areaSize&geometryPrecision=4&maxAllowableOffset=0.01&outSR=4326&f=geojson",
            ),
        ),
    ),
    # 20. MSHA Mines
    DataSourceSpec(
        id="msha_mines",
        category="energy",
        title="MSHA Mines Open Government Data Set",
        publisher="U.S. Dept. of Labor, Mine Safety & Health Administration",
        homepage="https://arlweb.msha.gov/OpenGovernmentData/OGIMSHA.asp",
        vintage="MSHA Mines (live open dataset)",
        used_for="Faceted mineral ore prism nodes (gold, copper, iron, lithium, aggregates)",
        files=(
            SourceFile(
                "msha/Mines.zip",
                "https://arlweb.msha.gov/OpenGovernmentData/DataSets/Mines.zip",
            ),
        ),
    ),
    # 21. Natural Earth 1:50m
    DataSourceSpec(
        id="natural_earth",
        category="geo",
        title="Natural Earth v5.1.2 (1:50m Countries, Lakes, Rivers)",
        publisher="Natural Earth",
        homepage="https://www.naturalearthdata.com/",
        vintage="Natural Earth v5.1.2 (1:50m)",
        used_for="Coastlines, Great Lakes, major rivers (Fresh Water bonus), bordering context",
        files=(
            SourceFile(
                "natural_earth/ne_50m_admin_0_countries.geojson",
                "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson",
            ),
            SourceFile(
                "natural_earth/ne_50m_lakes.geojson",
                "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_lakes.geojson",
            ),
            SourceFile(
                "natural_earth/ne_50m_rivers_lake_centerlines.geojson",
                "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_rivers_lake_centerlines.geojson",
            ),
        ),
    ),
    # 22. Natural Earth 1:10m Roads & Railroads
    DataSourceSpec(
        id="natural_earth_roads",
        category="economy",
        title="Natural Earth v5.1.2 (1:10m Roads & Railroads)",
        publisher="Natural Earth",
        homepage="https://www.naturalearthdata.com/",
        vintage="Natural Earth v5.1.2 (1:10m)",
        used_for="Interstate highways and main/secondary railroad network map art layers",
        files=(
            SourceFile(
                "natural_earth/ne_10m_roads.geojson",
                "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_roads.geojson",
            ),
            SourceFile(
                "natural_earth/ne_10m_railroads.geojson",
                "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_railroads.geojson",
            ),
        ),
    ),
    # 23. National Historic Landmarks (NPS NRHP)
    DataSourceSpec(
        id="nhl_landmarks",
        category="wonders",
        title="National Historic Landmarks (NRHP GIS Subset)",
        publisher="U.S. National Park Service (Cultural Resources GIS)",
        homepage="https://www.nps.gov/subjects/nationalhistoriclandmarks/index.htm",
        vintage="NPS National Register GIS (NHL)",
        used_for="Heritage Wonders & national landmark plaques",
        files=(
            SourceFile(
                "nhl/nhl_points.geojson",
                "https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/0/query?where=Is_NHL%3D%27X%27&outFields=NRIS_Refnum,RESNAME,ResType,City,County,State,CertDate&outSR=4326&f=geojson",
            ),
            SourceFile(
                "nhl/nhl_polygons.geojson",
                "https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/1/query?where=Is_NHL%3D%27X%27&outFields=NRIS_Refnum,RESNAME,ResType,City,County,State,CertDate&maxAllowableOffset=0.002&geometryPrecision=4&outSR=4326&f=geojson",
            ),
        ),
    ),
    # 24. USGS NLCD Land Cover (CONUS 2021 + AK 2016 + HI 2001)
    DataSourceSpec(
        id="nlcd",
        category="geo",
        title="National Land Cover Database (NLCD 2021 CONUS / 2016 AK / 2001 HI)",
        publisher="U.S. Geological Survey (USGS) / MRLC",
        homepage="https://www.mrlc.gov/data/nlcd-2021-land-cover-conus",
        vintage="NLCD 2021 (L48), 2016 (AK), 2001 (HI)",
        used_for="Biomes, Food/Production terrain yields, Forest / Farmland / Built-up lenses",
        files=(
            SourceFile(
                "nlcd/nlcd_l48_2km.tif",
                "https://www.mrlc.gov/geoserver/ows?service=WCS&version=2.0.1&request=GetCoverage&coverageId=mrlc_download__NLCD_2021_Land_Cover_L48&format=image/tiff&scalesize=i(2418),j(1567)&interpolation=http://www.opengis.net/def/interpolation/OGC/1/nearest-neighbor",
            ),
            SourceFile(
                "nlcd/nlcd_ak_4km.tif",
                "https://www.mrlc.gov/geoserver/ows?service=WCS&version=2.0.1&request=GetCoverage&coverageId=mrlc_download__NLCD_2016_Land_Cover_AK&format=image/tiff&scalesize=i(900),j(600)&interpolation=http://www.opengis.net/def/interpolation/OGC/1/nearest-neighbor",
                optional=True,
            ),
            SourceFile(
                "nlcd/nlcd_hi_1km.tif",
                "https://www.mrlc.gov/geoserver/ows?service=WCS&version=2.0.1&request=GetCoverage&coverageId=mrlc_download__NLCD_2001_Land_Cover_HI&format=image/tiff&scalesize=i(600),j(400)&interpolation=http://www.opengis.net/def/interpolation/OGC/1/nearest-neighbor",
                optional=True,
            ),
        ),
    ),
    # 25. NOAA Billion-Dollar Disasters
    DataSourceSpec(
        id="noaa_billions",
        category="hazards",
        title="U.S. Billion-Dollar Weather and Climate Disasters (1980-2024)",
        publisher="NOAA National Centers for Environmental Information (NCEI)",
        homepage="https://www.ncei.noaa.gov/access/billions/",
        vintage="NOAA NCEI 1980-2024 (final release)",
        used_for="Culture & Hazards advisor disaster timeline and state loss totals",
        files=(
            SourceFile("noaa_billions/events.csv", "https://www.ncei.noaa.gov/access/billions/events-US-1980-2024.csv"),
            SourceFile("noaa_billions/state_cost.csv", "https://www.ncei.noaa.gov/access/billions/state-cost-data.csv"),
            SourceFile("noaa_billions/state_freq.csv", "https://www.ncei.noaa.gov/access/billions/state-freq-data.csv"),
        ),
    ),
    # 26. NPS Boundaries
    DataSourceSpec(
        id="nps_boundaries",
        category="wonders",
        title="NPS Land Resources Division Boundaries",
        publisher="U.S. National Park Service (NPS)",
        homepage="https://www.arcgis.com/home/item.html?id=c8d60ffcbf5c4030a17762fe10e81c6a",
        vintage="NPS LRD Boundaries (2026)",
        used_for="Protected park footprints and Natural Wonder coordinates",
        files=(
            SourceFile(
                "nps/boundaries.geojson",
                "https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/2/query?where=1%3D1&outFields=UNIT_CODE,UNIT_NAME,UNIT_TYPE,STATE,REGION&maxAllowableOffset=0.005&geometryPrecision=4&outSR=4326&f=geojson",
            ),
            SourceFile(
                "nps/centroids.geojson",
                "https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/0/query?where=1%3D1&outFields=UNIT_CODE,UNIT_NAME,UNIT_TYPE,STATE,REGION&outSR=4326&f=geojson",
            ),
        ),
    ),
    # 27. NPS Visitor Use Statistics
    DataSourceSpec(
        id="nps_visits",
        category="wonders",
        title="NPS Visitor Use Statistics (Recreation Visits)",
        publisher="U.S. National Park Service (IRMA)",
        homepage="https://irma.nps.gov/Stats/",
        vintage="NPS Recreation Visits 2025",
        used_for="Open-rule ranking of Natural Wonders by annual visitors & Culture yield",
        files=(
            SourceFile(
                "nps/visits_2025.json",
                "https://irmaservices.nps.gov/v3/rest/stats/visitation?startMonth=1&startYear=2025&endMonth=12&endYear=2025",
            ),
        ),
    ),
    # 28. DoD OLDCC Spending
    DataSourceSpec(
        id="oldcc_spending",
        category="military",
        title="Defense Spending by State",
        publisher="U.S. Department of Defense (OLDCC)",
        homepage="https://oldcc.gov/defense-spending-state-fiscal-year-2024",
        vintage="OLDCC FY2024",
        used_for="State defense contract & payroll spending (Military advisor)",
        files=(
            SourceFile(
                "oldcc/spending_fy2024.xlsx",
                "https://oldcc.gov/sites/default/files/2025-11/oldcc_spending_by_state_fy2024_online_data_final_abridged_nov2025.xlsx",
            ),
        ),
    ),
    # 29. Census PEP Population Estimates
    DataSourceSpec(
        id="pep_population",
        category="people",
        title="Population Estimates Program (PEP), Vintage 2025",
        publisher="U.S. Census Bureau",
        homepage="https://www.census.gov/programs-surveys/popest.html",
        vintage="Census PEP Vintage 2025",
        used_for="Multi-year population growth & migration (natural change vs domestic/international)",
        files=(
            SourceFile(
                "pep/NST-EST2025-ALLDATA.csv",
                "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/state/totals/NST-EST2025-ALLDATA.csv",
            ),
            SourceFile(
                "pep/cbsa-est2025-alldata.csv",
                "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/metro/totals/cbsa-est2025-alldata.csv",
            ),
            SourceFile(
                "pep/co-est2025-alldata.csv",
                "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv",
                optional=True,
            ),
        ),
    ),
    # 30. USACE Principal Ports
    DataSourceSpec(
        id="usace_ports",
        category="economy",
        title="Principal Ports of the United States (Cargo Tonnage)",
        publisher="U.S. Army Corps of Engineers (via BTS NTAD)",
        homepage="https://doi.org/10.21949/1529073",
        vintage="USACE Principal Ports CY2023",
        used_for="Maritime Harbor hubs, tonnage rankings, Commerce advisor",
        files=(
            SourceFile(
                "usace_ports/principal_ports.json",
                "https://services7.arcgis.com/n1YM8pTrFmm7L4hs/arcgis/rest/services/Principal_Ports/FeatureServer/0/query?where=1%3D1&outFields=%2A&outSR=4326&returnGeometry=false&returnCentroid=true&f=json",
            ),
        ),
    ),
    # 31. 2020 U.S. Religion Census
    DataSourceSpec(
        id="usrc_2020",
        category="people",
        title="2020 U.S. Religion Census: County File (RCMSCY20)",
        publisher="ASARB via Association of Religion Data Archives (ARDA / OSF)",
        homepage="https://www.thearda.com/data-archive?fid=RCMSCY20",
        vintage="2020 U.S. Religion Census",
        used_for="Faith yield, Faith adherents lens, Largest Religious Tradition lens & Culture advisor",
        files=(
            SourceFile("usrc_2020/RCMSCY20.xlsx", "https://osf.io/download/5a6sk/"),
        ),
    ),
]
