/**
 * Scroll `el` into view inside its own `[data-scroll]` container only, the least distance needed.
 * Unlike scrollIntoView, this never scrolls ancestors (or the document), so the app shell stays put.
 */
export function revealInScroller(el: HTMLElement | null | undefined) {
  const box = el?.closest<HTMLElement>("[data-scroll]");
  if (!el || !box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const top = b.top + box.clientTop;
  // Bottom edge of the visible area: the border box minus the bottom border and any horizontal scrollbar.
  const bottom = b.bottom - (box.offsetHeight - box.clientHeight - box.clientTop);
  if (r.top < top) box.scrollTo({ top: box.scrollTop - Math.ceil(top - r.top) });
  else if (r.bottom > bottom) box.scrollTo({ top: box.scrollTop + Math.ceil(Math.min(r.bottom - bottom, r.top - top)) });
}
