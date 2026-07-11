// TypeScript shapes for the Vera GET /pm/v2/news response.
// Mirrors the NewsV2* Pydantic models served by ai-hub routers/pm.py.
// Every nested object is heavily nullable — treat null as "unknown", not zero.

export interface Momentum {
  /** Market visibly reacted around the event (descriptive, not predictive). */
  passed: boolean;
  /** Signed move in percentage points of implied probability. */
  pre_move_pp: number | null;
  /** Gate rule evaluated, e.g. "ANY |+1.8pp| >= 0.5". */
  criteria: string | null;
  /** Gate config version, e.g. "v4". */
  config: string | null;
}

export interface MarketSnapshot {
  /** Best ask on YES side as implied probability 0–1; null = no price. */
  yes_ask: number | null;
  /** Best ask on NO side as implied probability 0–1; null = no price. */
  no_ask: number | null;
  yes_ask_source: string | null; // "ask" (CLOB) | "ws" (stream) | null
  no_ask_source: string | null;
  volume_24h: number | null; // trailing 24h traded volume, USD
  total_volume: number | null; // all-time traded volume, USD
  yes_tick_age_seconds: number | null;
  no_tick_age_seconds: number | null;
  note: string; // always "Reference only."
}

export interface NewsEffect {
  affected_outcome: string; // "YES" | "NO"
  effect: string; // "supports" | "opposes" (never a buy/sell direction)
  relevance_bucket: string; // "low" | "moderate" | "high"
  rationale: string | null; // null for low-bucket items
}

export interface Outcomes {
  yes: { token_id: string | null };
  no: { token_id: string | null };
}

export interface SubMarket {
  sub_market_id: string;
  sub_market_title: string | null;
  market_url: string | null;
  outcomes: Outcomes;
  news_effect: NewsEffect;
  market_snapshot: MarketSnapshot;
  momentum: Momentum | null;
}

export interface MainMarket {
  market_id: string; // Polymarket Event ID (or standalone market ID)
  market_url: string | null;
  market_title: string | null;
  outcomes: Outcomes | null; // null for multi-outcome events
  news_effect: NewsEffect | null; // null for multi-outcome events
  market_snapshot: MarketSnapshot | null; // null for multi-outcome events
  thin_liquidity: boolean | null; // true = low 24h volume
  momentum: Momentum | null; // null until the shadow gate logs (~1 min)
}

export interface RelatedMarket {
  main_market: MainMarket;
  market_relationship: { bucket: string; summary: string };
  sub_markets: SubMarket[];
}

export interface NewsEvent {
  id: string;
  headline: string | null;
  short_headline: string | null; // 60–80 char curated display headline
  source_news_url: string | null;
  source_name: string | null;
  source_type: string | null; // "tweet" | "rss" | ...
  source_tier: string | null; // "t1" | "t2" | "t3"
  source_url: string | null;
  short_context: string | null; // "why this matters for traders"
  long_context: string | null;
  author: string | null;
  feed_categories: string[]; // e.g. ["geopolitics"], ["crypto"]; may be empty
  source_published_at: string | null; // ISO 8601
  endpoint_published_at: string | null; // ISO 8601
  aggregate_event_relevance: { bucket: string }; // "low" | "moderate" | "high"
}

export interface NewsMeta {
  content_type: string;
  not_investment_advice: boolean;
  not_trading_signal: boolean;
}

export interface NewsItem {
  news_event: NewsEvent;
  related_markets: RelatedMarket[];
  meta: NewsMeta;
}

export interface NewsResponse {
  items: NewsItem[];
  next_cursor: string | null;
}
