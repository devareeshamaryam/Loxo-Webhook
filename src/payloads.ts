import type { RouteKey } from "./constants";
import type { CandidateMatch, LoxoPerson } from "./match";
import type { Id } from "./webhook";

/** Everything a payload builder may draw from. */
export interface PayloadContext {
  person: LoxoPerson;
  event: { person_id: Id; job_id: Id; item_id?: Id };
  match: CandidateMatch;
}

/** Every target Zap receives flat string fields. */
export type ZapBody = Record<string, string>;

/** String-coerces a value, with "" for null/undefined. */
function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

/** 17003 AI Sourcing Enabled */
export function buildAiSourcingPayload({ person, match }: PayloadContext): ZapBody {
  return {
    person: JSON.stringify(person),
    has_phone: str(match.has_phone),
    vapi_call_name: str(match.vapi_call_name),
    call_phone: str(match.phone_number),
    job_description: str(match.job_description),
    job_name: str(match.job_name),
  };
}

/** 16749 Applied */
export function buildAppliedPayload({ event, match }: PayloadContext): ZapBody {
  return {
    candidate_id: str(match.candidate_id),
    // Full person name, as the old Zap sent it.
    first_name: str(match.person_name),
    phone: str(match.phone_number),
    email: str(match.email),
    job_id: str(event.job_id),
    person_id: str(event.person_id),
    job_name: str(match.job_name),
  };
}

/** 17529 Ready to Submit */
export function buildReadyToSubmitPayload({ event, match }: PayloadContext): ZapBody {
  return {
    candidate_id: str(match.candidate_id),
    candidate_name: str(match.person_name),
    email: str(match.email),
    phone: str(match.phone_number),
    person_id: str(event.person_id),
    job_id: str(event.job_id),
    item_id: str(event.item_id),
  };
}

export const PAYLOAD_BUILDERS: Record<RouteKey, (ctx: PayloadContext) => ZapBody> = {
  ai_sourcing: buildAiSourcingPayload,
  applied: buildAppliedPayload,
  ready_to_submit: buildReadyToSubmitPayload,
};
