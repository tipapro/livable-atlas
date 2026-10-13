import json

import numpy as np

from livable_pipeline.sources.countries import country_values
from livable_pipeline.sources.worldbank import by_year, latest_values, price_level


def _write(path, rows):
    path.write_text(json.dumps([{"page": 1}, [{"countryiso3code": c, "date": d, "value": v} for c, d, v in rows]]))
    return path


def test_latest_values(tmp_path):
    p = _write(tmp_path / "x.json", [("USA", "2019", 4.9), ("USA", "2022", 5.7), ("USA", "2021", 6.0), ("USA", "2023", None), ("", "2022", 2.9), ("SGP", "2022", None)])
    assert latest_values(p) == {"USA": 5.7}
    assert by_year(p) == {"USA": {"2019": 4.9, "2022": 5.7, "2021": 6.0}}


def test_price_level_common_year():
    ppp = {"ETH": {"2025": 50.0, "2024": 40.0}, "VEN": {"2011": 2.0}, "USA": {"2024": 1.0}}
    fcrf = {"ETH": {"2024": 100.0, "2023": 60.0}, "VEN": {"2017": 10.0}, "USA": {"2024": 1.0}}
    assert price_level(ppp, fcrf) == {"ETH": 0.4, "USA": 1.0}  # ETH: latest common year 2024; VEN: none


def test_country_values():
    index = np.array([[0, 1, np.nan]], np.float32)
    out = country_values(index, ["AAA", "BBB"], {"AAA": 2.5})
    assert out.dtype == np.float32 and out[0, 0] == 2.5 and np.isnan(out[0, 1]) and np.isnan(out[0, 2])
