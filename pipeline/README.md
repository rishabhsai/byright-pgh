# Data pipeline

Builds `public/data/lots.json` (the `LotsFile` type in `src/lib/types.ts`): one record per City-owned vacant lot in Pittsburgh.

## Rerun

From the repo root:

```sh
python3 -m venv pipeline/.venv
pipeline/.venv/bin/pip install shapely requests
# 1. Download the City-Owned Properties dump; build.py reads it and does not fetch it.
curl -L -o pipeline/city_owned.csv https://data.wprdc.org/datastore/dump/e1dcee82-9179-4306-8167-5891915b62a7
# 2. Build lots.json.
pipeline/.venv/bin/python pipeline/build.py
```

The run takes about 1-2 minutes. Downloads are cached in `pipeline/raw/` (gitignored). A file is fetched only when it is missing, so delete it to refresh. The script ends by validating the output and printing counts. The `retrieved` date in each source's vintage is the run date, even when a cached file was reused.

Input `pipeline/city_owned.csv` is the WPRDC dump of City-Owned Properties (step 1 above): https://data.wprdc.org/datastore/dump/e1dcee82-9179-4306-8167-5891915b62a7

The Bill 2025-1545 substitute text used for the "if it passes" rule set is archived at `docs/sources/bill-2025-1545.pdf` (source: https://www.pittsburghpa.gov/files/assets/city/v/1/dcp/documents/planning-commission/council-hearings-or-other/2025-1545-to-be-amended-by-substitute-from-june-2-2026-corrected-july-24-2026_final.pdf). Keep the archived copy with the page captures in `docs/sources/` so the encoded rules can be checked against the text that was read.

## Sources

| Source | Used for | URL |
| --- | --- | --- |
| City-Owned Properties (City of Pittsburgh, WPRDC) | Lot list (`class == "Vacant Land"`), PARID, address, point, zone (`zoned_as`), status, inventory type, neighborhood, council district | https://data.wprdc.org/dataset/city-owned-properties |
| Property Assessments (Allegheny County, WPRDC datastore `65855e14-...`) | `LOTAREA` → `lotAreaSqFt`, `FAIRMARKETLAND` → `landValue`, `LEGAL1`/`LEGAL2` → `frontageFt` | https://data.wprdc.org/dataset/property-assessments |
| Zoning Districts (City, WPRDC, `zon_new`) | `zoneMap`, `zoneAgrees`: cross-check of `zoned_as` | https://data.wprdc.org/dataset/01773197-baba-4f5e-aa77-ae87a04afafc |
| 25% or Greater Slope (City, WPRDC) | `hazards.steepSlope` | https://data.wprdc.org/dataset/25-or-greater-slope |
| Undermined Areas (City, WPRDC) | `hazards.undermined` | https://data.wprdc.org/dataset/undermined-areas |
| FEMA National Flood Hazard Layer, layer 28, `SFHA_TF='T'` | `hazards.floodZone` | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28 |

The `sources` array in `lots.json` records the vintage of each source for each build.

## Processing

- Rows are kept only if they have a PARID and a lat/lon. Duplicate PARIDs are dropped.
- Assessments are looked up in batches of 200 PARIDs with `datastore_search` and `filters`. `datastore_search_sql` returned HTTP 403 from WPRDC's CDN. If a lot has no assessment match, `lotAreaSqFt` falls back to the City's `parc_sq_ft`, and `landValue` and `frontageFt` are null.
- The zoning map cross-check tests the same inventory point against the City zoning polygons (`zoning.geojson`, cached in `pipeline/raw/`) and records `zoneMap` (the polygon's `zon_new`, or null when no polygon contains the point) and `zoneAgrees` (`zone == zoneMap` after trimming and upper-casing; null when the inventory zone is blank/UNKNOWN or `zoneMap` is null). The engine still evaluates `zone`; when `zoneAgrees` is false the app marks Use as Unknown and the lot cannot be Green. The build prints the agreement rate and the most common disagreements. On the Sept 26, 2026 data: 11,050 of 11,245 compared lots agree (98.3%), 195 disagree, 93 are not compared. The largest disagreement groups are map amendments (the Uptown UPR and Riverfront RIV districts) that the inventory's district field does not reflect (R2-VH → UPR-B, 27; DR-C → RIV-NS, 18; R1D-H → RIV-RM, 17; H → RIV-MU, 10) and residential inventory zones where the map shows Parks (R1D-M → P, 10).
- Hazard flags are computed by testing whether the lot's single point from the City inventory falls inside any polygon of the layer. The script uses a shapely STRtree for this test.

## Caveats

- **Assessed land value is not market value.** `FAIRMARKETLAND` is the county's base-year (2012) appraised land value.
- **Frontage from the legal description is approximate.** The script takes the first number of the first `A X B` or `A X AVG B` in the deed text. `LEGAL1` and `LEGAL2` are joined because the lines are fixed-width (46 chars) and wrap mid-number. Values below 10 ft or above 300 ft become null. In about 5% of parsed lots, frontage × depth differs from `LOTAREA` by more than 2×, because corner lots, irregular lots, and multi-lot descriptions do not parse cleanly.
- **Hazard layers are for screening only.** Flags are tested at the lot's single City inventory point, not the parcel polygon, and the pipeline does not establish that the point is a centroid. A single point per lot misses a hazard that touches only part of the parcel, and flags a lot whose point falls just inside a polygon edge. The steep-slope layer flags about half of all vacant lots, which is consistent with Pittsburgh's hillside vacant inventory. The FEMA query uses the bbox -80.10,40.36,-79.86,40.50, which contains every lot. Flags never change a verdict.
- `zone` is the City inventory's `zoned_as` field, and the engine evaluates it. `zoneMap` is a point-in-polygon check against the City zoning map at the same inventory point, so it inherits the point caveat above: a lot that straddles a district boundary is compared at one point only. `"UNKNOWN"` means `zoned_as` was blank (91 lots; 87 of them fall in a map polygon, so `zoneMap` names a district the engine does not use).

## Validation set

`pipeline/validate.py` writes `docs/validation-set.md`: 20 named lots with the inventory zone, the map zone, whether they agree, the engine's screen for the best home type with the sections it cites, the triage color, and an empty hand-check column. The engine columns come from the TypeScript engine (`src/lib/validationSet.test.ts`, run through `pnpm vitest`), so the table matches the app. Run it after `build.py`:

```sh
pipeline/.venv/bin/python pipeline/validate.py
```

## Comps

`pipeline/comps.py` builds `public/data/comps.json` (the `CompsFile` type in `src/lib/types.ts`). Run it after `build.py`:

```sh
pipeline/.venv/bin/python pipeline/comps.py
```

| Source | Used for | URL |
| --- | --- | --- |
| Zillow ZHVI, all homes, mid tier, smoothed, seasonally adjusted, by neighborhood (`Neighborhood_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`) | `byNeighborhood[name] = {zhvi, zhviDate}`, the latest non-empty month, filtered to `City == "Pittsburgh"` and `State == "PA"` | https://www.zillow.com/research/data/ |
| Zillow ZORI, all homes plus multifamily, smoothed, by ZIP (`Zip_zori_uc_sfrcondomfr_sm_month.csv`) | `byZip[zip] = {zori, zoriDate}`, the latest non-empty month, filtered to `State == "PA"` and `CountyName == "Allegheny County"` | https://www.zillow.com/research/data/ |
| Property Assessments, `PROPERTYZIP` (Allegheny County, WPRDC) | `lotZip[parid] = zip` | https://data.wprdc.org/dataset/property-assessments |

- The Zillow CSVs are cached in `pipeline/raw/`. The ZHVI file is about 100 MB. The script copies `/tmp/zhvi_nbhd.csv` and `/tmp/zori_ok.csv` when they exist, and downloads otherwise.
- `build.py` does not cache `PROPERTYZIP`, so `comps.py` fetches it for every lot. It uses batches of 200 PARIDs and caches the result in `pipeline/raw/assessment_zips.json`. The first run takes about 1 minute.
- Zillow neighborhood names are mapped to the City names in `lots.json`: Crawford Roberts, Fine View, Marshall - Shadeland, Mt Oliver, Southside Flats, Southside Slopes, Spring Hill - City View, and Wind Gap. Zillow's single "Oakland" fills Central, South, West, and North Oakland when Zillow has no value for them. In the 2026-08 data, it fills Central and South Oakland.
- `byNeighborhood` also includes suburbs that Zillow labels with City "Pittsburgh" (for example Mount Lebanon). No lot uses them.
- `lotZip` lists only lots whose ZIP has a ZORI. The file stays under 300 KB (289 KB).
- The script prints coverage: 10,521 of 11,338 lots have a ZHVI, and 10,367 have a ZORI. 11,336 lots have a ZIP; 15208 (968 lots) has no ZORI. It also lists the neighborhoods Zillow does not cover.

See `docs/comps-and-proforma.md` for how the pro forma and triage use these numbers.
