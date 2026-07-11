// Formatters that turn the verbose nested API payload into compact,
// agent-friendly text. Feed listings get a one-block digest per event so an
// agent can scan many events cheaply, then drill into one with vera_get_event.
//
// Important: the real signal for a multi-outcome market lives on its top
// sub-market (effect / price / momentum), and the API's market_id filter keys
// off sub_market_id — so the digest surfaces the sub-market, not the parent.

import type {
  MarketSnapshot,
  Momentum,
  NewsEffect,
  NewsItem,
  RelatedMarket,
  SubMarket,
} from "./types.js";

const RELEVANCE_RANK: Record<string, number> = { high: 3, moderate: 2, low: 1 };

export function relevanceRank(bucket: string | undefined | null): number {
  return bucket ? (RELEVANCE_RANK[bucket] ?? 0) : 0;
}

function prob(v: number | null | undefined): string {
  return v == null ? "—" : v.toFixed(2);
}

function usd(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

function momentumTag(m: Momentum | null | undefined): string {
  if (!m) return "";
  if (!m.passed) return "  momentum:flat";
  const pp =
    m.pre_move_pp == null
      ? ""
      : ` ${m.pre_move_pp > 0 ? "+" : ""}${m.pre_move_pp.toFixed(1)}pp`;
  return `  momentum:MOVED${pp}`;
}

function effectStr(eff: NewsEffect | null): string {
  return eff
    ? `news ${eff.effect} ${eff.affected_outcome} (${eff.relevance_bucket})`
    : "relationship noted";
}

function priceStr(snap: MarketSnapshot | null): string {
  return snap
    ? ` · yes=${prob(snap.yes_ask)} no=${prob(snap.no_ask)} vol24h=${usd(snap.volume_24h)}`
    : "";
}

/** The related market with the strongest relationship bucket (best signal). */
export function topMarket(item: NewsItem): RelatedMarket | undefined {
  if (item.related_markets.length === 0) return undefined;
  return [...item.related_markets].sort(
    (a, b) =>
      relevanceRank(b.market_relationship?.bucket) -
      relevanceRank(a.market_relationship?.bucket),
  )[0];
}

/** The sub-market carrying the strongest news effect (the queryable contract). */
export function topSubMarket(rm: RelatedMarket): SubMarket | undefined {
  if (rm.sub_markets.length === 0) return undefined;
  return [...rm.sub_markets].sort(
    (a, b) =>
      relevanceRank(b.news_effect?.relevance_bucket) -
      relevanceRank(a.news_effect?.relevance_bucket),
  )[0];
}

/** True if any market attached to the event showed a momentum move. */
export function itemHasMomentum(item: NewsItem): boolean {
  return item.related_markets.some(
    (rm) =>
      rm.main_market.momentum?.passed === true ||
      rm.sub_markets.some((sm) => sm.momentum?.passed === true),
  );
}

/**
 * Render the top related market as one line, pulling effect/price/momentum from
 * the sub-market when the parent is a multi-outcome event. Returns the line plus
 * the sub_market_id an agent can pass to vera_get_market_signals.
 */
function renderMarket(rm: RelatedMarket): { line: string; queryableId: string | undefined } {
  const m = rm.main_market;
  const tsm = topSubMarket(rm);
  const eff = m.news_effect ?? tsm?.news_effect ?? null;
  const snap = m.market_snapshot ?? tsm?.market_snapshot ?? null;
  const mom = m.momentum ?? tsm?.momentum ?? null;
  const title = m.market_title ?? m.market_id;
  const contract = tsm?.sub_market_title ? ` › ${tsm.sub_market_title}` : "";
  const thin = m.thin_liquidity ? " · thin" : "";
  const line = `${title}${contract} — ${effectStr(eff)}${priceStr(snap)}${thin}${momentumTag(mom)}`;
  return { line, queryableId: tsm?.sub_market_id ?? m.market_id };
}

/** One compact block summarizing a news event and its top related market. */
export function digest(item: NewsItem): string {
  const e = item.news_event;
  const when = e.endpoint_published_at ?? e.source_published_at ?? "";
  const cats = e.feed_categories.length ? ` [${e.feed_categories.join(", ")}]` : "";
  const rel = e.aggregate_event_relevance?.bucket
    ? `relevance:${e.aggregate_event_relevance.bucket}`
    : "";
  const head = e.short_headline ?? e.headline ?? "(no headline)";
  const src = e.source_name
    ? `  · ${e.source_name}${e.source_tier ? ` (${e.source_tier})` : ""}`
    : "";

  const tm = topMarket(item);
  const rendered = tm ? renderMarket(tm) : undefined;
  const marketStr = rendered ? `\n    ↳ ${rendered.line}` : "";
  const more =
    item.related_markets.length > 1
      ? `\n      (+${item.related_markets.length - 1} more related market${
          item.related_markets.length - 1 > 1 ? "s" : ""
        })`
      : "";
  const ids = `\n    news_id: ${e.id}${
    rendered?.queryableId ? `   ·   market_id: ${rendered.queryableId}` : ""
  }`;

  return `• ${when}${cats}  ${rel}\n  ${head}${src}${marketStr}${more}${ids}`;
}

/** Full, structured detail for a single event (drill-down). */
export function eventDetail(item: NewsItem): string {
  return JSON.stringify(item, null, 2);
}

export const DISCLAIMER =
  "Vera provides event-driven market intelligence for context only — not investment advice or a trading signal.";
