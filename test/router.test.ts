import { describe, expect, it } from "vitest";
import { resolveRoute } from "../src/router";

describe("resolveRoute", () => {
  it("routes 17003 to AI Sourcing Enabled", () => {
    expect(resolveRoute("17003")).toMatchObject({ key: "ai_sourcing", name: "AI Sourcing Enabled", envVar: "ZAP_URL_AI_SOURCING" });
  });

  it("routes 16749 to Applied", () => {
    expect(resolveRoute("16749")).toMatchObject({ key: "applied", name: "Applied", envVar: "ZAP_URL_APPLIED" });
  });

  it("routes 17529 to Ready to Submit", () => {
    expect(resolveRoute("17529")).toMatchObject({ key: "ready_to_submit", name: "Ready to Submit", envVar: "ZAP_URL_READY_TO_SUBMIT" });
  });

  it("returns null for unrouted stages", () => {
    expect(resolveRoute("16000")).toBeNull();
    expect(resolveRoute("")).toBeNull();
  });

  it("requires an exact string match", () => {
    expect(resolveRoute(" 17003")).toBeNull();
    expect(resolveRoute("170030")).toBeNull();
    expect(resolveRoute("toString")).toBeNull();
  });
});
