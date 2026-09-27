"use client";
import { useMemo, useState } from "react";
import { TYPOLOGY_LABEL } from "@/lib/types";
import { verdictLabel } from "./ui/answer";
import type { SelectedCase } from "@/lib/selectedCase";
import {
  buildApplicationPlan,
  NEVER_SUBMITS,
  renderApplicationMarkdown,
  SUGGESTION_LABEL,
  type AcquisitionChannel,
  type ApplicationPlan,
  type ChipTone,
  type PrefilledField,
  type Step,
} from "@/lib/application";
import { VERDICT_COLOR } from "./verdict";
import { REVIEW_CHECKLIST } from "./memo";
import { approvalOf, filingHeadline, VARIANCE_QUESTION } from "./ui/approval";

interface Props {
  /** The selected case: the packet is for its proposal, rule set and effective land cost. */
  selected: SelectedCase;
  /** Jump to where the proposal is chosen (Pays). */
  onChangeType: () => void;
  onFlash: (msg: string) => void;
  /** Expanded reading mode: wider form layout. */
  wide?: boolean;
}

const LAND_WORD = { override: "at your figure", assessed: "at the County value", default: "assumed (no assessment)" } as const;

/** A model's rewording of the proposed-use description, tied to the exact text it was made from. */
interface Suggestion {
  key: string;
  source: string;
  text: string;
}

