import gzip
import json
from types import SimpleNamespace

import numpy as np
import pytest

from livable_pipeline import cli, pack
from livable_pipeline.cli import merge_sources
from livable_pipeline.grid import H, W, Grid
from livable_pipeline.pack import SPECS, Spec, quantize, write
from livable_pipeline.sources.synthetic import INFO


def test_quantize_roundtrip_and_nodata():
    s = Spec("uint8", 0.5, -60, "°C")
    q = quantize(np.array([-60.0, 21.3, np.nan, 500.0]), s)
    assert q.dtype == np.uint8 and q[2] == 255 and q[3] == 254  # clipped to max−1
    assert abs((-60 + q[1] * 0.5) - 21.3) <= 0.25


def gunzip(path):
    return gzip.decompress(path.read_bytes())


def test_write_contract(tmp_path):
    land = np.zeros((H, W), bool)
    land[10, 20] = land[11, 5] = True
    g = Grid(land)
    warm = np.full((H, W), np.nan, np.float32)
    warm[10, 20] = 25
    warm[11, 5] = 30
    mon = np.zeros((12, H, W), np.float32)
    mon[:, 10, 20] = np.arange(12)
    m = write(g, {"synthetic": {"warm_tmax": warm, "monthly/tmax": mon}}, {"synthetic": INFO}, tmp_path)
    assert m["cellCount"] == 2 and m["layers"]["warm_tmax"]["file"] == "layers/warm_tmax.bin.gz"
    assert m["layers"]["warm_tmax"]["source"] == "synthetic" and m["sources"]["synthetic"] == INFO
    assert np.frombuffer(gunzip(tmp_path / "cells.bin.gz"), "<u4").tolist() == [10 * 1440 + 20, 11 * 1440 + 5]
    assert np.frombuffer(gunzip(tmp_path / "layers/warm_tmax.bin.gz"), "u1").tolist() == [170, 180]
    mt = np.frombuffer(gunzip(tmp_path / "monthly/tmax.bin.gz"), "u1")
    assert mt.size == 24 and mt[1] == 122  # cell 0, February: (1+60)/0.5
    assert json.loads((tmp_path / "manifest.json").read_text())["version"] == 2


def test_duplicate_layer_rejected(tmp_path):
    a, b = tmp_path / "a.npz", tmp_path / "b.npz"
    np.savez(a, warm_tmax=np.zeros((2, 2), np.float32))
    np.savez(b, warm_tmax=np.ones((2, 2), np.float32))
    with pytest.raises(ValueError, match=r"warm_tmax.*a.*b"):
        merge_sources([a, b])


def test_unknown_layer_rejected(tmp_path):
    g = Grid(np.ones((H, W), bool))
    with pytest.raises(KeyError):
        write(g, {"x": {"nope": np.zeros((H, W), np.float32)}}, {"x": {}}, tmp_path)


def test_bad_layer_id_writes_nothing(tmp_path):
    g = Grid(np.ones((H, W), bool))
    arrays = {"warm_tmax": np.zeros((H, W), np.float32), "nope": np.zeros((H, W), np.float32)}
    with pytest.raises(KeyError, match="nope"):
        write(g, {"x": arrays}, {"x": {}}, tmp_path)
    assert list(tmp_path.iterdir()) == []


def tiny_grid():
    land = np.zeros((H, W), bool)
    land[10, 20] = land[11, 5] = True
    return Grid(land)


def tiny_layer(value=25.0):
    arr = np.full((H, W), np.nan, np.float32)
    arr[10, 20] = value
    return arr


def test_write_is_deterministic(tmp_path):
    for d in ("a", "b"):
        write(tiny_grid(), {"s": {"warm_tmax": tiny_layer()}}, {"s": INFO}, tmp_path / d)
    assert (tmp_path / "a/layers/warm_tmax.bin.gz").read_bytes() == (tmp_path / "b/layers/warm_tmax.bin.gz").read_bytes()


def test_write_removes_stale_bins(tmp_path):
    for d in ("layers", "monthly"):
        (tmp_path / d).mkdir()
        (tmp_path / d / "old.bin").write_bytes(b"x")
    (tmp_path / "layers/old.bin.gz").write_bytes(b"x")
    (tmp_path / "cells.bin").write_bytes(b"x")
    (tmp_path / "layers/keep.txt").write_text("x")
    write(tiny_grid(), {"s": {"warm_tmax": tiny_layer()}}, {"s": INFO}, tmp_path)
    gone = ("layers/old.bin", "layers/old.bin.gz", "monthly/old.bin", "cells.bin")
    assert not any((tmp_path / f).exists() for f in gone)
    assert (tmp_path / "layers/keep.txt").exists() and (tmp_path / "layers/warm_tmax.bin.gz").exists()


def test_write_reports_clipping(tmp_path, capsys):
    write(tiny_grid(), {"s": {"warm_tmax": tiny_layer(500), "warm_tmin": tiny_layer()}}, {"s": INFO}, tmp_path)
    out = capsys.readouterr().out
    assert "warm_tmax: 1 values clipped to [-60, 67] °C" in out
    assert "warm_tmin" not in out


