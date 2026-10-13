from pathlib import Path

import numpy as np
import xarray

from ..derive import dewpoint, seasonal_layers
from ..download import fetch
from ..grid import Grid, coarsen_mean

VARS = ("tmax", "tmin", "ppt", "vap", "ws")
URL = "http://thredds.northwestknowledge.net:8080/thredds/fileServer/TERRACLIMATE_ALL/climatology/TerraClimate_19912020_{var}.nc"
INFO = {
    "name": "TerraClimate 1991–2020 monthly normals",
    "url": "https://www.climatologylab.org/terraclimate.html",
    "license": "CC0 1.0",
    "citation": "Abatzoglou, J.T., Dobrowski, S.Z., Parks, S.A., Hegewisch, K.C. (2018). TerraClimate, a high-resolution global dataset of monthly climate and climatic water balance from 1958–2015. Scientific Data 5, 170191.",
    "period": "1991–2020 monthly normals",
    "retrieved": "2026-10-12",
}


def climate_layers(m: dict[str, np.ndarray], land: np.ndarray) -> dict[str, np.ndarray]:
    tdew = dewpoint(m["vap"])
    out = {
        **seasonal_layers(m["tmax"], m["tmin"], tdew),
        "precip_annual": m["ppt"].sum(axis=0),
        "wind_mean": m["ws"].mean(axis=0),
        "monthly/tmax": m["tmax"],
        "monthly/tmin": m["tmin"],
        "monthly/tdew": tdew,
        "monthly/prec": m["ppt"],
    }
    return {k: np.where(land, v, np.nan).astype(np.float32) for k, v in out.items()}


def _regrid(path: Path) -> np.ndarray:
    with xarray.open_dataset(path, decode_times=False) as ds:
        (var,) = [v for v in ds.data_vars if ds[v].ndim == 3]
        da = ds[var]
        assert da.shape == (12, 4320, 8640), da.shape
        assert ds.lat[0] > ds.lat[-1] and ds.lon[0] < ds.lon[-1], "unexpected axis order"
        return np.stack([coarsen_mean(da.isel(time=i).values, 6) for i in range(12)])  # one month at a time: a whole variable is ~4 GB


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    m = {v: _regrid(fetch(URL.format(var=v), raw_dir / "terraclimate" / f"TerraClimate_19912020_{v}.nc")) for v in VARS}
    return climate_layers(m, grid.land)
