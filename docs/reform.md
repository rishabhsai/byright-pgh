# Reform levers

What the Reform tab computes, what its numbers mean, and what they leave out. Code: `src/lib/rules/params.ts`, `src/lib/levers.ts`, and the `reform` request in `src/lib/evalCompute.ts`. Tests: `src/lib/rules/params.test.ts`, `src/lib/levers.test.ts`.

## What a lever is

A lever is a **hypothetical change to one zoning parameter**. It is not a proposal, not a bill, and not a recommendation. It answers one question: if this one number or permission in Title Nine were different, how would the screen of the City's 11,338 vacant-land records change?

The engine's district tables are built from a small parameter set, `RuleParams`, by `buildRegistry(params)`. Today's code and Bill 2025-1545 are two rows of that table:

| Parameter | Section it edits | Today | Bill 2025-1545 |
|---|---|---|---|
| `minLotArea.VL / L / M / H / VH` | § 903.03.A–E.2 minimum lot size per density subdistrict | 6,000 / 3,000 / 2,400 / 1,200 / none sq ft | same |
| `hillsideMinLot` | § 905.02.C Hillside minimum lot size | 3,200 sq ft | same |
| `r1dAttachedWidthCap` | § 911.04.A.69A: R1D attached units by right at or under this lot width, else Special Exception | 35 ft | same |
| `twoUnitInR1` | § 911.02 use table: Two-Unit Residential in R1D and R1A | N (false) | same |
| `threeUnitInR2` | § 911.02 use table: Three-Unit Residential in R2 | N (false) | same |
| `aduByRight` | § 912.08 ADUs | overlay only (false) | by right, up to 2, no owner occupancy (true) |
| `parkingMinimums` | § 914.02.A Schedule A | minimums apply (true) | struck (false) |

`buildRegistry(TODAY_PARAMS)` and `buildRegistry(BILL_PARAMS)` reproduce the two encoded rule sets byte for byte. `params.test.ts` compares them against a snapshot of the tables taken before the parameterization (`src/lib/rules/__fixtures__/districts.golden.json`). `DISTRICTS` in `districts.ts` is still the two prebuilt registries, so every other screen is unchanged.

### Where the parameters do not reach

- **Citation text for ADUs and parking.** When `aduByRight` is true or `parkingMinimums` is false, the standard carries the bill's text and citation (Bill 2025-1545 § 37 for ADUs, § 40 for parking): up to two ADUs, no owner occupancy, 1,000 sq ft; minimums struck. The single-knob ADU and parking levers are exactly the bill's text for that one section.
- **Which rule set a citation names.** A registry's citations name `"bill-2025-1545"` when the params equal `BILL_PARAMS`, and `"current"` otherwise, because a lever edits today's code. Every check evaluated from a registry other than the prebuilt one also carries `citationScenario: "custom"`. The check cites the same section, but the text is not that rule set's. `RuleSet` itself is unchanged, because it keys the `Record<RuleSet, …>` tables across the app.
- **Hypothetical notes.** Any standard whose value differs from today's carries a note that starts "Hypothetical lever, not the code:", for example "1,800 sq ft in place of the code's 3,000 sq ft".
- **The evidence row's width text** reads the prebuilt registry, so under a custom `r1dAttachedWidthCap` the Width row still describes the 35 ft test. The verdict uses the custom cap. No preset changes this knob.

## What "allowed" means here

A lot counts as **allowed** when at least one of the five small home types (house, house + ADU, duplex, triplex, townhouse) gets the verdict `by-right` under the lever's parameters. That means:

- **Use table:** the § 911.02 letter is P. For R1D townhouses, P needs a recorded lot width at or under the cap. With no width, the permission is unresolved, not allowed.
- **Lot size:** the lot meets the minimum lot size (§ 903.03, § 905.02.C; LNC has none). A lot with no recorded area is not allowed.
- **LNC floor area ratio:** the proposal fits under 2:1.

Setbacks, height, lot coverage, overlays, steep-slope rules (§ 915) and whether required parking fits on the site are **not modeled**. "Allowed" is "allowed by the use table and lot-size standards", the same wording the Lots tab uses. It is not a buildability determination.

The other columns:

- **Newly allowed:** allowed under the lever and not allowed today (per lot, not a net difference). `publicLotsNoLongerAllowed` counts the reverse; it is 0 for every preset and can only rise under a stricter custom knob.
- **Candidates:** the Plan tab's candidate policy (`isCandidateLot`): allowed, recorded Available for Sale, disposition-eligible (`isDispositionEligible`), no hazard flag at the inventory point, at least 1,000 sf.
- **Clear cost screen:** candidates whose default proposal, picked by the same `triageLot` the Lots tab runs, clears the cost-and-return screen through the same `financeResult` gate. Per-lot land overrides are not applied.
- **Parking unresolved:** candidates whose selected proposal has a required parking count the data cannot verify.
- **Typology delta:** for each home type, lots where it is allowed under the lever minus lots where it is allowed today. The bill and use-table levers show up only here, because on those lots a house was already allowed.

