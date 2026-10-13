import re

from livable_pipeline.sources import SOURCES


def test_every_source_says_what_period_it_covers_and_when_it_was_retrieved():
    for name, module in SOURCES.items():
        info = module.INFO
        assert set(info) == {"name", "url", "license", "citation", "period", "retrieved"}, name
        assert info["period"].strip(), name
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", info["retrieved"]), name
