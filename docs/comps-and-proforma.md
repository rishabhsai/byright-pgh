# Comps, pro forma, and triage

ByRight PGH answers two questions for each City-owned vacant lot:

1. **What does zoning allow?** Encoded Title Nine rules (see `docs/rules-sources.md`).
2. **Does it clear the cost-and-return screen?** A reference value from aggregate indices (Zillow ZHVI for the lot's neighborhood, ZORI for its ZIP; not identified nearby sales) must exceed land, site work, hard and soft costs by a target margin. Mentors' guidance: developers check whether a project pencils before pursuing a variance (T. Hardy, Sept 26, 2026).

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
| Site work | $35,000 per project | Water/sewer taps, grading, sidewalks, landscaping; charged once per project, not per dwelling (a duplex carries one). $35,000 is a chosen allowance within Tom Hardy's $25k–$50k range (single unit); applied once per project as our assumption (hackathon SME channel, Sept 26, 2026: city site costs "$25k–$50k" per single unit). It is not the midpoint ($37,500), and one allowance on a duplex or triplex is our modeling assumption, not his multifamily estimate. |
| Hard cost | $225/sf | Midpoint of Dennis Steigerwalt's range (Housing Innovation Alliance, hackathon SME channel, Sept 26, 2026): for single-family infill in city limits "$200–$250/sf is a reasonable range". The prior default was $185/sf. BLS producer price indexes are national and give no Pittsburgh $/sf, so the number stays editable. |
| Soft cost | 22% of hard | Sixth Ward Flats (below): professional fees 5% + construction loan fees 4% + holding and lease-up 2% + other 4% = 15% of total cost = 22% of hard cost (67%). |
| Developer fee + overhead | 13% of hard | Sixth Ward Flats: 9% of total cost = 13% of hard cost. |

Soft cost and developer fee are shares of hard cost only; site work and land carry neither.

Building size per typology: single 1,200 sf; single + ADU 1,800 sf; duplex 2 × 950 sf; triplex 3 × 850 sf; townhome 1,400 sf.

### Calibration: hackathon mentors (Sept 26, 2026)

In the hackathon's #housing-sme-help channel on Sept 26, 2026:

- **Dennis Steigerwalt** (Housing Innovation Alliance): single-family infill in city limits at $200–$250/sf is reasonable; production builders in inner-ring suburbs imply about $150/sf. He points to county and city building permits, NAHB and RS Means as sources.
- **Tom Hardy** (hackathon SME): vertical construction, not counting site work, runs $325–$375/sf, and no reliable local public source exists. City site costs run $25k–$50k per single unit for water/sewer taps, grading, sidewalks and landscaping. Many City vacant lots have demolition debris in old basements, and undermining or environmental conditions can kill a deal up front. A developer checks whether a project pencils before pursuing a variance.

These set the defaults ($225/sf, the $35,000 site allowance) and the scenario rates ($185 prior hard-cost rate, $225, $250, $350). The $185 row keeps today's site allowance, so it is not the former complete default (which had no site line). `MENTOR_SOURCES` in `src/lib/proforma.ts` carries both citations; the About drawer lists them, and each pro forma's `inputsUsed` cites them.

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

The default soft cost leaves out reserves (5%) and syndication (1%). Syndication is a tax-credit cost; reserves are typical of rental and tax-credit deals, and a small for-sale builder usually does not carry them. With those two lines included, soft cost is 21% of total cost, or 31% of hard cost. Setting `softCostPct` to 31 approximates that deal's cost stack only; it does not model a tax-credit capital stack.

This one 35-unit LIHTC deal is mostly subsidy; it does not establish how a small infill home is financed. In Sixth Ward Flats, tax-credit equity alone is 71% of sources. Adding the URA, PHFA PHARE, and AHP grants brings equity and public money to 89% of the budget. Only the sponsor loan and the deferred fee (10%) are repaid from the project. The module exports these figures as `SIXTH_WARD_BENCHMARK` for the UI.

### Revenue

- **Sale (default):** neighborhood ZHVI × size scale × units sold. The size scale is unit sf ÷ 1,400 sf, the assumed size of a typical home, clamped to 0.6–1.3. An ADU is sold with its house, so single + ADU is one 1,800 sf sale.
  Duplex and triplex sale mode assumes the units are sold separately (two or three sales); the ownership structure and its transaction costs are not modeled.
- **Rent:** ZIP ZORI × 12 × units gives gross annual rent. The capitalized value (NOI ÷ cap rate) is gross rent × (1 − 35% operating expenses and vacancy) ÷ 7% cap rate. It is not a debt-service, cash-flow, or financing test. Gross annual rent is also returned.

### Input validation

`runProforma` validates every assumption at the model boundary (`validateFinance`). Out-of-range values are clamped; blanks, non-numbers, and zero on a field whose minimum is positive use the default. The UI keeps the typed text and shows "outside the accepted range, using X".

| Input | Accepted range | Default |
| --- | --- | --- |
| Hard cost | $50–$600/sf | $225 |
| Site work | $0–$150,000 per project | $35,000 |
| Soft cost | 0–60% of hard | 22% |
| Developer fee | 0–30% of hard | 13% |
| Target margin | 0–50% of cost | 10% |
| Typical home size | 500–4,000 sf | 1,400 sf |
| Cap rate | 3–15% | 7% |
| Operating expenses + vacancy | 10–60% of gross rent | 35% |

### Outputs

- `totalCost` = land + site work + hard + soft + developer fee.
- `margin` = revenue − total cost. `marginPct` = margin ÷ total cost.
- `pencils` is true when margin ≥ the target margin (default 10%) of total cost.
- `gap` is the modeled shortfall to the target return: (1 + target) × cost − revenue, or 0 when the deal pencils. It is not a subsidy award amount or a program-eligibility finding.
- `breakEvenValue` = (1 + target) × cost: the value at which margin equals the target. It includes the target return, so the UI and exports call it the target value ("target sale value" in sale mode, "target capitalized value" in rent mode), not zero-profit break-even; the CSV keeps the column name `break_even_value` for compatibility. The UI prints it under the result with the result at each other hard-cost scenario ($185, $250 and $350/sf at defaults) and at the new-construction premium (`sensitivityLine`).

Worked example: a single-unit house on a lot assessed at $10,000 costs $10,000 land + $35,000 site work + $270,000 hard + $59,400 soft + $35,100 fee = $409,500. At the 10% target it needs $450,450 in value. The 1,200 sf house sells at 0.857 of ZHVI, so that is a neighborhood ZHVI of about $526,000. At a ZHVI of $300,000 the modeled value is $257,143 and the shortfall is $193,307 ($122,027 at $185/sf, $237,857 at $250/sf, $416,057 at $350/sf, $116,164 at the 1.3× premium).

The developer fee and the target margin are two compensation layers: the example carries $35,100 of fee plus $40,950 of required return. Whether both belong depends on whose return is being modeled. A for-profit builder whose margin is the fee can set `devFeePct` to 0.

### Legacy API

`computeProforma(typology, landValue, ProformaAssumptions, mode)` still returns the earlier estimate: a sale price affordable at 80% AMI, or rent at HUD Fair Market Rent. It shares the cost stack with `runProforma`, with no developer fee and no site work.

## Triage (`src/lib/triage.ts`)

`triageLot(lot, findings, comps, assumptions?, typology?)` returns a `TriageResult`. With `typology` set (the Home type filter in the UI), the lot is triaged for that one proposal; without it, for the best typology.

| Color | Label | Rule |
| --- | --- | --- |
| Gray | Not evaluated | Every finding is `unknown`, because the district is not encoded (or the selected typology was not evaluated). |
| Red | Major screening obstacle; specialist review | No typology is by-right, review, or variance (or the selected typology is not listed in the district). Also red when the lot is in a FEMA flood zone and on a steep slope or undermined ground: a prototype prioritization rule, not a verified prohibition. |
| Green | Passes the preliminary screen under displayed assumptions | `GREEN_POLICY` in `src/lib/triage.ts`, read off the same six-check evidence row the UI shows: the best typology is by right; Use (the inventory district agrees with the City zoning map at the lot's point), Lot size (area known, at least 1,000 sq ft, standards met), Width (frontage known) and Site (no hazard flag, flood screening present) all pass; Fit is not failing; Finance passes; and the City records the lot as Available for Sale with an inventory type other than Park, Greenway, Legislated Greenway or Infrastructure Protection. A lot that passes everything but disposition is Yellow with the reason "Not for sale (City status: Hold for Study)" (or its actual status), or "Not a disposition candidate (City inventory type: Greenway)". Fit is never a pass today (setbacks, height and coverage are not modeled; an LNC FAR pass is shown as Not checked). An unverified parking minimum does not block Green, but it stays visible: the evidence row lists it as unresolved, the CSV exports it in `unresolved_notes`, and the reasons say "Confirm on-site parking on the site plan (§ 914.02.A)". |
| Yellow | Needs more information, review, or a different financial scenario | Everything else: review or relief is needed, a hazard flag is set or flood data is missing, lot area is unknown or below the floor, comps are unavailable, or there is a modeled shortfall. |

`bestTypology` is the typology with the best verdict and, among those, the lowest modeled shortfall to the target return (the highest margin when more than one clears the screen), ties to fewer dwellings (`DEFAULT_PROPOSAL_RULE`), with one exception: on a lot whose parsed frontage is under 25 ft, where both the detached house and the attached townhouse are by right, the townhouse is the proposal (the prototype follows the lot: a detached house loses its side yards on a lot that narrow, and the attached form needs no parking under § 914.02.A). `prototypeNote(lot, typology)` in `src/lib/proforma.ts` returns the line the card shows, e.g. "Prototype chosen for a 20 ft lot: attached form, 0 parking under § 914.02.A". If the lot lacks the comp for the chosen revenue mode, triage uses the other mode (for example, sale comps for a lot in 15208) and says so in the reasons.

`triageCounts(lots, ruleSet, compsFile, assumptions?, typology?)` returns `{green, yellow, red, gray}`.

Counts over the whole inventory, with the default assumptions and the Sept 26, 2026 data:

| Scenario | Green | Yellow | Red | Gray |
| --- | ---: | ---: | ---: | ---: |
| Current code, sale | 0 | 9,024 | 6 | 2,308 |
| Bill 2025-1545, sale | 0 | 9,024 | 6 | 2,308 |
| Current code, rent | 0 | 9,024 | 6 | 2,308 |
| Current code, no comps (finance not assessed) | 0 | 9,024 | 6 | 2,308 |
| Current code, sale, $185/sf (with site work) | 0 | 9,024 | 6 | 2,308 |
| Current code, sale, $185/sf, no site work (prior default) | 9 | 9,015 | 6 | 2,308 |
| Current code, sale, $250/sf | 0 | 9,024 | 6 | 2,308 |
| Current code, sale, $350/sf | 0 | 9,024 | 6 | 2,308 |
| Current code, sale, 1.3× new-construction premium | 7 | 9,017 | 6 | 2,308 |
| Current code, sale, 15% target margin | 0 | 9,024 | 6 | 2,308 |

With one home type selected (current code, sale):

| Selected type | Green | Yellow | Red | Gray |
| --- | ---: | ---: | ---: | ---: |
| Single-unit detached | 0 | 9,024 | 6 | 2,308 |
| Single-unit + ADU | 0 | 9,024 | 6 | 2,308 |
| Duplex | 0 | 2,641 | 6,389 | 2,308 |
| Triplex | 0 | 1,310 | 7,720 | 2,308 |
| Townhome | 0 | 9,024 | 6 | 2,308 |

Run `TRIAGE_REPORT=1 pnpm vitest run src/lib/triage.test.ts` to reprint these counts.

Green is a short list of candidates for staff review, not confirmed feasible projects. At the default ($225/sf plus the $35,000 site allowance) no lot is Green. 4 lots have raw hypothetical calculations before eligibility restrictions that reach the target return, and none of them has a screened financial result: all 4 are off the market (7154 Reynolds St, a Permanent City Ownership park record; 1254 S Negley Av, 5724 Murray Hill Pl and 0586 Peebles St, Hold for Study), and Murray Hill and Peebles also have an unconfirmed district. At the prior default ($185/sf, no site work) 9 lots were Green, all townhouses in R1A-VH in Central Northside (2 Public Sale, 7 URA Transfer). At the 1.3× new-construction premium 7 are Green (the premium count is the complete Green total at 1.3×, lots already Green included: at $150/sf, 11 are Green and 21 at the premium), all Central Northside townhouses (1 Public Sale, 126 Carrington; 6 URA Transfer); on all of them Fit is Not checked and none has a required parking space (the attached form needs none under § 914.02.A). 5724 Murray Hill Pl (`0085K00296000000`) has no recorded frontage, and the City zoning map puts its point in R1D-L while the inventory says RM-M, so its evidence reads 2 pass · 2 unknown · 2 not checked (Finance is not screened) and it is Yellow; 0586 Peebles St (`0176F00027000000`, inventory R1A-H, map R2-L) is held out of Green by the same zoning check. Most lots are Yellow: the steep-slope layer flags about half of the inventory, and most by-right lots show a modeled shortfall against the aggregate values. The Green count is sensitive to the assumptions: the mentors' calibration (+$40/sf and $35,000 site work) took it from 9 to 0, and valuing new homes at 1.3× the index brings it back to 7. The bill leaves the color totals unchanged, but it changes the default proposal on 52 lots (105 at the prior default), so the same counts do not mean the same proposals.

The Plan tab narrows further by disposition: citywide, 11,338 records → 9,030 encoded → 3,641 by right → 1,081 recorded available with no hazard flag → 1,038 at least 1,000 sf (candidates for staff review) → 0 clear the cost-and-return screen. Hazelwood: 797 → 754 → 285 → 123 → 106 → 0 (41 screened as a detached house, 65 as the attached form on lots under 25 ft). Hazelwood and Larimer together: 264 candidates.

The Plan's shortfall table has five rows: $185/sf (prior hard-cost rate, with today's site allowance), $225/sf (default, Steigerwalt mid), $250/sf (Steigerwalt high), $350/sf (Tom Hardy mid, vertical construction), and a new-construction premium row that values each home at 1.3× the comp index at the displayed hard cost (new infill often sells above the index of existing homes; the URA would calibrate this against actual gap awards). "(displayed)" marks the user's current rate; a rate that is not one of the four is inserted in order (`hardCostRows` in `src/lib/plan.ts`). The CSV carries one column per rate (`shortfall_at_185psf` … `shortfall_at_350psf`) and `site_cost_per_project`. For the ten lowest-shortfall Hazelwood candidates (all detached houses): at $185/sf $2,978,699; at $225/sf $3,691,499; at $250/sf $4,136,999; at $350/sf $5,918,999; at the 1.3× premium (at $225/sf) $3,477,859. The premium narrows the Hazelwood gap by about $21k a home; it does not close it, because 1.3 × an $83k index is still far below the ~$440k the home costs plus the 10% return. The same premium case is the last clause of the per-lot sensitivity line (`sensitivityLine` in `src/lib/proforma.ts`; a scenario that reaches the target reads "clears the target by" the exact amount, e.g. 126 Carrington's townhouse "clears the target by $1,207" at the premium, never a rounded margin percentage) and the CSV column `shortfall_at_1_3x_value`. Candidates are a review queue: each CSV row's `next_action` names its first open item and recorded channel.

## Limits

- ZHVI is the value of a typical existing home in the neighborhood, not the price of new construction or of any one parcel. How a new small infill home would sell relative to it, and whether the size scaling holds, has not been validated; treat the value as an aggregate reference for a scenario, not an appraisal.
- ZORI is the typical asking rent per unit, whatever the unit size. It overstates rent for a 600 sf ADU.
- Neighborhood and ZIP averages hide block-level variation.
- Hard cost is an assumption, not a bid. Steep, undermined, or flood-zone lots cost more to build, and the model does not add that cost.
- Site work is one flat figure. Demolition debris in old basements, soils, undermining, environmental remediation and the condition of water and sewer lines can push it well past $35,000; Tom Hardy calls site costs the hardest information to get.
