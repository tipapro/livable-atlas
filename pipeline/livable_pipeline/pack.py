import gzip
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from .grid import H, RES, W, Grid


@dataclass
class Spec:
    dtype: str
    scale: float
    offset: float
    unit: str


_TEMP = Spec("uint8", 0.5, -60, "°C")
SPECS: dict[str, Spec] = {
    **{k: _TEMP for k in ("warm_tmax", "warm_tmin", "cold_tmax", "cold_tmin", "warm_tdew")},
    **{f"monthly/{k}": _TEMP for k in ("tmax", "tmin", "tdew")},
    "seasonality": Spec("uint8", 0.25, 0, "°C"),
    "frost_months": Spec("uint8", 1, 0, "mo"),
    "monthly/prec": Spec("uint16", 1, 0, "mm"),
    "precip_annual": Spec("uint16", 1, 0, "mm"),
    "sunshine": Spec("uint16", 1, 0, "h"),
    "wet_days": Spec("uint16", 1, 0, "days"),
    "cold_sun": Spec("uint8", 0.5, 0, "%"),
    "wind_mean": Spec("uint8", 0.1, 0, "m/s"),
    "coast_dist": Spec("uint16", 1, 0, "km"),
    "ruggedness": Spec("uint16", 1, 0, "m"),
    "elevation": Spec("uint16", 1, -500, "m"),
    "cyclone_freq": Spec("uint16", 0.01, 0, "/decade"),
    "seismic_pga": Spec("uint16", 0.001, 0, "g"),
    "wildfire": Spec("uint16", 0.01, 0, "%"),
    "flood": Spec("uint8", 0.5, 0, "%"),
    "pm25": Spec("uint16", 0.1, 0, "µg/m³"),
    "travel_city": Spec("uint16", 1, 0, "min"),
    "dist_bigcity": Spec("uint16", 1, 0, "km"),
    "dist_airport": Spec("uint16", 1, 0, "km"),
    # shortcut: densities < 0.5/km² store as 0 (score uses log10(max(v, 1e-6))); use a finer scale if low-density tuning matters.
    "pop_density": Spec("uint16", 1, 0, "people/km²"),
    "gdp_pc": Spec("uint16", 10, 0, "$"),
    "hdi": Spec("uint16", 0.001, 0, "index"),
    "homicide": Spec("uint16", 0.01, 0, "/100k"),
    "price_level": Spec("uint16", 0.001, 0, "ratio"),
    "country": Spec("uint8", 1, 0, "index"),
}


def _scaled(values: np.ndarray, spec: Spec) -> tuple[np.ndarray, np.ndarray]:
    nodata = np.isnan(values)
    return nodata, np.round((np.where(nodata, 0, values) - spec.offset) / spec.scale)


def quantize(values: np.ndarray, spec: Spec) -> np.ndarray:
    top = np.iinfo(spec.dtype).max
    nodata, q = _scaled(values, spec)
    return np.where(nodata, top, np.clip(q, 0, top - 1)).astype(spec.dtype)


def _report_clipping(layer_id: str, values: np.ndarray, spec: Spec) -> None:
    top = np.iinfo(spec.dtype).max
    nodata, q = _scaled(values, spec)
    n = int((~nodata & ((q < 0) | (q > top - 1))).sum())
    if n:
        print(f"{layer_id}: {n} values clipped to [{spec.offset:g}, {spec.offset + (top - 1) * spec.scale:g}] {spec.unit}")


def _save(path: Path, q: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(q.astype(q.dtype.newbyteorder("<")).tobytes(), mtime=0))  # mtime=0: reproducible output


def write(grid: Grid, by_source: dict[str, dict[str, np.ndarray]], infos: dict[str, dict], out_dir: Path) -> dict:
    for arrays in by_source.values():
        for layer_id in arrays:
            if layer_id not in SPECS:
                raise KeyError(f"unknown layer id: {layer_id}")
    for stale in [out_dir / "cells.bin", *(p for d in ("layers", "monthly") for p in (out_dir / d).glob("*.bin*"))]:
        stale.unlink(missing_ok=True)
    layers, monthly = {}, {}
    _save(out_dir / "cells.bin.gz", grid.cells.astype("<u4"))
    for source, arrays in by_source.items():
        for layer_id, arr in arrays.items():
            spec = SPECS[layer_id]
            name = layer_id.removeprefix("monthly/")
            if name != layer_id:
                values, table, rel = arr[:, grid.land].T.ravel(), monthly, f"monthly/{name}.bin.gz"  # cell-major
            else:
                values, table, rel = arr[grid.land], layers, f"layers/{name}.bin.gz"
            _report_clipping(layer_id, values, spec)
            q = quantize(values, spec)
            _save(out_dir / rel, q)
            table[name] = {"file": rel, "dtype": spec.dtype, "scale": spec.scale, "offset": spec.offset, "unit": spec.unit, "source": source}
    manifest = {
        "version": 2,
        "grid": {"res": RES, "width": W, "height": H, "west": -180, "north": 90},
        "cellCount": int(grid.land.sum()),
        "layers": layers,
        "monthly": monthly,
        "sources": {s: infos[s] for s in by_source},
        "builtAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest
