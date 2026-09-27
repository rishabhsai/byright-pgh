"use client";
import { useEffect, useRef } from "react";
import type { CompsFile, LotsFile } from "@/lib/types";
import { caveats, RULESET_LABEL, RULESET_NOTE } from "@/lib/engine";
import { encodedDistricts } from "./district";
import { GREEN_POLICY } from "@/lib/triage";

/** How AI was used, short form. The README carries the long version. */
const AI_USE = [
  "Claude extracted the use and dimensional tables for the encoded districts from saved ecode360 captures of Title Nine (docs/sources). The rows were checked against those captures during development and re-checked by automated audits; an independent practitioner validation is not complete.",
  "No model sits in the decision path. Every verdict, triage color, count and dollar figure comes from those tables, public data and arithmetic you can read in the code.",
  "Where a model rewrites text (the optional wording suggestion in the filing packet), it is labeled as unverified model output and never replaces the deterministic text.",
];

const LIMITATIONS = [
  "City of Pittsburgh only. Lots in other Allegheny County municipalities are out of scope.",
  "Setbacks, height, lot coverage, and overlay districts are not encoded. A survey and a zoning review are still needed.",
  "Steep slope, undermining, and flood layers are screening signals. They never change a verdict.",
  "County land value is the 2012-base assessment, not a market price.",
  "Street frontage is parsed from the legal description and is approximate. A survey governs.",
  "The header counts lots, not homes. The five home types on a lot are alternatives, so lot × home-type combinations are not added up anywhere.",
  "No personal information is used or shown. Parcels come from the City's vacant-land inventory; a few records are marked Privately Owned.",
  "Rules decide. No verdict comes from a model.",
];

export default function AboutDrawer({
  open,
  onClose,
  file,
  compsFile,
}: {
  open: boolean;
  onClose: () => void;
  file: LotsFile | null;
  compsFile: CompsFile | null;
}) {
  const districts = encodedDistricts();
  // Focus moves into the drawer on open (the close button's ref) and back to the opener on close.
  const opener = useRef<HTMLElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement as HTMLElement | null;
      closeBtn.current?.focus({ preventScroll: true });
      return;
    }
    const el = opener.current;
    opener.current = null;
    if (el && document.contains(el)) el.focus({ preventScroll: true });
  }, [open]);
  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open} inert={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-[#17211e]/25 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="About the data"
        className={`scroll-thin absolute top-0 right-0 h-full w-[520px] overflow-y-auto border-l border-hairline bg-panel shadow-[-20px_0_40px_-20px_rgba(23,33,30,.3)] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-hairline px-6 pt-6 pb-4">
          <div>
            <h2 className="font-serif text-[32px] leading-none">About the data</h2>
            <p className="mt-2 text-[12px] text-muted">
              What ByRight PGH knows, where it came from, and what it deliberately leaves to people.
            </p>
          </div>
          <button
            ref={closeBtn}
            onClick={onClose}
            aria-label="Close (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-7 px-6 py-6 text-[13px]">
          <Block title="Sources">
            <ul className="space-y-3">
              {(file?.sources ?? []).map((s) => (
                <li key={s.name}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                    {s.name}
                  </a>
                  <p className="mt-0.5 text-[11px] leading-snug break-words text-muted [overflow-wrap:anywhere]">{s.vintage}</p>
                </li>
              ))}
            </ul>
            {file && (
              <p className="mt-2 text-[11px] text-faint">
                {file.lots.length.toLocaleString()} lots, file generated {file.generatedAt}.
              </p>
            )}
          </Block>

          <Block title="How the AI was used">
            <ul className="list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-ink marker:text-faint">
              {AI_USE.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Block>

          <Block title="Green, Yellow, Red">
            <ul className="space-y-1 text-[13px] leading-relaxed text-ink">
              <li>
                <Swatch c="#16a34a" /> Green: passes the modeled screen; fit and staff review remain.
              </li>
              <li>
                <Swatch c="#f59e0b" /> Yellow: the first unresolved or failed item is named on the lot.
              </li>
              <li>
                <Swatch c="#e11d48" /> Red: no small home type passes the use table, or a hard site flag.
              </li>
            </ul>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Yellow: something is unknown, needs staff approval or a Zoning Board hearing, falls short of the target return at
              the reference value, or is not for sale. Red: no small home type is allowed, or flood zone
              on steep or undermined ground. Gray: the district is not encoded. None of them confirms a project is feasible.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-ink">{GREEN_POLICY}</p>
          </Block>

          <Block title="Comps and finance">
            <ul className="space-y-3">
              {(compsFile?.sources ?? []).map((s) => (
                <li key={s.name}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                    {s.name}
                  </a>
                  <p className="mt-0.5 text-[11px] leading-snug break-words text-muted [overflow-wrap:anywhere]">{s.vintage}</p>
                </li>
              ))}
              {!compsFile?.sources?.length && (
                <li className="text-[12px] text-muted">No comps file loaded; finance is not assessed for any lot.</li>
              )}
            </ul>
            <p className="mt-3 text-[12px] leading-relaxed text-ink">
              A lot that is short at today&apos;s prices is common for small infill, not a dead end. The shortfall is a
              screening number, not a subsidy award or an eligibility finding.
            </p>
            <p className="mt-3 text-[12px] text-muted">
              Further reading:{" "}
              <a
                href="https://www.prohousingpgh.org/ycbth"
                target="_blank"
                rel="noreferrer"
                className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
              >
                Pro-Housing Pittsburgh, &ldquo;You Can&apos;t Build That Here&rdquo; series
              </a>
            </p>
          </Block>

          <Block title="Rule sets">
            <dl className="space-y-2">
              {(Object.keys(RULESET_LABEL) as (keyof typeof RULESET_LABEL)[]).map((k) => (
                <div key={k}>
                  <dt className="font-medium">{RULESET_LABEL[k]}</dt>
                  <dd className="text-[12px] text-muted">{RULESET_NOTE[k]}</dd>
                </div>
              ))}
            </dl>
          </Block>

          <Block title={`Districts encoded (${districts.length})`}>
            <div className="flex flex-wrap gap-1.5">
              {districts.map((d) => (
                <span key={d} className="rounded border border-hairline bg-white px-1.5 py-0.5 text-[11px] font-medium">
                  {d}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-faint">Lots in any other district show as not evaluated.</p>
          </Block>

          {caveats.length > 0 && (
            <Block title="Engine caveats">
              <ul className="list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-ink marker:text-faint">
                {caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="Limitations">
            <ul className="list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-ink marker:text-faint">
              {LIMITATIONS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Block>
        </div>
      </div>
    </div>
  );
}

function Swatch({ c }: { c: string }) {
  return <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: c }} />;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 font-serif text-[20px] leading-none text-ink">{title}</h3>
      {children}
    </section>
  );
}
