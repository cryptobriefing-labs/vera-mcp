# vera-mcp

An [MCP](https://modelcontextprotocol.io) server for the **Vera** prediction-markets
data API. It gives an AI agent (Claude Desktop, Claude Code, Cursor, or any MCP
client) live, event-driven market intelligence: for each breaking news event,
the Polymarket market it most affects, the current price, and whether the market
visibly moved.

> Vera provides market **intelligence for context** — not investment advice or a
> trading signal.

## Tools

| Tool | What it does |
|------|--------------|
| `vera_get_signals` | Scan the recent feed of news events + the market each affects (price, effect, momentum). Filter by `category`, `momentum_only`, `min_relevance`; paginate with `cursor`. |
| `vera_get_event` | Full structured JSON for one event by `news_id` — headline, context, and every related market with prices, effects, liquidity, and momentum. |
| `vera_get_market_signals` | The recent news flow driving one specific market contract (`market_id` as shown in the feed). |

## Setup

You need a Vera API key (starts with `vera_`). Get one at
**[vera.cryptobriefing.com](https://vera.cryptobriefing.com)**.

```bash
git clone https://github.com/cryptobriefing-labs/vera-mcp.git
cd vera-mcp
npm install
npm run build
```

### Register with Claude Code

```bash
claude mcp add vera -e VERA_API_KEY=vera_your_key_here -- node /absolute/path/to/vera-mcp/dist/index.js
```

### Register with Claude Desktop / any MCP client

Add to your MCP config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "vera": {
      "command": "node",
      "args": ["/absolute/path/to/vera-mcp/dist/index.js"],
      "env": { "VERA_API_KEY": "vera_your_key_here" }
    }
  }
}
```

Restart the client; the three `vera_*` tools appear. The server also starts
without a key so the tools are discoverable — calls then return a short message
telling you to set `VERA_API_KEY`.

## Try it

Ask your agent things like:

- *"What are the latest geopolitics signals from Vera?"*
- *"Show me Vera events where the market actually moved."* (`momentum_only`)
- *"Pull full detail on that Iran event."* (`vera_get_event`)
- *"What news has been driving the Ukraine–Crimea market?"* (`vera_get_market_signals`)

## Configuration

| Env var | Required | Default | Notes |
|---------|----------|---------|-------|
| `VERA_API_KEY` | yes | — | Your `vera_` key. |
| `VERA_API_BASE` | no | `https://ai-hub.cryptobriefing.com` | Override the API base URL. |

## Development

```bash
npm run dev     # run from source with tsx (stdio server)
npm run build   # compile TypeScript -> dist/
VERA_API_KEY=vera_... node scripts/smoke.mjs   # end-to-end smoke test against live API
```

Rate limits (Founding tier): 2 req/s sustained, 10 req/s burst, 50k/day. The
server surfaces `429`s (with `Retry-After`) and auth errors as readable tool
messages.

## License

UNLICENSED — © Crypto Briefing.
