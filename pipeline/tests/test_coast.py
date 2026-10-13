import geopandas
import numpy as np
import shapely

from livable_pipeline.grid import H, W, land_distance_km
from livable_pipeline.sources.coast import combine, water_points


def test_land_distance_km():
    land = np.zeros((H, W), bool); land[359, 720] = land[0, 0] = True  # (0.125°N, 0.125°E) and a polar cell
    d = land_distance_km(np.array([0.125]), np.array([1.125]), land)
    assert abs(d[359, 720] - 111.2) < 0.5 and d[0, 0] > 9000 and np.isnan(d[100, 100])
    assert d.dtype == np.float32


def test_combine():
    coast = np.array([10.0, 100.0, 300.0, np.nan], np.float32)
    river = np.array([50.0, 10.0, np.inf, np.nan], np.float32)
    assert combine(coast, river).tolist()[:3] == [10.0, 20.0, 300.0] and np.isnan(combine(coast, river)[3])


def test_water_points_filters_rank_and_densifies():
    rivers = geopandas.GeoDataFrame({"scalerank": [3, 9]}, geometry=[shapely.LineString([(0, 0), (1, 0)]), shapely.LineString([(50, 50), (51, 50)])])
    lakes = geopandas.GeoDataFrame({"scalerank": [0, 7]}, geometry=[shapely.box(10, 10, 11, 11), shapely.box(60, 60, 61, 61)])
    lat, lon = water_points(rivers, lakes)
    assert lon.max() <= 11 and lat.max() <= 11          # rank-9 river and rank-7 lake dropped
    assert ((lat == 0) & (lon <= 1)).sum() >= 11          # 1° line densified to ≤ 0.1° steps
    assert np.diff(np.sort(lon[lat == 0])).max() <= 0.1 + 1e-9
