import { createHash, timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import { processEvent, type ProcessorDeps } from "./processor";

export interface AppDeps extends ProcessorDeps {
  webhookSecret?: string;
  /** Called with each background job so the server can wait for them on shutdown. */
  track?: (job: Promise<unknown>) => void;
}

function tokensMatch(provided: string, expected: string): boolean {
  // Hash both sides so lengths match and timingSafeEqual can be used.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.post("/webhooks/loxo", (req, res) => {
    if (deps.webhookSecret) {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!tokensMatch(token, deps.webhookSecret)) {
        deps.log.warn({ path: req.path }, "Rejected webhook: invalid or missing token");
        res.status(401).json({ error: "unauthorized" });
        return;
      }
    }

    // Acknowledge right away; Loxo doesn't need to wait for Loxo/Zapier round-trips.
    res.status(200).json({ received: true });

    const job = processEvent(req.body, deps);
    deps.track?.(job);
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === "number" ? err.status : 500;
    deps.log.warn({ status, err: String(err) }, "Request error");
    res.status(status).json({ error: status === 400 ? "invalid JSON" : "internal error" });
  };
  app.use(onError);

  return app;
}
