# Demo script

_Numbers from the Sept 26, 2026 build: current code, Any home type, sale mode, $185/sf, no land overrides._

AI for Housing Hackathon, Track 1. We're [names]; this is ByRight PGH, a review queue for the City's vacant land.

Suppose staff are asked which City lots in Hazelwood could take a small home, through which recorded channel, and what shortfall appears under stated assumptions. Today this means parcel-by-parcel lookups.

**Plan, pick Hazelwood, open reading view.** Hazelwood has 797 City records. 754 are in encoded districts; 285 pass the use table and lot-size standards; 123 are recorded for sale with no slope, mine or flood flag; 106 are at least a thousand square feet. Those 106 are candidates for staff review, with open questions: 98 through URA Transfer, eight through Public Sale. None clears the cost-and-return screen against the neighborhood index.

The ten selected prototypes each need about $331,000 of value to reach cost plus the target return; the Hazelwood index puts them at about $71,000. Together they show a $2.59 million modeled shortfall at $185 a foot. At $150 it is $1.97 million; at $215, $3.13 million. That is a screen, not a subsidy award.

**Click 4623 Chatsworth St, then Fits, then Pays.** A house is allowed by the use table in R1D-H. Four checks pass, Finance fails, Fit is not checked: setbacks and height are not modeled, and one parking space must fit. Not checked never counts as a pass. Cost $300,100 against $71,213 of modeled value: $258,897 short of the target return.

**Clear the neighborhood. ⌘K, "126 Carrington".** A Public Sale townhouse in Central Northside: $350,450 cost, $391,048 value, $5,553 above the ten percent return. **Pays: construction 185 to 195.** Now $15,237 short. Thin, and we say so. **Back to $185.** **Lots tab, Home type: Duplex.** Not allowed here, and no money line appears anywhere. **Back to Any.**

**⌘K, paste 0086L00500000000.** Two traps. 0 Forbes is LNC, with no minimum lot size, but it is 259 square feet and floor-area ratio caps the building at 518. The triplex fails Fit, so Finance is not screened. **⌘K, 5724 Murray Hill.** The inventory says RM-M; the City map says R1D-L. We do not pick one: Use stays unknown and Finance is not screened until someone confirms the district.

**Back to the Hazelwood plan (Plan tab, add Hazelwood): Export CSV, Download brief.** Staff leave with a 797-row CSV, every check cited, and a short review brief. Rows whose finance was not screened carry no dollar figures and say why.

**About the data.** Claude extracted the zoning tables from saved code captures; each row was checked against its capture. No model sits in the decision path: every verdict, count and dollar figure is tables, public data and arithmetic. No partnership exists yet. We propose a six-week pilot on Hazelwood and Larimer, asking City Planning to check 30 parcels and publishing every disagreement. Decision support, not zoning advice.

## Recording notes

- 1920×1080, browser zoom 110%, pre-warm the page once so the first-load skeleton is not on camera. Record beats as separate clips.
- Type "195" in one quick motion and wait about 2.5 s before cutting; slow typing shows an intermediate value.
- Before the duplex beat click the Lots tab; after "Back to Any" return to Plan and re-add Hazelwood before exporting.
- Use the full parcel ID for 0 Forbes Av (0086L00500000000); by name it ranks third.
