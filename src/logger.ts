import pino from "pino";

// Map pino levels to Cloud Logging severities so logs are filterable in the GCP console.
const SEVERITY: Record<string, string> = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
  messageKey: "message",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ severity: SEVERITY[label] ?? "DEFAULT" }),
  },
});

export type Logger = pino.Logger;
