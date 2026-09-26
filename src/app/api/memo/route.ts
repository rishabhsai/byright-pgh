import type { Finding, Lot, RuleSet } from "@/lib/types";
import { TYPOLOGY_LABEL, VERDICT_LABEL } from "@/lib/types";

export const maxDuration = 60;

interface MemoRequest {
  lot: Lot;
  ruleSet: RuleSet;
  findings: Finding[];
  bill?: Finding[];
}

interface Provider {
  url: string;
  model: string;
  token: string;
}

function provider(): Provider | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      model: process.env.MEMO_MODEL ?? "gpt-4.1-mini",
      token: process.env.OPENAI_API_KEY,
    };
  }
  const gatewayToken = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN;
  if (gatewayToken) {
    return {
      url: "https://ai-gateway.vercel.sh/v1/chat/completions",
      model: process.env.MEMO_MODEL ?? "anthropic/claude-sonnet-4.5",
      token: gatewayToken,
    };
  }
  return null;
}

function structuredFacts(req: MemoRequest): string {
  const { lot, ruleSet, findings, bill } = req;
  const lines: string[] = [];
  lines.push(`Parcel ${lot.id}, ${lot.address}, ${lot.neighborhood}, zoning district ${lot.zone}.`);
  lines.push(
    `Lot area: ${lot.lotAreaSqFt ?? "not in record"} sq ft. Frontage: ${lot.frontageFt ?? "not in record"} ft. County assessed land value (not market value): ${lot.landValue ?? "not in record"}.`,
  );
  lines.push(
    `Hazard screening: steep slope ${lot.hazards.steepSlope ? "yes" : "no"}, undermined ${lot.hazards.undermined ? "yes" : "no"}, flood zone ${lot.hazards.floodZone === null ? "not checked" : lot.hazards.floodZone ? "yes" : "no"}.`,
  );
  lines.push(`Rule set applied: ${ruleSet}.`);
  for (const f of findings) {
    lines.push(`\n${TYPOLOGY_LABEL[f.typology]}: ${VERDICT_LABEL[f.verdict]}. ${f.summary}`);
    for (const c of f.checks) {
      const status = c.passed === null ? "needs survey" : c.passed ? "pass" : "FAIL";
      lines.push(
        `  - ${c.label}: ${status}; measured ${c.measured ?? "n/a"}, required ${c.required ?? "n/a"}; cite ${c.citation.section} (${c.citation.title}) ${c.citation.url}`,
      );
    }
  }
  if (bill && ruleSet === "current") {
    const changes = bill
      .map((b, i) => ({ b, cur: findings[i] }))
      .filter(({ b, cur }) => b.verdict !== cur.verdict);
    if (changes.length) {
      lines.push("\nIf Council adopts Bill 2025-1545:");
      for (const { b, cur } of changes) {
        lines.push(`  - ${TYPOLOGY_LABEL[b.typology]}: ${VERDICT_LABEL[cur.verdict]} -> ${VERDICT_LABEL[b.verdict]}`);
      }
    }
  }
  return lines.join("\n");
}

const SYSTEM = `You write short zoning screening memos for the Pittsburgh Land Bank and City Planning staff.
You are given structured findings produced by a deterministic rules engine. You must not add, remove, or reinterpret any finding, number, or citation. Do not invent code sections. If a value is "not in record" or "needs survey", say so plainly.
Format: Markdown. Sections: "Bottom line" (2 sentences), "What fits by right", "What would need a variance or review" (name the failing check and cite its section inline like §903.03), "Hazards to review", "If Bill 2025-1545 passes" (only if provided), "Confirm before acting" (a 3-item checklist starting with confirming the determination with the City's Zoning Administrator).
End with the sentence: "This memo is decision support generated from public records and is not a zoning determination or legal advice."
Keep it under 260 words.`;

export async function POST(request: Request) {
  const body = (await request.json()) as MemoRequest;
  const facts = structuredFacts(body);
  const p = provider();
  if (!p) {
    return Response.json({ memo: null, facts, error: "no-llm-credentials" }, { status: 200 });
  }
  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${p.token}` },
      body: JSON.stringify({
        model: p.model,
        max_tokens: 700,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Findings:\n${facts}` },
        ],
      }),
    });
    if (!res.ok) {
      return Response.json({ memo: null, facts, error: `gateway-${res.status}` }, { status: 200 });
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const memo = data.choices?.[0]?.message?.content ?? null;
    return Response.json({ memo, facts, model: p.model });
  } catch (err) {
    return Response.json({ memo: null, facts, error: String(err) }, { status: 200 });
  }
}
