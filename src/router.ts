import { STAGE_ROUTES, type Route } from "./constants";

/** Returns the Zapier route for a stage id (exact string match), or null if the stage isn't routed. */
export function resolveRoute(stageId: string): Route | null {
  return Object.prototype.hasOwnProperty.call(STAGE_ROUTES, stageId)
    ? STAGE_ROUTES[stageId as keyof typeof STAGE_ROUTES]
    : null;
}
