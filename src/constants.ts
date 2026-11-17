/**
 * Loxo workflow stage id -> Zapier target. This map is also the filter:
 * candidates in any stage not listed here are not forwarded.
 */
export const STAGE_ROUTES = {
  "17003": { key: "ai_sourcing", name: "AI Sourcing Enabled", envVar: "ZAP_URL_AI_SOURCING" },
  "16749": { key: "applied", name: "Applied", envVar: "ZAP_URL_APPLIED" },
  "17529": { key: "ready_to_submit", name: "Ready to Submit", envVar: "ZAP_URL_READY_TO_SUBMIT" },
} as const;

export type StageId = keyof typeof STAGE_ROUTES;
export type Route = (typeof STAGE_ROUTES)[StageId];
export type RouteKey = Route["key"];
