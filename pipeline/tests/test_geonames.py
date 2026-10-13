import zipfile

import numpy as np

from livable_pipeline.sources.geonames import big_cities, cities, metro_members, russian_names


def test_big_cities(tmp_path):
    def row(name, lat, lon, pop, code="PPL"):
        f = [""] * 19
        f[1], f[4], f[5], f[7], f[14] = name, lat, lon, code, pop
        return "\t".join(f)

    z = tmp_path / "cities15000.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("cities15000.txt", "\n".join([
            row('Big "Quoted" City', "10.5", "20.5", "2000000"),
            row("Small", "11", "21", "999999"),
            row("Exact", "12", "22", "1000000"),
            row("Sub", "11.1", "21", "50000"),  # 11 km from Small: 999,999 + 50,000 passes
            row("Section", "30", "40", "800000", "PPLX"),  # a section of a city: not counted
            row("Alone", "30.1", "40", "300000"),  # 300k + a PPLX section would pass 1M
        ]) + "\n")
    lat, lon = big_cities(z)
    assert sorted(zip(lat, lon)) == [(10.5, 20.5), (11, 21), (11.1, 21), (12, 22)]


def test_metro_members_chain():
    lat = np.zeros(3); lon = np.array([0.0, 0.25, 0.5]); pop = np.array([400_000, 400_000, 300_000])
    assert metro_members(lat, lon, pop).tolist() == [True, True, True]  # A-B-C chain sums to 1.1M


def test_metro_members_separate_clusters():
    lat = np.zeros(4); lon = np.array([0.0, 0.2, 5.0, 5.2]); pop = np.array([500_000, 400_000, 600_000, 300_000])
    assert not metro_members(lat, lon, pop).any()  # 900k each, 550 km apart


def test_metro_members_single_city():
    assert metro_members(np.zeros(2), np.array([0.0, 10.0]), np.array([2_000_000, 900_000])).tolist() == [True, False]


def test_russian_names(tmp_path):
    rows = [
        ["1", "100", "ru", "A", "", "", "", "", "", ""],
        ["2", "100", "ru", "B", "1", "", "", "", "", ""],  # preferred replaces A
        ["3", "100", "ru", "C", "", "", "", "", "", ""],  # later non-preferred ignored
        ["4", "200", "ru", "Old", "", "", "", "1", "", ""],  # historic skipped
        ["5", "200", "uk", "Київ", "", "", "", "", "", ""],  # other language
        ["6", "300", "ru", "Нью-Йорк", "", "", "", "", "", ""],
        ["7", "999", "ru", "X", "", "", "", "", "", ""],  # id not asked for
        ["8", "300", "ru", "Colloquial", "1", "", "1", "", "", ""],  # colloquial skipped even if preferred
        ["9", "400", "ru", "Stavropol’", "", "", "", "", "", ""],
        ["10", "400", "ru", "Ставрополь", "", "", "", "", "", ""],  # Cyrillic replaces Latin though not preferred
        ["11", "400", "ru", "Stavropol", "1", "", "", "", "", ""],  # preferred Latin never replaces Cyrillic
        ["12", "400", "ru", "Ставрополь-на-Волге", "", "", "", "", "", ""],  # later non-preferred Cyrillic ignored
    ]
    z = tmp_path / "alt.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("alternateNamesV2.txt", "\n".join("\t".join(r) for r in rows) + "\n")
    assert russian_names(z, {"100", "200", "300", "400"}) == {"100": "B", "300": "Нью-Йорк", "400": "Ставрополь"}


def test_cities(tmp_path):
    def row(gid, name, cc, lat, lon, pop):
        f = [""] * 19
        f[0], f[1], f[4], f[5], f[8], f[14] = gid, name, lat, lon, cc, pop
        return "\t".join(f)

    z = tmp_path / "cities15000.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("cities15000.txt", "\n".join([
            row("100", "Lisbon", "PT", "38.71667", "-9.13333", "517802"),
            row("300", "New York City", "US", "40.71427", "-74.00597", "8804190"),
            row("400", "Tiny", "FR", "48.0", "2.0", "14999"),
        ]) + "\n")
    assert cities(z, {"100": "Лиссабон"}) == [
        ["New York City", None, "US", 40.7143, -74.006, 8804190],
        ["Lisbon", "Лиссабон", "PT", 38.7167, -9.1333, 517802],
    ]
