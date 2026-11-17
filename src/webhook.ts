export type Id = string | number;

export interface LoxoWebhookEvent {
  id?: Id;
  signature?: string;
  agency_id?: Id;
  agency_slug?: string;
  item_id?: Id;
  item_type?: string;
  action?: string;
  timestamp?: string;
  job_id?: Id;
  person_id?: Id;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accepts either Loxo's nested shape `{ data: { ... } }` or a flat object.
 * Returns null if the body is not an object at all.
 */
export function normalizeWebhook(body: unknown): LoxoWebhookEvent | null {
  if (!isObject(body)) return null;
  const source = isObject(body.data) ? body.data : body;
  return source as LoxoWebhookEvent;
}

export function isCandidateUpdate(event: LoxoWebhookEvent): boolean {
  return event.item_type === "candidate" && event.action === "update";
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

/** Returns the names of fields the processor needs but the event lacks. */
export function missingRequiredFields(event: LoxoWebhookEvent): string[] {
  return (["person_id", "job_id"] as const).filter((key) => !hasValue(event[key]));
}
