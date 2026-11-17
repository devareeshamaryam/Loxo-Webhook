import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { Deduper } from "../src/dedupe";
import { logger } from "../src/logger";
import { makePerson, samplePayload, testConfig } from "./fixtures";

let close: (() => void) | undefined;
afterEach(() => close?.());

async function start(webhookSecret?: string) {
  const jobs: Promise<unknown>[] = [];
  const postToZap = vi.fn(async () => {});
  const app = createApp({
    config: testConfig,
    deduper: new Deduper(),
    log: logger,
    fetchPerson: async () => makePerson(),
    postToZap,
    webhookSecret,
    track: (job) => jobs.push(job),
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  close = () => server.close();
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, jobs, postToZap };
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("HTTP app", () => {
  it("serves /health", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
  });

  it("acks the webhook with 200 and processes it in the background", async () => {
    const { base, jobs, postToZap } = await start();
    const res = await post(`${base}/webhooks/loxo`, samplePayload);
    expect(res.status).toBe(200);
    await Promise.all(jobs);
    expect(postToZap).toHaveBeenCalledTimes(1);
  });

  it("rejects a wrong or missing token when WEBHOOK_SECRET is set", async () => {
    const { base, jobs } = await start("s3cret");
    expect((await post(`${base}/webhooks/loxo?token=nope`, samplePayload)).status).toBe(401);
    expect((await post(`${base}/webhooks/loxo`, samplePayload)).status).toBe(401);
    expect((await post(`${base}/webhooks/loxo?token=s3cret`, samplePayload)).status).toBe(200);
    expect(jobs).toHaveLength(1);
  });

  it("returns 400 for malformed JSON", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/webhooks/loxo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});
