import type { Config } from "./config";
import { dedupeKey, type Deduper } from "./dedupe";
import { fetchPerson as defaultFetchPerson } from "./loxo";
import type { Logger } from "./logger";
import { matchCandidate } from "./match";
import { PAYLOAD_BUILDERS } from "./payloads";
import type { RetryOptions } from "./retry";
import { resolveRoute } from "./router";
import { isCandidateUpdate, missingRequiredFields, normalizeWebhook } from "./webhook";
import { postToZap as defaultPostToZap } from "./zapier";

export type SkipReason =
  | "invalid_body"
  | "not_candidate_update"
  | "missing_fields"
  | "agency_mismatch"
  | "no_matching_candidate"
  | "stage_not_routed"
  | "duplicate";

export type Outcome =
  | { outcome: "forwarded"; route: string }
  | { outcome: "skipped"; reason: SkipReason }
  | { outcome: "error"; reason: string };

export interface ProcessorDeps {
  config: Pick<Config, "loxoApiKey" | "loxoAgencySlug" | "loxoDomain" | "zapUrls">;
  deduper: Deduper;
  log: Logger;
  fetchPerson?: typeof defaultFetchPerson;
  postToZap?: typeof defaultPostToZap;
  retry?: RetryOptions;
}

/** Fetch person, match candidate, route by stage, dedupe, POST to that stage's Zap. Never throws. */
export async function processEvent(body: unknown, deps: ProcessorDeps): Promise<Outcome> {
  const { config, deduper } = deps;
  const fetchPerson = deps.fetchPerson ?? defaultFetchPerson;
  const postToZap = deps.postToZap ?? defaultPostToZap;

  const event = normalizeWebhook(body);
  if (!event) {
    deps.log.warn({ outcome: "skipped", reason: "invalid_body" }, "Webhook skipped");
    return { outcome: "skipped", reason: "invalid_body" };
  }

  let log = deps.log.child({
    event_id: event.id,
    person_id: event.person_id,
    job_id: event.job_id,
    item_id: event.item_id,
    item_type: event.item_type,
    action: event.action,
  });

  const skip = (reason: SkipReason, extra: Record<string, unknown> = {}): Outcome => {
    log.info({ outcome: "skipped", reason, ...extra }, `Webhook skipped: ${reason}`);
    return { outcome: "skipped", reason };
  };

  if (!isCandidateUpdate(event)) return skip("not_candidate_update");

  const missing = missingRequiredFields(event);
  if (missing.length > 0) return skip("missing_fields", { missing });

  // A webhook for another agency would point at a person we can't (and shouldn't) fetch.
  if (event.agency_slug && event.agency_slug !== config.loxoAgencySlug) {
    return skip("agency_mismatch", { agency_slug: event.agency_slug, expected: config.loxoAgencySlug });
  }

  const person_id = event.person_id!;
  const job_id = event.job_id!;
  let reservedKey: string | undefined;

  try {
    const retryLog = (step: string): RetryOptions => ({
      ...deps.retry,
      onRetry: (err, attempt, delayMs) =>
        log.warn({ step, attempt, delayMs, err: String(err) }, `Retrying ${step}`),
    });

    const person = await fetchPerson(
      {
        domain: config.loxoDomain,
        agencySlug: config.loxoAgencySlug,
        personId: person_id,
        apiKey: config.loxoApiKey,
      },
      retryLog("fetch_person"),
    );

    const match = matchCandidate(person, { person_id, job_id });
    if (!match) {
      return skip("no_matching_candidate", {
        candidate_count: Array.isArray(person.candidates) ? person.candidates.length : 0,
      });
    }

    log = log.child({ candidate_id: match.candidate_id, stage: match.current_stage_id });

    const route = resolveRoute(match.current_stage_id);
    if (!route) return skip("stage_not_routed");

    log = log.child({ route: route.name });

    const key = dedupeKey(person_id, job_id, match.current_stage_id);
    if (!deduper.tryReserve(key)) return skip("duplicate");
    reservedKey = key;

    const payload = PAYLOAD_BUILDERS[route.key]({ person, event: { person_id, job_id, item_id: event.item_id }, match });
    await postToZap(config.zapUrls[route.key], payload, retryLog(`post_to_zap:${route.key}`));

    log.info({ outcome: "forwarded", has_phone: match.has_phone }, `Webhook forwarded to Zapier: ${route.name}`);
    return { outcome: "forwarded", route: route.name };
  } catch (err) {
    // Let a redelivery of the same event through if we never managed to forward it.
    if (reservedKey) deduper.release(reservedKey);
    const reason = err instanceof Error ? err.message : String(err);
    log.error({ outcome: "error", reason, err }, "Webhook processing failed");
    return { outcome: "error", reason };
  }
}
