# ByRight PGH

**Which small homes are allowed on Pittsburgh's vacant public lots**

A first screen of which small home types Pittsburgh's vacant public lots allow, under today's zoning code and under Bill 2025-1545, and which lots deserve the next staff review.

Built during the AI for Housing Hackathon (AI Horizons 2026, Pittsburgh), Sept 26–27, 2026. Track 1: Development Feasibility & Pro Forma Navigator.

Live demo: https://byright-pgh.vercel.app · Demo video: https://byright-pgh.vercel.app/demo.mp4 · Script: [`docs/demo-script.md`](docs/demo-script.md)

## The problem

The Pittsburgh Land Bank and the City hold roughly 11,000 vacant lots. Checking one lot by hand, to see whether a starter home, a duplex, or a house with an accessory dwelling unit clears the use table and lot-size standards, means reading several code sections and parcel records. ByRight does that first screen for every lot at once. Mayor O'Connor has called zoning variances the thing that has "had Pittsburghers asking 'Why can't we?' for years." City Council heard Bill 2025-1545 (citywide ADUs, parking minimums removed, an affordable housing bonus) on Sept 23, 2026; we found no final vote as of Sept 26, 2026.

## What ByRight does

For every vacant-land record in the City's property inventory (11,338 parcels from WPRDC):

