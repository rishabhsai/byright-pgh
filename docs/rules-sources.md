# Rules engine sources

What `src/lib/rules/` encodes, where each number was read, and what it deliberately leaves out.
Verbatim page text captured on the access date lives in `docs/sources/` (ecode360 pages rendered
in a headed browser because the site blocks plain HTTP clients; the bill is `pdftotext` output plus
rendered page images for the redline).

Accessed: 2026-09-26. ecode360 header shows the Pittsburgh code current through **2026-09-16**.
§ 903.03 carries the history note `Ord. No. 10-2025, eff. 5-7-2025`, so the residential dimensional
table below is the post-May-2025 minimum-lot-size reform (one minimum lot size per density
subdistrict; no lot-area-per-unit row; no minimum lot width). The § 911.02 use table history runs
through `Ord. No. 18-2026, eff. 6-11-2026`.

## Encoded standards

| District | Typology / dimension | Value (`current`) | Value (`bill-2025-1545`) | Section | URL |
|---|---|---|---|---|---|
| R1D, R1A, R2, R3, RM -VL | Minimum lot size | 6,000 sq ft | same | § 903.03.A.2 | https://ecode360.com/45474225 |
| R1D, R1A, R2, R3, RM -L | Minimum lot size | 3,000 sq ft | same | § 903.03.B.2 | https://ecode360.com/45474231 |
| R1D, R1A, R2, R3, RM -M | Minimum lot size | 2,400 sq ft | same | § 903.03.C.2 | https://ecode360.com/45474237 |
| R1D, R1A, R2, R3, RM -H | Minimum lot size | 1,200 sq ft | same | § 903.03.D.2 | https://ecode360.com/45474243 |
| R1D, R1A, R2, R3, RM -VH | Minimum lot size | none listed | same | § 903.03.E.2 | https://ecode360.com/45474250 |
| all residential subdistricts | Minimum lot area per unit | none (row removed by Ord. 10-2025) | same | § 903.03 | as above |
| all residential subdistricts | Minimum lot width | none in § 903.03 | same | § 903.03 | as above |
| LNC | Minimum lot size | 0 | 0 (bill § 2 restates the table unchanged) | § 904.02.C | https://ecode360.com/45474257#45474277 |
| H | Minimum lot size | 3,200 sq ft | same (bill does not amend § 905.02) | § 905.02.C | https://ecode360.com/45474542#45474559 |
| R1D | Single-Unit Detached | P | same | § 911.02 | https://ecode360.com/45476524 |
| R1D | Single-Unit Attached (townhome) | P/S: P if lot width <= 35 ft, else S | same | § 911.02; § 911.04.A.69A | https://ecode360.com/45476524 |
| R1D | Two-Unit, Three-Unit | not listed (prohibited) | same | § 911.02 | https://ecode360.com/45476524 |
| R1A | Single Detached P; Attached P; Two-Unit, Three-Unit not listed | | same | § 911.02 | https://ecode360.com/45476524 |
| R2 | Single Detached P; Attached P; Two-Unit P; Three-Unit not listed | | same | § 911.02 | https://ecode360.com/45476524 |
| R3, RM, LNC | Single Detached P; Attached P; Two-Unit P; Three-Unit P | | same | § 911.02 | https://ecode360.com/45476524 |
| H | Single Detached A; Attached S (<= 4 per cluster); Two-Unit, Three-Unit not listed | | same | § 911.02; § 911.04.A.69(a),(c) | https://ecode360.com/45476524 |
| all | Parking, Single-Unit Detached | 1 per unit (max 4) | 0 (Schedule A minimums struck; § 914.02.A becomes a maximum-only schedule) | § 914.02.A / bill § 40 | https://ecode360.com/45478031 ; bill PDF pp. 112, 140 |
| all | Parking, Single-Unit Attached | 0 per unit | 0 | § 914.02.A / bill § 40 | same |
| all | Parking, Two-Unit | 1 per unit | 0 | § 914.02.A / bill § 40 | same |
| all | Parking, Three-Unit | 1 per unit | 0 | § 914.02.A / bill § 40 | same |
| all | ADU permitted where | only inside an adopted ADU Overlay District | any lot whose primary use is Residential (also Community Center, Religious Assembly) | § 912.08 / bill § 37 (§ 912.08.C.2) | https://ecode360.com/45477814 ; bill PDF p. 108 |
| all | ADUs per zoning lot | 1 | 2 (accessory to a Residential use) | § 912.08.E.3 / bill § 912.08.C.8 | same |
| all | ADU owner-occupancy | required (§ 912.08.E.4) | requirement struck | § 912.08 / bill § 37 | same |
| all | ADU max size | under 800 sq ft | 1,000 sq ft | § 912.08.D.2 / bill § 912.08.B.1 | same |
| all | ADU parking | exempt (§ 912.08.E.9) | no minimums citywide | § 912.08 / bill § 40 | same |

