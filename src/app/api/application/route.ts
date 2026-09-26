import type { ApplicationPlan } from "@/lib/application";

export const maxDuration = 60;

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

export interface Narrative {
  description: string;
  findings: string[];
}

const SYSTEM = `You edit draft text for a zoning variance application and a City property purchase form in Pittsburgh.
You receive a "detailed description" and five variance justification paragraphs, each already drafted from public records.
Rewrite ONLY these six texts into clear, plain applicant prose in the first person plural ("we").
Rules: do not add facts, numbers, dates, dollar amounts, code sections, or claims. Keep every number and section exactly as given. Keep every "Applicant to add:" instruction. Do not remove caveats such as "needs survey" or "under the checks we ran". Never say the application was or will be submitted by anyone but the applicant.
Return JSON only: {"description": string, "findings": [five strings, in order]}. Total under 400 words.`;

/** Every number in the polished text must already appear in the template; otherwise reject the polish. */
function numbersPreserved(source: string, polished: string): boolean {
  const nums = (t: string) => new Set((t.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]$/, "")));
  const allowed = nums(source);
  for (const n of nums(polished)) if (!allowed.has(n)) return false;
  return true;
}

function parse(content: string): Narrative | null {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Partial<Narrative>;
    if (typeof j.description !== "string" || !Array.isArray(j.findings) || j.findings.length !== 5) return null;
    if (!j.findings.every((f) => typeof f === "string" && f.trim())) return null;
    return { description: j.description, findings: j.findings };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const { plan } = (await request.json()) as { plan: ApplicationPlan };
  const p = provider();
  if (!p || !plan?.zba) return Response.json({ narrative: null });
  const source = [
    `Detailed description:\n${plan.description}`,
    ...plan.zba.findings.map((f) => `Finding ${f.n} (${f.title}):\n${f.text}`),
  ].join("\n\n");
  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${p.token}` },
      body: JSON.stringify({
        model: p.model,
        max_tokens: 900,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: source },
        ],
      }),
    });
    if (!res.ok) return Response.json({ narrative: null, error: `gateway-${res.status}` });
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const narrative = parse(data.choices?.[0]?.message?.content ?? "");
    if (!narrative) return Response.json({ narrative: null, error: "unparseable" });
    if (!numbersPreserved(source, [narrative.description, ...narrative.findings].join("\n"))) {
      return Response.json({ narrative: null, error: "numbers-changed" });
    }
    return Response.json({ narrative, model: p.model });
  } catch (err) {
    return Response.json({ narrative: null, error: String(err) });
  }
}
