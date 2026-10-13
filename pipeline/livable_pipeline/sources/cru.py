import gzip
from pathlib import Path

import numpy as np
from scipy.ndimage import distance_transform_edt

from ..derive import MONTH_DAYS, daylength_hours
from ..download import fetch
from ..grid import LAT, RES, H, W, Grid

URL = "https://crudata.uea.ac.uk/cru/data/hrg/tmc/grid_10min_{var}.dat.gz"
INFO = {
    "name": "CRU CL 2.0 10′ climatology, 1961–1990 (sunshine, wet days)",
    "url": "https://crudata.uea.ac.uk/cru/data/hrg/tmc/",
    "license": "Free download, no explicit licence; cite the paper",
    "citation": "New, M., Lister, D., Hulme, M., Makin, I. (2002). A high-resolution data set of surface climate over global land areas. Climate Research 21, 1–25.",
    "period": "1961–1990 climatology (CRU CL 2.0, published 2002)",
    "retrieved": "2026-10-13",
}


def read_points(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Rows of `lat lon v1..v12` (10′ cell centres, land only)."""
    with gzip.open(path, "rt") as f:
        a = np.loadtxt(f, dtype=np.float64, ndmin=2)
    assert a.ndim == 2 and a.shape[1] == 14, f"{path}: unexpected shape {a.shape}"
    lat, lon = a[:, 0], a[:, 1]
    assert ((lat > -90) & (lat <= 90) & (lon >= -180) & (lon < 180)).all() and (a[:, 2:] >= 0).all(), f"{path}: coordinates or values out of range"
    return lat, lon, a[:, 2:]


def to_grid(lat: np.ndarray, lon: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Mean of the 10′ points inside each 0.25° cell, per month; NaN where no point falls."""
    flat = np.floor((90 - lat) / RES).astype(int) * W + np.floor((lon + 180) / RES).astype(int)
    n = np.bincount(flat, minlength=H * W)
    with np.errstate(invalid="ignore"):
        return np.stack([np.bincount(flat, v[:, m], H * W) / n for m in range(12)]).reshape(12, H, W)


def fill_near(v: np.ndarray, max_cells: float) -> np.ndarray:
    """Copy the nearest value into NaN cells at most `max_cells` away (CRU's land mask misses some coasts and islands)."""
    dist, idx = distance_transform_edt(np.isnan(v), return_indices=True)
    return np.where(dist <= max_cells, v[tuple(idx)], np.nan)


def cru_layers(sunp: np.ndarray, rd0: np.ndarray, land: np.ndarray, lat: np.ndarray) -> dict[str, np.ndarray]:
    hours = (sunp / 100 * (daylength_hours(lat) * MONTH_DAYS[:, None])[:, :, None]).sum(axis=0)
    winter = np.where(lat[:, None] >= 0, sunp[[11, 0, 1]].mean(axis=0), sunp[[5, 6, 7]].mean(axis=0))  # Dec–Feb north, Jun–Aug south
    out = {"sunshine": fill_near(hours, 2), "wet_days": fill_near(rd0.sum(axis=0), 2), "cold_sun": fill_near(winter, 2)}
    return {k: np.where(land, v, np.nan).astype(np.float32) for k, v in out.items()}


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    sunp, rd0 = (to_grid(*read_points(fetch(URL.format(var=v), raw_dir / "cru" / f"grid_10min_{v}.dat.gz"))) for v in ("sunp", "rd0"))
    return cru_layers(sunp, rd0, grid.land, LAT)
