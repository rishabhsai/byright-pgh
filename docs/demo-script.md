# Demo script, by clip

_Numbers from the Sept 27, 2026 build: current code, Any home type, sale mode, $225/sf plus a $35,000 site-work allowance per project, no land overrides. Replace [names]. Narration is 461 words; the cut should land at 3:20–3:50._

## How to record

- Record each clip separately with QuickTime (File → New Screen Recording, microphone on) and say that clip's lines while you do the actions. If you would rather not talk while clicking, record the screen silently and send a voice memo per clip named the same way with `-voice` (`clip-03-voice.m4a`).
- Save clips as `clip-01.mov`, `clip-02.mov`, … in `/Users/rishabhsai/Desktop/AIhorizonshack/video/clips/` (outside the repo). Same mic, same room, no music. Leave about one second of silence before the first word and after the last.
- If you flub a line, keep recording, pause, and restart that sentence. I cut the flub. Only re-record a clip if the screen shows the wrong thing.
- Setup once: 1920×1080, browser zoom 110%, https://byright-pgh.vercel.app, pre-warm the page once. Double-click the rail/panel handles and the rail's split handle so the layout is at defaults. Hide the bookmarks bar and any extension icons.
- Words in **bold** are what you do. Plain text is what you say. Lines under "Edit" are mine: captions, overlays and cuts I add afterwards, so you do not have to show them.

Clip list:

| Clip | Beat | Target length |
|---|---|---|
| 01 | Cold open on the map | 0:25 |
| 02 | Plan tab, Hazelwood funnel and cost hurdle | 0:45 |
| 03 | 126 Carrington, premium and 250 | 0:35 |
| 04 | Forbes parcel, FAR hard stop | 0:15 |
| 05 | Murray Hill, district disagreement | 0:10 |
| 06 | Ask ByRight | 0:20 |
| 07 | Reform lever and Bill 2025-1545 | 0:35 |
| 08 | Export CSV and brief | 0:15 |
| 09 | About the data, close | 0:30 |

## Clip 01: cold open

**Open the app on the map with nothing selected. Slowly pan or just hold still.**

AI for Housing Hackathon, Track One. We're [names]. On Saturday the hackathon's housing mentors told teams two things: developers check whether a project pencils before chasing a variance, and cost above value is the biggest blocker. ByRight PGH is built around both. It helps Pittsburgh disposition staff decide which public lots deserve review, what financial assumptions need checking, and which zoning changes would matter. AI helped extract the zoning text into inspectable rule tables; rules and arithmetic make every decision.

