// Configuration read from the environment. The API key is provided by the
// developer running the MCP server (env var), not stored by us — this server
// is meant to be distributed and run by anyone with a Vera key.

export const DEFAULT_BASE_URL = "https://ai-hub.cryptobriefing.com";

export function getApiBase(): string {
  return (process.env.VERA_API_BASE ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function getApiKey(): string | undefined {
  const k = process.env.VERA_API_KEY?.trim();
  return k ? k : undefined;
}
