from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import geopandas
import numpy as np
import rasterio
import rasterio.features
import rasterio.transform
from scipy.spatial import cKDTree

from .download import fetch

RES = 0.25
W = 1440
H = 720
LAT = 90 - (np.arange(H) + 0.5) * RES
LON = -180 + (np.arange(W) + 0.5) * RES
LAND_URL = "https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip"
R_KM = 6371.0088


@dataclass
class Grid:
    land: np.ndarray  # bool (H, W)

    @property
    def cells(self) -> np.ndarray:
        return np.flatnonzero(self.land).astype(np.uint32)


def land_mask(geoms) -> np.ndarray:
    m = rasterio.features.rasterize(
        geoms, out_shape=(H, W), transform=rasterio.transform.from_origin(-180, 90, RES, RES), all_touched=True
    ).astype(bool)
    m[600:] = False  # lat < -60: Antarctica is out of scope
    return m


def load_grid(raw_dir: Path) -> Grid:
    path = fetch(LAND_URL, raw_dir / "naturalearth/ne_10m_land.zip")
    return Grid(land_mask(geopandas.read_file(f"zip://{path}").geometry))


def coarsen_mean(a: np.ndarray, k: int) -> np.ndarray:
    """k×k block means ignoring NaN; blocks with no data stay NaN."""
    h, w = a.shape[0] // k, a.shape[1] // k
    b = a.reshape(h, k, w, k)
    n = (~np.isnan(b)).sum(axis=(1, 3))
    return np.divide(np.nansum(b, axis=(1, 3)), n, out=np.full((h, w), np.nan), where=n > 0).astype(np.float32)


def coarsen_sum(a: np.ndarray, k: int) -> np.ndarray:
    """k×k block sums ignoring NaN; blocks with no data stay NaN."""
    h, w = a.shape[0] // k, a.shape[1] // k
    b = a.reshape(h, k, w, k)
    return np.where(np.isnan(b).all(axis=(1, 3)), np.nan, np.nansum(b, axis=(1, 3))).astype(np.float32)


def cell_area_km2() -> np.ndarray:
    """Area of one 0.25° cell in each row, float64 (H,)."""
    north = np.radians(90 - np.arange(H) * RES)
    south = np.radians(90 - (np.arange(H) + 1) * RES)
    return R_KM**2 * np.radians(RES) * (np.sin(north) - np.sin(south))


def _aligned(origin: float, step: float, k: int) -> tuple[int, int]:
    """(pixels to drop before the first cell boundary, first cell index) for a raster edge `origin` px from the grid edge."""
    px = origin / step
    # shortcut: sub-pixel misregistration (<0.25 px) is snapped, not resampled; upgrade if a source needs sub-pixel accuracy.
    assert abs(px - round(px)) <= 0.25, f"origin off the pixel grid by {px - round(px):.2f} px"
    px = round(px)
    lead = -px % k  # also drops pixels that start before the grid origin (px < 0)
    assert px + lead >= 0, "raster extends beyond the grid origin by more than a cell"
    return lead, (px + lead) // k


def read_coarse(
    path: str,
    prep: Callable[[np.ndarray], np.ndarray] | None = None,
    reduce: Callable[[np.ndarray, int], np.ndarray] = coarsen_mean,
    band: int = 1,
) -> np.ndarray:
    """Regrid a global EPSG:4326 raster onto the (H, W) grid in row strips; cells it does not cover are NaN."""
    out = np.full((H, W), np.nan, np.float32)
    with rasterio.open(path) as src:
        assert src.crs.to_epsg() == 4326, f"{path}: not EPSG:4326"
        px, py = src.transform.a, -src.transform.e
        k = round(RES / px)
        assert k == round(RES / py) and k > 0, f"{path}: pixel {px}x{py} does not divide {RES}"
        assert all(abs(p - RES / k) <= 1e-3 * RES / k for p in (px, py)), f"{path}: pixel {px}x{py} is not {RES}/{k}"
        lead_x, col0 = _aligned(src.transform.c + 180, px, k)
        lead_y, row0 = _aligned(90 - src.transform.f, py, k)
        nx = min((src.width - lead_x) // k, W - col0)
        ny = min((src.height - lead_y) // k, H - row0)
        step = max(1, 4_000_000 // (k * k * max(nx, 1)))  # block rows per strip, ~4M pixels
        for b in range(0, ny, step):
            n = min(step, ny - b)
            raw = src.read(band, window=((lead_y + b * k, lead_y + (b + n) * k), (lead_x, lead_x + nx * k)), masked=True)
            # fill nodata in the native dtype first: float64 nodata like 1.797e308 would become inf if cast to float32
            strip = np.where(np.ma.getmaskarray(raw), np.nan, raw.data).astype(np.float32)
            out[row0 + b : row0 + b + n, col0 : col0 + nx] = reduce(prep(strip) if prep else strip, k)
    return out


def unit_vectors(lat, lon) -> np.ndarray:
    lat, lon = np.radians(lat), np.radians(lon)
    return np.column_stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])


def nearest_km(target_lat, target_lon, query_lat, query_lon) -> np.ndarray:
    chord, _ = cKDTree(unit_vectors(target_lat, target_lon)).query(unit_vectors(query_lat, query_lon))
    return 2 * R_KM * np.arcsin(chord / 2)


def land_distance_km(pt_lat: np.ndarray, pt_lon: np.ndarray, land: np.ndarray) -> np.ndarray:
    """Great-circle distance from each land cell centre to the nearest point; off-land cells are NaN."""
    out = np.full(land.shape, np.nan, np.float32)
    ii, jj = np.nonzero(land)
    out[ii, jj] = nearest_km(pt_lat, pt_lon, LAT[ii], LON[jj])
    return out
