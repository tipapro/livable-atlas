import numpy as np

from livable_pipeline.derive import dewpoint, seasonal_layers, window_starts


def months(peak):  # (12,1,1) cosine peaking at month `peak`
    m = np.arange(12)[:, None, None]
    return 10 + 10 * np.cos(2 * np.pi * (m - peak) / 12)


def test_window_north():
    warm, cold = window_starts(months(6))
    assert warm[0, 0] == 5 and cold[0, 0] == 11  # JJA, DJF


def test_window_south_wraps():
    warm, cold = window_starts(months(0))
    assert warm[0, 0] == 11 and cold[0, 0] == 5  # DJF, JJA


def test_seasonal_layers():
    tavg = months(6)
    tmax, tmin = tavg + 5, tavg - 5
    out = seasonal_layers(tmax, tmin, tmin - 3)
    assert out["warm_tmax"][0, 0] > out["cold_tmax"][0, 0]
    assert out["frost_months"][0, 0] == 0
    assert np.isnan(seasonal_layers(*(np.full((12, 1, 1), np.nan),) * 3)["warm_tmax"][0, 0])


def test_window_partial_nan_all_negative():
    tavg = months(6) - 30  # every window below zero, so a NaN->0 stand-in would win argmax
    tavg[:4] = np.nan  # starts 10, 11, 0..3 touch a NaN month
    warm, cold = window_starts(tavg)
    assert warm[0, 0] == 5 and cold[0, 0] == 9


def test_dewpoint():
    assert abs(dewpoint(np.array([0.61094]))[0]) < 1e-6
    assert abs(dewpoint(np.array([2.3335]))[0] - 20) < 0.05
    assert np.isfinite(dewpoint(np.array([0.0]))[0]) and dewpoint(np.array([0.0]))[0] < -40
    assert np.isnan(dewpoint(np.array([np.nan]))[0])
