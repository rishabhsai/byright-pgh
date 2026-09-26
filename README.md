# ByRight PGH

**Which small homes fit Pittsburgh's vacant public lots, under today's zoning code and under Bill 2025-1545.**

Built during the AI for Housing Hackathon (AI Horizons 2026, Pittsburgh), Sept 26–27, 2026. Track 1: Development Feasibility & Pro Forma Navigator.

Live demo: https://byright-pgh.vercel.app · Demo video: _(link added at submission)_

## The problem

The Pittsburgh Land Bank and the City hold roughly 11,000 vacant lots. Checking one lot by hand, to see whether a starter home, a duplex, or a house with an accessory dwelling unit clears the use table and lot-size standards, means reading several code sections and parcel records. ByRight does that first screen for every lot at once. Mayor O'Connor has called zoning variances the thing that has "had Pittsburghers asking 'Why can't we?' for years." City Council heard Bill 2025-1545 (citywide ADUs, parking minimums removed, an affordable housing bonus) on Sept 23, 2026; we found no final vote as of Sept 26, 2026.

## What ByRight does

For every vacant-land record in the City's property inventory (11,338 parcels from WPRDC):

1. **Verdict per housing type.** Single-unit, single-unit + ADU, duplex, three-unit, attached townhome. Each is *by right*, *needs administrative or special-exception review*, *needs a variance*, *not permitted*, or *not evaluated*. Every check shows the measured value, the required value, and the Zoning Code section it comes from.
2. **The reform toggle.** Flip "If Bill 2025-1545 passes" and the whole map recomputes under the amended code. The stat strip shows how the screening results change; it is a rule-result comparison, not a count of homes that would be built.
3. **Green / Yellow / Red triage.** The vocabulary the hackathon's housing mentors suggested: *Red* is not developable (zoning, finance, topography), *Yellow* could be developable but needs a variance, review, or subsidy, *Green* is easily developable as is. Every color comes with its reasons.
4. **Fast-track finder.** A ranked list of lots, green first, then by how many housing types fit by right, penalized for steep slope, undermined ground, and flood zone, with neighborhood totals.
5. **Does it pencil?** A screening pro forma using public comps: Zillow ZHVI (typical home value) for the lot's neighborhood and Zillow ZORI (typical rent) for its ZIP, against land, hard cost, soft cost, and developer fee. Cost shares are calibrated to a real Pittsburgh affordable deal (Action Housing's Sixth Ward Flats budget). Every assumption is editable. It is a screen, not underwriting.
6. **Application planner.** For the lot and home type you pick, it assembles the filings this lot actually needs, in order: the City's *Request to Purchase Application* (Dept. of Finance Real Estate Division), the Building and Development Application on OneStopPGH, and, when a check fails, a Zoning Board of Adjustment hearing. It routes the purchase by the lot's inventory type (City Request to Purchase form for Public Sale lots, the URA for URA-transfer lots, confirm-first for everything else), pre-fills the purchase form's page 2 from public records (address, ward, block/lot, proposed end use, which section a failing check cites), builds a ZBA review worksheet for the five § 922.09.E criteria that separates what the record shows from the questions and evidence the applicant must supply, and lists every attachment (site plan, notice-poster photo, abutters list, fees). **You review, sign, and file it. ByRight never submits anything.** Built from the City's form (V. 1/2018) and the Department of City Planning's ZBA process guide (Dec 2024), both saved in `docs/sources/`.
7. **Memo.** A deterministic memo built from the structured findings, with citations and a human-review checklist. If a model is configured, a short plain-language summary appears under it, labeled "model-generated, unverified".

## What the data says (Sept 26, 2026)

- 11,338 vacant-land records in the City inventory. 3,641 pass our use-and-lot-size screening for at least one small home type (setbacks, height, and overlays not checked); on 3,638 more, no type passes and a permitted type fails a lot-size or lot-width standard (zoning staff decide whether the relief path is a variance or a nonconforming-lot exception); 1,751 sit in the Hillside district, where the use needs an administrator exception; 2,308 are in districts we did not encode (mostly Parks).
- If Council adopts **Bill 2025-1545**, the proposed reform would allow an ADU by right on 3,619 of those 3,641 lots. That is a change in the rule result, not a count of homes that would be built.
- Of 3,382 lots that pass the screening and have a Zillow neighborhood value, 40 clear the default cost-and-return screen (10% return over cost, including a 13% developer fee); 28 also pass the size and hazard screens (Green); 9 of those are marked available for sale. These are candidates for verification, not confirmed feasible projects. The rest of the buildable lots are *Yellow* because they need subsidy, a variance, or a hazard review, and the tool reports the gap per lot.

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
- **Not all standards are encoded.** Setbacks, height, lot coverage, overlay districts (riverfront, IPOD, historic), steep-slope overlay rules, and subdivision requirements are out of scope. A by-right verdict here means the use is permitted and the lot-size and lot-width checks pass. Parking is reported, not verified: where the code requires spaces, the check stays open for the site plan. It is not a zoning determination.
- **Assessed land value is not market value.** The pro forma is a screen with editable assumptions.
- **Lots under 1,000 sq ft can't be Green.** That floor is our screening assumption, not code; LNC and VH districts set no minimum. Such lots likely need consolidation.
- **Comps are neighborhood and ZIP aggregates,** not parcel-level sales. Zillow's public research files are used under their attribution terms; where a neighborhood has no Zillow value the pro forma falls back to the ZIP's rent index, and a lot with neither is marked "not assessed" and can't be Green.
- **Frontage is parsed from the legal description** when present and is approximate. A survey governs.
- **Hazard flags are screening layers,** not site engineering. Undermined-area maps in particular are historic and incomplete.
- **Hazard flags are tested at the inventory point, not the parcel polygon.** Each lot has one point in the City inventory; a hazard touching another part of the parcel is missed. The app says "no hazard found at the inventory point", never "site clear".
- **Inventory membership is not proof of current ownership or availability.** The file includes acquisition-pending, sale-pending, and permanent-ownership statuses, and two records marked Privately Owned. Confirm ownership and disposition status with the Real Estate Division (or the URA for URA-transfer lots) before acting.
- **Bill 2025-1545 is pending.** The "if it passes" rule set encodes the substitute text heard on Sept 23, 2026; Council may amend it.
- **No personal data.** Every record is a public parcel record about City-owned land.

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

## What we'd build next

ZBA decision extraction to show how similar variance requests fared nearby; extending the rule tables to the Phase 1 zoning cleanup; a Land Bank disposition-status feed; setbacks and buildable-envelope checks from parcel geometry.
