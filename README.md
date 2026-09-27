# ByRight PGH

**A first screen of which small home types Pittsburgh's vacant public lots allow, under today's zoning code and under Bill 2025-1545, and which lots deserve the next staff review.**

Built during the AI for Housing Hackathon (AI Horizons 2026, Pittsburgh), Sept 26–27, 2026. Track 1: Development Feasibility & Pro Forma Navigator.

Live demo: https://byright-pgh.vercel.app · Demo video: _(link added at submission)_

## The problem

The Pittsburgh Land Bank and the City hold roughly 11,000 vacant lots. Checking one lot by hand, to see whether a starter home, a duplex, or a house with an accessory dwelling unit clears the use table and lot-size standards, means reading several code sections and parcel records. ByRight does that first screen for every lot at once. Mayor O'Connor has called zoning variances the thing that has "had Pittsburghers asking 'Why can't we?' for years." City Council heard Bill 2025-1545 (citywide ADUs, parking minimums removed, an affordable housing bonus) on Sept 23, 2026; we found no final vote as of Sept 26, 2026.

## What ByRight does

For every vacant-land record in the City's property inventory (11,338 parcels from WPRDC):

1. **Verdict per housing type.** Single-unit, single-unit + ADU, duplex, three-unit, attached townhome. Each is *allowed, no hearing* (by right under the checks we ran), *staff approval (administrator exception)*, *Board approval (special exception)*, *relief needed* (a variance or a § 921.04 nonconforming-lot exception; for floor area, a smaller building), *not allowed here*, or *not checked yet*. A Hillside lot that needs lot-size relief keeps its use approval in the label. Every check shows the measured value, the required value, and the Zoning Code section it comes from.
2. **The reform toggle.** Flip "If Bill 2025-1545 passes" and the whole map recomputes under the amended code. The stat strip shows how the screening results change; it is a rule-result comparison, not a count of homes that would be built.
3. **Green / Yellow / Red triage.** The colors the hackathon's housing mentors suggested, with narrower meanings here. *Green* passes this preliminary screen: the best home type is allowed by right; the Use, Lot size, Width and Site checks pass; Fit is not failing (it is usually *not checked*); and the numbers clear the default cost-and-return screen (the policy is one constant, `GREEN_POLICY` in `src/lib/triage.ts`). *Yellow* needs review, relief, missing data, or a different financial scenario. *Red* is a major screening obstacle. Every color comes with its reasons, and each lot shows its six checks as literal counts (e.g. "4 pass · 1 fail · 1 not checked"); *not checked* is never counted as a pass.
4. **Disposition review queue.** For a neighborhood or the city: a funnel from inventory records to *candidates for staff review* (by right under the checks we ran, recorded Available for Sale, no hazard flag, at least 1,000 sf), split by recorded channel; the modeled shortfall for N projects (projects and dwellings counted separately); and a CSV and Markdown brief. Each row's next action is its first open review item plus the recorded channel (e.g. "Staff review: fit not checked; channel URA Transfer"), never an instruction to offer the lot.
5. **Does it pencil?** A screening pro forma using public comps: Zillow ZHVI (typical home value) for the lot's neighborhood and Zillow ZORI (typical rent) for its ZIP, against land, hard cost, soft cost, and developer fee. Cost shares are calibrated to a real Pittsburgh affordable deal (Action Housing's Sixth Ward Flats budget). Every assumption is editable. It is a screen, not underwriting.
6. **Application planner.** For the lot and home type you pick, it assembles the filings the screen points to, in order: the City's *Request to Purchase Application* (Dept. of Finance Real Estate Division), the Building and Development Application on OneStopPGH, and, when a standard fails or the use needs an exception, the relief or exception route derived from every failed check (lot size, width, FAR) and the review kind; zoning staff determine the path. It routes the purchase by the lot's inventory type (City Request to Purchase form for Public Sale lots, the URA for URA-transfer lots, confirm-first for everything else), pre-fills the purchase form's page 2 from public records (address, ward, block/lot, proposed end use, every failed standard and exception route with its section), builds a ZBA review worksheet for the five § 922.09.E criteria that separates what the record shows from the questions and evidence the applicant must supply, and lists every attachment (site plan, notice-poster photo, abutters list, fees). **You review, sign, and file it. ByRight never submits anything.** Built from the City's form (V. 1/2018) and the Department of City Planning's ZBA process guide (Dec 2024), both saved in `docs/sources/`.
7. **Memo.** A deterministic memo built from the structured findings, with citations and a human-review checklist, available from the lot's export menu. If a model is configured, a short plain-language summary is offered next to it, labeled "model-generated, unverified".

