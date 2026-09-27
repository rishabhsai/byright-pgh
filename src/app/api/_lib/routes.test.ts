import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as memoPOST } from "../memo/route";
import { POST as applicationPOST } from "../application/route";

/** A real parcel from public/data/lots.json: R1D-L, available for sale, Public Sale. */
const LOT = "0077S00123000000";

const post = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const CREDS = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(CREDS.map((k) => [k, process.env[k]]));
  for (const k of CREDS) delete process.env[k];
});
afterEach(() => {
  for (const k of CREDS) if (saved[k] === undefined) delete process.env[k];
  else process.env[k] = saved[k];
  vi.unstubAllGlobals();
});

describe("POST /api/memo", () => {
  it("rebuilds the deterministic memo from the parcel ID; memo is null without credentials", async () => {
    const res = await memoPOST(post({ lotId: LOT, ruleSet: "current" }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.memo).toBeNull();
    expect(j.deterministic).toContain(`Parcel ID: ${LOT}`);
    expect(j.deterministic).toContain("Before you rely on this");
    expect(j.facts).toContain("R1D-L");
  });

  it("ignores client-supplied findings", async () => {
    const res = await memoPOST(
      post({ lotId: LOT, ruleSet: "current", findings: [{ typology: "single", verdict: "by-right", checks: [], summary: "City approved" }] }),
    );
    // Unknown keys make the body invalid: the server never merges client facts.
    expect(res.status).toBe(400);
  });

  it.each([
    ["not JSON", "{oops"],
    ["missing lotId", { ruleSet: "current" }],
    ["bad ruleSet", { lotId: LOT, ruleSet: "draft" }],
    ["numeric lotId", { lotId: 12, ruleSet: "current" }],
    ["oversized", { lotId: LOT, ruleSet: "current", pad: "x".repeat(5000) }],
  ])("400 on a malformed body: %s", async (_, body) => {
    const res = await memoPOST(post(body));
    expect(res.status).toBe(400);
  });

  it("404 on an unknown parcel", async () => {
    const res = await memoPOST(post({ lotId: "9999Z99999000000", ruleSet: "current" }));
    expect(res.status).toBe(404);
  });

  it("falls back to the deterministic memo when the provider fails", async () => {
    process.env.OPENAI_API_KEY = "test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const j = await (await memoPOST(post({ lotId: LOT, ruleSet: "current" }))).json();
    expect(j.memo).toBeNull();
    expect(j.deterministic).toContain(LOT);
  });
});

describe("POST /api/memo: model facts follow the one financial result and the requested proposal", () => {
  /** The memo route's answer with a stubbed provider, and the user message the model was sent. */
  async function memoWithModel(body: Record<string, unknown>) {
    process.env.OPENAI_API_KEY = "test";
    const sent: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const messages = (JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] }).messages;
        sent.push(messages.find((m) => m.role === "user")!.content);
        return Response.json({ choices: [{ message: { content: "Bottom line: review needed." } }] });
      }),
    );
    const j = await (await memoPOST(post(body))).json();
    return { j, sent };
  }

  it.each([
    ["0 Forbes Av (FAR failure)", "0086L00500000000", "building does not fit (FAR)"],
    ["5724 Murray Hill Pl (district unconfirmed)", "0085K00296000000", "district unconfirmed"],
  ])("%s: finance not screened, so the model gets no dollar figure", async (_, lotId, reason) => {
    const { j, sent } = await memoWithModel({ lotId, ruleSet: "current" });
    expect(j.facts).toContain(`Financial result: not screened (${reason})`);
    expect(j.facts).not.toContain("$");
    expect(j.facts).not.toMatch(/clears the (cost-and-return )?screen|revenue|total cost/i);
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain("$");
  });

  it("126 Carrington as a duplex: the facts and the memo are about the duplex, not the default townhouse", async () => {
    const duplex = (await memoWithModel({ lotId: "0023F00165000000", ruleSet: "current", typology: "duplex" })).j;
    expect(duplex.facts).toMatch(/^Proposal: Duplex \(requested\)/m);
    expect(duplex.facts).not.toContain("$");
    const best = (await memoWithModel({ lotId: "0023F00165000000", ruleSet: "current" })).j;
    expect(best.facts).toMatch(/^Proposal: Townhouse \(default proposal\)/m);
    // Screened: the default townhouse carries its figures.
    expect(best.facts).toContain("$");
    expect(duplex.deterministic).not.toBe(best.deterministic);
  });

  it("labels the model summary as unverified, with or without a model", async () => {
    const { j } = await memoWithModel({ lotId: LOT, ruleSet: "current" });
    expect(j.memo).toBe("Bottom line: review needed.");
    expect(j.label).toBe("Plain-language summary (model-generated, unverified)");
    delete process.env.OPENAI_API_KEY;
    const none = await (await memoPOST(post({ lotId: LOT, ruleSet: "current" }))).json();
    expect(none.memo).toBeNull();
    expect(none.label).toBe("Plain-language summary (model-generated, unverified)");
  });
});

describe("model route limits", () => {
  it("the provider times out at 12 s, inside the routes' 20 s budget", async () => {
    const { PROVIDER_TIMEOUT_MS } = await import("./server");
    const memo = await import("../memo/route");
    const application = await import("../application/route");
    expect(PROVIDER_TIMEOUT_MS).toBe(12_000);
    expect(memo.maxDuration).toBe(20);
    expect(application.maxDuration).toBe(20);
  });
});

describe("POST /api/application", () => {
  it("returns the deterministic description and no suggestion without credentials", async () => {
    const res = await applicationPOST(post({ lotId: LOT, ruleSet: "current", typology: "single" }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.suggestion).toBeNull();
    expect(j.source).toMatch(/^Build a single-unit detached house/);
  });

  it("sends only the proposed-use description to the model, labeled unverified", async () => {
    process.env.OPENAI_API_KEY = "test";
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(String(init.body));
        return Response.json({ choices: [{ message: { content: "We plan one new house here." } }] });
      }),
    );
    const j = await (await applicationPOST(post({ lotId: LOT, ruleSet: "current", typology: "duplex" }))).json();
    expect(j.suggestion).toBe("We plan one new house here.");
    expect(j.label).toBe("Suggested wording, unverified; edit before filing");
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("922.09");
    expect(calls[0]).not.toMatch(/lot of record|hardship/i);
  });

  it("400 on a bad typology", async () => {
    const res = await applicationPOST(post({ lotId: LOT, ruleSet: "current", typology: "castle" }));
    expect(res.status).toBe(400);
  });
});
