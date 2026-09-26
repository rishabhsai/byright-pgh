# Comps, pro forma, and triage

ByRight PGH answers two questions for each City-owned vacant lot:

1. **What does zoning allow?** Encoded Title Nine rules (see `docs/rules-sources.md`).
2. **What pencils?** Revenue from sales or rents, taken from nearby comps, must exceed hard and soft costs by a margin.

The answers combine into a Green / Yellow / Red triage, as defined by the hackathon organizers on Sept 26, 2026.

The pro forma is a screening estimate, not underwriting. Every assumption is editable, and each result lists the inputs it used with their sources (`Proforma.inputsUsed`).

## Comps (`public/data/comps.json`)

`pipeline/comps.py` builds the file. See the "Comps" section of `pipeline/README.md`.

| Input | Source | Grain | Month |
| --- | --- | --- | --- |
| Typical home value | Zillow Home Value Index (ZHVI), all homes, mid tier (33rd–67th percentile), smoothed, seasonally adjusted. File `Neighborhood_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`. | Zillow neighborhood, mapped to City neighborhood names | 2026-08 |
| Typical rent | Zillow Observed Rent Index (ZORI), all homes plus multifamily, smoothed. File `Zip_zori_uc_sfrcondomfr_sm_month.csv`. | ZIP code | 2026-08 |
| Lot ZIP | Allegheny County Property Assessments, `PROPERTYZIP` (WPRDC) | Parcel | Current |

Both Zillow files are published at https://www.zillow.com/research/data/.

Coverage over the 11,338 lots:

- 10,521 lots have a neighborhood ZHVI. Zillow does not publish ZHVI for 16 City neighborhoods, which hold 810 lots, and 7 lots have a blank neighborhood. The largest gaps are New Homestead (218 lots), Homewood West (173), Hays (78), and St. Clair (62).
- 10,367 lots have a ZIP ZORI. Zillow publishes no ZORI for 15208 (Homewood, Point Breeze; 968 lots). `lotZip` lists only lots whose ZIP has a ZORI, which keeps the file under 300 KB.

## Pro forma (`src/lib/proforma.ts`)

`runProforma(lot, typology, comps, assumptions)` returns `null` when comps are missing, or when the comp that the chosen revenue mode needs is missing.

### Costs

| Line | Default | Basis |
| --- | --- | --- |
| Land | County assessed land value | `FAIRMARKETLAND`, the 2012 base-year assessment, used as a proxy for acquisition cost. It is not market value and is flagged as such. A per-lot override entered in the UI takes precedence for that lot only; the shared assumptions never carry one. A lot with no assessment uses $5,000. |
| Hard cost | $185/sf | An assumption for small wood-frame infill. BLS producer price indexes are national and give no Pittsburgh $/sf, so the number stays editable. |
| Soft cost | 22% of hard | Sixth Ward Flats (below): professional fees 5% + construction loan fees 4% + holding and lease-up 2% + other 4% = 15% of total cost = 22% of hard cost (67%). |
| Developer fee + overhead | 13% of hard | Sixth Ward Flats: 9% of total cost = 13% of hard cost. |

Building size per typology: single 1,200 sf; single + ADU 1,800 sf; duplex 2 × 950 sf; triplex 3 × 850 sf; townhome 1,400 sf.

### Calibration: Sixth Ward Flats

Action Housing's Sixth Ward Flats budget (35 LIHTC units, $16.4M total) was presented to Pro-Housing Pittsburgh and shared by organizer Jack Billings on Sept 26, 2026.

| Uses | % of total | Sources | % of total |
| --- | --- | --- | --- |
| Construction | 67 | Tax-credit equity | 71 |
| Land | 3 | URA | 9 |
| Professional fees | 5 | PHFA PHARE | 8 |
| Syndication | 1 | FHLB AHP | 1 |
| Construction loan fees | 4 | Sponsor loan | 6 |
| Holding + lease-up | 2 | Deferred developer fee | 4 |
| Reserves | 5 | | |
| Developer fee + overhead | 9 | | |
| Other | 4 | | |

The default soft cost leaves out reserves (5%) and syndication (1%). Both are LIHTC-specific, and a small for-sale builder does not carry them. With those two lines included, soft cost is 21% of total cost, or 31% of hard cost. Set `softCostPct` to 31 to model a tax-credit deal.

A typical affordable deal is mostly subsidy. In Sixth Ward Flats, tax-credit equity alone is 71% of sources. Adding the URA, PHFA PHARE, and AHP grants brings equity and public money to 89% of the budget. Only the sponsor loan and the deferred fee (10%) are repaid from the project. The module exports these figures as `SIXTH_WARD_BENCHMARK` for the UI.

### Revenue

- **Sale (default):** neighborhood ZHVI × size scale × units sold. The size scale is unit sf ÷ 1,400 sf, the assumed size of a typical home, clamped to 0.6–1.3. An ADU is sold with its house, so single + ADU is one 1,800 sf sale.
  Duplex and triplex sale mode assumes the units are sold separately (two or three sales); the ownership structure and its transaction costs are not modeled.
- **Rent:** ZIP ZORI × 12 × units gives gross annual rent. The capitalized value (NOI ÷ cap rate) is gross rent × (1 − 35% operating expenses and vacancy) ÷ 7% cap rate. It is not a debt-service, cash-flow, or financing test. Gross annual rent is also returned.

### Input validation

`runProforma` validates every assumption at the model boundary (`validateFinance`). Out-of-range values are clamped; blanks, non-numbers, and zero on a field whose minimum is positive use the default. The UI keeps the typed text and shows "outside the accepted range, using X".