Only the 11,338 public records are screened. Existing homes and private parcels are not evaluated.

## Results

Default finance assumptions ($225/sf; `DEFAULT_FINANCE`). "Clear at 1.3×" is the same count with new homes valued at 1.3× the neighborhood index (`NEW_CONSTRUCTION_PREMIUM`). The numbers are printed by the "prints the lever table" test in `src/lib/levers.test.ts` (`pnpm vitest run src/lib/levers.test.ts --silent=false`).

| Preset | Allowed | Newly allowed | Candidates | Newly candidates | Clear cost screen | Clear at 1.3× | Parking unresolved | Δ house / +ADU / duplex / triplex / townhouse |
|---|--:|--:|--:|--:|--:|--:|--:|---|
| Today's code | 3,641 | 0 | 1,038 | 0 | 0 | 7 | 687 | 0 / 0 / 0 / 0 / 0 |
| Bill 2025-1545 (substitute) | 3,641 | 0 | 1,038 | 0 | 0 | 9 | 0 | 0 / +3,619 / 0 / 0 / 0 |
| Minimum lot size L 3,000 → 1,800 (§ 903.03.B.2) | 4,228 | 587 | 1,213 | 175 | 0 | 7 | 787 | +587 / 0 / +358 / 0 / +574 |
| Minimum lot size M 2,400 → 1,500 (§ 903.03.C.2) | 3,989 | 348 | 1,168 | 130 | 0 | 7 | 715 | +348 / 0 / +255 / +254 / +340 |
| Minimum lot size H 1,200 → 900 (§ 903.03.D.2) | 3,725 | 84 | 1,062 | 24 | 0 | 7 | 692 | +84 / 0 / +22 / +7 / +79 |
| Hillside minimum 3,200 → 2,000 (§ 905.02.C) | 3,641 | 0 | 1,038 | 0 | 0 | 7 | 687 | 0 / 0 / 0 / 0 / 0 |
| Two-unit by right in R1D/R1A (§ 911.02) | 3,641 | 0 | 1,038 | 0 | 0 | 9 | 688 | 0 / 0 / +2,128 / 0 / 0 |
| Three-unit by right in R2 (§ 911.02) | 3,641 | 0 | 1,038 | 0 | 0 | 7 | 687 | 0 / 0 / 0 / +756 / 0 |
| ADUs by right citywide (§ 912.08) | 3,641 | 0 | 1,038 | 0 | 0 | 9 | 691 | 0 / +3,619 / 0 / 0 / 0 |
| No parking minimums (§ 914.02.A) | 3,641 | 0 | 1,038 | 0 | 0 | 7 | 0 | 0 / 0 / 0 / 0 / 0 |

Where the lot-size levers land (top neighborhoods by newly allowed; district families with any change):

| Lever | Top neighborhoods (newly allowed) | Families (newly allowed) |
|---|---|---|
| L → 1,800 | Homewood North 178, Homewood West 68, New Homestead 61, Upper Hill 36, Lincoln-Lemington-Belmar 34 | R2 358, R1D 229 |
| M → 1,500 | Middle Hill 88, Crawford-Roberts 50, Homewood South 45, California-Kirkbride 37, Garfield 27 | RM 254, R1D 57, R1A 36, R2 1 |
| H → 900 | Larimer 23, Garfield 11, Perry South 9, Beltzhoover 8, Marshall-Shadeland 5 | R1D 42, R1A 20, R2 15, RM 7 |

What the table says:

- **Lot size is the lever that moves vacant lots.** Lowering the Low-Density minimum to 1,800 sq ft makes 587 more public lots allowed and 175 more candidates.
- **The bill adds no allowed lot.** It adds a house + ADU wherever a house is already allowed (3,619 lots), and it removes the unverified parking requirement on every candidate (687 → 0). Two more candidates clear the cost screen at the 1.3× premium (7 → 9), because a house + ADU becomes the proposal there.
- **Hillside minimum:** no Hillside lot becomes allowed, because a Hillside house still needs an Administrator Exception (§ 911.04.A.69(a)) whatever the lot size.
- **Two-unit and three-unit levers** make duplexes (2,128 lots) and triplexes (756 lots) allowed where only a house or townhouse was, without adding a lot.
- **At $225/sf, no candidate clears the cost screen under any lever.** Rules alone do not close the modeled shortfall.
- **Parking unresolved rises** under the lot-size levers (687 → 787 with L → 1,800) because there are more candidates, not because parking rules change.

## Performance

`runCustom` over all 11,338 lots takes about 150–200 ms in Node once today's baseline is cached (best of three in `levers.test.ts`, which asserts under 400 ms). The first call also computes the baseline, about 480 ms. The baseline is cached per lots array, comps array and assumption values.

## Worker protocol

Send `{ kind: "reform", seq, presetId | params, assumptions }` to the existing eval worker. It answers `{ seq, part: "reform", result: LeverResult, ms }` or `{ seq, part: "reform-error", message }`. Lots and comps default to the ones the worker already holds from eval requests; to use a worker that holds none, send `lots` and `comps` on the request. The eval hook ignores reform parts.
