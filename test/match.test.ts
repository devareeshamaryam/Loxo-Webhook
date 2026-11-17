import { describe, expect, it } from "vitest";
import { matchCandidate } from "../src/match";
import { makePerson } from "./fixtures";

const ids = { person_id: 4455725, job_id: 122597 };

describe("matchCandidate", () => {
  it("matches the candidate for the webhook job and extracts all fields", () => {
    expect(matchCandidate(makePerson(), ids)).toEqual({
      person_name: "Jane Doe",
      phone_number: "+44 7700 900123",
      has_phone: true,
      email: "jane@example.com",
      candidate_id: "9002",
      job_name: "Senior Engineer",
      job_description: "<p>Build things</p>",
      current_stage_id: "17003",
      is_stage_17003: true,
      vapi_call_name: JSON.stringify({ person_id: "4455725", job_id: "122597", candidate_id: "9002" }),
    });
  });

  it("returns null when no candidate is for the webhook job", () => {
    expect(matchCandidate(makePerson(), { person_id: 1, job_id: 999 })).toBeNull();
  });

  it("returns null when candidates is missing or not an array", () => {
    expect(matchCandidate(makePerson({ candidates: undefined }), ids)).toBeNull();
    expect(matchCandidate(makePerson({ candidates: null as never }), ids)).toBeNull();
  });

  it("ignores candidates without a job", () => {
    const person = makePerson({ candidates: [{ id: 1, job: null }, { id: 2 }] });
    expect(matchCandidate(person, ids)).toBeNull();
  });

  it("handles a missing phone", () => {
    for (const phones of [undefined, [], [{ value: "   " }], [{}]]) {
      const result = matchCandidate(makePerson({ phones }), ids);
      expect(result?.phone_number).toBe("");
      expect(result?.has_phone).toBe(false);
    }
  });

  it("handles a missing email", () => {
    for (const emails of [undefined, [], [{ value: null }]]) {
      expect(matchCandidate(makePerson({ emails }), ids)?.email).toBe("");
    }
  });

  it("matches number vs string ids in either direction", () => {
    expect(matchCandidate(makePerson(), { person_id: "4455725", job_id: "122597" })?.candidate_id).toBe("9002");

    const stringJobIds = makePerson({
      candidates: [{ id: "9003", workflow_stage_id: "16749", job: { id: "122597", title: "T" } }],
    });
    const result = matchCandidate(stringJobIds, { person_id: 4455725, job_id: 122597 });
    expect(result?.candidate_id).toBe("9003");
    expect(result?.current_stage_id).toBe("16749");
    expect(result?.is_stage_17003).toBe(false);
  });

  it("defaults stage, title and description when absent", () => {
    const person = makePerson({ candidates: [{ id: 5, workflow_stage_id: null, job: { id: 122597 } }] });
    const result = matchCandidate(person, ids);
    expect(result?.current_stage_id).toBe("");
    expect(result?.is_stage_17003).toBe(false);
    expect(result?.job_name).toBe("");
    expect(result?.job_description).toBe("");
  });

  it("takes the first matching candidate", () => {
    const person = makePerson({
      candidates: [
        { id: 1, workflow_stage_id: 17529, job: { id: 122597 } },
        { id: 2, workflow_stage_id: 17003, job: { id: 122597 } },
      ],
    });
    expect(matchCandidate(person, ids)?.candidate_id).toBe("1");
  });
});
