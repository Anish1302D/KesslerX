"""
KesslerX Demo Catalog Fixtures.
Strictly isolated to tests and explicit APP_ENV=demo environments.
NEVER imported or served in production mode.
"""

from typing import List, Dict, Any


def get_demo_catalog_fixtures() -> List[Dict[str, Any]]:
    """Static demonstration satellite and debris catalog for offline demo mode."""
    fixtures = [
        # ISS
        {
            "NORAD_CAT_ID": 25544,
            "OBJECT_NAME": "ISS (ZARYA)",
            "TLE_LINE1": "1 25544U 98067A   26310.53055556  .00016717  00000-0  30062-3 0  9997",
            "TLE_LINE2": "2 25544  51.6416 113.8823 0004944 260.6558 139.7397 15.49842525452261",
            "OBJECT_TYPE": "PAYLOAD",
            "CATEGORY": "ISS",
            "SOURCE": "demo"
        },
        # Communications
        {
            "NORAD_CAT_ID": 44713,
            "OBJECT_NAME": "STARLINK-1007",
            "TLE_LINE1": "1 44713U 19074A   26310.12345678  .00012345  00000-0  12345-3 0  9991",
            "TLE_LINE2": "2 44713  53.0500 123.4567 0001234 123.4567 123.4567 15.00000000123451",
            "OBJECT_TYPE": "PAYLOAD",
            "CATEGORY": "Communication",
            "SOURCE": "demo"
        },
        {
            "NORAD_CAT_ID": 44714,
            "OBJECT_NAME": "ONEWEB-0012",
            "TLE_LINE1": "1 44714U 19074B   26310.12345678  .00012345  00000-0  12345-3 0  9991",
            "TLE_LINE2": "2 44714  87.0500 123.4567 0001234 123.4567 123.4567 13.00000000123451",
            "OBJECT_TYPE": "PAYLOAD",
            "CATEGORY": "Communication",
            "SOURCE": "demo"
        },
        {
            "NORAD_CAT_ID": 44715,
            "OBJECT_NAME": "IRIDIUM-101",
            "TLE_LINE1": "1 44715U 19074C   26310.12345678  .00012345  00000-0  12345-3 0  9991",
            "TLE_LINE2": "2 44715  86.4000 123.4567 0001234 123.4567 123.4567 14.00000000123451",
            "OBJECT_TYPE": "PAYLOAD",
            "CATEGORY": "Communication",
            "SOURCE": "demo"
        },
        # Weather
        {
            "NORAD_CAT_ID": 43013,
            "OBJECT_NAME": "NOAA-20",
            "TLE_LINE1": "1 43013U 17073A   26310.12345678  .00012345  00000-0  12345-3 0  9991",
            "TLE_LINE2": "2 43013  98.7000 123.4567 0001234 123.4567 123.4567 14.10000000123451",
            "OBJECT_TYPE": "PAYLOAD",
            "CATEGORY": "Weather",
            "SOURCE": "demo"
        },
        # Scientific
        {
            "NORAD_CAT_ID": 20580,
            "OBJECT_NAME": "HUBBLE",
            "TLE_LINE1": "1 20580U 90037B   26310.12345678  .00012345  00000-0  12345-3 0  9991",
            "TLE_LINE2": "2 20580  28.5000 123.4567 0001234 123.4567 123.4567 15.00000000123451",
            "OBJECT_TYPE": "PAYLOAD",
            "CATEGORY": "Scientific",
            "SOURCE": "demo"
        },
    ]

    # Pre-calculated deterministic debris (no random generation in runtime)
    debris_records = [
        {"norad": 88172, "name": "DEBRIS-88172", "inc": "52.4000", "raan": "112.5000", "mm": "15.20000000"},
        {"norad": 44210, "name": "COSMOS-DEB-4421", "inc": "74.0000", "raan": "045.1000", "mm": "14.80000000"},
        {"norad": 72401, "name": "DEBRIS-72401", "inc": "82.5000", "raan": "210.0000", "mm": "13.90000000"},
        {"norad": 55102, "name": "DEBRIS-55102", "inc": "98.2000", "raan": "315.4000", "mm": "14.50000000"},
        {"norad": 90012, "name": "DEBRIS-90012", "inc": "45.0000", "raan": "080.2000", "mm": "15.05000000"},
    ]
    for d in debris_records:
        fixtures.append({
            "NORAD_CAT_ID": d["norad"],
            "OBJECT_NAME": d["name"],
            "TLE_LINE1": f"1 {d['norad']}U 09005A   26310.12345678  .00012345  00000-0  12345-3 0  9991",
            "TLE_LINE2": f"2 {d['norad']} {d['inc']} {d['raan']} 0001234 123.4567 123.4567 {d['mm']}",
            "OBJECT_TYPE": "DEBRIS",
            "CATEGORY": "Debris",
            "SOURCE": "demo"
        })

    return fixtures

