import type { ZapBody } from "./payloads";
import { HttpError, readBodySafe, withRetry, type RetryOptions } from "./retry";

const REQUEST_TIMEOUT_MS = 10_000;

export async function postToZap(zapUrl: string, payload: ZapBody, retry?: RetryOptions): Promise<void> {
  await withRetry(async () => {
    const res = await fetch(zapUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new HttpError("Zapier", res.status, await readBodySafe(res));
    }
  }, retry);
}
