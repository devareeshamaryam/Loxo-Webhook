import type { LoxoPerson } from "./match";
import { HttpError, readBodySafe, withRetry, type RetryOptions } from "./retry";
import type { Id } from "./webhook";

const REQUEST_TIMEOUT_MS = 10_000;

export interface FetchPersonParams {
  domain: string;
  agencySlug: string;
  personId: Id;
  apiKey: string;
}

export async function fetchPerson(params: FetchPersonParams, retry?: RetryOptions): Promise<LoxoPerson> {
  const url =
    `https://${params.domain}/api/${encodeURIComponent(params.agencySlug)}` +
    `/people/${encodeURIComponent(String(params.personId))}`;

  return withRetry(async () => {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new HttpError("Loxo", res.status, await readBodySafe(res));
    }
    return (await res.json()) as LoxoPerson;
  }, retry);
}
