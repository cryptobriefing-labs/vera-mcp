#!/usr/bin/env node
// Vera MCP server — exposes the Vera prediction-markets data API as MCP tools
// over stdio. The server starts even without VERA_API_KEY so the tools are
// discoverable; a missing/invalid key surfaces as a friendly message on call.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

async function main() {
  const server = new McpServer({ name: "vera-mcp", version: "0.1.0" });
  registerTools(server);
  await server.connect(new StdioServerTransport());
  // stdout is the MCP protocol channel — all logging must go to stderr.
  process.stderr.write("vera-mcp server ready (stdio)\n");
}

main().catch((e) => {
  process.stderr.write(`vera-mcp failed to start: ${e?.stack ?? e}\n`);
  process.exit(1);
});
