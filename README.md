# ByRight PGH

**Which small homes fit Pittsburgh's vacant public lots, under today's zoning code and under Bill 2025-1545.**

Built during the AI for Housing Hackathon (AI Horizons 2026, Pittsburgh), Sept 26–27, 2026. Track 1: Development Feasibility & Pro Forma Navigator.

Live demo: _(link added at submission)_ · Demo video: _(link added at submission)_

## The problem

The Pittsburgh Land Bank and the City hold roughly 11,000 vacant lots. Nobody can say quickly which of them could take a starter home, a duplex, or a house with an accessory dwelling unit without a trip to the Zoning Board. Mayor O'Connor has called zoning variances the thing that has "had Pittsburghers asking 'Why can't we?' for years." City Council heard Bill 2025-1545 (citywide ADUs, parking minimums removed, an affordable housing bonus) on Sept 23, 2026 and has not voted.

## What ByRight does

For every City-owned vacant lot (11,338 parcels from WPRDC):

1. **Verdict per housing type.** Single-unit, single-unit + ADU, duplex, three-unit, attached townhome. Each is *by right*, *needs administrative or special-exception review*, *needs a variance*, *not permitted*, or *not evaluated*. Every check shows the measured value, the required value, and the Zoning Code section it comes from.
2. **The reform toggle.** Flip "If Bill 2025-1545 passes" and the whole map recomputes under the amended code. The stat strip shows how many lots become buildable without a variance.
3. **Fast-track finder.** A ranked list of lots by how many housing types fit by right, penalized for steep slope, undermined ground, and flood zone, with neighborhood totals.
4. **Screening pro forma.** Land, hard cost, soft cost, and an affordability-anchored revenue estimate. Every assumption is editable. It is a screen, not underwriting.
5. **Memo.** A plain-language memo built from the structured findings, with citations and a human-review checklist. An LLM writes the prose only from the rules engine's output; it never decides anything.

## How the AI is used

Rules decide, the model explains. The zoning determination is a deterministic table lookup in [`src/lib/rules`](src/lib/rules) with a citation on every check. The language model (`/api/memo`) receives only the structured findings and is instructed not to add, remove, or reinterpret any finding or citation. If no model credentials are configured the app produces the same memo from a template.

AI tools used to build it: Claude Code (Opus and Fable models) for research, pipeline, rules encoding, and UI; Cursor credits offered by the event. All code was written during the build window; commit history starts Sept 26, 2026.

## Data sources

| Source | Steward | Vintage | Used for |
|---|---|---|---|
| [City-Owned Properties](https://data.wprdc.org/dataset/city-owned-properties) | City of Pittsburgh / WPRDC | see `generatedAt` in `public/data/lots.json` | Lot inventory, zoning district, status, coordinates |
| [Allegheny County Property Assessments](https://data.wprdc.org/dataset/property-assessments) | Allegheny County / WPRDC | 2026 | Lot area, assessed land value, legal description (frontage) |
| [25% or Greater Slope](https://data.wprdc.org/dataset/25-or-greater-slope) | City of Pittsburgh / WPRDC | | Steep-slope screening flag |
| [Undermined Areas](https://data.wprdc.org/dataset/undermined-areas) | City / County / WPRDC | | Mine-subsidence screening flag |
| [FEMA National Flood Hazard Layer](https://www.fema.gov/flood-maps/national-flood-hazard-layer) | FEMA | | Special Flood Hazard Area flag |
| [Pittsburgh Zoning Code, Title Nine](https://ecode360.com/45474225) | City of Pittsburgh | as read Sept 26, 2026 | Use table, dimensional standards, accessory uses, parking |
| [Council Bill 2025-1545, substitute (June 2, 2026; corrected July 24, 2026)](https://www.pittsburghpa.gov/files/assets/city/v/1/dcp/documents/planning-commission/council-hearings-or-other/2025-1545-to-be-amended-by-substitute-from-june-2-2026-corrected-july-24-2026_final.pdf) | City of Pittsburgh | | The "if it passes" rule set |

Full list of encoded standards, with section numbers and access dates: [`docs/rules-sources.md`](docs/rules-sources.md). Pipeline details: [`pipeline/README.md`](pipeline/README.md).

## Limitations

- **City of Pittsburgh only.** Allegheny County has 130 municipalities with their own codes.
- **Only residential districts, LNC, and Hillside are encoded.** Lots in other districts (Parks, industrial, downtown, planned developments) show *not evaluated*.
- **Not all standards are encoded.** Setbacks, height, lot coverage, overlay districts (riverfront, IPOD, historic), steep-slope overlay rules, and subdivision requirements are out of scope. A by-right verdict here means the use is permitted and the lot-size, lot-width, and parking checks pass. It is not a zoning determination.
- **Assessed land value is not market value.** The pro forma is a screen with editable assumptions.
- **Frontage is parsed from the legal description** when present and is approximate. A survey governs.
- **Hazard flags are screening layers,** not site engineering. Undermined-area maps in particular are historic and incomplete.
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

Optional, for the AI memo: set `OPENAI_API_KEY` (or `AI_GATEWAY_API_KEY`) in `.env.local`.

Rebuild the data: see [`pipeline/README.md`](pipeline/README.md).

## Stack

Next.js 15, TypeScript, Tailwind v4, MapLibre GL, Vitest. Python 3 with Shapely for the pipeline. Deployed on Vercel.

## Team

_(filled at submission)_

## What we'd build next

ZBA decision extraction to show how similar variance requests fared nearby; extending the rule tables to the Phase 1 zoning cleanup; a Land Bank disposition-status feed; setbacks and buildable-envelope checks from parcel geometry.
