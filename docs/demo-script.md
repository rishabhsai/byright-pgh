# Demo script, by clip

_Numbers from the Sept 27, 2026 build: current code, Any home type, sale mode, $225/sf plus a $35,000 site-work allowance per project, no land overrides. Replace [names]. Say the numbers however feels natural; the digits are written so you can read them. The cut should land at 3:20–3:50._

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

This is ByRight PGH, our Track One entry. We're [names]. On Saturday two of the hackathon's housing mentors said the same thing in Slack: before a developer bothers with a variance, they check whether the numbers work. And usually they don't, because building the house costs more than it will sell for. So we built the tool around that. It's for the City staff who decide which public lots to sell. It shows which lots deserve a closer look, which cost assumptions to double-check, and which zoning changes would actually matter. We used AI to pull the zoning code into rule tables you can read. Every decision comes from those tables and plain arithmetic.

Edit: title card "ByRight PGH" over the first two seconds; screenshot of the two Slack mentor messages (Tom Hardy Sat 4:00 p.m., Dennis Steigerwalt Sat 5:51 p.m., #housing-sme-help) slides in on "On Saturday" and out on "built around both"; caption "Rule tables + arithmetic. No model decides." on the last sentence.

## Clip 02: Plan tab, Hazelwood

**Click Plan. In the neighborhood box type "Haz", pick Hazelwood, press Escape. Click "Open in reading view". Let the funnel sit for a beat, then scroll slowly to the shortfall section.**

Start with Hazelwood. The City lists 797 vacant lots there. After the screen, 106 are worth staff review: 98 through URA transfer, eight through public sale. Each one comes with the next thing staff need to check.

Then the cost problem. At $225 a square foot plus $35,000 for site work, each of these ten homes needs to be worth about $440,000 to hit the target return. Zillow's neighborhood value, adjusted for size, is about $71,000. Staff know exactly what to verify with real bids and real sales before approving anything. It's a screen. It doesn't award anyone money.

Edit: captions "797 records → 106 candidates" and "98 URA Transfer · 8 Public Sale" on the funnel; "$225/sf + $35,000 site allowance" and "Needs ≈ $440,000 · Reference ≈ $71,000" on the shortfall; "This is a screen, not an award" at the end.

## Clip 03: 126 Carrington

**Clear the neighborhood filter. Press ⌘K, type "126 Carrington", Enter. Wait for the card. Click Pays. In Adjust assumptions, click the Construction field, press ⌘A, type 250 in one motion, wait about three seconds, and point the cursor at the premium count in the status strip. Then ⌘A, type 225, wait.**

One lot now. 126 Carrington, a townhouse lot the City is selling in Central Northside. At the neighborhood value it misses the target return. Assume buyers pay 30 percent more and it clears by about $1,200. Bump construction to $250 a foot and it's short again.

Edit: caption "Premium case clears by $1,207" while the field still reads 225; "At $250/sf: falls short" after the recompute; zoom-in on the status strip count.

## Clip 04: Forbes parcel

**Press ⌘K, paste `0086L00500000000`, Enter. Show the Allowed tab (518), then the Fits tab (259).**

It also catches hard stops. This lot on Forbes is 259 square feet. The most you could build is 518 square feet of floor area. A triplex doesn't fit, so the app doesn't run the money.

Edit: caption "259 sq ft lot · 518 sq ft floor-area limit · finance withheld".

## Clip 05: 5724 Murray Hill

**Press ⌘K, type "5724 Murray Hill", Enter. Hold on the "District unconfirmed" headline.**

On Murray Hill, the City's inventory says one district and the zoning map says another. Staff have to settle that before anything else.

Edit: caption "Inventory RM-M vs map R1D-L: resolve the district first".

## Clip 06: Ask ByRight

**Close the lot card. Press ⌘K, type "Hazelwood lots where a duplex passes if the L minimum drops to 1,800", Enter. Wait about four seconds for the three chips to appear. Hover one chip's undo.**

Or just ask. A question becomes filters you can see and undo one at a time. The model only picks filters. It never writes a number.

Edit: caption "The model picks filters. It never writes a number."

## Clip 07: Reform

**Click the "Minimum lot size L 3,000 → 1,800" lever row (or open `?tab=reform&preset=min-lot-L-1800`). Scroll to "Where it moves" and hold. Then click the Bill 2025-1545 preset and hold.**

Reform answers a different question: which rule is actually holding lots back. Drop the low-density lot minimum from 3,000 to 1,800 square feet and 587 more public lots pass the screen. 175 join the review list. Homewood North alone gains 178. None clear the cost screen at today's prices. The bill Council is considering unlocks zero new lots. It allows more housing types on lots that already qualify. Useful, but different.

Edit: captions "+587 pass the screen · +175 review cohort · Homewood North +178" and "Bill 2025-1545: 0 additional lots, more home-type options".

## Clip 08: Export

**Click "Reset filters" in the applied-changes row. Click Plan, add Hazelwood, press Escape. Click Export CSV, then Download brief (both pinned in the Plan header). Let the downloads show.**

Staff leave with a CSV of every check, citation and assumption, plus a one-page brief.

Edit: caption "68 columns: checks, citations, assumptions, next action"; quick cut to the CSV opened in a spreadsheet if you also send a screenshot of it.

## Clip 09: About, close

**Open About. Scroll slowly through Sources and Validation. Hold on the last screen.**

Every number comes from public data, the rule tables and arithmetic. Practitioners haven't validated it yet, and the app says so. We're proposing a six-week pilot with City Planning, the URA and the Land Bank: thirty parcels, publish every disagreement, measure staff time saved. Nobody has signed on yet. This is decision support, not a zoning determination.

Edit: end card with the repo URL and live URL, team names, "Decision support, not a zoning determination."

## Never say

"98.3% accurate", "587 homes unlocked", "3,619 ADUs will be built", "zero feasible lots", "$3.69M required subsidy".

## Assets I will make for the edit

- Slack screenshot of the two mentor messages (I will capture it, or send me a ⌘⇧4 of the thread if you have Slack open).
- Title card, end card, lower-third captions in the app's type and gray palette.
- Chapter titles between clips: Plan, Lot, Ask, Reform, Export.
