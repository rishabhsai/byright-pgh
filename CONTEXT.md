# ByRight PGH: domain context

Built for the AI for Housing Hackathon (AI Horizons 2026, Pittsburgh), Sept 26–27, 2026.

## What it is

A decision-support tool for the Pittsburgh Land Bank, City Planning zoning staff, CDCs, and small builders. For each vacant-land record in the City's property inventory it screens: which small housing types can be built here by right, which need a variance, and what changes if City Council passes Bill 2025-1545. It is not zoning advice. The City's Zoning Administrator interprets the code.

## Vocabulary

- **Lot.** One parcel in the City of Pittsburgh's property inventory (`city-owned-properties` on WPRDC), classed "Vacant Land". Keyed by county parcel ID (`PARID`, 16 chars, e.g. `0043R00172000000`).
- **Zone.** The base zoning district string from the City inventory's `zoned_as` field (not a spatial join to the zoning layer), e.g. `R1D-H`, `R2-L`, `RM-M`, `LNC`, `H`. The suffix is the density subdistrict (VL, L, M, H, VH). The engine evaluates this string. **Map zone** (`zoneMap`) is the City zoning map's district at the lot's inventory point; when the two disagree (`zoneAgrees === false`) the Use check is Unknown and the lot cannot be Green.
- **Typology.** A small-home building type a builder would put on one lot: `single` (single-unit detached), `single_adu` (single-unit plus an accessory dwelling unit), `duplex` (two-unit), `triplex` (three-unit), `townhome` (single-unit attached).
- **Rule set.** Which version of Title Nine (the Zoning Code) is applied. `current` is the code in force today. `bill-2025-1545` is the code as it would read if Council adopts the substitute bill heard Sept 23, 2026 (citywide ADUs, parking minimums removed, affordable housing bonus).
- **Check.** One rule applied to one lot for one typology. Every check carries a citation (code section, title, URL) and the measured vs. required value.
- **Verdict.** The outcome for a typology on a lot. `by-right` (use permitted and no encoded dimensional check fails; unverifiable checks stay unknown), `review` (use allowed only through an administrator or special exception; `reviewKind` says which), `variance` (a dimensional check fails: lot size, width, or LNC FAR; the use may also need an exception), `prohibited` (not allowed in the district at all), `unknown` (district or data not encoded).
- **Evidence row.** Six checks for the selected proposal (Use, Lot size, Width, Fit, Site, Finance), each Pass, Fail, Unknown or Not checked, reported as literal counts ("4 pass · 1 fail · 1 not checked"). Not checked is never a pass. Fit is Not checked unless it fails, because setbacks, height and coverage are not modeled. Required parking the data cannot verify is listed as unresolved.
- **Verdict label.** Plain-language label derived from the verdict and its route (`verdictLabel`): "Allowed, no hearing", "Staff approval (administrator exception)", "Board approval (special exception)", "Relief needed (variance or § 921.04 exception)" or "(smaller building or variance)" for FAR, "Not allowed here", "Not checked yet".
- **Green.** `GREEN_POLICY` in `src/lib/triage.ts`: best type by right; Use, Lot size, Width and Site pass; Fit not failing; Finance passes; recorded Available for Sale and not a Park, Greenway, Legislated Greenway or Infrastructure Protection record. A candidate for staff review, not a buildability determination.
- **Prototype.** The home a typology stands for in the pro forma (`UNIT_PLAN`). On a lot under 25 ft where both are by right, the attached townhouse is the proposal instead of the detached house (`prototypeNote`).
- **Candidate for staff review.** Plan-tab stage: by right under the checks we ran, recorded Available for Sale, no hazard flag, at least 1,000 sf. A review queue entry with a next action (first open item plus recorded channel), never a release or offer instruction.
- **Hazard flags.** Screening-only signals from City GIS layers: steep slope (25%+), undermined area, FEMA flood zone, tested at the lot's single inventory point, not the parcel polygon. Say "no hazard found at the inventory point", never "site clear". They never change a verdict; they are shown so a human reviews them.
- **Pro forma.** A screening estimate, not underwriting: land (assessed land value, flagged as not market value), hard cost ($/sf assumption), soft cost (%), revenue from Zillow comps (neighborhood ZHVI for sale value, ZIP ZORI for rent). All assumptions are editable in the UI.
- **ZBA review worksheet.** The application planner's § 922.09.E section. Each criterion has "What the record shows" (parcel facts with sources) and "What you must establish" (questions and evidence prompts). It never asserts a lot of record, boundary history, who created a hardship, or that no conforming use exists.
- **Acquisition channel.** How a lot is bought, from its inventory status and type: `city-form` (Available for Sale, Public Sale: City Request to Purchase form), `ura` (Available for Sale, URA Transfer: contact the URA), `confirm` (anything else: confirm availability first). Inventory listing is not proof of ownership or availability.

## Decisions

- Rules decide; the model only rewords. No verdict, number, or legal finding comes from a model. A model may suggest rewording for the purchase form's proposed-use description and write a summary under the deterministic memo; both are labeled unverified and shown next to, never in place of, the deterministic text. The model routes take only `{ lotId, ruleSet, typology }` and rebuild the facts server-side.
- Everything is precomputed. The app ships a static `public/data/lots.json`; the browser evaluates rules client-side. The two model routes read the same files on the server and re-evaluate there.
- Scope is the City of Pittsburgh only, residential districts plus LNC and H. Other districts return `unknown` with an honest label.
