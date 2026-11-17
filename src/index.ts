import { createApp } from "./app";
import { loadConfig, type Config } from "./config";
import { STAGE_ROUTES } from "./constants";
import { Deduper } from "./dedupe";
import { logger } from "./logger";

// Cloud Run sends SIGTERM and allows ~10s before SIGKILL.
const SHUTDOWN_GRACE_MS = 9_000;

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  logger.fatal({ err: String(err) }, "Invalid configuration, refusing to start");
  process.exit(1);
}

const inFlight = new Set<Promise<unknown>>();

const app = createApp({
  config,
  deduper: new Deduper(),
  log: logger,
  webhookSecret: config.webhookSecret,
  track: (job) => {
    inFlight.add(job);
    void job.finally(() => inFlight.delete(job));
  },
});

const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      loxo_domain: config.loxoDomain,
      loxo_agency_slug: config.loxoAgencySlug,
      routes: Object.entries(STAGE_ROUTES).map(([stage, r]) => `${stage} -> ${r.name}`),
      token_required: Boolean(config.webhookSecret),
    },
    "Server listening",
  );
});

async function shutdown(signal: string) {
  logger.info({ signal, in_flight: inFlight.size }, "Shutting down");
  server.close();
  const timeout = new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS));
  await Promise.race([Promise.allSettled([...inFlight]), timeout]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
