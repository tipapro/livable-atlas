import argparse
import shutil
from pathlib import Path

import numpy as np

from .grid import load_grid
from .pack import write
from .report import main_report
from .sources import SOURCES

ROOT = Path(__file__).parents[2]
CACHE = ROOT / "pipeline/.cache"
OUT = ROOT / "web/public/data"


def merge_sources(paths: list[Path]) -> dict[str, dict[str, np.ndarray]]:
    by_source, owner = {}, {}
    for path in paths:
        with np.load(path) as npz:
            by_source[path.stem] = {k: npz[k] for k in npz.files}
        for layer_id in by_source[path.stem]:
            if layer_id in owner:
                raise ValueError(f"layer {layer_id} provided by {owner[layer_id]} and {path.stem}; delete pipeline/.cache/layers/{path.stem}.npz")
            owner[layer_id] = path.stem
    return {s: layers for s, layers in by_source.items() if layers}  # manual sources (acag) save an empty npz


def select_npz(layers_dir: Path) -> list[Path]:
    paths = sorted(layers_dir.glob("*.npz"))
    for path in paths:
        if path.stem not in SOURCES:
            print(f"ignoring stale pipeline/.cache/layers/{path.stem}.npz")
    return [p for p in paths if p.stem in SOURCES]


TABLES = {"countries": "countries.json", "geonames": "cities.json"}  # source -> JSON copied next to the packed layers


def copy_tables(by_source: dict, layers_dir: Path, out: Path, previous: Path | None = None) -> None:
    for source, file in TABLES.items():
        if source not in by_source:
            continue
        if (layers_dir / file).exists():
            shutil.copy(layers_dir / file, out / file)
        else:  # a stale .npz from before this table existed: keep the published copy, if any
            print(f"warning: {file} is missing (stale {source}.npz); rebuild with `atlas build {source}`")
            if previous and (previous / file).exists():
                shutil.copy(previous / file, out / file)


def build(names: list[str]) -> None:
    layers_dir = CACHE / "layers"
    layers_dir.mkdir(parents=True, exist_ok=True)
    grid = load_grid(CACHE / "raw")
    failed = []
    for name in names:
        try:
            np.savez(layers_dir / f"{name}.npz", **SOURCES[name].build(grid, CACHE / "raw"))
        except Exception as e:  # spec §10: one failing source (network, bad file) must not stop the others
            print(f"{name}: {e}")
            failed.append(name)
    by_source = merge_sources(select_npz(layers_dir))
    # Pack into a staging folder and swap it in only when complete, so a failure never leaves new layers under an old manifest.
    staging, old = OUT.with_name(OUT.name + ".new"), OUT.with_name(OUT.name + ".old")
    shutil.rmtree(staging, ignore_errors=True)
    try:
        manifest = write(grid, by_source, {s: SOURCES[s].INFO for s in by_source}, staging)
        copy_tables(by_source, layers_dir, staging, OUT)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    shutil.rmtree(old, ignore_errors=True)
    if OUT.exists():
        OUT.rename(old)
    staging.rename(OUT)
    shutil.rmtree(old, ignore_errors=True)
    print(f"wrote {OUT}: {manifest['cellCount']} cells, {len(manifest['layers'])} layers, {len(manifest['monthly'])} monthly")
    if failed:
        raise SystemExit(f"failed: {', '.join(failed)} (their previous layers, if any, were packed again)")


def main() -> None:
    parser = argparse.ArgumentParser(prog="atlas")
    sub = parser.add_subparsers(dest="command", required=True)
    b = sub.add_parser("build", help="build sources and pack web/public/data")
    b.add_argument("sources", nargs="*", choices=list(SOURCES))
    sub.add_parser("pack", help="repack the cached layers into web/public/data without rebuilding a source")
    sub.add_parser("report", help="print packed values at reference places")
    args = parser.parse_args()
    if args.command == "report":
        main_report(OUT)
    elif args.command == "pack":
        build([])
    else:
        build(args.sources or list(SOURCES))