def test_stale_npz_ignored(tmp_path, capsys, monkeypatch):
    monkeypatch.setattr(cli, "SOURCES", {"terraclimate": None})
    for stem in ("synthetic", "terraclimate"):
        np.savez(tmp_path / f"{stem}.npz", warm_tmax=np.zeros((2, 2), np.float32))
    assert [p.stem for p in cli.select_npz(tmp_path)] == ["terraclimate"]
    assert "ignoring stale pipeline/.cache/layers/synthetic.npz" in capsys.readouterr().out


def test_merge_skips_sources_without_layers(tmp_path):
    np.savez(tmp_path / "acag.npz")
    np.savez(tmp_path / "coast.npz", coast_dist=np.zeros((2, 2), np.float32))
    assert list(cli.merge_sources([tmp_path / "acag.npz", tmp_path / "coast.npz"])) == ["coast"]


@pytest.mark.parametrize(
    "layer_id, spec",
    [
        ("cyclone_freq", Spec("uint16", 0.01, 0, "/decade")),
        ("seismic_pga", Spec("uint16", 0.001, 0, "g")),
        ("wildfire", Spec("uint16", 0.01, 0, "%")),
        ("flood", Spec("uint8", 0.5, 0, "%")),
        ("pm25", Spec("uint16", 0.1, 0, "µg/m³")),
        ("travel_city", Spec("uint16", 1, 0, "min")),
        ("dist_bigcity", Spec("uint16", 1, 0, "km")),
        ("dist_airport", Spec("uint16", 1, 0, "km")),
        ("pop_density", Spec("uint16", 1, 0, "people/km²")),
        ("hdi", Spec("uint16", 0.001, 0, "index")),
        ("homicide", Spec("uint16", 0.01, 0, "/100k")),
        ("price_level", Spec("uint16", 0.001, 0, "ratio")),
        ("country", Spec("uint8", 1, 0, "index")),
    ],
)
def test_phase3_specs(layer_id, spec):
    assert SPECS[layer_id] == spec


def test_copy_tables(tmp_path):
    layers, out = tmp_path / "layers", tmp_path / "out"
    layers.mkdir()
    out.mkdir()
    (layers / "cities.json").write_text("[]")
    (layers / "countries.json").write_text("{}")
    cli.copy_tables({"geonames": {}}, layers, out)
    assert [p.name for p in out.iterdir()] == ["cities.json"]  # countries not packed


def test_copy_tables_warns_on_stale_cache(tmp_path, capsys):
    layers, out = tmp_path / "layers", tmp_path / "out"
    layers.mkdir()
    out.mkdir()
    cli.copy_tables({"geonames": {}}, layers, out)  # geonames.npz without cities.json
    assert list(out.iterdir()) == []
    assert "atlas build geonames" in capsys.readouterr().out


def test_build_keeps_the_current_data_when_packing_fails(tmp_path, monkeypatch):
    out = tmp_path / "out"
    (out / "layers").mkdir(parents=True)
    (out / "manifest.json").write_text("old")
    (out / "layers/warm_tmax.bin.gz").write_bytes(b"old")
    real = pack._save
    monkeypatch.setattr(pack, "_save", lambda path, q: 1 / 0 if "warm_tmin" in path.name else real(path, q))
    sources = {"s": SimpleNamespace(INFO=INFO, build=lambda grid, raw: {"warm_tmax": tiny_layer(), "warm_tmin": tiny_layer()})}
    monkeypatch.setattr(cli, "SOURCES", sources)
    monkeypatch.setattr(cli, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(cli, "OUT", out)
    monkeypatch.setattr(cli, "load_grid", lambda raw: tiny_grid())
    with pytest.raises(ZeroDivisionError):
        cli.build(["s"])
    # The new warm_tmax was written, but only into the staging folder: the published set stays consistent.
    assert (out / "manifest.json").read_text() == "old" and (out / "layers/warm_tmax.bin.gz").read_bytes() == b"old"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["cache", "out"]


def test_copy_tables_keeps_the_previous_table_on_stale_cache(tmp_path, capsys):
    layers, out, previous = tmp_path / "layers", tmp_path / "out", tmp_path / "previous"
    for d in (layers, out, previous):
        d.mkdir()
    (previous / "cities.json").write_text("[1]")
    cli.copy_tables({"geonames": {}}, layers, out, previous)
    assert (out / "cities.json").read_text() == "[1]"
    assert "atlas build geonames" in capsys.readouterr().out


def test_build_keeps_going_after_a_failing_source(tmp_path, monkeypatch, capsys):
    def boom(grid, raw):
        raise OSError("network down")
    sources = {"bad": SimpleNamespace(INFO=INFO, build=boom), "ok": SimpleNamespace(INFO=INFO, build=lambda grid, raw: {"warm_tmax": tiny_layer()})}
    monkeypatch.setattr(cli, "SOURCES", sources)
    monkeypatch.setattr(cli, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(cli, "OUT", tmp_path / "out")
    monkeypatch.setattr(cli, "load_grid", lambda raw: tiny_grid())
    with pytest.raises(SystemExit, match="failed: bad"):
        cli.build(["bad", "ok"])
    assert (tmp_path / "out/layers/warm_tmax.bin.gz").exists()
    assert "bad: network down" in capsys.readouterr().out
