export class HttpError extends Error {
  constructor(
    readonly service: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${service} responded ${status}: ${body}`);
    this.name = "HttpError";
  }
}

/** Retry network errors, timeouts, 408, 429 and 5xx. Other 4xx responses won't change on retry. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.status === 408 || err.status === 429 || err.status >= 500;
  }
  return true;
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

/** Runs fn up to `attempts` times with exponential backoff (base, 2x base, ...). */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 3, baseDelayMs = 500, onRetry } = options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= attempts || !isRetryable(err)) throw err;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      onRetry?.(err, attempt, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/** Reads a response body for error messages, capped so logs stay readable. */
export async function readBodySafe(res: Response, max = 1000): Promise<string> {
  try {
    const text = await res.text();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return "<unreadable body>";
  }
}
