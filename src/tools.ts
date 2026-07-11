// Tool registration for the Vera MCP server. Three tools:
//   vera_get_signals         — scan the recent market-intelligence feed (digest)
//   vera_get_event           — full structured detail for one event (drill-down)
//   vera_get_market_signals  — events tied to a specific Polymarket market
//
// The API's GET /pm/v2/news only filters by limit/since/cursor/news_id/market_id.
// Category, momentum, and minimum-relevance filters are therefore applied
// client-side after fetching, so we over-fetch when a client-side filter is on.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VeraClient, VeraError } from "./client.js";
import type { NewsItem } from "./types.js";
import {
  DISCLAIMER,
  digest,
  eventDetail,
  itemHasMomentum,
  relevanceRank,
} from "./format.js";

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

/** Build a client, or return a friendly setup message if the key is missing. */
function makeClient(): { client?: VeraClient; error?: string } {
  try {
    return { client: new VeraClient() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Run a client call, mapping VeraError to a readable tool message. */
async function guarded(fn: () => Promise<ReturnType<typeof text>>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof VeraError) return text(`⚠️ ${e.message}`);
    return text(`⚠️ Unexpected error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function registerTools(server: McpServer) {
  // ── vera_get_signals ─────────────────────────────────────────────────────
  server.registerTool(
    "vera_get_signals",
    {
      title: "Get recent Vera market-intelligence signals",
      description:
        "Scan the latest event-driven prediction-market intelligence from Vera. " +
        "Each result is a news event with the Polymarket market it most affects, " +
        "the price snapshot, and whether the market visibly moved (momentum). " +
        "Newest first. Use this to survey what's happening; call vera_get_event " +
        "with a news_id for full detail. Optional filters (category, momentum_only, " +
        "min_relevance) are applied after fetching.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Max events to return after filtering (1–100)."),
        since: z
          .string()
          .optional()
          .describe("ISO 8601 timestamp; only events scored at/after this time."),
        cursor: z
          .string()
          .optional()
          .describe(
            "Pagination cursor from a previous call's 'Next page' line; returns events strictly older.",
          ),
        category: z
          .string()
          .optional()
          .describe(
            "Filter to a feed category, e.g. geopolitics, crypto, macro, politics, tech, sports.",
          ),
        momentum_only: z
          .boolean()
          .default(false)
          .describe("Only events whose market visibly moved around the news."),
        min_relevance: z
          .enum(["low", "moderate", "high"])
          .optional()
          .describe("Only events at/above this event-relevance bucket."),
      },
    },
    async ({ limit, since, cursor, category, momentum_only, min_relevance }) =>
      guarded(async () => {
        const { client, error } = makeClient();
        if (!client) return text(`⚠️ ${error}`);

        const filtering = Boolean(category || momentum_only || min_relevance);
        // Over-fetch when filtering client-side so we can still fill `limit`.
        const fetchLimit = filtering ? Math.min(500, Math.max(limit * 5, 100)) : limit;

        const res = await client.getNews({ limit: fetchLimit, since, cursor });

        let items: NewsItem[] = res.items;
        if (category) {
          const c = category.toLowerCase();
          items = items.filter((it) =>
            it.news_event.feed_categories.some((fc) => fc.toLowerCase() === c),
          );
        }
        if (momentum_only) items = items.filter(itemHasMomentum);
        if (min_relevance) {
          const floor = relevanceRank(min_relevance);
          items = items.filter(
            (it) => relevanceRank(it.news_event.aggregate_event_relevance?.bucket) >= floor,
          );
        }

        const shown = items.slice(0, limit);
        if (shown.length === 0) {
          const note = filtering
            ? " matching your filters (try widening them or a larger `since` window)"
            : "";
          return text(`No Vera events found${note}.`);
        }

        const filterDesc = [
          category ? `category=${category}` : null,
          momentum_only ? "momentum_only" : null,
          min_relevance ? `min_relevance=${min_relevance}` : null,
        ]
          .filter(Boolean)
          .join(", ");
        const header =
          `${shown.length} Vera event${shown.length > 1 ? "s" : ""}` +
          (filterDesc ? ` (${filterDesc})` : "") +
          `, newest first:`;

        const body = shown.map(digest).join("\n\n");
        // The cursor is the oldest item shown; only meaningful if we returned a full page.
        const last = shown[shown.length - 1];
        const pageCursor = last?.news_event.endpoint_published_at ?? res.next_cursor;
        const pageHint =
          !filtering && res.next_cursor
            ? `\n\nNext page: call vera_get_signals with cursor="${res.next_cursor}"`
            : filtering && pageCursor
              ? `\n\nMore may exist: re-call with cursor="${pageCursor}" and the same filters.`
              : "";

        return text(`${header}\n\n${body}${pageHint}\n\n${DISCLAIMER}`);
      }),
  );

  // ── vera_get_event ───────────────────────────────────────────────────────
  server.registerTool(
    "vera_get_event",
    {
      title: "Get full detail for one Vera event",
      description:
        "Fetch the complete structured record for a single news event by its " +
        "news_id (from vera_get_signals): headline, context, and every related " +
        "market with prices, the news effect on each outcome, liquidity, and " +
        "momentum. Returns JSON.",
      inputSchema: {
        news_id: z.string().describe("The event's news_id, from vera_get_signals."),
      },
    },
    async ({ news_id }) =>
      guarded(async () => {
        const { client, error } = makeClient();
        if (!client) return text(`⚠️ ${error}`);

        const res = await client.getNews({ news_id, limit: 1 });
        const item = res.items[0];
        if (!item) return text(`No Vera event found for news_id "${news_id}".`);
        return text(`${eventDetail(item)}\n\n${DISCLAIMER}`);
      }),
  );

  // ── vera_get_market_signals ──────────────────────────────────────────────
  server.registerTool(
    "vera_get_market_signals",
    {
      title: "Get Vera events for a specific Polymarket market",
      description:
        "List recent news events Vera has tied to a specific Polymarket market " +
        "contract. Pass the market_id exactly as shown by vera_get_signals (a " +
        "specific yes/no contract id, e.g. 'us_iran_peace_talks:us-x-iran-...'). " +
        "Use this to see the news flow driving one market. Newest first.",
      inputSchema: {
        market_id: z
          .string()
          .describe(
            "A specific market contract id — the market_id shown in a vera_get_signals result.",
          ),
        limit: z.number().int().min(1).max(100).default(20).describe("Max events (1–100)."),
        since: z
          .string()
          .optional()
          .describe("ISO 8601 timestamp; only events scored at/after this time."),
      },
    },
    async ({ market_id, limit, since }) =>
      guarded(async () => {
        const { client, error } = makeClient();
        if (!client) return text(`⚠️ ${error}`);

        const res = await client.getNews({ market_id, limit, since });
        if (res.items.length === 0) {
          return text(`No Vera events found for market_id "${market_id}".`);
        }
        const header = `${res.items.length} Vera event${
          res.items.length > 1 ? "s" : ""
        } for market ${market_id}, newest first:`;
        const body = res.items.map(digest).join("\n\n");
        const pageHint = res.next_cursor
          ? `\n\nNext page: re-call with since/cursor semantics via vera_get_signals cursor="${res.next_cursor}".`
          : "";
        return text(`${header}\n\n${body}${pageHint}\n\n${DISCLAIMER}`);
      }),
  );
}
