import zipfile

import numpy as np
import pytest
import xarray

from livable_pipeline.grid import H, W, cell_area_km2
from livable_pipeline.grid import Grid
from livable_pipeline.sources.gfed import annual_burned_km2, build, extract_months, wildfire_layer


def _write_month(path, south_value):
    total = np.zeros((1, H, W))
    total[0, 0, :] = south_value  # lat index 0 = southernmost row
    lat = -89.875 + 0.25 * np.arange(H)
    lon = -179.875 + 0.25 * np.arange(W)
    xarray.Dataset({"Total": (("time", "lat", "lon"), total)}, coords={"time": [0], "lat": lat, "lon": lon}).to_netcdf(path, engine="scipy")


def test_wildfire_percent():
    land = np.zeros((H, W), bool)
    land[0, 0] = land[360, 0] = land[360, 1] = True
    km2 = np.zeros((H, W), np.float32)
    km2[360, 0] = 0.05 * cell_area_km2()[360]
    km2[360, 1] = np.nan
    out = wildfire_layer(km2, land)["wildfire"]
    assert abs(out[360, 0] - 5) < 1e-3 and out[0, 0] == 0 and np.isnan(out[360, 1]) and np.isnan(out[1, 1])


# netCDF4 1.7.4 warns about the numpy 2.5 ABI on import under pytest, and DeprecationWarning on write: fixtures are written with scipy.
@pytest.mark.filterwarnings("ignore:numpy.ndarray size changed:RuntimeWarning")
def test_annual_burned_km2_flips_and_averages_years(tmp_path):
    paths = [tmp_path / "BA200101.nc", tmp_path / "BA200201.nc"]
    for p in paths:
        _write_month(p, 4.0)
    out = annual_burned_km2(paths)
    assert out.shape == (H, W) and out.dtype == np.float32
    assert (out[H - 1] == 4).all() and (out[0] == 0).all()  # 8 km² over 2 years, south row is last


def test_extract_months_only_matching_members_flat(tmp_path):
    src, raw = tmp_path / "BA.zip", tmp_path / "out"
    raw.mkdir()
    with zipfile.ZipFile(src, "w") as z:
        z.writestr("BA200101.nc", b"a")
        z.writestr("sub/../BA202012.nc", b"b")  # path ignored, basename used
        z.writestr("BA200001.nc", b"c")  # year outside YEARS
        z.writestr("BA202101.nc", b"d")
        z.writestr("renamedefo.py", b"print(1)")
    got = extract_months(src, raw)
    assert [p.name for p in got] == ["BA200101.nc", "BA202012.nc"]
    assert all(p.parent == raw for p in got) and sorted(p.name for p in raw.iterdir()) == ["BA200101.nc", "BA202012.nc"]


def test_build_rejects_an_incomplete_archive(tmp_path):
    # A truncated download must not silently average fewer months (or none) into the wildfire layer.
    (tmp_path / "gfed").mkdir()
    with zipfile.ZipFile(tmp_path / "gfed/BA.zip", "w") as z:
        z.writestr("BA200101.nc", b"")
    with pytest.raises(AssertionError, match="1 monthly files, expected 240"):
        build(Grid(np.zeros((H, W), bool)), tmp_path)
