import { afterEach, describe, expect, it, vi } from "vitest";
import { Deduper } from "../src/dedupe";
import { logger } from "../src/logger";
import type { ZapBody } from "../src/payloads";
import { processEvent, type ProcessorDeps } from "../src/processor";
import { HttpError } from "../src/retry";
import { postToZap as realPostToZap } from "../src/zapier";
import { makePerson, personInStage, samplePayload, testConfig } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

function setup(overrides: Partial<ProcessorDeps> = {}) {
  const fetchPerson = vi.fn(async () => makePerson());
  const postToZap = vi.fn(async (_url: string, _payload: ZapBody) => {});
  const deps: ProcessorDeps = {
    config: testConfig,
    deduper: new Deduper(),
    log: logger,
    fetchPerson,
    postToZap,
    retry: { baseDelayMs: 0 },
    ...overrides,
  };
  return { deps, fetchPerson, postToZap };
}

describe("processEvent", () => {
  it("fetches the person using the configured agency slug", async () => {
    const { deps, fetchPerson } = setup();
    await processEvent(samplePayload, deps);
    expect(fetchPerson).toHaveBeenCalledWith(
      { domain: "app.loxo.co", agencySlug: "steve-slater", personId: 4455725, apiKey: "key" },
      expect.anything(),
    );
  });

  it("routes 17003 to the AI Sourcing hook with its body", async () => {
    const { deps, postToZap } = setup({ fetchPerson: async () => personInStage(17003) });
    expect(await processEvent(samplePayload, deps)).toEqual({ outcome: "forwarded", route: "AI Sourcing Enabled" });
    expect(postToZap).toHaveBeenCalledTimes(1);
    const [url, body] = postToZap.mock.calls[0]!;
    expect(url).toBe(testConfig.zapUrls.ai_sourcing);
    expect(Object.keys(body)).toEqual(["person", "has_phone", "vapi_call_name", "call_phone", "job_description", "job_name"]);
    expect(JSON.parse(body.person!)).toEqual(personInStage(17003));
  });

  it("routes 16749 to the Applied hook with its body", async () => {
    const { deps, postToZap } = setup({ fetchPerson: async () => personInStage("16749") });
    expect(await processEvent(samplePayload, deps)).toEqual({ outcome: "forwarded", route: "Applied" });
    const [url, body] = postToZap.mock.calls[0]!;
    expect(url).toBe(testConfig.zapUrls.applied);
    expect(body).toMatchObject({ candidate_id: "9002", person_id: "4455725", job_id: "122597" });
  });

  it("routes 17529 to the Ready to Submit hook with its body", async () => {
    const { deps, postToZap } = setup({ fetchPerson: async () => personInStage(17529) });
    expect(await processEvent(samplePayload, deps)).toEqual({ outcome: "forwarded", route: "Ready to Submit" });
    const [url, body] = postToZap.mock.calls[0]!;
    expect(url).toBe(testConfig.zapUrls.ready_to_submit);
    expect(body).toMatchObject({ candidate_id: "9002", item_id: "3130927" });
  });

  it("makes no HTTP call to Zapier for an unrouted stage", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    // Real postToZap, so any Zapier request would go through the stubbed fetch.
    const { deps } = setup({ fetchPerson: async () => personInStage(16000), postToZap: realPostToZap });
    expect(await processEvent(samplePayload, deps)).toEqual({ outcome: "skipped", reason: "stage_not_routed" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats a missing stage as unrouted", async () => {
    const { deps, postToZap } = setup({ fetchPerson: async () => personInStage(null) });
    expect(await processEvent(samplePayload, deps)).toEqual({ outcome: "skipped", reason: "stage_not_routed" });
    expect(postToZap).not.toHaveBeenCalled();
  });

  it("uses the configured slug when the webhook has none", async () => {
    const { deps, fetchPerson } = setup();
    const { agency_slug: _omit, ...flat } = samplePayload.data;
    expect((await processEvent(flat, deps)).outcome).toBe("forwarded");
    expect(fetchPerson).toHaveBeenCalledWith(expect.objectContaining({ agencySlug: "steve-slater" }), expect.anything());
  });

  it("skips a webhook from a different agency without calling Loxo", async () => {
    const { deps, fetchPerson } = setup();
    const result = await processEvent({ data: { ...samplePayload.data, agency_slug: "someone-else" } }, deps);
    expect(result).toEqual({ outcome: "skipped", reason: "agency_mismatch" });
    expect(fetchPerson).not.toHaveBeenCalled();
  });

  it("ignores non candidate-update events without calling Loxo", async () => {
    const { deps, fetchPerson } = setup();
    const result = await processEvent({ data: { ...samplePayload.data, action: "create" } }, deps);
    expect(result).toEqual({ outcome: "skipped", reason: "not_candidate_update" });
    expect(fetchPerson).not.toHaveBeenCalled();
  });

  it("stops without calling Zapier when there is no matching candidate", async () => {
    const { deps, postToZap } = setup({ fetchPerson: async () => makePerson({ candidates: [] }) });
    expect(await processEvent(samplePayload, deps)).toEqual({ outcome: "skipped", reason: "no_matching_candidate" });
    expect(postToZap).not.toHaveBeenCalled();
  });

  it("drops a duplicate event within the dedupe window", async () => {
    const { deps, postToZap } = setup();
    await processEvent(samplePayload, deps);
    expect(await processEvent(samplePayload, deps)).toEqual({ outcome: "skipped", reason: "duplicate" });
    expect(postToZap).toHaveBeenCalledTimes(1);
  });

  it("allows the same event again after the window expires", () => {
    let now = 0;
    const deduper = new Deduper(10 * 60 * 1000, () => now);
    expect(deduper.tryReserve("k")).toBe(true);
    now += 10 * 60 * 1000 - 1;
    expect(deduper.tryReserve("k")).toBe(false);
    now += 1;
    expect(deduper.tryReserve("k")).toBe(true);
  });

  it("releases the dedupe key when forwarding fails so a redelivery can succeed", async () => {
    const postToZap = vi.fn().mockRejectedValueOnce(new HttpError("Zapier", 500, "boom")).mockResolvedValue(undefined);
    const { deps } = setup({ postToZap });
    expect((await processEvent(samplePayload, deps)).outcome).toBe("error");
    expect((await processEvent(samplePayload, deps)).outcome).toBe("forwarded");
  });

  it("retries a failing Zapier POST before succeeding", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { deps } = setup({ postToZap: realPostToZap });
    expect(await processEvent(samplePayload, deps)).toEqual({ outcome: "forwarded", route: "AI Sourcing Enabled" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]![0]).toBe(testConfig.zapUrls.ai_sourcing);
  });

  it("reports Loxo errors with status and body", async () => {
    const { deps, postToZap } = setup({
      fetchPerson: async () => {
        throw new HttpError("Loxo", 404, '{"error":"not found"}');
      },
    });
    expect(await processEvent(samplePayload, deps)).toEqual({
      outcome: "error",
      reason: 'Loxo responded 404: {"error":"not found"}',
    });
    expect(postToZap).not.toHaveBeenCalled();
  });
});
