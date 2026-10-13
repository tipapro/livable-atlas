from pathlib import Path

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from ..download import fetch
from ..grid import LAT, LON, R_KM, Grid, unit_vectors

URL = "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.since1980.list.v04r01.csv"
INFO = {
    "name": "IBTrACS v04r01 (since 1980)",
    "url": "https://www.ncei.noaa.gov/products/international-best-track-archive",
    "license": "Public domain (NOAA NCEI)",
    "citation": "Knapp, K.R., Kruk, M.C., Levinson, D.H., Diamond, H.J., Neumann, C.J. (2010). The International Best Track Archive for Climate Stewardship (IBTrACS). Bulletin of the American Meteorological Society 91, 363–376.",
    "period": "storm seasons 1980–2025 (v04r01)",
    "retrieved": "2026-10-12",
}
SEASONS = range(1980, 2026)
MIN_KT = 64
RADIUS_KM = 150
CHORD = 2 * np.sin(RADIUS_KM / (2 * R_KM))


def read_tracks(csv_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    cols = ["SID", "SEASON", "LAT", "LON", "WMO_WIND", "USA_WIND"]
    df = pd.read_csv(csv_path, usecols=cols, skiprows=[1], keep_default_na=False, dtype=str)
    num = {c: pd.to_numeric(df[c], errors="coerce") for c in cols[1:]}  # blank → NaN
    keep = num["SEASON"].isin(SEASONS).to_numpy()
    wind = num["USA_WIND"].fillna(num["WMO_WIND"]).to_numpy(np.float64)
    return df["SID"].to_numpy()[keep], num["LAT"].to_numpy()[keep], num["LON"].to_numpy()[keep], wind[keep]


def cyclone_freq(sid, lat, lon, wind_kt, land: np.ndarray, years: int) -> np.ndarray:
    strong = wind_kt >= MIN_KT
    sid, xyz = sid[strong], unit_vectors(lat[strong], lon[strong])
    ii, jj = np.nonzero(land)
    tree = cKDTree(unit_vectors(LAT[ii], LON[jj]))
    count = np.zeros(len(ii), np.int32)
    order = np.argsort(sid, kind="stable")
    for idx in np.split(order, np.flatnonzero(sid[order][1:] != sid[order][:-1]) + 1) if len(sid) else []:
        hit = np.unique(np.concatenate(tree.query_ball_point(xyz[idx], CHORD)).astype(np.intp))  # one increment per storm
        count[hit] += 1
    out = np.full(land.shape, np.nan, np.float32)
    out[ii, jj] = count * 10 / years
    return out


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    path = fetch(URL, raw_dir / "ibtracs" / "ibtracs.since1980.list.v04r01.csv")
    return {"cyclone_freq": cyclone_freq(*read_tracks(path), grid.land, len(SEASONS))}