1. **Verdict per housing type.** Single-unit, single-unit + ADU, duplex, three-unit, attached townhome. Each is *allowed by the use table and lot-size standards; other standards not checked* (by right under the checks we ran), *staff approval (administrator exception)*, *Board approval (special exception)*, *relief needed* (a variance or a § 921.04 nonconforming-lot exception; for floor area, a smaller building), *not allowed here*, *permission unresolved*, or *not checked yet*. *Permission unresolved* is used where the permission turns on a fact the data lacks, and the tool names the question instead of picking a route: an R1D townhouse on a lot with no recorded width ("P if lot width ≤ 35 ft, else S; width not in the record"; 96 lots, 43 with no other failing standard), and a house + ADU under today's code, which allows ADUs only inside an ADU Overlay District that is not in our data. The lot's first open item and next action become "Resolve permission: confirm lot width" or "… confirm ADU overlay". A Hillside lot that needs lot-size relief keeps its use approval in the label. Every check shows the measured value, the required value, and the Zoning Code section it comes from.
2. **The reform toggle.** Flip "If Bill 2025-1545 passes" and the whole map recomputes under the amended code. The stat strip shows how the screening results change; it is a rule-result comparison, not a count of homes that would be built.
3. **Green / Yellow / Red triage.** The colors the hackathon's housing mentors suggested, with narrower meanings here. *Green* passes this preliminary screen: the best home type is allowed by the use table and lot-size standards; the Use, Lot size, Width and Site checks pass (Use is *unknown* where the City zoning map names a different district than the inventory); Fit is not failing (it is usually *not checked*); the numbers clear the default cost-and-return screen; and the City records the lot as Available for Sale and it is disposition-eligible: not a park, greenway, legislated-greenway or infrastructure-protection record and not marked Privately Owned (the policy is one constant, `GREEN_POLICY` in `src/lib/triage.ts`; eligibility is one function, `isDispositionEligible` in `src/lib/ranking.ts`, shared by Green, the ranking and the plan's candidates). Two open items do not block Green: Fit *not checked* and required on-site parking not verified; both stay listed on the lot. The proposal screened on each lot is the allowed type with the lowest modeled shortfall to the target return (the highest margin when more than one clears the screen), ties to fewer dwellings (`DEFAULT_PROPOSAL_RULE`); on a lot under 25 ft wide the attached townhouse replaces the detached house, and the card says why. *Yellow* needs review, relief, missing data, or a different financial scenario. *Red* is a major screening obstacle. Every color comes with its reasons, and each lot shows its six checks as literal counts (e.g. "4 pass · 1 fail · 1 not checked"); *not checked* is never counted as a pass.
4. **Disposition review queue.** For a neighborhood or the city: a funnel from inventory records to *candidates for staff review* (allowed by the use table and lot-size standards under the inventory district, recorded Available for Sale, disposition-eligible, no hazard flag, at least 1,000 sf), split by recorded channel; the modeled shortfall for N projects (projects and dwellings counted separately); and a CSV and a short Markdown review brief (brief: about 350–450 words; with the shipped sources, Hazelwood is 409 words and the citywide brief 439: scope, the assumptions including the site allowance, funnel, channels, the financial hurdle with the hard-cost and premium scenarios, open items grouped with counts, sources; per-lot detail stays in the CSV). Each row's next action is its first open review item (`firstOpenItem` in `src/lib/evidence.ts`, the same decision the triage reasons and the application planner use) plus the recorded channel (e.g. "Staff review: fit not checked; channel URA Transfer"). Where the inventory district and the zoning map disagree, the next action is the district itself (e.g. "Resolve district: inventory R2-VH vs map UPR-B"), never a finance action. It is never an instruction to offer the lot.
5. **Cost-and-return screen.** A screening pro forma using public comps: Zillow ZHVI (typical home value) for the lot's neighborhood and Zillow ZORI (typical rent) for its ZIP, against land, site work, hard cost, soft cost, and developer fee. Hard cost ($225/sf) is the midpoint of the range Dennis Steigerwalt (Housing Innovation Alliance) gave on Sept 26, 2026: $200–$250/sf for city infill. Site work: $35,000 is a chosen allowance within Tom Hardy's $25k–$50k range (single unit); applied once per project as our assumption (Tom Hardy, hackathon SME, Sept 26, 2026, for water/sewer taps, grading, sidewalks and landscaping); a duplex or triplex carries one allowance, which is our assumption, not his multifamily estimate. Mentors' guidance: developers check whether a project pencils before pursuing a variance (T. Hardy, Sept 26, 2026). Soft cost and fee shares are informed by one real Pittsburgh affordable deal (Action Housing's Sixth Ward Flats budget); that does not validate small-infill hard cost or achievable value. Every assumption is editable. A shortfall is the modeled gap to the target return at the reference value, not a finding that subsidy is needed. One financial result feeds every output (`financeResult` in `src/lib/evidence.ts`): finance is screened only when Use passes, Fit does not fail, the district is confirmed, the lot is recorded Available for Sale and disposition-eligible, and comps exist. Otherwise triage carries no margin or gap, exports carry no financial-result estimates on unscreened rows (inputs and assessed values remain), CSV result columns are blank with `finance_screened=false` and a `finance_reason` ("district unconfirmed", "permission unresolved", "use not permitted", "building does not fit (FAR)", ...), the brief's totals leave the lot out, and the application description quotes no dollar figure. It is a screen, not underwriting.
6. **Application planner.** For the lot and home type you pick, it assembles the filings the screen points to, in order: the City's *Request to Purchase Application* (Dept. of Finance Real Estate Division), the Building and Development Application on OneStopPGH, and, when a standard fails or the use needs an exception, the relief or exception route derived from every failed check (lot size, width, FAR) and the review kind; zoning staff determine the path. It routes the purchase by the lot's inventory type (City Request to Purchase form for Public Sale lots, the URA for URA-transfer lots, confirm-first for everything else), pre-fills the purchase form's page 2 from public records (address, ward, block/lot, proposed end use, every failed standard and exception route with its section), builds a ZBA review worksheet for the five § 922.09.E criteria that separates what the record shows from the questions and evidence the applicant must supply, and lists every attachment (site plan, notice-poster photo, abutters list, fees). **You review, sign, and file it. ByRight never submits anything.** Built from the City's form (V. 1/2018) and the Department of City Planning's ZBA process guide (Dec 2024), both saved in `docs/sources/`.
7. **Memo.** A deterministic memo built from the structured findings, with citations and a human-review checklist, available from the lot's export menu. An optional `/api/memo` route can write a model summary labeled "Plain-language summary (model-generated, unverified)"; the app does not currently call it. The lot brief does NOT include the model summary; the only model text in the UI is the labeled filing-wording suggestion.

## Try these five lots

