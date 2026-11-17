import { describe, expect, it } from "vitest";
import { isCandidateUpdate, missingRequiredFields, normalizeWebhook } from "../src/webhook";
import { samplePayload } from "./fixtures";

describe("normalizeWebhook", () => {
  it("unwraps the nested Loxo shape", () => {
    expect(normalizeWebhook(samplePayload)).toEqual(samplePayload.data);
  });

  it("accepts a flat body", () => {
    expect(normalizeWebhook(samplePayload.data)).toEqual(samplePayload.data);
  });

  it("returns null for non-objects", () => {
    expect(normalizeWebhook(null)).toBeNull();
    expect(normalizeWebhook("x")).toBeNull();
    expect(normalizeWebhook([1])).toBeNull();
  });
});

describe("event checks", () => {
  it("only accepts candidate updates", () => {
    expect(isCandidateUpdate(samplePayload.data)).toBe(true);
    expect(isCandidateUpdate({ ...samplePayload.data, action: "create" })).toBe(false);
    expect(isCandidateUpdate({ ...samplePayload.data, item_type: "person" })).toBe(false);
  });

  it("reports missing required fields", () => {
    expect(missingRequiredFields(samplePayload.data)).toEqual([]);
    expect(missingRequiredFields({ person_id: 1, job_id: "" })).toEqual(["job_id"]);
  });
});
