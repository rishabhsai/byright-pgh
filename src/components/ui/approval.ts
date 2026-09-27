// The approval route a finding establishes, in the words a filing summary uses. Derived from the verdict,
// the review kind and the failed checks; an unanswered applicability question (district, width, ADU
// overlay) is never turned into a definite route, and no summary states a hearing likelihood.
import type { Finding, Lot } from "@/lib/types";
import { districtUnconfirmed } from "@/lib/evidence";

export type ApprovalKind = "unresolved" | "by-right" | "administrator" | "special" | "relief" | "prohibited";

export interface Approval {
  kind: ApprovalKind;
  /** Lower-case phrase for "N filings · <phrase>". */
  phrase: string;
  /** What "Will you need to seek a variance or special exception?" can honestly say. */
  formAnswer: string;
}

type ApprovalFinding = Pick<Finding, "verdict" | "reviewKind" | "checks"> & Partial<Pick<Finding, "permissionQuestion">>;
type ApprovalLot = Partial<Pick<Lot, "zoneAgrees" | "zoneMap" | "zone">>;

const ROUTE: Record<"administrator" | "special", string> = {
  administrator: "administrator exception (staff)",
  special: "special exception (Board hearing)",
};

/** Which fact must be confirmed before permission can be read, or null when permission is resolved. */
export function unresolvedPermission(finding: ApprovalFinding | null, lot: ApprovalLot | null): string | null {
  if (lot && districtUnconfirmed({ zoneAgrees: lot.zoneAgrees, zoneMap: lot.zoneMap })) return "the zoning district";
  if (!finding) return null;
  // The lib names the open applicability question when it has one.
  if (finding.permissionQuestion?.kind === "lot-width") return "the lot width";
  if (finding.permissionQuestion?.kind === "adu-overlay") return "the ADU overlay";
  const use = finding.checks.find((c) => c.id === "use");
  const adu = finding.checks.find((c) => c.id === "adu-eligibility");
  const text = [use?.note, use?.measured, adu?.note, adu?.measured].filter(Boolean).join(" ");
  // Width-conditional use with frontage missing: the stricter letter is an assumption, not a route.
  if (use?.passed !== true && /width/i.test(text) && /frontage not in|needs survey|width (is )?unknown/i.test(text)) return "the lot width";
  // ADU allowed only inside an overlay, and the prototype has no overlay layer.
  if (/Overlay District/i.test(text) && /none (is )?assumed|no overlay layer|assumes the lot is outside/i.test(text) && finding.verdict !== "by-right")
    return "the ADU overlay";
  if (finding.verdict === "unknown") {
    if (use && use.passed === null && !finding.reviewKind) return "the use-table entry";
    const missing = finding.checks.find((c) => c.passed === null && c.id !== "use");
    if (missing) return missing.id === "lot-width" ? "the lot width" : missing.id.startsWith("lot-area") ? "the lot area" : missing.label.toLowerCase();
    return "the zoning district";
  }
  return null;
}

const FAR_ONLY = (f: ApprovalFinding) => {
  const failed = f.checks.filter((c) => c.passed === false && c.id !== "use" && c.id !== "adu-eligibility");
  return failed.length > 0 && failed.every((c) => c.id === "far");
};

export function approvalOf(finding: ApprovalFinding | null, lot: ApprovalLot | null): Approval {
  const open = unresolvedPermission(finding, lot);
  if (open)
    return {
      kind: "unresolved",
      phrase: `permission unresolved: confirm ${open} first`,
      formAnswer: `Permission unresolved: confirm ${open} first; zoning staff then determine whether any exception or variance applies`,
    };
  if (!finding) return { kind: "unresolved", phrase: "permission unresolved: ask the Zoning Administrator", formAnswer: "Ask the Zoning Administrator" };
  switch (finding.verdict) {
    case "by-right":
      return {
        kind: "by-right",
        phrase: "staff zoning review",
        formAnswer: "Not under the checks we ran (use table and lot-size standards); zoning staff confirm",
      };
    case "review": {
      if (finding.reviewKind === "administrator")
        return {
          kind: "administrator",
          phrase: ROUTE.administrator,
          formAnswer: "No variance or special exception under the checks we ran; the use needs an administrator exception (§ 922.08), decided by zoning staff",
        };
      if (finding.reviewKind === "special")
        return {
          kind: "special",
          phrase: ROUTE.special,
          formAnswer: "Yes: special exception (§ 922.07), decided by the Zoning Board of Adjustment after a hearing",
        };
      return { kind: "unresolved", phrase: "approval route unresolved: zoning staff determine it", formAnswer: "Zoning staff determine the approval route" };
    }
    case "variance": {
      const base = FAR_ONLY(finding) ? "relief needed (smaller building or variance)" : "relief needed (variance or § 921.04)";
      const route = finding.reviewKind ? ` + ${ROUTE[finding.reviewKind]}` : "";
      const also =
        finding.reviewKind === "special"
          ? "; the use also needs a special exception (§ 922.07, Board hearing)"
          : finding.reviewKind === "administrator"
            ? "; the use also needs an administrator exception (§ 922.08, staff)"
            : "";
      return {
        kind: "relief",
        phrase: `${base}${route}`,
        formAnswer: `Yes: relief from a failed standard (dimensional variance, or the § 921.04 nonconforming-lot exception if the lot qualifies; zoning staff determine the route)${also}`,
      };
    }
    case "prohibited":
      return {
        kind: "prohibited",
        phrase: "use not allowed: use variance or a different home type",
        formAnswer: "Yes: use variance (§ 922.09); the use is not listed in this district. Consider a home type the use table allows",
      };
    default:
      return {
        kind: "unresolved",
        phrase: "permission unresolved: ask the Zoning Administrator",
        formAnswer: "Ask the Zoning Administrator which filings apply",
      };
  }
}

/** "3 filings · administrator exception (staff)". Never a hearing likelihood. */
export function filingHeadline(filings: number, approval: Approval): string {
  return `${filings} filing${filings === 1 ? "" : "s"} · ${approval.phrase}`;
}

export const VARIANCE_QUESTION = "Will you need to seek a variance or special exception?";
