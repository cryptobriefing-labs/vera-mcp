// Thin HTTP client for the Vera REST API. Uses the global fetch (Node >=18).
// Surfaces auth / rate-limit / HTTP errors as a typed VeraError so tools can
// turn them into friendly, actionable messages for the agent.

import { getApiBase, getApiKey } from "./config.js";
import type { NewsResponse } from "./types.js";

export type VeraErrorKind = "auth" | "rate_limit" | "http" | "network";

export class VeraError extends Error {
  constructor(
    message: string,
    readonly kind: VeraErrorKind,
    readonly status?: number,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "VeraError";
  }
}

export interface NewsQuery {
  limit?: number;
  since?: string;
  cursor?: string;
  news_id?: string;
  market_id?: string;
}

export class VeraClient {
  private readonly base: string;
  private readonly key: string;

  constructor() {
    const key = getApiKey();
    if (!key) {
      throw new VeraError(
        "VERA_API_KEY is not set. Get a key at https://vera.cryptobriefing.com, " +
          "then set VERA_API_KEY in this MCP server's environment.",
        "auth",
      );
    }
    if (!key.startsWith("vera_")) {
      throw new VeraError(
        'VERA_API_KEY does not look like a Vera key (expected a "vera_" prefix). ' +
          "Double-check the value you configured.",
        "auth",
      );
    }
    this.key = key;
    this.base = getApiBase();
  }

  async getNews(q: NewsQuery = {}): Promise<NewsResponse> {
    const url = new URL(`${this.base}/pm/v2/news`);
    if (q.limit != null) url.searchParams.set("limit", String(q.limit));
    if (q.since) url.searchParams.set("since", q.since);
    if (q.cursor) url.searchParams.set("cursor", q.cursor);
    if (q.news_id) url.searchParams.set("news_id", q.news_id);
    if (q.market_id) url.searchParams.set("market_id", q.market_id);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.key}`,
          Accept: "application/json",
        },
      });
    } catch (e) {
      throw new VeraError(
        `Network error reaching Vera (${this.base}): ${(e as Error).message}`,
        "network",
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new VeraError(
        "Vera rejected the API key (HTTP " +
          res.status +
          "). Check that VERA_API_KEY is valid, active, and not revoked.",
        "auth",
        res.status,
      );
    }
    if (res.status === 429) {
      const raRaw = res.headers.get("retry-after");
      const ra = raRaw != null ? Number(raRaw) : NaN;
      const retryAfter = Number.isFinite(ra) ? ra : undefined;
      throw new VeraError(
        "Rate limit exceeded. " +
          (retryAfter != null ? `Retry after ${retryAfter}s. ` : "Try again shortly. ") +
          "(Founding tier: 2 req/s sustained, 10 req/s burst, 50k/day.)",
        "rate_limit",
        429,
        retryAfter,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new VeraError(
        `Vera API error ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
        "http",
        res.status,
      );
    }

    return (await res.json()) as NewsResponse;
  }
}
