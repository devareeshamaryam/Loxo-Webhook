import type { Id } from "./webhook";

/** Only the parts of a Loxo person we read; everything else is passed through untouched. */
export interface LoxoPerson {
  name?: string;
  phones?: Array<{ value?: unknown }>;
  emails?: Array<{ value?: unknown }>;
  candidates?: LoxoCandidate[];
  [key: string]: unknown;
}

export interface LoxoCandidate {
  id: Id;
  workflow_stage_id?: Id | null;
  job?: {
    id?: Id;
    title?: string | null;
    description?: string | null;
  } | null;
  [key: string]: unknown;
}

export interface CandidateMatch {
  person_name: string;
  phone_number: string;
  has_phone: boolean;
  email: string;
  candidate_id: string;
  job_name: string;
  job_description: string;
  current_stage_id: string;
  is_stage_17003: boolean;
  vapi_call_name: string;
}

function firstValue(list: unknown): string {
  if (!Array.isArray(list) || list.length === 0) return "";
  const value = list[0]?.value;
  return value === undefined || value === null ? "" : String(value).trim();
}

/**
 * Port of the Zapier "match candidate" code step.
 * Returns null when the person has no candidate record for the webhook's job.
 *
 * Ids are compared and emitted as strings, matching Zapier where Code-step inputs are always strings.
 */
export function matchCandidate(
  person: LoxoPerson,
  ids: { person_id: Id; job_id: Id },
): CandidateMatch | null {
  const candidates: LoxoCandidate[] = Array.isArray(person.candidates) ? person.candidates : [];
  const candidate = candidates.find((c) => c?.job != null && String(c.job.id) === String(ids.job_id));
  if (!candidate) return null;

  const phone_number = firstValue(person.phones);
  const candidate_id = String(candidate.id);
  const current_stage_id = String(candidate.workflow_stage_id ?? "");

  return {
    person_name: person.name ?? "",
    phone_number,
    has_phone: phone_number.length > 0,
    email: firstValue(person.emails),
    candidate_id,
    job_name: candidate.job?.title || "",
    job_description: candidate.job?.description ?? "",
    current_stage_id,
    is_stage_17003: current_stage_id === "17003",
    vapi_call_name: JSON.stringify({
      person_id: String(ids.person_id),
      job_id: String(ids.job_id),
      candidate_id,
    }),
  };
}
