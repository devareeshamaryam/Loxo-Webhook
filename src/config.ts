import { STAGE_ROUTES, type RouteKey } from "./constants";

export interface Config {
  port: number;
  loxoApiKey: string;
  /** Loxo agency slug used in API paths: /api/<slug>/... */
  loxoAgencySlug: string;
  loxoDomain: string;
  /** Zapier Catch Hook URL per route. */
  zapUrls: Record<RouteKey, string>;
  /** When set, requests must include ?token=<WEBHOOK_SECRET>. */
  webhookSecret?: string;
}

const ROUTES = Object.values(STAGE_ROUTES);
const REQUIRED = ["LOXO_API_KEY", "LOXO_AGENCY_SLUG", ...ROUTES.map((r) => r.envVar)];

/** Reads and validates env vars. Throws if anything required is missing or invalid. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const zapUrls = {} as Record<RouteKey, string>;
  for (const route of ROUTES) {
    const url = env[route.envVar]!.trim();
    try {
      new URL(url);
    } catch {
      throw new Error(`${route.envVar} is not a valid URL`);
    }
    zapUrls[route.key] = url;
  }

  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT is not a valid port: ${env.PORT}`);
  }

  return {
    port,
    loxoApiKey: env.LOXO_API_KEY!.trim(),
    loxoAgencySlug: env.LOXO_AGENCY_SLUG!.trim(),
    loxoDomain: env.LOXO_DOMAIN?.trim() || "app.loxo.co",
    zapUrls,
    webhookSecret: env.WEBHOOK_SECRET?.trim() || undefined,
  };
}
