# ByRight PGH visual system

A light civic workspace: platform typography, graphite text, white surfaces, quiet separators and one interaction accent. This layer preserves the existing component tree, props, copy, figures, decision rules, data paths and exports.

## Tokens

`src/app/globals.css` owns the tokens in `@theme`; `layout.tsx` loads variable Inter with `display: swap`. The sans stack is `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", var(--font-inter), sans-serif`. Use the platform font first and Inter where those fonts are unavailable. Figures inherit tabular numerals.

| Role | Token / value |
| --- | --- |
| Workspace / panel | `surface` #f5f5f7 / `panel` #fff |
| Primary / secondary / tertiary text | `ink` #1d1d1f / `muted` #6e6e73 / `faint` #86868b |
| Separator | `hairline` rgba(0,0,0,.08) |
| Interaction / selected background | `accent` #0071e3 / `accent-soft` #e8f2ff |
| Input / segmented track | `control` #f2f2f7 / `track` #e9e9eb |
| Pass / approval / relief / prohibited / unknown | `v-byright` #34c759 / `v-review` #007aff / `v-variance` #ff9f0a / `v-prohibited` #ff3b30 / `v-unknown` #8e8e93 |
| Bill and caution background | `warning-soft` #fff4e2 |
| Readable status text | `success-ink` #187b35 / `review-ink` #005bbd / `warning-ink` #855000 / `danger-ink` #c42b22 |

State colors identify screening results; blue accent identifies interaction. Use bright state colors for bars, dots and icons, and companion inks for text. MapLibre resolves these same CSS color tokens for canvas paint. The existing “Gold ring” copy remains unchanged; its appearance is amber.

## Typography

| Utility | Size / line height | Weight | Tracking |
| --- | --- | --- | --- |
| `text-hero` (empty-state figures) | 48 / 56px | 600 | −.02em |
| `text-display` (lot title, headline figures) | 34 / 40px | 600 | −.02em |
| `text-title` (section and Plan headings) | 22 / 28px | 600 | −.015em |
| `text-headline` | 17 / 24px | 600 | normal |
| `text-body` | 15 / 22px | 400 | normal |
| `text-callout` | 13 / 18px | inherited, normally 400 | normal |
| `text-caption` | 12 / 16px | 500 | normal |
| `text-status` (status pills only) | 11 / 16px | 500 | .04em, uppercase |

Empty states lead with `StatBlocks` (ui/Funnel.tsx): two `text-display` figures with caption labels on one row, then the sentence in `text-body`, muted. No display-size figures inside empty-state prose. Hero numbers and financial totals align to the label baseline where space permits. Dense figure groups wrap into rows; keep every label and value available. No serif styling.

## Surfaces and components

- Work in 8px increments, with 4px adjustments for compact controls. `p-panel` = 24px, `p-card` = 20px, `space-y-section` = 32px. The rail is 360px; detail is 380px and 440px at 1440px viewport width. Both are resizable (`ui/ResizeHandle.tsx`, `paneLayout.ts`): an 8px `col-resize` hit area over each pane's hairline, which turns accent on hover, focus and drag; rail 280–520px, detail 340–720px, and the map never under 360px. Double-click restores the defaults; ←/→ move 16px (Shift 64px), Home/End go to min/max. Widths persist in `localStorage` (`byright.layout.v1`) and are dropped while they would squeeze the map.
- `surface-card`: white, 12px corners, no outer border; shadow `0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)`. Use hairlines between rows.
- `toolbar`: translucent white with `saturate(180%) blur(20px)`. Used on the top bar and panel/drawer headers.
- `button-primary` / `button-secondary`: blue / gray, pill radius 980px, 15px semibold. `icon-button`: 32px gray circle. SVG strokes are 1.5px, with non-scaling strokes.
- `input-field` / `input-shell`: 36px minimum height, 10px corners, gray fill. Focus uses a 3px accent ring at 30% alpha. An invalid numeric field retains its amber edge and existing explanation.
- `Segmented`: 32px gray track, white thumb, 13px medium labels. The thumb measures existing buttons and follows selection and resizing; radio/tab semantics and keyboard behavior are unchanged. Switches use a white thumb on a gray/green track.
- Status chips use `status-chip`; verdict chips retain sentence case and a leading dot. Compact list triage markers retain their existing letters and accessible names, with a leading colored dot.
- `evidence-meter`: six equal cells in one surface, separated by hairlines, with 3px state bars, caption labels and callout states. Unknown stays hatched; not checked stays outlined. Words never break mid-word (`hyphens: none`, `overflow-wrap: normal`); below a 384px meter (both detail-panel widths) the cells form two rows of three.
- The map stays full bleed. `map-legend` is a floating white pill; `map-scenario` stacks above it so wrapped legend text cannot overlap the scenario note.
- Tooltips retain their 200ms delay and keyboard behavior, with graphite fill, 8px corners and 12px text.
- Motion uses `cubic-bezier(.2,.8,.2,1)`, 160ms press, 200ms controls and 220ms reveal. Selection fades and rises 6px; presses scale to .98. Reduced motion removes transitions, stagger and press scaling; numeric counts finish on the next animation frame.

Light mode is intentional. Dark mode is omitted because map tiles, state colors and dense evidence text need visual contrast verification together. No browser verification was available for this pass.
