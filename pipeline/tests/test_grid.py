import numpy as np
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import box

from livable_pipeline.grid import (
    H, LAT, LON, R_KM, W, Grid, cell_area_km2, coarsen_mean, coarsen_sum, land_mask, nearest_km, read_coarse,
)


def _tif(path, a, west, north, px, py=None, nodata=None):
    with rasterio.open(
        path, "w", driver="GTiff", height=a.shape[0], width=a.shape[1], count=1, dtype=a.dtype,
        crs="EPSG:4326", transform=from_origin(west, north, px, py or px), nodata=nodata,
    ) as dst:
        dst.write(a, 1)


def test_centers():
    assert LAT[0] == 89.875 and LAT[-1] == -89.875
    assert LON[0] == -179.875 and LON[-1] == 179.875


def test_land_mask_box():
    m = land_mask([box(0.1, 0.1, 0.9, 0.9)])
    assert m.sum() == 16
    assert m[356:360, 720:724].all()


def test_land_mask_drops_antarctica():
    assert land_mask([box(10, -70, 20, -65)]).sum() == 0


def test_cells_are_flat_indices():
    land = np.zeros((H, W), bool)
    land[1, 2] = True
    land[0, 5] = True
    assert Grid(land).cells.tolist() == [5, 1442]


def test_nearest_km():
    d = nearest_km(np.array([0.0]), np.array([0.0]), np.array([0.0, 37.77]), np.array([1.0, -122.42]))
    assert abs(d[0] - 111.19) < 0.1
    d2 = nearest_km(np.array([34.05]), np.array([-118.24]), np.array([37.77]), np.array([-122.42]))
    assert abs(d2[0] - 559) < 3  # LA–SF


def test_coarsen_mean_partial_nan():
    a = np.array([[1, np.nan, 5, 5], [3, np.nan, 5, 5]], np.float32)
    assert coarsen_mean(a, 2).tolist() == [[2.0, 5.0]]


def test_coarsen_mean_all_nan_block_is_nan():
    out = coarsen_mean(np.full((2, 2), np.nan, np.float32), 2)
    assert np.isnan(out[0, 0])


def test_coarsen_sum():
    a = np.array([[1, np.nan, np.nan, np.nan], [2, 3, np.nan, np.nan]], np.float32)
    out = coarsen_sum(a, 2)
    assert out[0, 0] == 6 and np.isnan(out[0, 1])


def test_cell_area_km2():
    a = cell_area_km2()
    assert abs(a.sum() * W / (4 * np.pi * R_KM**2) - 1) < 1e-9 and a[0] < a[359] and a[359] == a[360]


def test_read_coarse_places_partial_raster(tmp_path):
    a = np.arange(16, dtype=np.float32).reshape(4, 4)
    a[0, 0] = -1  # k=2, starts at cell (row 2, col 3)
    _tif(tmp_path / "a.tif", a, west=-180 + 3 * 0.25, north=90 - 2 * 0.25, px=0.125, nodata=-1)
    out = read_coarse(str(tmp_path / "a.tif"))
    assert out.shape == (H, W) and out.dtype == np.float32
    assert out[2, 3] == np.float32((1 + 4 + 5) / 3) and out[3, 4] == np.float32((10 + 11 + 14 + 15) / 4)
    assert np.isnan(out[0, 0]) and np.isnan(out[2, 2])


def test_read_coarse_snaps_and_drops_leading_pixels(tmp_path):
    a = np.ones((2, 3), np.float32)
    a[:, 0] = 100  # first column lies west of a cell boundary
    _tif(tmp_path / "b.tif", a, west=-180 + 0.125 + 0.01 * 0.125, north=90 - 0.2 * 0.125, px=0.125, py=0.12499)
    out = read_coarse(str(tmp_path / "b.tif"))
    assert out[0, 1] == 1 and np.isnan(out[0, 0])


def test_read_coarse_drops_pixels_west_of_the_grid(tmp_path):
    a = np.ones((2, 3), np.float32)
    a[:, 0] = 100  # GHSL-style padding column starting at -180 - 1 px
    _tif(tmp_path / "e.tif", a, west=-180 - 0.125, north=90, px=0.125)
    out = read_coarse(str(tmp_path / "e.tif"))
    assert out[0, 0] == 1 and np.isnan(out[0, 1])


def test_read_coarse_prep_and_sum(tmp_path):
    _tif(tmp_path / "c.tif", np.ones((2, 2), np.float32), west=-180, north=90, px=0.125)
    out = read_coarse(str(tmp_path / "c.tif"), prep=lambda x: x * 2, reduce=coarsen_sum)
    assert out[0, 0] == 8


def test_read_coarse_float64_nodata_is_masked_before_cast(tmp_path):
    a = np.array([[1.0, 1.797e308], [3.0, 1.797e308]])  # GEM-style nodata overflows float32
    _tif(tmp_path / "d.tif", a, west=-180, north=90, px=0.125, nodata=1.797e308)
    assert read_coarse(str(tmp_path / "d.tif"))[0, 0] == 2
