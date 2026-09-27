// Address, block-lot and parcel search: the one index ⌘K and /api/ask resolve lots with. Pure; no React.

export const SEARCH_LIMIT = 8;

const SUFFIX: Record<string, string> = {
  wy: "way",
  av: "avenue",
  ave: "avenue",
  st: "street",
  str: "street",
  pl: "place",
  rd: "road",
  blvd: "boulevard",
  bl: "boulevard",
  dr: "drive",
  ln: "lane",
  ct: "court",
  ter: "terrace",
  terr: "terrace",
  cir: "circle",
  hwy: "highway",
  pk: "park",
  sq: "square",
};

/** Spelled-out street suffixes: a query may add one the inventory address leaves off. */
const SUFFIX_WORDS = new Set(Object.values(SUFFIX));

/**
 * Lowercase, drop punctuation, spell out street suffixes, and drop leading zeros from house numbers,
 * so "5118 Ladora Way" finds "5118 Ladora Wy" and "110 Roup Ave" finds "0110 Roup Av" ("0" stays "0").
 */
export function normalizeAddress(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIX[w] ?? (/^\d+$/.test(w) ? w.replace(/^0+(?=\d)/, "") : w))
    .join(" ");
}

/**
 * A block-lot number ("56-N-203", "23 E 93", "0056N00203000000") as a parcel ID prefix:
 * four-digit block, letter, five-digit lot, then optional sub-lot digits.
 */
export function parcelPrefix(q: string): string | null {
  const s = q.trim().toLowerCase();
  const compact = s.replace(/[\s-]/g, "");
  if (/^\d+$/.test(compact) || /^\d{4}[a-z]\d*$/.test(compact)) return compact;
  const m = s.match(/^(\d{1,4})[\s-]*([a-z])[\s-]*(\d{1,5})(?:[\s-]+(\d{1,4}))?$/);
  if (!m) return null;
  return `${m[1].padStart(4, "0")}${m[2]}${m[3].padStart(5, "0")}${m[4] ? m[4].padStart(4, "0") : ""}`;
}

export interface SearchEntry {
  /** normalizeAddress(address) */
  addr: string;
  /** Parcel ID, lowercase. */
  id: string;
  /** normalizeAddress(neighborhood); lets "forbes squirrel" narrow to one section of a long street. */
  hood?: string;
  /** False for lots the screen does not evaluate; they rank after evaluated lots with the same score. */
  evaluated?: boolean;
}

/**
 * How well one lot matches the query tokens; 0 when any token matches nothing. Exact street-name and
 * house-number tokens beat prefixes, which beat neighborhood tokens, which beat loose substrings.
 */
function tokenScore(r: SearchEntry, tokens: string[], whole: string): number {
  const words = r.addr.split(" ");
  const hood = r.hood ? r.hood.split(" ") : [];
  // The inventory often omits the suffix ("126 Carrington"): a trailing suffix in the query that the
  // address lacks is tolerated rather than failing the match.
  const addrHasSuffix = SUFFIX_WORDS.has(words[words.length - 1] ?? "");
  const last = tokens.length - 1;
  const extraSuffix = tokens.length > 1 && SUFFIX_WORDS.has(tokens[last]) && !addrHasSuffix && !words.includes(tokens[last]);
  const scored = extraSuffix ? tokens.slice(0, last) : tokens;
  if (extraSuffix) whole = scored.join(" ");
  let score = 0;
  for (const t of scored) {
    const numeric = /^\d+$/.test(t);
    if (words.includes(t)) score += numeric && words[0] === t ? 16 : 10;
    else if (!numeric && words.some((w) => w.startsWith(t))) score += 6;
    else if (hood.some((w) => w === t || (!numeric && w.startsWith(t))))
      score += 4;
    else if (!numeric && t.length >= 3 && r.addr.includes(t)) score += 2;
    else return 0;
  }
  if (r.addr === whole) score += 20;
  else if (r.addr.startsWith(whole)) score += 3;
  return score;
}

/**
 * Address tokens (suffix-normalized), neighborhood tokens, parcel/block-lot prefix, or a parcel ID
 * substring, case-insensitive. Ranked by match quality, then evaluated lots first; within a tie, one
 * lot per neighborhood before a second from any, so a street that crosses neighborhoods shows each.
 */
export function searchLots(
  index: SearchEntry[],
  q: string,
  limit = SEARCH_LIMIT,
): number[] {
  const whole = normalizeAddress(q);
  if (!whole) return [];
  const tokens = whole.split(" ");
  const id = parcelPrefix(q);
  const compact = q.trim().toLowerCase().replace(/[\s-]/g, "");
  const idSub =
    /^[0-9a-z]{4,}$/.test(compact) && /\d/.test(compact) ? compact : null;
  const hits: { i: number; score: number; evaluated: boolean; hood: string }[] =
    [];
  for (let i = 0; i < index.length; i++) {
    const r = index[i];
    let score = 0;
    if (id && r.id.startsWith(id)) score = 1000;
    else if (idSub && r.id.includes(idSub)) score = 500;
    else score = tokenScore(r, tokens, whole);
    if (score > 0)
      hits.push({
        i,
        score,
        evaluated: r.evaluated !== false,
        hood: r.hood ?? "",
      });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.evaluated) - Number(a.evaluated) ||
      a.i - b.i,
  );
  // Within each score-and-evaluated tier, interleave neighborhoods: each lot's rank within its neighborhood.
  const seen = new Map<string, number>();
  const tierOf = (h: (typeof hits)[number]) => `${h.score}|${h.evaluated}`;
  const ranked = hits.map((h, k) => {
    const key = `${tierOf(h)}|${h.hood}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return { ...h, k, n };
  });
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.evaluated) - Number(a.evaluated) ||
      a.n - b.n ||
      a.k - b.k,
  );
  return ranked.slice(0, limit).map((h) => h.i);
}

/** Neighborhoods a query names: an exact name, or a prefix of at least four letters. At most two. */
export function matchNeighborhoods(hoods: string[], q: string): string[] {
  const whole = normalizeAddress(q);
  if (whole.length < 4 || /^\d/.test(whole)) return [];
  const exact = hoods.filter((h) => normalizeAddress(h) === whole);
  if (exact.length) return exact.slice(0, 1);
  return hoods.filter((h) => normalizeAddress(h).startsWith(whole)).slice(0, 2);
}
