import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const base = {
  LOXO_API_KEY: "k",
  LOXO_AGENCY_SLUG: "steve-slater",
  ZAP_URL_AI_SOURCING: "https://hooks.zapier.com/hooks/catch/1/ai/",
  ZAP_URL_APPLIED: "https://hooks.zapier.com/hooks/catch/1/applied/",
  ZAP_URL_READY_TO_SUBMIT: "https://hooks.zapier.com/hooks/catch/1/ready/",
};

describe("loadConfig", () => {
  it("fails when required vars are missing", () => {
    expect(() => loadConfig({})).toThrow(
      "LOXO_API_KEY, LOXO_AGENCY_SLUG, ZAP_URL_APPLIED, ZAP_URL_AI_SOURCING, ZAP_URL_READY_TO_SUBMIT",
    );
    expect(() => loadConfig({ ...base, LOXO_API_KEY: " " })).toThrow("LOXO_API_KEY");
  });

  it.each(["LOXO_AGENCY_SLUG", "ZAP_URL_AI_SOURCING", "ZAP_URL_APPLIED", "ZAP_URL_READY_TO_SUBMIT"])("fails when %s is missing", (name) => {
    expect(() => loadConfig({ ...base, [name]: "" })).toThrow(`Missing required environment variables: ${name}`);
  });

  it("rejects an invalid Zap URL", () => {
    expect(() => loadConfig({ ...base, ZAP_URL_APPLIED: "not a url" })).toThrow("ZAP_URL_APPLIED is not a valid URL");
  });

  it("maps each env var to its route and applies defaults", () => {
    const config = loadConfig(base);
    expect(config.zapUrls).toEqual({
      ai_sourcing: base.ZAP_URL_AI_SOURCING,
      applied: base.ZAP_URL_APPLIED,
      ready_to_submit: base.ZAP_URL_READY_TO_SUBMIT,
    });
    expect(config.loxoAgencySlug).toBe("steve-slater");
    expect(config.loxoDomain).toBe("app.loxo.co");
    expect(config.port).toBe(8080);
    expect(config.webhookSecret).toBeUndefined();
  });
});
