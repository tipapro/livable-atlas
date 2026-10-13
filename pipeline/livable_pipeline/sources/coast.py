from pathlib import Path

import geopandas
import numpy as np
import shapely

from ..download import fetch
from ..grid import Grid, land_distance_km

URL = "https://naciscdn.org/naturalearth/10m/physical/ne_10m_coastline.zip"
RIVERS_URL = "https://naciscdn.org/naturalearth/10m/physical/ne_10m_rivers_lake_centerlines.zip"
LAKES_URL = "https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip"
RIVER_MAX_RANK = 4  # Natural Earth scalerank: Danube, Rhine, Seine and bigger; Volga is 3, Oka 7-8 is out
LAKE_MAX_RANK = 2  # Baikal, Great Lakes, Ladoga, Onega, Titicaca
RIVER_FACTOR = 2  # a river or lake counts as half as good as the sea
STEP_DEG = 0.1  # vertex spacing, so nearest-vertex distance is within ~5 km of the line
INFO = {
    "name": "Natural Earth 10m coastline, rivers and lakes",
    "url": "https://www.naturalearthdata.com/",
    "license": "Public domain",
    "citation": "Made with Natural Earth.",
    "period": "Natural Earth 5.0.0 (coastline 5.0.0-pre9, rivers and lakes 5.0.0)",
    "retrieved": "2026-10-12",
}


def _vertices(geoms) -> tuple[np.ndarray, np.ndarray]:
    xy = shapely.get_coordinates(shapely.segmentize(np.asarray(geoms), STEP_DEG))
    return xy[:, 1], xy[:, 0]


def water_points(rivers: geopandas.GeoDataFrame, lakes: geopandas.GeoDataFrame) -> tuple[np.ndarray, np.ndarray]:
    """lat, lon of the major rivers' vertices and the major lakes' shore vertices."""
    lat_r, lon_r = _vertices(rivers.geometry[rivers.scalerank <= RIVER_MAX_RANK])
    lat_l, lon_l = _vertices(lakes.geometry[lakes.scalerank <= LAKE_MAX_RANK])
    return np.concatenate([lat_r, lat_l]), np.concatenate([lon_r, lon_l])


def combine(coast_km: np.ndarray, river_km: np.ndarray) -> np.ndarray:
    return np.minimum(coast_km, RIVER_FACTOR * river_km).astype(np.float32)


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    def read(url: str):
        return geopandas.read_file(f"zip://{fetch(url, raw_dir / 'coast' / url.rsplit('/', 1)[1])}")

    # shortcut: distance to the nearest vertex, not segment (overstates near long straight segments); upgrade to segment distance if coast_dist precision matters
    xy = shapely.get_coordinates(read(URL).geometry)
    coast = land_distance_km(xy[:, 1], xy[:, 0], grid.land)
    river = land_distance_km(*water_points(read(RIVERS_URL), read(LAKES_URL)), grid.land)
    return {"coast_dist": combine(coast, river)}
