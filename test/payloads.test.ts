import { describe, expect, it } from "vitest";
import { matchCandidate, type CandidateMatch } from "../src/match";
import {
  buildAiSourcingPayload,
  buildAppliedPayload,
  buildReadyToSubmitPayload,
  PAYLOAD_BUILDERS,
  type PayloadContext,
} from "../src/payloads";
import { makePerson, personInStage } from "./fixtures";

const event = { person_id: 4455725, job_id: 122597, item_id: 3130927 };

function fullContext(): PayloadContext {
  const person = personInStage(17003);
  return { person, event, match: matchCandidate(person, event)! };
}

/** Person with no name, phone, email, title, description or stage. */
function sparseContext(): PayloadContext {
  const person = makePerson({
    name: undefined,
    phones: [],
    emails: undefined,
    candidates: [{ id: 9002, job: { id: 122597 } }],
  });
  return { person, event: { person_id: 4455725, job_id: 122597 }, match: matchCandidate(person, event)! };
}

function expectAllStrings(body: Record<string, unknown>) {
  for (const [key, value] of Object.entries(body)) {
    expect(typeof value, key).toBe("string");
  }
}

describe("buildAiSourcingPayload", () => {
  it("has exactly the expected keys and string values", () => {
    const ctx = fullContext();
    const body = buildAiSourcingPayload(ctx);
    expect(body).toEqual({
      person: JSON.stringify(ctx.person),
      has_phone: "true",
      vapi_call_name: JSON.stringify({ person_id: "4455725", job_id: "122597", candidate_id: "9002" }),
      call_phone: "+44 7700 900123",
      job_description: "<p>Build things</p>",
      job_name: "Senior Engineer",
    });
    expectAllStrings(body);
  });

  it("uses empty strings for missing values", () => {
    const body = buildAiSourcingPayload(sparseContext());
    expect(body).toMatchObject({ has_phone: "false", call_phone: "", job_description: "", job_name: "" });
    expectAllStrings(body);
  });
});

describe("buildAppliedPayload", () => {
  it("has exactly the expected keys and string values", () => {
    const body = buildAppliedPayload(fullContext());
    expect(body).toEqual({
      candidate_id: "9002",
      first_name: "Jane Doe",
      phone: "+44 7700 900123",
      email: "jane@example.com",
      job_id: "122597",
      person_id: "4455725",
      job_name: "Senior Engineer",
    });
    expectAllStrings(body);
  });

  it("uses empty strings for missing values", () => {
    const body = buildAppliedPayload(sparseContext());
    expect(body).toMatchObject({ first_name: "", phone: "", email: "", job_name: "" });
    expectAllStrings(body);
  });
});

describe("buildReadyToSubmitPayload", () => {
  it("has exactly the expected keys and string values", () => {
    const body = buildReadyToSubmitPayload(fullContext());
    expect(body).toEqual({
      candidate_id: "9002",
      candidate_name: "Jane Doe",
      email: "jane@example.com",
      phone: "+44 7700 900123",
      person_id: "4455725",
      job_id: "122597",
      item_id: "3130927",
    });
    expectAllStrings(body);
  });

  it("uses empty strings for missing values, including item_id", () => {
    const body = buildReadyToSubmitPayload(sparseContext());
    expect(body).toMatchObject({ candidate_name: "", email: "", phone: "", item_id: "" });
    expectAllStrings(body);
  });

  it("stringifies non-string match values defensively", () => {
    const ctx = fullContext();
    const match = { ...ctx.match, email: null } as unknown as CandidateMatch;
    expect(buildReadyToSubmitPayload({ ...ctx, match }).email).toBe("");
  });
});

describe("PAYLOAD_BUILDERS", () => {
  it("has a builder for every route", () => {
    expect(PAYLOAD_BUILDERS).toEqual({
      ai_sourcing: buildAiSourcingPayload,
      applied: buildAppliedPayload,
      ready_to_submit: buildReadyToSubmitPayload,
    });
  });
});
