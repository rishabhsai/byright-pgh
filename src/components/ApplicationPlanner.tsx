"use client";
import { useMemo, useState } from "react";
import type { Comps, Finding, Lot, RuleSet, TriageResult, Typology } from "@/lib/types";
import { proformaWithFallback, type FinanceAssumptions } from "@/lib/finance";
import {
  buildApplicationPlan,
  defaultTypology,
  NEVER_SUBMITS,
  renderApplicationMarkdown,
  type ApplicationPlan,
  type ChipTone,
  type PrefilledField,
  type Step,
} from "@/lib/application";
import { TYPOLOGY_SHORT, VERDICT_COLOR, VERDICT_SHORT } from "./verdict";

interface Props {
  lot: Lot;
  findings: Finding[];
  ruleSet: RuleSet;
  triage: TriageResult | null;
  comps: Comps | null;
  assumptions: FinanceAssumptions;
  onFlash: (msg: string) => void;
  /** Expanded reading mode: wider form layout. */
  wide?: boolean;
}

interface Narrative {
  description: string;
  findings: string[];
}

export default function ApplicationPlanner({ lot, findings, ruleSet, triage, comps, assumptions, onFlash, wide = false }: Props) {
  const [typology, setTypology] = useState<Typology | null>(() => defaultTypology(findings, triage));
  const [prepared, setPrepared] = useState(false);
  const [polish, setPolish] = useState<{ key: string; narrative: Narrative; model: string } | null>(null);
  const [polishing, setPolishing] = useState(false);

  const basePlan = useMemo<ApplicationPlan | null>(() => {
    if (!prepared || !typology) return null;
    const pf = proformaWithFallback(lot, typology, comps, assumptions);
    return buildApplicationPlan(lot, findings, ruleSet, triage, pf, comps, typology);
  }, [prepared, typology, lot, findings, ruleSet, triage, comps, assumptions]);

  const planKey = basePlan ? `${basePlan.lotId}|${basePlan.typology}|${basePlan.ruleSet}|${basePlan.description}` : "";
  const narrative = polish && polish.key === planKey ? polish : null;

  /** The plan with polished prose swapped in; facts, sections and labels are unchanged. */
  const plan = useMemo<ApplicationPlan | null>(() => {
    if (!basePlan || !narrative || !basePlan.zba) return basePlan;
    const n = narrative.narrative;
    return {
      ...basePlan,
      description: n.description,
      purchaseForm: basePlan.purchaseForm.map((f) =>
        f.label.startsWith("Detailed description") ? { ...f, value: n.description } : f,
      ),
      zba: { ...basePlan.zba, findings: basePlan.zba.findings.map((f, i) => ({ ...f, text: n.findings[i] ?? f.text })) },
    };
  }, [basePlan, narrative]);

  const requestPolish = async (t: Typology) => {
    const pf = proformaWithFallback(lot, t, comps, assumptions);
    const p = buildApplicationPlan(lot, findings, ruleSet, triage, pf, comps, t);
    if (!p.zba) return;
    const key = `${p.lotId}|${p.typology}|${p.ruleSet}|${p.description}`;
    setPolishing(true);
    try {
      const res = await fetch("/api/application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: p }),
      });
      const data = (await res.json()) as { narrative: Narrative | null; model?: string };
      if (data.narrative) setPolish({ key, narrative: data.narrative, model: data.model ?? "an LLM" });
    } catch {
      // Keep the template text.
    } finally {
      setPolishing(false);
    }
  };

  const prepare = (t: Typology | null = typology) => {
    if (!t) return;
    setPrepared(true);
    void requestPolish(t);
  };

  const pick = (t: Typology) => {
    setTypology(t);
    if (prepared) prepare(t);
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

  const evaluable = findings.some((f) => f.verdict !== "unknown");

  return (
    <div className="space-y-3">
      <p className="flex gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2.5 text-[12px] leading-snug text-accent">
        <HandIcon />
        <span>{NEVER_SUBMITS}</span>
      </p>

      {!evaluable ? (
        <p className="rounded-lg border border-dashed border-hairline px-3 py-3 text-[12px] text-muted">
          Zoning was not evaluated for this district, so there is nothing to prepare yet. Ask the Zoning Administrator which
          filings apply.
        </p>
      ) : (
        <>
          <div>
            <p className="mb-1.5 text-[11px] text-muted">What do you plan to build?</p>
            <div role="radiogroup" aria-label="Home type" className="flex flex-wrap gap-1.5">
              {findings.map((f) => {
                const on = f.typology === typology;
                return (
                  <button
                    key={f.typology}
                    role="radio"
                    aria-checked={on}
                    onClick={() => pick(f.typology)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                      on ? "border-ink bg-ink text-white" : "border-hairline bg-white text-ink hover:bg-surface"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: VERDICT_COLOR[f.verdict] }} />
                    {TYPOLOGY_SHORT[f.typology]}
                    <span className={on ? "text-white/70" : "text-faint"}>{VERDICT_SHORT[f.verdict]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {!plan && (
            <button
              onClick={() => prepare()}
              disabled={!typology}
              className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent disabled:opacity-50"
            >
              Prepare packet
            </button>
          )}
        </>
      )}

      {plan && (
        <div className="fade-in space-y-4 pt-1">
          <Stepper steps={plan.steps} />
          <PurchaseForm fields={plan.purchaseForm} polished={!!narrative} wide={wide} />
          {plan.zba && (
            <ZbaCard
              plan={plan}
              polishedBy={narrative?.model ?? null}
              polishing={polishing && !narrative}
            />
          )}
          <Attachments items={plan.attachments} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copy}
              className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent"
            >
              Copy packet
            </button>
            <button
              onClick={download}
              className="rounded-md border border-hairline bg-white px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-surface"
            >
              Download .md
            </button>
          </div>
          <details className="text-[11px] text-muted">
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
      )}
    </div>
  );
}

const CHIP: Record<ChipTone, string> = {
  fee: "bg-gold-soft text-[#6b5200]",
  time: "bg-surface text-ink",
  place: "border border-hairline text-muted",
  warn: "bg-gold-soft text-[#6b5200] border border-gold/60",
};

function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const dashed = s.id === "bill";
        return (
          <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={`absolute top-6 bottom-0 left-[11px] w-px ${steps[i + 1]?.id === "bill" ? "border-l border-dashed border-hairline" : "bg-hairline"}`}
              />
            )}
            <span
              className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-serif text-[13px] ${
                dashed ? "border border-dashed border-gold bg-gold-soft text-[#6b5200]" : "bg-ink text-white"
              }`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h4 className="text-[13px] font-semibold text-ink">{s.title}</h4>
              {s.callout && (
                <p
                  className={`mt-1 rounded-md px-2 py-1 text-[11.5px] leading-snug ${
                    s.callout.tone === "ok" ? "bg-[#e6f4ea] text-[#14532d]" : "bg-[#fdf0e1] text-[#8a4b00]"
                  }`}
                >
                  {s.callout.text}
                </p>
              )}
              <ul className="mt-1.5 max-w-[70ch] space-y-1">
                {s.body.map((b) => (
                  <li key={b} className="text-[12px] leading-snug text-ink">
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-1">
                {s.chips.map((c) => (
                  <span key={c.label} className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${CHIP[c.tone]}`}>
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
function PurchaseForm({ fields, polished, wide }: { fields: PrefilledField[]; polished: boolean; wide: boolean }) {
  const filled = fields.filter((f) => f.who === "prefilled");
  const blank = fields.filter((f) => f.who === "you");
  return (
    <section className="overflow-hidden rounded-lg border border-hairline bg-white">
      <header className="flex items-baseline justify-between gap-2 border-b border-hairline bg-[#fafaf8] px-3 py-2">
        <h4 className="text-[12.5px] font-semibold text-ink">Pre-filled: Request to Purchase, page 2</h4>
        <span className="text-[10.5px] text-faint">City form V. 1/2018</span>
      </header>
      <dl
        className={`grid text-[11.5px] ${wide ? "grid-cols-[240px_minmax(0,1fr)]" : "grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]"}`}
      >
        {filled.map((f) => (
          <div key={f.label} className="contents">
            <dt className="border-b border-hairline px-3 py-2 leading-snug text-muted">{f.label}</dt>
            <dd className="border-b border-hairline px-3 py-2 leading-snug text-ink">
              <span className={`font-serif text-[13px] ${wide ? "block max-w-[70ch]" : ""}`}>{f.value}</span>
              {f.label.startsWith("Detailed description") && polished && (
                <span className="mt-0.5 block text-[10px] text-faint">Wording polished; facts unchanged.</span>
              )}
              {f.note && <span className="mt-0.5 block text-[10.5px] text-faint">{f.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="px-3 pt-2.5 pb-3">
        <p className="mb-1.5 text-[11px] font-semibold text-ink">You complete</p>
        <ul className={wide ? "grid grid-cols-2 gap-x-8 gap-y-2" : "space-y-1.5"}>
          {blank.map((f) => (
            <li key={f.label} className="min-w-0 text-[11.5px]">
              {/* Label wraps in its own column; the fill-in rule takes the rest and never pushes past the edge. */}
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(2.5rem,30%)] items-end gap-2">
                <span className="min-w-0 text-muted [overflow-wrap:anywhere]">{f.label}</span>
                <span aria-hidden className="mb-[3px] border-b border-dashed border-[#b9bfb8]" />
              </div>
              {f.note && <p className="mt-0.5 text-[10.5px] text-[#8a4b00]">{f.note}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ZbaCard({ plan, polishedBy, polishing }: { plan: ApplicationPlan; polishedBy: string | null; polishing: boolean }) {
  const z = plan.zba!;
  return (
    <section className="overflow-hidden rounded-lg border border-[#e7c9a0] bg-white">
      <header className="flex items-baseline justify-between gap-2 border-b border-[#e7c9a0] bg-[#fdf6ec] px-3 py-2">
        <h4 className="text-[12.5px] font-semibold text-ink">Zoning Board of Adjustment request</h4>
        <span className="rounded-sm bg-[#8a4b00] px-1.5 py-px text-[10px] font-semibold text-white">{z.label}</span>
      </header>
      <div className="space-y-3 px-3 py-3 text-[12px]">
        <div>
          <p className="text-[11px] text-muted">Request type</p>
          <p className="font-medium text-ink">{z.requestTypes.join("; ")}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">Sections from which relief is requested</p>
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
          <p className="text-[11px] text-muted">
            Justification under{" "}
            <a href={z.criteria.url} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/30 underline-offset-2">
              {z.criteria.section}
            </a>{" "}
            ({z.criteria.title}; mirrors {z.criteria.mirrors}). The Board must find all five.
          </p>
          {z.note && <p className="mt-1 text-[11px] text-[#8a4b00]">{z.note}</p>}
          <ol className="mt-2 space-y-2.5">
            {z.findings.map((f) => (
              <li key={f.n} className="flex gap-2.5">
                <span className="font-serif text-[18px] leading-none text-[#b45309] italic">{f.n}</span>
                <div className="min-w-0 max-w-[70ch]">
                  <p className="text-[11.5px] font-semibold text-ink">{f.title}</p>
                  <p className={`mt-0.5 leading-relaxed text-ink ${polishing ? "opacity-70" : ""}`}>{f.text}</p>
                </div>
              </li>
            ))}
          </ol>
          {polishedBy && <p className="mt-2 text-[10.5px] text-faint">Polished by {polishedBy}; facts unchanged.</p>}
        </div>
      </div>
    </section>
  );
}

function Attachments({ items }: { items: string[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  return (
    <section>
      <h4 className="mb-1.5 text-[12.5px] font-semibold text-ink">Attachments to gather</h4>
      <ul className="space-y-1.5">
        {items.map((a) => (
          <li key={a}>
            <label className="flex cursor-pointer items-start gap-2.5 text-[12px] leading-snug">
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
                className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
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
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="mt-px shrink-0">
      <rect x="2.5" y="1.5" width="9" height="11" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 4.5h5M4.5 6.8h5M4.5 9.1h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
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

