# Demo script

_Numbers from the Sept 27, 2026 build: current code, Any home type, sale mode, $225/sf plus a $35,000 site-work allowance per project, no land overrides. Replace [names]. Target 3:20–3:50 with pauses._

**Open the app.** AI for Housing Hackathon, Track One. We're [names]. ByRight PGH helps Pittsburgh disposition staff decide which public lots deserve review, what financial assumptions need checking, and which zoning changes would matter. AI helped extract the zoning text into inspectable rule tables; rules and arithmetic make every decision.

**Plan tab, pick Hazelwood, Escape, open reading view.** Start with Hazelwood. Seven hundred ninety-seven inventory records become one hundred six candidates for staff review: ninety-eight recorded as URA Transfer, eight as Public Sale. Each row carries its next review action in the export.

Now the financial hurdle. At two hundred twenty-five dollars per square foot, plus a thirty-five-thousand-dollar site-work allowance per project, the ten selected prototypes need roughly four hundred forty thousand dollars of value each, including the target return. Their size-adjusted neighborhood reference value is about seventy-one thousand. Staff verify bids and new-home sales before approvals. A screen, not a subsidy award.

**Clear the neighborhood. ⌘K, "126 Carrington".** A different case: a Public Sale townhouse in Central Northside. At the reference value it falls short of the target return. A hypothetical thirty-percent value premium clears that target by only about twelve hundred dollars. **Pays: open Adjust assumptions, select the construction field, type 250, wait; point at the status line's premium count.** Raise construction to two hundred fifty and the premium case falls short again. **Back to 225.**

**⌘K, paste 0086L00500000000.** It also catches hard stops. This Forbes parcel is two hundred fifty-nine square feet; its floor-area limit is five hundred eighteen, so the triplex prototype fails and finance is withheld. **⌘K, 5724 Murray Hill.** Here the inventory and the zoning map disagree. Staff resolve the district first.

**Close the card. ⌘K, type "Hazelwood lots where a duplex passes if the L minimum drops to 1,800", Enter.** Ask ByRight turns that sentence into three filters you can see and undo; the model only chooses filters and levers, every number is the engine's. **Click the "Minimum lot size L 3,000 → 1,800" lever row, scroll to Where it moves.** Reform asks which rule binds. Lower the low-density lot minimum from three thousand to eighteen hundred square feet: five hundred eighty-seven more public lots pass the encoded screen, one hundred seventy-five join the review cohort, Homewood North gains one hundred seventy-eight. None clears the default cost screen. **Click Bill 2025-1545.** The bill unlocks no additional lot; it adds home-type options on lots already allowed, a different benefit.

**Plan tab, add Hazelwood: Export CSV, Download brief.** Staff leave with a CSV of checks, citations, assumptions and next actions, plus a short review brief.

**About the data.** Every verdict and figure comes from tables, public data and arithmetic. Independent practitioner validation is not finished; we say so. We propose a six-week pilot with City Planning, the URA and the Land Bank to review thirty parcels, publish every disagreement and measure staff time. No partner has committed. Decision support, not a zoning determination.

## Recording notes

- 1920×1080, browser zoom 110%, pre-warm the page once. Double-click the rail/panel handles and the rail's split handle first so the layout is at defaults. Record beats as separate clips.
- After picking Hazelwood in the combobox, press Escape before "Open in reading view".
- In the construction field, select all (⌘A) and type "250" in one motion; wait about 2.5 s. Clicking and typing appends.
- Use the full parcel ID for 0 Forbes Av. 259 sq ft is on the Fits tab; 518 is on Allowed.
- Hold a beat on the Reform and About screens; the narration alone runs about 2:40, the take lands near 3:15.
- Close any open lot card before the Ask beat; the question takes 1–3 s to apply; then click the lever row (or open `?tab=reform&preset=min-lot-L-1800`) rather than hand-dragging the slider.
- Never say: "98.3% accurate", "587 homes unlocked", "3,619 ADUs will be built", "zero feasible lots", "$3.69M required subsidy".
