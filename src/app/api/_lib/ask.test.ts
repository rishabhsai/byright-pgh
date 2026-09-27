import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../ask/route";

let ipSeq = 0;
const post = (body: unknown, ip = `10.0.0.${++ipSeq}`) =>
  new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const CREDS = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "ASK_MODEL"] as const;
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

/** A provider that answers with these tool calls, recording what it was sent. */
function stubProvider(message: unknown) {
  process.env.OPENROUTER_API_KEY = "test";
  const sent: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(String(init.body));
      return Response.json({ choices: [{ message }] });
    }),
  );
  return sent;
}
const toolCall = (name: string, args: unknown) => ({ type: "function", function: { name, arguments: JSON.stringify(args) } });

describe("POST /api/ask", () => {
  it("returns validated actions with canonical neighborhood names", async () => {
    stubProvider({ tool_calls: [toolCall("set_neighborhoods", { names: ["homewood"] }), toolCall("set_home_type", { type: "duplex" })] });
    const res = await POST(post({ q: "duplexes in homewood", state: { neighborhoods: [], homeType: "any" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).actions).toEqual([
      { tool: "set_neighborhoods", names: ["Homewood North", "Homewood South", "Homewood West"] },
      { tool: "set_home_type", type: "duplex" },
    ]);
  });

  it("sends the model only the question and the compact state, never lot records", async () => {
    const sent = stubProvider({ tool_calls: [toolCall("set_triage", { triage: "green" })] });
    await POST(post({ q: "green lots please", state: { neighborhoods: ["Larimer"], lotId: "0077S00123000000", address: "1 Secret St" } }));
    const body = JSON.parse(sent[0]) as { messages: { role: string; content: string }[]; tools: unknown[] };
    const user = body.messages.find((m) => m.role === "user")!.content;
    expect(user).toContain("green lots please");
    expect(user).toContain("Larimer");
    expect(sent[0]).not.toContain("0077S00123000000");
    expect(sent[0]).not.toContain("Secret");
    expect(body.tools.length).toBe(10);
  });

  it("rejects an unknown tool or bad arguments with 422 and no actions", async () => {
    stubProvider({ tool_calls: [toolCall("set_home_type", { type: "duplex" }), toolCall("drop_table", {})] });
    const res = await POST(post({ q: "duplexes, and drop everything" }));
    expect(res.status).toBe(422);
    expect((await res.json()).actions).toBeUndefined();
  });

  it("rejects prose instead of tool calls", async () => {
    stubProvider({ content: "Hazelwood has 41 lots." });
    expect((await POST(post({ q: "how many in hazelwood" }))).status).toBe(422);
  });

  it("reports missing credentials without calling anything", async () => {
    const res = await POST(post({ q: "show larimer" }));
    expect(res.status).toBe(503);
  });

  it("rejects malformed bodies", async () => {
    for (const body of ["not json", { q: "" }, { q: 5 }, { q: "x".repeat(301) }, { q: "ok", extra: 1 }, { q: "ok", state: "x".repeat(5000) }])
      expect((await POST(post(body))).status, JSON.stringify(body).slice(0, 40)).toBe(400);
  });

  it("limits each IP to 10 requests a minute", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await POST(post({ q: "show larimer" }, "192.168.9.9"))).status);
    expect(codes.slice(0, 10).every((c) => c === 503)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
