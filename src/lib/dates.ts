const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** The Pittsburgh (America/New_York) calendar date as YYYY-MM-DD, for export dates and file names. */
export function todayET(now: Date = new Date()): string {
  const p = Object.fromEntries(ET_DATE.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