| Input | Accepted range | Default |
| --- | --- | --- |
| Hard cost | $50–$600/sf | $185 |
| Soft cost | 0–60% of hard | 22% |
| Developer fee | 0–30% of hard | 13% |
| Target margin | 0–50% of cost | 10% |
| Typical home size | 500–4,000 sf | 1,400 sf |
| Cap rate | 3–15% | 7% |
| Operating expenses + vacancy | 10–60% of gross rent | 35% |

### Outputs

- `totalCost` = land + hard + soft + developer fee.
- `margin` = revenue − total cost. `marginPct` = margin ÷ total cost.
- `pencils` is true when margin ≥ the target margin (default 10%) of total cost.
- `gap` is the modeled shortfall to the target return: (1 + target) × cost − revenue, or 0 when the deal pencils. It is not a subsidy award amount or a program-eligibility finding.
- `breakEvenValue` = (1 + target) × cost: the value at which margin equals the target. The UI prints it under the result, with the result at hard cost + $10/sf ($195/sf at defaults).

Worked example: a single-unit house on a lot assessed at $10,000 costs $10,000 + $222,000 hard + $48,840 soft + $28,860 fee = $309,700. At the 10% target it needs $340,670 in value. The 1,200 sf house sells at 0.857 of ZHVI, so that is a neighborhood ZHVI of about $397,000. At a ZHVI of $300,000 the modeled value is $257,143 and the shortfall is $83,527.

The developer fee and the target margin are two compensation layers: the example carries $28,860 of fee plus $30,970 of required return. Whether both belong depends on whose return is being modeled. A for-profit builder whose margin is the fee can set `devFeePct` to 0.

### Legacy API

`computeProforma(typology, landValue, ProformaAssumptions, mode)` still returns the earlier estimate: a sale price affordable at 80% AMI, or rent at HUD Fair Market Rent. It shares the cost stack with `runProforma`, with no developer fee.

## Triage (`src/lib/triage.ts`)

`triageLot(lot, findings, comps, assumptions?, typology?)` returns a `TriageResult`. With `typology` set (the Home type filter in the UI), the lot is triaged for that one proposal; without it, for the best typology.

| Color | Label | Rule |
| --- | --- | --- |
| Gray | Not evaluated | Every finding is `unknown`, because the district is not encoded (or the selected typology was not evaluated). |
| Red | Major screening obstacle; specialist review | No typology is by-right, review, or variance (or the selected typology is not listed in the district). Also red when the lot is in a FEMA flood zone and on a steep slope or undermined ground: a prototype prioritization rule, not a verified prohibition. |
| Green | Passes the preliminary screen under displayed assumptions | The typology is by right; lot area is known and at least 1,000 sq ft; flood screening is present (null is unresolved, not clear); no hazard flags; no lot-size check is unresolved; and the pro forma pencils. An unverified parking minimum does not block Green: on a vacant lot it is a site-plan question, and the reasons say "Confirm on-site parking on the site plan (§ 914.02.A)". |
| Yellow | Needs more information, review, or a different financial scenario | Everything else: review or relief is needed, a hazard flag is set or flood data is missing, lot area is unknown or below the floor, comps are unavailable, or there is a modeled shortfall. |

`bestTypology` is the typology with the best verdict and, among those, the highest margin. If the lot lacks the comp for the chosen revenue mode, triage uses the other mode (for example, sale comps for a lot in 15208) and says so in the reasons.

`triageCounts(lots, ruleSet, compsFile, assumptions?, typology?)` returns `{green, yellow, red, gray}`.

Counts over the whole inventory, with the default assumptions and the Sept 26, 2026 data:

| Scenario | Green | Yellow | Red | Gray |
| --- | ---: | ---: | ---: | ---: |
| Current code, sale | 28 | 8,996 | 6 | 2,308 |
| Bill 2025-1545, sale | 28 | 8,996 | 6 | 2,308 |
| Current code, rent | 0 | 9,024 | 6 | 2,308 |
| Current code, no comps (finance not assessed) | 0 | 9,024 | 6 | 2,308 |
| Current code, sale, hard cost $195/sf | 12 | 9,012 | 6 | 2,308 |
| Current code, sale, 15% target margin | 12 | 9,012 | 6 | 2,308 |

With one home type selected (current code, sale):

| Selected type | Green | Yellow | Red | Gray |
| --- | ---: | ---: | ---: | ---: |
| Single-unit detached | 26 | 8,998 | 6 | 2,308 |
| Single-unit + ADU | 0 | 0 | 9,030 | 2,308 |
| Duplex | 6 | 2,635 | 6,389 | 2,308 |
| Triplex | 4 | 1,306 | 7,720 | 2,308 |
| Townhome | 26 | 8,998 | 6 | 2,308 |

Run `TRIAGE_REPORT=1 pnpm vitest run src/lib/triage.test.ts` to reprint these counts.

Green is a short list of candidates for verification, not confirmed feasible projects. Most lots are yellow: the steep-slope layer flags about half of the inventory, and most by-right lots show a modeled shortfall at market values. The Green count is sensitive to the assumptions: $10/sf more hard cost, or a 15% target, cuts it from 28 to 12. The bill leaves the counts unchanged because it adds ADUs and removes parking minimums; it does not change which typology is best on a lot or whether that typology pencils.

## Limits

- ZHVI is the value of a typical existing home in the neighborhood, not the price of new construction. New homes usually sell above ZHVI, so sale revenue is conservative.
- ZORI is the typical asking rent per unit, whatever the unit size. It overstates rent for a 600 sf ADU.
- Neighborhood and ZIP averages hide block-level variation.
- Hard cost is an assumption, not a bid. Steep, undermined, or flood-zone lots cost more to build, and the model does not add that cost.
