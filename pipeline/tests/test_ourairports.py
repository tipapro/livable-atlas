from livable_pipeline.sources.ourairports import large_airports


def test_large_airports(tmp_path):
    p = tmp_path / "airports.csv"
    p.write_text(
        'id,ident,type,name,latitude_deg,longitude_deg\n'
        '1,AAAA,large_airport,"Big, Intl",10.5,20.5\n'
        '2,BBBB,medium_airport,Med,11,21\n'
        '3,CCCC,heliport,Heli,12,22\n'
    )
    lat, lon = large_airports(p)
    assert list(lat) == [10.5] and list(lon) == [20.5]