## What the data says (Sept 26, 2026)

- 11,338 vacant-land records in the City inventory. 3,641 have at least one small home type allowed by right under the checks we ran (use, lot size, lot width, and floor area in LNC; setbacks, height, overlays, and parking on the site plan not checked); on 3,638 more, no type passes and a permitted type fails a lot-size or lot-width standard (zoning staff decide whether the relief path is a variance or a nonconforming-lot exception); 1,751 sit in the Hillside district, where the use needs an administrator exception; 2,308 are in districts we did not encode (mostly Parks).
- If Council adopts **Bill 2025-1545**, the proposed reform would allow an ADU by right on 3,619 of those 3,641 lots. That is a change in the rule result, not a count of homes that would be built. The Green/Yellow/Red totals do not change, but the best-screening home type changes on 235 lots.
- Of 3,382 by-right lots with a Zillow neighborhood value, 40 clear the default cost-and-return screen (10% return over cost, including a 13% developer fee, against an aggregate neighborhood value). 27 also pass the lot-size, width and site screens (Green); on all 27 building fit is *not checked*, and 7 still have a required parking space to confirm on the site plan. 9 of the 27 are recorded available for sale. At $195/sf hard cost, Green drops to 11. These are candidates for staff review, not confirmed feasible projects.
- Citywide, 1,040 lots are candidates for staff review (772 Public Sale, 257 URA Transfer, 9 PLB Transfer, 2 Other, the two Other records being Greenway parcels whose channel needs review); 9 of them clear the cost-and-return screen. Hazelwood has 106 candidates (98 URA Transfer, 8 Public Sale), none of which clears it: the ten lowest-shortfall single-home projects show about $2.59M of modeled shortfall at $185/sf ($1.96M at $150, $3.12M at $215). That is a scenario against an aggregate index, not a subsidy request or parcel appraisal.

## How the AI is used

Rules decide; the model only rewords. The screening results, the triage, the pro forma, the memo, and the application packet are all deterministic. The zoning screen is a table lookup in [`src/lib/rules`](src/lib/rules) with a citation on every check. A model, when configured, does two things only: it suggests rewording for the purchase form's proposed-use description (`/api/application`), and it writes a short plain-language summary under the deterministic memo (`/api/memo`). It never touches the § 922.09.E worksheet. Both routes take only a parcel ID, rule set, and home type, rebuild the findings on the server from the shipped data, and time out after 8 seconds. Model text is shown separately and labeled unverified ("Suggested wording, unverified; edit before filing" and "Plain-language summary (model-generated, unverified)"); the instructions ask it not to add facts, but nothing guarantees that. Without credentials the app shows only the deterministic text. Optional model calls send parcel-derived content (address, zone, findings) to the configured provider.

AI tools used to build it: Claude Code (Opus and Fable models) for research, pipeline, rules encoding, and UI; Cursor credits offered by the event. All code was written during the build window; commit history starts Sept 26, 2026.

## Data sources

