import type { Config } from "../src/config";
import type { LoxoPerson } from "../src/match";

export const testConfig: Pick<Config, "loxoApiKey" | "loxoAgencySlug" | "loxoDomain" | "zapUrls"> = {
  loxoApiKey: "key",
  loxoAgencySlug: "steve-slater",
  loxoDomain: "app.loxo.co",
  zapUrls: {
    ai_sourcing: "https://hooks.zapier.com/hooks/catch/1/ai/",
    applied: "https://hooks.zapier.com/hooks/catch/1/applied/",
    ready_to_submit: "https://hooks.zapier.com/hooks/catch/1/ready/",
  },
};

/** Person whose candidate for the sample job (122597) is in the given stage. */
export function personInStage(stage: string | number | null): LoxoPerson {
  return makePerson({
    candidates: [
      { id: 9002, workflow_stage_id: stage, job: { id: 122597, title: "Senior Engineer", description: "<p>Build things</p>" } },
    ],
  });
}

export const samplePayload = {
  data: {
    id: 515623,
    signature: "175c26856a2f",
    agency_id: 49341,
    agency_slug: "steve-slater",
    item_id: 3130927,
    item_type: "candidate",
    action: "update",
    timestamp: "2026-10-12T13:45:48.307Z",
    job_id: 122597,
    person_id: 4455725,
  },
};

export function makePerson(overrides: Partial<LoxoPerson> = {}): LoxoPerson {
  return {
    id: 4455725,
    name: "Jane Doe",
    phones: [{ value: "  +44 7700 900123 " }],
    emails: [{ value: " jane@example.com " }],
    candidates: [
      {
        id: 9001,
        workflow_stage_id: 16000,
        job: { id: 111, title: "Other job", description: "Not this one" },
      },
      {
        id: 9002,
        workflow_stage_id: 17003,
        job: { id: 122597, title: "Senior Engineer", description: "<p>Build things</p>" },
      },
    ],
    ...overrides,
  };
}