Bill PDF: https://www.pittsburghpa.gov/files/assets/city/v/1/dcp/documents/planning-commission/council-hearings-or-other/2025-1545-to-be-amended-by-substitute-from-june-2-2026-corrected-july-24-2026_final.pdf
(local copy `/tmp/hack/bill-2025-1545.pdf`, text `/tmp/hack/bill.txt`). The bill's Section 1 touches only
§ 903.02.E (RM bonus height); it does not change the § 903.03 lot-size tables or the residential rows of
§ 911.02, so under `bill-2025-1545` those checks cite the current code page with `ruleSet: "bill-2025-1545"`.

## How the verdict is derived

Use-table letter N -> `prohibited`. Any dimensional check (lot area, lot width, lot area per unit) with
`passed === false` -> `variance`. Otherwise P -> `by-right`, A or S -> `review`. A check whose input is
missing from the inventory gets `passed: null`, is labelled "needs survey", is mentioned in the summary,
and never changes the verdict. `single_adu` = the Single-Unit Detached row plus the ADU rule: under
`current` the ADU rule is N (no overlay data), under the bill it is P. Districts outside the registry
(P, EMI, RIV/DR, GT, SP, UI, GI, HC, NDO, NDI, UNC, UC, PUD, GPR, UNKNOWN) return `unknown` for every
typology.

## What we did NOT encode

- Setbacks, maximum height, lot coverage, FAR, maximum area of disturbance (H).
- Overlay districts, including any ADU Overlay District, IPOD, riverfront (RIV), Grandview and other
  Public Realm districts, historic districts.
- Steep-slope / landslide-prone rules of § 915 and the H-district site conditions of § 911.04.A.69(a)
  (topography, soils, vegetation, access, infrastructure), Site Plan Review triggers.
- Subdivision / consolidation, nonconforming lots of record (§ 921), contextual setbacks (§ 925.06-07).
- Residential Compatibility Standards (§ 916), parking maximums, bicycle parking, the PRT Frequent
  Service Walkshed used by the bill's maximum parking table.
- Bill provisions other than ADUs and parking minimums (affordable housing bonus points/height,
  Community Center rows, mixed-use district changes).

## Caveats

Mirrors the `caveats` export in `src/lib/rules/index.ts`.

1. Screening only; the Zoning Administrator interprets the code.
2. Current-code ADU verdicts assume the lot is outside any ADU Overlay District; the prototype has
   no overlay layer. The only overlay we know of was the 2018 interim pilot (Ord. 32-2018).
3. Missing lot area or frontage -> "needs survey", verdict not downgraded.
4. Frontage stands in for Lot Width in the § 911.04.A.69A 35 ft test; the code's Lot Width
   definition (§ 925/926) can differ from street frontage.
5. Parking minimums are reported, not checked against lot geometry.
6. H-district single-unit uses require Administrator Exception review; those site conditions are
   not encoded.
7. § 903.03.E lists no minimum lot size for VH subdistricts; the engine treats VH as having none.
8. The bill text used is the substitute as posted for the Sept 23, 2026 hearing; Council may amend
   it further. pdftotext drops strikethrough, so deletions were confirmed against rendered pages
   (108, 112, 140).
