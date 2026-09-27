// The UI's reading of the lib's one financial result (evidence.ts financeResult): the answer card, Pays,
// the hover card, the list order and the lot brief all ask here. An unscreened proposal gets
// "Not screened: <reason>"; its numbers appear only as a disclosed hypothetical, and only when the lib
// keeps one (unresolved district or permission, lot not offered).
import type { Finding, Lot } from "@/lib/types";
import { financeResult, type Evidence } from "@/lib/evidence";
import type { Proforma } from "@/lib/finance";
import { approvalOf } from "./approval";

export interface FinanceGate {
  screened: boolean;
  /** Why the screen did not run, lower-case ("permission unresolved: confirm the lot width first"). */
  reason: string | null;
  /** The labeled hypothetical Pays may show under a disclosure; null when there is none. */
  hypothetical: Proforma | null;
  /** The lib's reason code, for callers that branch on it. */
  code: string | null;
}

/** The lib's reason, made specific where the screen knows more (which fact resolves permission). */
function reasonText(code: string, lot: Lot, finding: Pick<Finding, "verdict" | "reviewKind" | "checks" | "permissionQuestion">): string {
  if (code === "permission unresolved") {
    const a = approvalOf(finding, lot);
    if (a.kind === "unresolved") return a.phrase;
    if (finding.reviewKind === "administrator") return "permission unresolved: the use needs an administrator exception (staff)";
    if (finding.reviewKind === "special") return "permission unresolved: the use needs a special exception (Board hearing)";
    return code;
  }
  if (code === "district unconfirmed") return `district unconfirmed (inventory ${lot.zone || "none"}, map ${lot.zoneMap ?? "none"})`;
  return code;
}

export function financeGate(args: {
  lot: Lot;
  finding: Pick<Finding, "verdict" | "reviewKind" | "checks" | "permissionQuestion"> | null;
  evidence: Pick<Evidence, "checks"> | null;
  proforma: Proforma | null;
}): FinanceGate {
  const { lot, finding, evidence, proforma } = args;
  if (!finding || !evidence) return { screened: false, reason: "zoning not evaluated", hypothetical: null, code: "zoning not evaluated" };
  const r = financeResult(lot, finding, evidence, proforma);
  if (r.screened) return { screened: true, reason: null, hypothetical: null, code: null };
  const code = r.reason ?? "not screened";
  return { screened: false, reason: reasonText(code, lot, finding), hypothetical: r.proforma, code };
}

export const NO_COMPS_REASON = "no value comps for this lot";
