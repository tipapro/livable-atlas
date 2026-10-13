import gzip
import json
from pathlib import Path

import numpy as np

from .grid import RES, W

PLACES = [
    ("San Diego", 32.7157, -117.1611),
    ("Los Angeles", 34.0522, -118.2437),
    ("San Francisco", 37.7749, -122.4194),
    ("Lisbon", 38.7223, -9.1393),
    ("Perth", -31.9523, 115.8613),
    ("Novosibirsk", 55.0084, 82.9357),
    ("Vladivostok", 43.1155, 131.8855),
    ("Singapore", 1.3521, 103.8198),
    ("Death Valley", 36.5054, -117.0794),
    ("Moscow", 55.7558, 37.6173),
    ("Nizhny Novgorod", 56.3269, 44.0059),
    ("Samara", 53.1959, 50.1002),
    ("Volgograd", 48.7080, 44.5133),
    ("Vienna", 48.2082, 16.3738),
    ("Budapest", 47.4979, 19.0402),
    ("Irkutsk", 52.2870, 104.3050),
    ("Chicago", 41.8781, -87.6298),
    ("Seattle", 47.6062, -122.3321),
    ("Denver", 39.7392, -104.9903),
    ("Yakutsk", 62.0355, 129.6755),
    ("Tver", 56.86, 35.90),
    ("Vladimir", 56.13, 40.41),
    ("London", 51.51, -0.13),
    ("Lagos", 6.52, 3.38),
]


def read_values(out_dir: Path, places) -> dict[str, dict[str, float]]:
    """Decode the packed output at each place; NaN for nodata or a place outside the land cells."""
    manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    def read(file: str, dtype) -> np.ndarray:
        return np.frombuffer(gzip.decompress((out_dir / file).read_bytes()), np.dtype(dtype).newbyteorder("<"))

    cells = read("cells.bin.gz", "u4")
    result = {name: {} for name, _, _ in places}
    flat = [int((90 - lat) // RES) * W + int((lon + 180) // RES) for _, lat, lon in places]
    idx = np.minimum(np.searchsorted(cells, flat), len(cells) - 1)
    on_land = cells[idx] == flat
    for layer_id, meta in manifest["layers"].items():
        q = read(meta["file"], meta["dtype"])
        top = np.iinfo(meta["dtype"]).max
        for (name, _, _), i, ok in zip(places, idx, on_land):
            result[name][layer_id] = meta["offset"] + float(q[i]) * meta["scale"] if ok and q[i] != top else float("nan")
    return result


def main_report(out_dir: Path) -> None:
    values = read_values(out_dir, PLACES)
    names = [p[0] for p in PLACES]
    print("| layer | " + " | ".join(names) + " |")
    print("|---|" + "---:|" * len(names))
    for layer_id in next(iter(values.values())):
        print(f"| {layer_id} | " + " | ".join(f"{values[n][layer_id]:.3g}" for n in names) + " |")
