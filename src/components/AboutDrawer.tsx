"use client";
import type { CompsFile, LotsFile } from "@/lib/types";
import { caveats, RULESET_LABEL, RULESET_NOTE } from "@/lib/engine";
import { encodedDistricts } from "./district";

const LIMITATIONS = [
  "City of Pittsburgh only. Lots in other Allegheny County municipalities are out of scope.",
  "Setbacks, height, lot coverage, and overlay districts are not encoded. A survey and a zoning review are still needed.",
  "Steep slope, undermining, and flood layers are screening signals. They never change a verdict.",
  "Land value is the county assessment, which is not market value.",
  "No personal information is used or shown. Every parcel is publicly owned.",
  "Rules decide, the language model explains. No verdict comes from a model.",
];

export default function AboutDrawer({
  open,
  onClose,
  file,
  compsFile,
  usingFixtures,
}: {
  open: boolean;
  onClose: () => void;
  file: LotsFile | null;
  compsFile: CompsFile | null;
  usingFixtures: boolean;
}) {
  const districts = encodedDistricts();
  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
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
          <button onClick={onClose} className="rounded-md border border-hairline px-2 py-0.5 text-[11px] text-muted hover:bg-surface">
            Close
          </button>
        </div>

        <div className="space-y-7 px-6 py-6 text-[13px]">
          <Block title="Sources">
            {usingFixtures && (
              <p className="mb-2 rounded-md bg-[#fde8ec] px-2.5 py-1.5 text-[12px] text-[#9f1239]">
                The full lot file did not load, so the app is showing a small sample.
              </p>
            )}
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

          <Block title="Green, yellow, red">
            <blockquote className="border-l-2 border-hairline pl-3 text-[13px] leading-relaxed text-ink">
              <p>
                <Swatch c="#e11d48" /> Red: not developable.
              </p>
              <p>
                <Swatch c="#f59e0b" /> Yellow: needs variances or subsidy.
              </p>
              <p>
                <Swatch c="#16a34a" /> Green: easily developable as is.
              </p>
            </blockquote>
            <p className="mt-1.5 text-[11px] text-muted">Hackathon housing mentors, Sept 26, 2026</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              ByRight keeps the colors but claims less: Green passes the preliminary screen under the displayed
              assumptions; Yellow needs more information, review, or a different financial scenario; Red is a major
              screening obstacle for specialist review; Gray means the district is not encoded, so the lot was not
              evaluated. None of them confirms a project is feasible.
            </p>
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
              Calibration: a typical Pittsburgh affordable deal is about 70% tax-credit equity and public subsidy (Action
              Housing, Sixth Ward Flats). A yellow lot with a modeled shortfall to the target return is normal for
              affordable housing, not a dead end; the shortfall is not a subsidy award or eligibility finding.
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