Edit: title card "ByRight PGH" over the first two seconds; screenshot of the two Slack mentor messages (Tom Hardy Sat 4:00 p.m., Dennis Steigerwalt Sat 5:51 p.m., #housing-sme-help) slides in on "On Saturday" and out on "built around both"; caption "Rules and arithmetic make every decision" on the last sentence.

## Clip 02: Plan tab, Hazelwood

**Click Plan. In the neighborhood box type "Haz", pick Hazelwood, press Escape. Click "Open in reading view". Let the funnel sit for a beat, then scroll slowly to the shortfall section.**

Start with Hazelwood. Seven hundred ninety-seven inventory records become one hundred six candidates for staff review: ninety-eight recorded as URA Transfer, eight as Public Sale. Each candidate carries its next review action in the export.

Now the financial hurdle. At two hundred twenty-five dollars per square foot, plus a thirty-five-thousand-dollar site-work allowance per project, the ten selected prototypes need roughly four hundred forty thousand dollars of value each, including the target return. Their size-adjusted neighborhood reference value is about seventy-one thousand. Staff verify bids and new-home sales before approvals. A screen, not a subsidy award.

Edit: captions "797 records → 106 candidates" and "98 URA Transfer · 8 Public Sale" on the funnel; "$225/sf + $35,000 site allowance" and "Needs ≈ $440,000 · Reference ≈ $71,000" on the shortfall; "A screen, not a subsidy award" at the end.

## Clip 03: 126 Carrington

**Clear the neighborhood filter. Press ⌘K, type "126 Carrington", Enter. Wait for the card. Click Pays. In Adjust assumptions, click the Construction field, press ⌘A, type 250 in one motion, wait about three seconds, and point the cursor at the premium count in the status strip. Then ⌘A, type 225, wait.**

A different case: a Public Sale townhouse in Central Northside. At the reference value it falls short of the target return. A hypothetical thirty-percent value premium clears that target by only about twelve hundred dollars. Raise construction to two hundred fifty and the premium case falls short again.

Edit: caption "Premium case clears by $1,207" while the field still reads 225; "At $250/sf: falls short" after the recompute; zoom-in on the status strip count.

## Clip 04: Forbes parcel

**Press ⌘K, paste `0086L00500000000`, Enter. Show the Allowed tab (518), then the Fits tab (259).**

It also catches hard stops. This Forbes parcel is two hundred fifty-nine square feet; its floor-area limit is five hundred eighteen, so the triplex prototype fails and finance is withheld.

Edit: caption "259 sq ft lot · 518 sq ft floor-area limit · finance withheld".

## Clip 05: 5724 Murray Hill

**Press ⌘K, type "5724 Murray Hill", Enter. Hold on the "District unconfirmed" headline.**

Here the inventory and the zoning map disagree. Staff resolve the district first.

Edit: caption "Inventory RM-M vs map R1D-L: resolve the district first".

## Clip 06: Ask ByRight

**Close the lot card. Press ⌘K, type "Hazelwood lots where a duplex passes if the L minimum drops to 1,800", Enter. Wait about four seconds for the three chips to appear. Hover one chip's undo.**

Ask ByRight turns that sentence into three filters you can see and undo; the model only chooses filters and levers, every number is the engine's.

Edit: caption "The model picks filters and levers. It never produces a number."

## Clip 07: Reform

**Click the "Minimum lot size L 3,000 → 1,800" lever row (or open `?tab=reform&preset=min-lot-L-1800`). Scroll to "Where it moves" and hold. Then click the Bill 2025-1545 preset and hold.**

Reform asks which rule binds. Lower the low-density lot minimum from three thousand to eighteen hundred square feet: five hundred eighty-seven more public lots pass the encoded screen, one hundred seventy-five join the review cohort, Homewood North gains one hundred seventy-eight. None clears the default cost screen. The bill unlocks no additional lot; it adds home-type options on lots already allowed, a different benefit.

Edit: captions "+587 pass the screen · +175 review cohort · Homewood North +178" and "Bill 2025-1545: 0 additional lots, more home-type options".

## Clip 08: Export

**Click "Reset filters" in the applied-changes row. Click Plan, add Hazelwood, press Escape. Click Export CSV, then Download brief (both pinned in the Plan header). Let the downloads show.**

Staff leave with a CSV of checks, citations, assumptions and next actions, plus a short review brief.

Edit: caption "68 columns: checks, citations, assumptions, next action"; quick cut to the CSV opened in a spreadsheet if you also send a screenshot of it.

## Clip 09: About, close

**Open About. Scroll slowly through Sources and Validation. Hold on the last screen.**

Every verdict and figure comes from tables, public data and arithmetic. Independent practitioner validation is not finished; we say so. We propose a six-week pilot with City Planning, the URA and the Land Bank to review thirty parcels, publish every disagreement and measure staff time. No partner has committed. Decision support, not a zoning determination.

Edit: end card with the repo URL and live URL, team names, "Decision support, not a zoning determination."

## Never say

"98.3% accurate", "587 homes unlocked", "3,619 ADUs will be built", "zero feasible lots", "$3.69M required subsidy".

## Assets I will make for the edit

- Slack screenshot of the two mentor messages (I will capture it, or send me a ⌘⇧4 of the thread if you have Slack open).
- Title card, end card, lower-third captions in the app's type and gray palette.
- Chapter titles between clips: Plan, Lot, Ask, Reform, Export.
