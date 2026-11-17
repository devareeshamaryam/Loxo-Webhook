import { describe, expect, it, vi } from "vitest";
import { HttpError, withRetry } from "../src/retry";

describe("withRetry", () => {
  it("retries 5xx and network errors up to the attempt limit", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError("X", 503, ""))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue("ok");
    expect(await withRetry(fn, { baseDelayMs: 0 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last attempt", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError("X", 500, "down"));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 0 })).rejects.toThrow("X responded 500: down");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable 4xx", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError("X", 401, "nope"));
    await expect(withRetry(fn, { baseDelayMs: 0 })).rejects.toThrow("401");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