export default function ApplicationPlanner({ selected, onChangeType, onFlash, wide = false }: Props) {
  const { lot, ruleSet, typology, triage, proforma, comps, finding } = selected;
  const findings = selected.findings[ruleSet];
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const evaluable = findings.some((f) => f.verdict !== "unknown");

  // The approval route, from the verdict, review kind and failed checks (unresolved permission stays unresolved).
  const approval = useMemo(() => approvalOf(finding, lot), [finding, lot]);

  /**
   * Deterministic plan for the selected proposal. Model text never replaces any of it. The form's
   * "variance or special exception?" answer is restated from the approval route, so an administrator
   * exception is never answered as a variance or special exception, and the download says the same.
   */
  const plan = useMemo<ApplicationPlan | null>(() => {
    if (!evaluable) return null;
    const p = buildApplicationPlan(lot, findings, ruleSet, triage, proforma, comps, typology);
    return {
      ...p,
      purchaseForm: p.purchaseForm.map((f) => (f.label === VARIANCE_QUESTION ? { ...f, value: approval.formAnswer } : f)),
    };
  }, [evaluable, typology, lot, findings, ruleSet, triage, proforma, comps, approval]);

  // The server rebuilds the description with default assumptions; show its suggestion only when
  // that matches what this panel shows.
  const shownSuggestion =
    plan && suggestion && suggestion.key === `${plan.lotId}|${plan.typology}|${plan.ruleSet}` && suggestion.source === plan.description
      ? suggestion.text
      : null;

  const requestSuggestion = async () => {
    const t = typology;
    const key = `${lot.id}|${t}|${ruleSet}`;
    setSuggesting(true);
    try {
      const res = await fetch("/api/application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lotId: lot.id, ruleSet, typology: t }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { source?: string; suggestion?: string | null };
      if (data.suggestion && data.source) setSuggestion({ key, source: data.source, text: data.suggestion });
    } catch {
      // No suggestion; the deterministic text stands.
    } finally {
      setSuggesting(false);
    }
  };

  // The optional model rewording is only asked for once someone opens the applicant packet.
  const [asked, setAsked] = useState(false);
  const onOpenPacket = (open: boolean) => {
    if (!open || asked) return;
    setAsked(true);
    void requestSuggestion();
  };

  const md = () => (plan ? renderApplicationMarkdown(plan) : "");
  const copy = async () => {
    await copyText(md());
    onFlash("Packet copied");
  };
  const download = () => {
    if (!plan) return;
    const blob = new Blob([md()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `byright-application-${plan.lotId}-${plan.typology}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-section">
      <p className="flex gap-2 rounded-card bg-control p-card text-callout text-muted">
        <HandIcon />
        <span>{NEVER_SUBMITS}</span>
      </p>

      {!evaluable ? (
        <p className="rounded-card bg-control p-card text-caption text-muted">
          Zoning was not evaluated for this district, so there is nothing to prepare yet. Ask the Zoning Administrator which
          filings apply.
        </p>
      ) : (
        <>
          <p className="flex items-start gap-2 text-callout text-ink">
            <span aria-hidden className="mt-[6px] h-2 w-2 shrink-0 rounded-full" style={{ background: VERDICT_COLOR[approval.kind === "unresolved" ? "unknown" : (finding?.verdict ?? "unknown")] }} />
            <span>
              For a <span className="font-medium">{TYPOLOGY_LABEL[typology].toLowerCase()}</span>
              {finding && (
                <span className="text-muted">
                  , {approval.kind === "unresolved" ? approval.phrase : verdictLabel(finding).charAt(0).toLowerCase() + verdictLabel(finding).slice(1)}
                </span>
              )}
              {proforma && <span className="text-muted">, land {LAND_WORD[proforma.landSource]}</span>}{" "}
              <button onClick={onChangeType} className="text-caption text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                Change in Pays
              </button>
            </span>
          </p>

          {plan && (
            <p className="text-title text-ink">
              {filingHeadline(plan.steps.filter((st) => st.id !== "bill").length, approval)}
            </p>
          )}
        </>
      )}

      {plan && (
        <details className="surface-card group" onToggle={(e) => onOpenPacket(e.currentTarget.open)}>
          <summary className="flex cursor-pointer items-center justify-between gap-3 p-card text-body font-semibold text-ink select-none">
            For an applicant
            <span className="text-right text-caption font-normal text-muted">
              Filing steps, purchase form pre-fill{plan.zba ? ", hearing worksheet" : ""}
            </span>
          </summary>
          <div className="fade-in space-y-section border-t border-hairline p-card">
            <Stepper steps={plan.steps} />
            <Attachments items={plan.attachments} />
            <PurchaseForm fields={plan.purchaseForm} acquisition={plan.acquisition} suggestion={shownSuggestion} suggesting={suggesting} wide={wide} />
            {plan.zba && <ZbaCard plan={plan} />}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={copy}
                className="button-primary"
              >
                Copy packet
              </button>
              <button
                onClick={download}
                className="button-secondary"
              >
                Download .md
              </button>
            </div>
            <details className="text-caption text-muted">
              <summary className="cursor-pointer text-faint hover:text-muted">Sources ({plan.sources.length})</summary>
              <ul className="mt-1.5 space-y-1">
                {plan.sources.map((s) => (
                  <li key={s.url + s.title}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </details>
      )}

      <ReviewChecklist />
    </div>
  );
}

function ReviewChecklist() {
  const [checked, setChecked] = useState<boolean[]>(REVIEW_CHECKLIST.map(() => false));
  return (
    <section className="pt-1">
      <h4 className="mb-3 text-headline text-ink">Before you rely on this</h4>
      <ul className="space-y-1.5">
        {REVIEW_CHECKLIST.map((item, i) => (
          <li key={item}>
            <label className="flex cursor-pointer items-start gap-2.5 text-callout">
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() => setChecked((c) => c.map((x, j) => (j === i ? !x : x)))}
                className="mt-1 h-4 w-4 shrink-0 accent-accent"
              />
              <span className={checked[i] ? "text-faint line-through" : "text-ink"}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

const CHIP: Record<ChipTone, string> = {
  fee: "bg-warning-soft text-warning-ink",
  time: "bg-surface text-ink",
  place: "bg-control text-muted",
  warn: "bg-warning-soft text-warning-ink",
};

function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const dashed = s.id === "bill";
        return (
          <li key={s.id} className="relative flex gap-3 pb-section last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={`absolute top-6 bottom-0 left-[11px] w-px ${steps[i + 1]?.id === "bill" ? "border-l border-dashed border-hairline" : "bg-hairline"}`}
              />
            )}
            <span
              className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-callout font-semibold ${
                dashed ? "border border-dashed border-v-variance bg-warning-soft text-warning-ink" : "bg-ink text-white"
              }`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h4 className="text-headline text-ink">{s.title}</h4>
              {s.callout && (
                <p
                  className={`mt-1 rounded-control px-2 py-1 text-caption ${
                    s.callout.tone === "ok" ? "bg-success-soft text-success-ink" : "bg-warning-soft text-warning-ink"
                  }`}
                >
                  {s.callout.text}
                </p>
              )}
              <ul className="mt-1.5 max-w-[70ch] space-y-2">
                {s.body.map((b) => (
                  <li key={b} className="text-caption text-ink">
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-1">
                {s.chips.map((c) => (
                  <span key={c.label} className={`rounded-full px-2 py-0.5 text-caption font-medium ${CHIP[c.tone]}`}>
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Rendered like page 2 of the City's paper form: typed values on ruled lines, blanks for the applicant. */
function PurchaseForm({
  fields,
  acquisition,
  suggestion,
  suggesting,
  wide,
}: {
  fields: PrefilledField[];
  acquisition: AcquisitionChannel;
  suggestion: string | null;
  suggesting: boolean;
  wide: boolean;
}) {
  const filled = fields.filter((f) => f.who === "prefilled");
  const blank = fields.filter((f) => f.who === "you");
  return (
    <section className="overflow-hidden surface-card">
      <header className="flex items-baseline justify-between gap-2 border-b border-hairline bg-surface px-3 py-2">
        <h4 className="text-headline text-ink">Pre-filled: Request to Purchase, page 2</h4>
        <span className="text-caption text-faint">City form V. 1/2018</span>
      </header>
      {acquisition !== "city-form" && (
        <p className="border-b border-hairline bg-warning-soft px-3 py-1.5 text-caption text-warning-ink">
          {acquisition === "ura"
            ? "This lot is listed for transfer to the URA; use this City form for reference only."
            : "Confirm with the Real Estate Division that this lot is for sale before you file this form."}
        </p>
      )}
      <dl
        className={`grid text-caption ${wide ? "grid-cols-[240px_minmax(0,1fr)]" : "grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]"}`}
      >
        {filled.map((f) => (
          <div key={f.label} className="contents">
            <dt className="border-b border-hairline px-3 py-2 text-muted">{f.label}</dt>
            <dd className="border-b border-hairline px-3 py-2 text-ink">
              <span className={`text-body ${wide ? "block max-w-[70ch]" : ""}`}>{f.value}</span>
              {f.label.startsWith("Detailed description") && suggesting && !suggestion && (
                <span className="mt-1 block text-caption text-faint">Checking for suggested wording…</span>
              )}
              {f.label.startsWith("Detailed description") && suggestion && (
                <span className="mt-1.5 block rounded border border-dashed border-hairline px-2 py-1.5">
                  <span className="block text-caption font-semibold text-warning-ink">{SUGGESTION_LABEL}</span>
                  <span className="mt-0.5 block text-caption text-muted">{suggestion}</span>
                </span>
              )}
              {f.note && <span className="mt-0.5 block text-caption text-faint">{f.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="px-3 pt-2.5 pb-3">
        <p className="mb-1.5 text-caption font-semibold text-ink">You complete</p>
        <ul className={wide ? "grid grid-cols-2 gap-x-8 gap-y-2" : "space-y-1.5"}>
          {blank.map((f) => (
            <li key={f.label} className="min-w-0 text-caption">
              {/* Label wraps in its own column; the fill-in rule takes the rest and never pushes past the edge. */}
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(2.5rem,30%)] items-end gap-2">
                <span className="min-w-0 text-muted [overflow-wrap:anywhere]">{f.label}</span>
                <span aria-hidden className="mb-[3px] border-b border-dashed border-control-edge" />
              </div>
              {f.note && <p className="mt-0.5 text-caption text-warning-ink">{f.note}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ZbaCard({ plan }: { plan: ApplicationPlan }) {
  const z = plan.zba!;
  return (
    <section className="overflow-hidden surface-card">
      <header className="flex items-baseline justify-between gap-2 border-b border-hairline bg-warning-soft px-3 py-2">
        <h4 className="text-headline text-ink">{z.label}</h4>
        <span className="text-caption text-faint">Questions, not a completed justification</span>
      </header>
      <div className="space-y-3 px-3 py-3 text-caption">
        <div>
          <p className="text-caption text-muted">Request type</p>
          <p className="font-medium text-ink">{z.requestTypes.join("; ")}</p>
        </div>
        <div>
          <p className="text-caption text-muted">Sections from which relief is requested</p>
          <ul className="mt-0.5 space-y-1">
            {z.sections.map((s) => (
              <li key={s.text}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="leading-snug text-ink underline decoration-hairline underline-offset-2 hover:decoration-accent"
                >
                  {s.text}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          {z.findings.length > 0 && (
            <p className="text-caption text-muted">
              Criteria under{" "}
              <a href={z.criteria.url} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/30 underline-offset-2">
                {z.criteria.section}
              </a>{" "}
              ({z.criteria.title}; mirrors {z.criteria.mirrors}). The Board must find all five; the burden of proof is yours.
            </p>
          )}
          {z.note && <p className="mt-1 text-caption text-warning-ink">{z.note}</p>}
          <ol className="mt-2 space-y-3">
            {z.findings.map((f) => (
              <li key={f.n} className="flex gap-2.5">
                <span className="text-headline text-warning-ink">{f.n}</span>
                <div className="min-w-0 max-w-[70ch]">
                  <p className="text-caption font-semibold text-ink">{f.title}</p>
                  <p className="mt-1 text-caption font-semibold tracking-wide text-muted uppercase">What the record shows</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {f.record.map((r) => (
                      <li key={r} className="leading-snug text-ink">
                        {r}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-caption font-semibold tracking-wide text-warning-ink uppercase">What you must establish</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {f.establish.map((q) => (
                      <li key={q} className="leading-snug text-ink">
                        ☐ {q}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Attachments({ items }: { items: string[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  return (
    <section>
      <h4 className="mb-3 text-headline text-ink">Attachments to gather</h4>
      <ul className="space-y-1.5">
        {items.map((a) => (
          <li key={a}>
            <label className="flex cursor-pointer items-start gap-2.5 text-caption">
              <input
                type="checkbox"
                checked={done.has(a)}
                onChange={() =>
                  setDone((d) => {
                    const n = new Set(d);
                    if (n.has(a)) n.delete(a);
                    else n.add(a);
                    return n;
                  })
                }
                className="mt-1 h-4 w-4 shrink-0 accent-accent"
              />
              <span className={done.has(a) ? "text-faint line-through" : "text-ink"}>{a}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden className="mt-px shrink-0">
      <rect x="2.5" y="1.5" width="9" height="11" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 4.5h5M4.5 6.8h5M4.5 9.1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