| Source | Steward | Vintage | Used for |
|---|---|---|---|
| [City-Owned Properties](https://data.wprdc.org/dataset/city-owned-properties) | City of Pittsburgh / WPRDC | records updated through 2026-09-24 | Lot inventory, zoning district, status, coordinates |
| [Allegheny County Property Assessments](https://data.wprdc.org/dataset/property-assessments) | Allegheny County / WPRDC | assessment as of 2026-09-01; land values keep the 2012 base year | Lot area, assessed land value, legal description (frontage) |
| [25% or Greater Slope](https://data.wprdc.org/dataset/25-or-greater-slope) | City of Pittsburgh / WPRDC | resource modified 2026-09-23 (not a terrain-survey date) | Steep-slope screening flag |
| [Undermined Areas](https://data.wprdc.org/dataset/undermined-areas) | City / County / WPRDC | resource modified 2026-09-23 | Mine-subsidence screening flag |
| [FEMA National Flood Hazard Layer](https://www.fema.gov/flood-maps/national-flood-hazard-layer) | FEMA | latest panel in the lot area effective 2015-09-30 | Special Flood Hazard Area flag |
| [Zillow Research: ZHVI by neighborhood, ZORI by ZIP](https://www.zillow.com/research/data/) | Zillow | series month 2026-08-31 | Sale-value and rent comps for the pro forma |
| Action Housing, "Building Affordable Housing" presentation to Pro-Housing Pittsburgh ([video](https://youtu.be/vJ0ReB26gVA)) | Action Housing | 2024 | Cost-share calibration for the pro forma |
| [Pittsburgh Zoning Code, Title Nine](https://ecode360.com/45474225) | City of Pittsburgh | as read Sept 26, 2026 | Use table, dimensional standards, accessory uses, parking |
| [Council Bill 2025-1545, substitute (June 2, 2026; corrected July 24, 2026)](https://www.pittsburghpa.gov/files/assets/city/v/1/dcp/documents/planning-commission/council-hearings-or-other/2025-1545-to-be-amended-by-substitute-from-june-2-2026-corrected-july-24-2026_final.pdf) | City of Pittsburgh | | The "if it passes" rule set |

Full list of encoded standards, with section numbers and access dates: [`docs/rules-sources.md`](docs/rules-sources.md). Pipeline details: [`pipeline/README.md`](pipeline/README.md).

## Limitations

- **City of Pittsburgh only.** Allegheny County has 130 municipalities with their own codes.
- **Only residential districts, LNC, and Hillside are encoded.** Lots in other districts (Parks, industrial, downtown, planned developments) show *not evaluated*.
- **Not all standards are encoded.** Setbacks, height, lot coverage, overlay districts (riverfront, IPOD, historic), steep-slope overlay rules, and subdivision requirements are out of scope. A by-right verdict here means the use is permitted and no encoded lot-size, lot-width or (in LNC) floor-area check fails; a check the data cannot verify is marked unknown and keeps the lot out of Green. Fit is therefore never a pass. Parking is reported, not verified: where the code requires spaces, the check stays open for the site plan. It is not a zoning determination.
- **Assessed land value is not market value.** The pro forma is a screen with editable assumptions.
- **Lots under 1,000 sq ft can't be Green.** That floor is our screening assumption, not code; LNC and VH districts set no minimum. Such lots likely need consolidation.
- **Comps are neighborhood and ZIP aggregates,** not parcel-level sales. Zillow's public research files are used under their attribution terms; where a neighborhood has no Zillow value the pro forma falls back to the ZIP's rent index, and a lot with neither is marked "not assessed" and can't be Green.
- **Frontage is parsed from the legal description** when present and is approximate. A survey governs.
- **Hazard flags are screening layers,** not site engineering. Undermined-area maps in particular are historic and incomplete.
- **Hazard flags are tested at the inventory point, not the parcel polygon.** Each lot has one point in the City inventory; a hazard touching another part of the parcel is missed. The app says "no hazard found at the inventory point", never "site clear".
- **Inventory membership is not proof of current ownership or availability.** The file includes acquisition-pending, sale-pending, and permanent-ownership statuses, and two records marked Privately Owned. Confirm ownership and disposition status with the Real Estate Division (or the URA for URA-transfer lots) before acting.
- **Bill 2025-1545 is pending.** The "if it passes" rule set encodes the substitute text heard on Sept 23, 2026; Council may amend it.
- **No personal data.** Every record is a public parcel record from the City's property inventory (which includes two records marked Privately Owned).

## Human in the loop

Every memo ends with a checklist: confirm the determination with the City's Zoning Administrator, order a survey, check overlay districts, verify utilities and access. The tool is positioned strictly as decision support.

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm vitest run     # rules engine tests
```

Optional, for the model-generated summary and suggested wording: set `OPENAI_API_KEY` (or `AI_GATEWAY_API_KEY`) in `.env.local`.

Rebuild the data: see [`pipeline/README.md`](pipeline/README.md).

## Stack

Next.js 16.3.6, TypeScript, Tailwind v4, MapLibre GL, Vitest. Python 3 with Shapely for the pipeline. Deployed on Vercel.

## Team

_(filled at submission)_

## Pilot

We propose a six-week pilot on two neighborhoods, Hazelwood and Larimer, where ByRight lists 264 candidates for staff review. No partnership exists yet; this is the pilot we would propose to City Planning, the URA and the Pittsburgh Land Bank.

The first deliverable is a **30-parcel adjudicated review set**, not a release list:

- City Planning zoning staff resolve each parcel's zoning route and the evidence the screen left open (fit, parking, width, Hillside conditions).
- URA and Land Bank staff verify recorded status, disposition channel, and suitability for disposition.
- Actual infill construction costs and sale evidence calibrate the cost-and-return scenario.
- We measure staff review time per parcel, the reasons staff disagree with the screen, and the share of candidates that survive staff review, and publish every disagreement as a correction to the rule tables.

In return we would ask for three data feeds we cannot get from WPRDC: current disposition status by parcel, adopted overlay boundaries including any ADU overlay, and ZBA decisions in a structured form.

## What we'd build next

ZBA decision extraction to show how similar variance requests fared nearby; extending the rule tables to the Phase 1 zoning cleanup; a Land Bank disposition-status feed; setbacks and buildable-envelope checks from parcel geometry.
