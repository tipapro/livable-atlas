import math

import numpy as np

from livable_pipeline.grid import H, W, Grid
from livable_pipeline.pack import write
from livable_pipeline.report import read_values
from livable_pipeline.sources.synthetic import INFO


def test_read_values_roundtrip(tmp_path):
    land = np.zeros((H, W), bool)
    land[10, 20] = land[11, 5] = True
    warm = np.full((H, W), np.nan, np.float32)
    warm[10, 20], warm[11, 5] = 25.0, 30.0
    write(Grid(land), {"synthetic": {"warm_tmax": warm, "elevation": warm * 4}}, {"synthetic": INFO}, tmp_path)
    places = [("a", 90 - 10.5 * 0.25, -180 + 20.5 * 0.25), ("b", 90 - 11.5 * 0.25, -180 + 5.5 * 0.25), ("sea", 0.0, 0.0)]
    v = read_values(tmp_path, places)
    assert abs(v["a"]["warm_tmax"] - 25.0) <= 0.25 and abs(v["b"]["warm_tmax"] - 30.0) <= 0.25
    assert v["b"]["elevation"] == 120  # integer scale + negative offset must not overflow uint16
    assert math.isnan(v["sea"]["warm_tmax"])
