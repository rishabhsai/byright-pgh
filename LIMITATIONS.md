# Limitations

What ByRight PGH does not check, model, or claim. This mirrors the Limitations section of the README and the About drawer in the app; the README is the maintained copy.

- **City of Pittsburgh only.** Allegheny County has 130 municipalities with their own codes.
- **Only residential districts, LNC, and Hillside are encoded.** Lots in other districts (Parks, industrial, downtown, planned developments) show *not evaluated*.
- **Not all standards are encoded.** Setbacks, height, lot coverage, overlay districts (riverfront, IPOD, historic), steep-slope overlay rules, and subdivision requirements are out of scope. A by-right verdict here means the use is permitted and no encoded lot-size, lot-width or (in LNC) floor-area check fails. Missing lot area, width, flood screening or zoning-map agreement is marked unknown and keeps the lot out of Green. Fit is never a pass, and Fit *not checked* does not block Green. Parking is reported, not verified: where the code requires spaces, the item stays open for the site plan and does not block Green. It is not a zoning determination.
- **Assessed land value is not market value.** The pro forma is a screen with editable assumptions.
- **Lots under 1,000 sq ft can't be Green.** That floor is our screening assumption, not code; LNC and VH districts set no minimum. Such lots likely need consolidation.
- **Comps are neighborhood and ZIP aggregates,** not parcel-level sales. Zillow's public research files are used under their attribution terms; where a neighborhood has no Zillow value the pro forma falls back to the ZIP's rent index, and a lot with neither is marked "not assessed" and can't be Green.
- **Frontage is parsed from the legal description** when present and is approximate. A survey governs.
- **The zoning district comes from the City inventory, cross-checked at one point.** The engine evaluates the inventory's `zoned_as`. We compare it with the City zoning map at the lot's inventory point; where they disagree (or no map district contains the point) the Use check is Unknown, Finance is not screened, the lot cannot be Green, and resolving the district is its first open item, but the engine does not re-evaluate the lot under the map's district. A lot that straddles a boundary is compared at one point only.
- **No ADU overlay layer.** Under today's code a house + ADU is *permission unresolved* on every lot until staff confirm whether it is inside an adopted ADU Overlay District.
- **Hazard flags are screening layers,** not site engineering. Undermined-area maps in particular are historic and incomplete.
- **Hazard flags are tested at the inventory point, not the parcel polygon.** Each lot has one point in the City inventory; a hazard touching another part of the parcel is missed. The app says "no hazard found at the inventory point", never "site clear".
- **Inventory membership is not proof of current ownership or availability.** The file includes acquisition-pending, sale-pending, and permanent-ownership statuses, and two records marked Privately Owned. Confirm ownership and disposition status with the Real Estate Division (or the URA for URA-transfer lots) before acting.
- **Bill 2025-1545 is pending.** The "if it passes" rule set encodes the substitute text heard on Sept 23, 2026; Council may amend it.
- **No personal data.** Every record is a public parcel record from the City's property inventory (which includes two records marked Privately Owned).

## Not modeled at all

- Side and rear setbacks, height, lot coverage, and buildable width. A 19-ft lot can pass the lot-size standard and still be unbuildable for a detached house once side yards apply; the Fit check says "not checked" for exactly this reason.
- Utilities (water and sewer line condition and location), soils, prior demolition debris in old basements, environmental conditions. Mentors named these as the costs that decide small infill; they are not in public parcel data.
- Household affordability, income restrictions, subsidy eligibility, debt coverage. Rental mode capitalizes NOI; it does not test PHFA's 1.15 debt-service coverage standard, which would be the next test to add.
- Legal nonconformity (§ 921 grandfathering) and any ZBA outcome prediction.

Decision support only. The City's Zoning Administrator interprets the code.
