// Evidence in words. Plain module (no "use client") so server routes and exports can use it too.
import type { Evidence, EvidenceState } from "@/lib/evidence";

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const list = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * One sentence that never rounds a gap up to a pass: "4 of 6 checks pass. Finance fails; fit not checked."
 * Only literal passes count.
 */
export function evidenceSummary(e: Evidence, useRoute?: string | null): string {
  const c = e.counts;
  // A use that needs an exception is a known route, not an unknown: name it instead.
  const routed = (x: { id: string; state: EvidenceState }) => !!useRoute && x.id === "use" && x.state === "unknown";
  const names = (s: EvidenceState) => e.checks.filter((x) => x.state === s && !routed(x)).map((x) => lower(x.label));
  const unknown = names("unknown");
  const head = `${c.pass} of ${e.checks.length} checks pass.`;
  const rest = [
    c.fail && `${list(names("fail"))} ${c.fail === 1 ? "fails" : "fail"}`,
    e.checks.some(routed) && `use needs ${lower(useRoute!)}`,
    unknown.length > 0 && `${list(unknown)} unknown`,
    c.notChecked && `${list(names("notChecked"))} not checked`,
  ].filter(Boolean) as string[];
  for (const u of e.unresolved ?? []) rest.push(`${lower(u.label)} unresolved`);
  if (!rest.length) return head;
  const tail = rest.join("; ");
  return `${head} ${tail.charAt(0).toUpperCase()}${tail.slice(1)}.`;
}

