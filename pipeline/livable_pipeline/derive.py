import numpy as np


def dewpoint(vap_kpa: np.ndarray) -> np.ndarray:
    """Dew point (°C) from vapour pressure, inverse Magnus over water; the 0.1 hPa floor keeps dry pixels finite."""
    g = np.log(np.maximum(10 * vap_kpa, 0.1) / 6.1094)
    return 243.04 * g / (17.625 - g)


def window_starts(tavg: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Start month of the warmest and coldest 3-month window (wrapping), per cell."""
    win = (tavg + np.roll(tavg, -1, axis=0) + np.roll(tavg, -2, axis=0)) / 3
    # NaN windows never win; fully-NaN cells get an arbitrary start and window_mean() restores NaN.
    return np.where(np.isnan(win), -np.inf, win).argmax(axis=0), np.where(np.isnan(win), np.inf, win).argmin(axis=0)


def window_mean(monthly: np.ndarray, start: np.ndarray) -> np.ndarray:
    idx = (start + np.arange(3)[:, None, None]) % 12
    return np.take_along_axis(monthly, idx, axis=0).mean(axis=0)


def seasonal_layers(tmax: np.ndarray, tmin: np.ndarray, tdew: np.ndarray) -> dict[str, np.ndarray]:
    tavg = (tmax + tmin) / 2
    warm, cold = window_starts(tavg)
    return {
        "warm_tmax": window_mean(tmax, warm),
        "warm_tmin": window_mean(tmin, warm),
        "cold_tmax": window_mean(tmax, cold),
        "cold_tmin": window_mean(tmin, cold),
        "warm_tdew": window_mean(tdew, warm),
        "seasonality": window_mean(tavg, warm) - window_mean(tavg, cold),
        "frost_months": np.where(np.isnan(tavg).any(axis=0), np.nan, (tavg < 0).sum(axis=0)),
    }


MONTH_DAYS = np.array([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])


def daylength_hours(lat: np.ndarray) -> np.ndarray:
    """Mean daylight hours per month (12, len(lat)), FAO-56 eq. 34 averaged over each month's days."""
    j = np.arange(1, 366)[:, None]
    decl = 0.409 * np.sin(2 * np.pi * j / 365 - 1.39)
    ws = np.arccos(np.clip(-np.tan(np.radians(lat))[None, :] * np.tan(decl), -1, 1))  # clip covers polar day/night
    month = np.repeat(np.arange(12), MONTH_DAYS)
    return np.stack([(24 / np.pi * ws)[month == m].mean(axis=0) for m in range(12)])
