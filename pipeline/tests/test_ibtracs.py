import numpy as np

from livable_pipeline.grid import H, W
from livable_pipeline.sources.ibtracs import cyclone_freq, read_tracks


def test_cyclone_freq():
    land = np.zeros((H, W), bool); land[359, 720] = land[359, 760] = True  # (0.125, 0.125) and (0.125, 10.125)
    sid = np.array(["A", "A", "B", "C"])
    lat = np.array([0.5, 0.6, 0.5, 0.0]); lon = np.array([0.5, 0.6, 0.5, 2.0])
    wind = np.array([70, 80, 50, 64.0])
    out = cyclone_freq(sid, lat, lon, wind, land, years=10)
    # A counts once (two close points), B is too weak, C is ~208 km away
    assert out[359, 720] == 1.0 and out[359, 760] == 0.0 and np.isnan(out[0, 0])
    assert out.dtype == np.float32


def test_read_tracks(tmp_path):
    p = tmp_path / "t.csv"
    p.write_text(
        "SID,SEASON,LAT,LON,WMO_WIND,USA_WIND\n"
        " ,Year,degrees_north,degrees_east,kts,kts\n"
        "S1,1979,10,20,90,90\n"
        "S2,1990,11,21,75,80\n"
        "S3,1990,12,22,70, \n"
        "S4,2026,13,23,100,100\n"
        "S5,1990,14,24, , \n"
    )
    sid, lat, lon, wind = read_tracks(p)
    assert list(sid) == ["S2", "S3", "S5"] and list(lat) == [11, 12, 14] and list(lon) == [21, 22, 24]
    assert list(wind[:2]) == [80, 70] and np.isnan(wind[2])