- [4623 Chatsworth St, Hazelwood](https://byright-pgh.vercel.app/?lot=0055P00008000000) · a house is allowed by the use table; the modeled shortfall shows why nothing pencils at market.
- [126 Carrington, Central Northside](https://byright-pgh.vercel.app/?lot=0023F00165000000) · a Public Sale townhouse that clears only at a 1.3× new-construction premium.
- [0 Forbes Av, Squirrel Hill South](https://byright-pgh.vercel.app/?lot=0086L00500000000) · 259 sq ft in LNC; FAR caps the building at 518 sq ft, so a lookup tool's "yes" is wrong.
- [5724 Murray Hill Pl, Squirrel Hill North](https://byright-pgh.vercel.app/?lot=0085K00296000000) · the inventory says RM-M, the City map says R1D-L; the screen refuses to pick.
- [4613 Hazelwood Ave, Hazelwood](https://byright-pgh.vercel.app/?lot=0055R00106000000) · Hillside: an administrator exception, a slope flag, and not for sale.

Or open the [Hazelwood disposition plan](https://byright-pgh.vercel.app/?hoods=Hazelwood&tab=plan).

## How a lot is screened

1. **Use.** Is the home type listed as permitted in the lot's district (§ 911.02)? Unresolved conditions (lot width, ADU overlay) stay unresolved.
2. **Lot size and width.** The district's minimum (§ 903.03 / § 904.02 / § 905.02) against the County record; frontage is parsed from the legal description and marked approximate.
3. **Fit.** Only the LNC 2:1 floor-area ratio is modeled; setbacks, height and coverage are "not checked", never a pass.
4. **Site.** Steep slope, undermined, FEMA flood flags at the inventory point; a flag keeps a lot out of the review cohort.
5. **District check.** The inventory district against the City zoning map (98.3% source agreement, not a measure of verdict accuracy); a conflict makes the district "unconfirmed".
6. **Finance.** Cost (mentor-calibrated $/sf, site work, soft cost, fee) against Zillow index value, screened only when the proposal is buildable, the district is confirmed and the lot is for sale.

## Reform levers

A third tab applies hypothetical rule changes to the same 11,338 lots: one preset per lever (minimum lot size by subdistrict, Hillside minimum, two-unit in R1, three-unit in R2, ADUs by right, no parking minimums) plus Bill 2025-1545 and a custom mode with sliders, each labeled with the section it edits. "Allowed" means the use table, minimum lot size and LNC FAR; setbacks and height are not modeled. Today's code and the bill are rebuilt from the same parameter table and are byte-identical to the hand-encoded tables (tested). Headline results at default finance: lowering the L minimum from 3,000 to 1,800 sq ft makes 587 more public lots pass the screen (175 more candidates; Homewood North +178); the bill unlocks no additional lots but adds 3,619 ADU options and removes parking minimums. Full table: `docs/reform.md`. Not a proposal; a lever to see where a rule binds.

## What the data says (Sept 26, 2026)

- 11,338 vacant-land records in the City inventory. 3,641 have at least one small home type that passes the use table and lot-size standards (use, lot size, lot width, and floor area in LNC; setbacks, height, overlays, and parking on the site plan not checked); on 3,638 more, no type passes and a permitted type needs relief: 3,631 fail a lot-size standard (zoning staff decide whether the relief path is a variance or a nonconforming-lot exception) and 7 fail only the LNC floor-area ratio; 3,549 are in the Hillside district, where the use needs an administrator exception (1,751 with no failing lot standard, 1,798 that also need lot-size relief); 2,308 are in districts we did not encode (mostly Parks).
- The inventory's zoning district is the engine's only zoning input, so we check it against the City zoning map at every lot's point: 11,050 of 11,245 compared lots agree (98.3%). That is agreement between two City sources, not the accuracy of zoning verdicts, buildability or finance. Most of the 195 disagreements are map amendments (the Uptown UPR and Riverfront RIV districts) that the inventory's district field does not reflect (R2-VH → UPR-B, DR-C → RIV-NS, R1D-H → RIV-RM); 83 of them are lots that pass the use-table and lot-size screen. On a disagreeing lot (or one where no map district contains the point) the Use check reads "Inventory says RM-M; City zoning map says R1D-L at this point. Confirm district before relying on this.", Finance is not screened, the lot cannot be Green, and its first open item everywhere (triage reasons, plan next action, application) is "Resolve district: inventory RM-M vs map R1D-L".
- If Council adopts **Bill 2025-1545**, the proposed reform would allow an ADU by right on 3,619 of those 3,641 lots. That is a change in the rule result, not a count of homes that would be built. The Green/Yellow/Red totals do not change, but the default proposal changes on 52 lots. Under today's code the house + ADU is *permission unresolved* on every encoded lot (the overlay map is not in our data), not *not allowed*. The best-verdict distribution is 3,641 by right, 1,751 review, 3,638 variance, 2,308 not evaluated; it did not change when unresolved width and ADU permissions stopped counting as a Special Exception and a prohibition, because a detached house is always the more permissive option on those lots.
- Of 3,382 of those lots with a Zillow neighborhood value, 4 have raw hypothetical calculations before eligibility restrictions that reach the default target return ($225/sf plus the $35,000 site allowance, 10% return over cost, including a 13% developer fee, against an aggregate neighborhood value). None of the 4 has a screened financial result: all 4 are off the market (one Permanent City Ownership park record, three Hold for Study lots), and 2 of them also have an unconfirmed district (inventory and zoning map disagree), so **no lot is Green** at the default. The count is sensitive to the assumptions: at the prior default ($185/sf, no site line) 9 lots were Green, all Central Northside townhouses; if new homes sell at 1.3× the neighborhood index, 7 are Green (Central Northside townhouses, 1 Public Sale, 6 URA Transfer). Green lots are candidates for staff review, not confirmed feasible projects.
- Citywide, 1,038 lots are candidates for staff review (772 Public Sale, 257 URA Transfer, 9 PLB Transfer); none clears the cost-and-return screen at the default. 14 of the 1,038 have an unresolved district (inventory and zoning map disagree), so their next action is to resolve it and their finance is not screened: they stay in the queue but never enter a shortfall total (in Esplen, 9 of 11 candidates; its ten-project shortlist totals only the 2 screened projects). Two recorded-available Greenway parcels (311 Venture St, 100 Solar St) are excluded as protected-purpose records; they stay searchable and in the CSV. Hazelwood has 106 candidates (98 URA Transfer, 8 Public Sale; 41 screened as a detached house, 65 as the attached form on lots under 25 ft), none of which clears it: the ten lowest-shortfall projects show $3,691,499 of modeled shortfall at the default $225/sf ($2,978,699 at the prior $185, $4,136,999 at $250, $5,918,999 at $350, and $3,477,859 if new homes sell at 1.3× the neighborhood index). That is a scenario against an aggregate index, not a subsidy request or parcel appraisal; the URA would calibrate the premium against its actual gap awards. If Bill 2025-1545 passes: an ADU by right on all 106, and required parking goes from 1 space to 0 on the 41 detached-house proposals.
- The plan exports a 68-column CSV (one row per lot in scope, every check as pass, fail, unknown or not checked, with citations, cost basis, a shortfall at each hard-cost scenario, and `finance_screened` / `finance_reason`) and a short Markdown review brief (brief: about 350–450 words). Export dates and file names use the Pittsburgh (America/New_York) calendar date.
- A 20-lot validation set is in [`docs/validation-set.md`](docs/validation-set.md): inventory zone vs. map zone (automated) and our screen with the sections cited, with an empty column and a "Checked by" block for a human check against the code. It lists exactly which checks were automated. No row has been hand-checked yet.

## How the AI was used

**Rule extraction.** The zoning rule tables in [`src/lib/rules/districts.ts`](src/lib/rules/districts.ts) (use permissions by district for each home type, minimum lot sizes, the LNC floor-area ratio, parking minimums, ADU rules, and the Bill 2025-1545 variants) were produced by Claude reading the ecode360 pages of Title Nine and the bill text. Those pages are saved verbatim in [`docs/sources/`](docs/sources/): ecode360 blocks plain HTTP clients, so each page was rendered in a browser and its text captured on Sept 26, 2026. Each row was then checked against its capture. [`docs/rules-sources.md`](docs/rules-sources.md) lists every encoded value with its section, URL and access date, and what was deliberately left out. Two AI-agent audits (not practitioner or City review) re-verified the tables against the same captures.

**No model in the decision path.** Verdicts, triage colors, evidence counts, the pro forma, the plan, the memo and the application packet are deterministic code over public data, with a citation on every check. The inventory's zoning district is cross-checked against the City zoning map by a point-in-polygon test (see [`pipeline/README.md`](pipeline/README.md)), not by a model.

**Optional rewrites, labeled.** When a model is configured, two routes exist: one suggests rewording for the purchase form's proposed-use description (`/api/application`), and one can write a short plain-language summary of the deterministic memo (`/api/memo`, not currently called by the app). Both routes take only a parcel ID, rule set and home type (the memo route honors the home type), rebuild the facts on the server, and give the provider 12 seconds inside a 20-second route limit. The memo facts follow the one financial result: when finance is not screened they carry no dollar figure. Providers, in order: OpenRouter (`OPENROUTER_API_KEY`), OpenAI (`OPENAI_API_KEY`), Vercel AI Gateway (`AI_GATEWAY_API_KEY`); `MEMO_MODEL` overrides the model. Their text is shown next to the deterministic text, never in place of it, and labeled unverified ("Suggested wording, unverified; edit before filing" and "Plain-language summary (model-generated, unverified)"). The lot brief does NOT include the model summary; the only model text in the UI is the labeled filing-wording suggestion. The prompt asks the model not to add facts; nothing guarantees that. Without credentials the app shows only the deterministic text. Optional model calls send parcel-derived content (address, zone, findings) to the configured provider.

**Ask ByRight.** The search box (⌘K) also takes plain-language requests ("Hazelwood lots where a duplex passes if the L minimum drops to 1,800"): `/api/ask` sends the model only the question and a compact view state (filters, scenario id, tab, three finance inputs; never lot records), and the model may only pick from ten tools (neighborhoods, home type, status, triage, scenario or rule parameters, tab, lot, finance, a fixed explanation), each validated server-side; a set with any invalid call is rejected whole, and a rule or finance number the question does not contain is dropped. The app applies the calls through its own filter setters, shows each as a chip the user can undo, and composes the one-sentence answer from the rules engine for the resulting state, so every count comes from the engine and none from the model; on a failure or timeout (12 s) nothing changes. The model can still misread a request (a wrong neighborhood, a lever the user did not mean), which is why every applied change is shown and undoable; the rate limit (10 requests a minute per IP) is in memory per server instance, and `ASK_MODEL` overrides the model.

**Re-encoding another municipality.** The engine reads one district table per code. A new municipality's residential districts means capturing its code pages, having the model draft one table from them, and checking each row against the capture. We have not done this for a second municipality, so we give no time estimate; exceptions, overlays, data joins and validation add work.

Tools used to build it: Claude Code (Opus and Fable models) for research, the pipeline, rules encoding and UI; Cursor credits offered by the event. All code was written during the build window; commit history starts Sept 26, 2026.

## Data sources

| Source | Steward | Vintage | Used for |
|---|---|---|---|
| [City-Owned Properties](https://data.wprdc.org/dataset/city-owned-properties) | City of Pittsburgh / WPRDC | records updated through 2026-09-24 | Lot inventory, zoning district, status, coordinates |
| [Allegheny County Property Assessments](https://data.wprdc.org/dataset/property-assessments) | Allegheny County / WPRDC | assessment as of 2026-09-01; land values keep the 2012 base year | Lot area, assessed land value, legal description (frontage) |
| [Zoning Districts](https://data.wprdc.org/dataset/01773197-baba-4f5e-aa77-ae87a04afafc) | City of Pittsburgh / WPRDC | resource modified 2026-09-23 | Cross-check of the inventory's zoning district at each lot's point |
| [25% or Greater Slope](https://data.wprdc.org/dataset/25-or-greater-slope) | City of Pittsburgh / WPRDC | resource modified 2026-09-23 (not a terrain-survey date) | Steep-slope screening flag |
| [Undermined Areas](https://data.wprdc.org/dataset/undermined-areas) | City / County / WPRDC | resource modified 2026-09-23 | Mine-subsidence screening flag |
| [FEMA National Flood Hazard Layer](https://www.fema.gov/flood-maps/national-flood-hazard-layer) | FEMA | latest panel in the lot area effective 2015-09-30 | Special Flood Hazard Area flag |
| [Zillow Research: ZHVI by neighborhood, ZORI by ZIP](https://www.zillow.com/research/data/) | Zillow | series month 2026-08-31 | Sale-value and rent comps for the pro forma |
| Action Housing, "Building Affordable Housing" presentation to Pro-Housing Pittsburgh ([video](https://youtu.be/vJ0ReB26gVA)) | Action Housing | 2024 | Cost-share calibration for the pro forma |
| [Pittsburgh Zoning Code, Title Nine](https://ecode360.com/45474225) | City of Pittsburgh | as read Sept 26, 2026 | Use table, dimensional standards, accessory uses, parking |
| [Council Bill 2025-1545, substitute (June 2, 2026; corrected July 24, 2026)](https://www.pittsburghpa.gov/files/assets/city/v/1/dcp/documents/planning-commission/council-hearings-or-other/2025-1545-to-be-amended-by-substitute-from-june-2-2026-corrected-july-24-2026_final.pdf) | City of Pittsburgh | | The "if it passes" rule set |

Full list of encoded standards, with section numbers and access dates: [`docs/rules-sources.md`](docs/rules-sources.md). Pipeline details: [`pipeline/README.md`](pipeline/README.md).

## Limitations

Also in [`LIMITATIONS.md`](LIMITATIONS.md).

- **City of Pittsburgh only.** Allegheny County has 130 municipalities with their own codes.
- **Only residential districts, LNC, and Hillside are encoded.** Lots in other districts (Parks, industrial, downtown, planned developments) show *not evaluated*.
- **Not all standards are encoded.** Setbacks, height, lot coverage, overlay districts (riverfront, IPOD, historic), steep-slope overlay rules, and subdivision requirements are out of scope. A by-right verdict here means the use is permitted and no encoded lot-size, lot-width or (in LNC) floor-area check fails. Missing lot area, width, flood screening or zoning-map agreement is marked unknown and keeps the lot out of Green. Fit is never a pass, and Fit *not checked* does not block Green. Parking is reported, not verified: where the code requires spaces, the item stays open for the site plan and does not block Green. It is not a zoning determination.
- **Assessed land value is not market value.** The pro forma is a screen with editable assumptions.
- **Lots under 1,000 sq ft can't be Green.** That floor is our screening assumption, not code; LNC and VH districts set no minimum. Such lots likely need consolidation.
- **Rental mode is a capitalized-value screen, not underwriting.** The next test to add is PHFA's 1.15 debt-service coverage standard; it is not modeled.
- **Comps are neighborhood and ZIP aggregates,** not parcel-level sales. Zillow's public research files are used under their attribution terms; where a neighborhood has no Zillow value the pro forma falls back to the ZIP's rent index, and a lot with neither is marked "not assessed" and can't be Green.
- **Frontage is parsed from the legal description** when present and is approximate. A survey governs.
- **The zoning district comes from the City inventory, cross-checked at one point.** The engine evaluates the inventory's `zoned_as`. We compare it with the City zoning map at the lot's inventory point; where they disagree (or no map district contains the point) the Use check is Unknown, Finance is not screened, the lot cannot be Green, and resolving the district is its first open item, but the engine does not re-evaluate the lot under the map's district. A lot that straddles a boundary is compared at one point only.
- **No ADU overlay layer.** Under today's code a house + ADU is *permission unresolved* on every lot until staff confirm whether it is inside an adopted ADU Overlay District.
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

Optional, for the suggested filing wording (and the uncalled `/api/memo` summary): copy `.env.example` to `.env.local` and set one of `OPENROUTER_API_KEY`, `OPENAI_API_KEY` or `AI_GATEWAY_API_KEY`.

Rebuild the data: see [`pipeline/README.md`](pipeline/README.md).

## Stack

Next.js 16.3.6, TypeScript, Tailwind v4, MapLibre GL, Vitest. Python 3 with Shapely for the pipeline. Deployed on Vercel.

## Team

_(filled at submission)_

## Pilot

We propose a six-week pilot on two neighborhoods, Hazelwood and Larimer, where ByRight lists 264 candidates for staff review. The pilot is proposed; no partner has committed. City Planning, the URA and the Pittsburgh Land Bank are the partners we would ask; none has endorsed the tool.

The first deliverable is a **30-parcel adjudicated review set**, not a release list:

- City Planning zoning staff resolve each parcel's zoning route and the evidence the screen left open (fit, parking, width, Hillside conditions).
- URA and Land Bank staff verify recorded status, disposition channel, and suitability for disposition.
- Actual infill construction costs and sale evidence calibrate the cost-and-return scenario.
- We measure staff review time per parcel, the reasons staff disagree with the screen, and the share of candidates that survive staff review, and publish every disagreement as a correction to the rule tables.

In return we would ask for three data feeds we cannot get from WPRDC: current disposition status by parcel, adopted overlay boundaries including any ADU overlay, and ZBA decisions in a structured form.

## What we'd build next

ZBA decision extraction to show how similar variance requests fared nearby; extending the rule tables to the Phase 1 zoning cleanup; a Land Bank disposition-status feed; setbacks and buildable-envelope checks from parcel geometry.
