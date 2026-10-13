from . import (
    acag, coast, countries, cru, etopo, gem, geonames, gfed, ghsl, ibtracs, jrc_flood,
    kummu, nelson, ourairports, terraclimate, undp, worldbank,
)

SOURCES = {
    "terraclimate": terraclimate, "etopo": etopo, "coast": coast,
    "ibtracs": ibtracs, "gem": gem, "gfed": gfed, "jrc_flood": jrc_flood, "nelson": nelson,
    "ghsl": ghsl, "geonames": geonames, "ourairports": ourairports, "countries": countries,
    "undp": undp, "worldbank": worldbank, "acag": acag, "cru": cru, "kummu": kummu,
}
