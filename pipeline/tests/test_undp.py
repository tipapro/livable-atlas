from livable_pipeline.sources.undp import latest_hdi


def test_latest_hdi(tmp_path):
    p = tmp_path / "hdr.csv"
    p.write_text(
        "iso3,country,hdi_2022,hdi_2023\nUSA,United States,0.92,0.93\nXXX,Nowhere,0.5,\nZZA.VHHD,Very high,0.9,0.91\n", encoding="cp1252"
    )
    assert latest_hdi(p) == {"USA": 0.93, "XXX": 0.5}
