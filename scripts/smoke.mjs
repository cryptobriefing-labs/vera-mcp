// Temporary smoke test — spawns the built server over stdio and exercises tools.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const key = process.env.VERA_API_KEY;
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, VERA_API_KEY: key ?? "" },
});
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const txt = r.content.map((c) => c.text).join("\n");
  console.log(`\n===== ${name}(${JSON.stringify(args)}) =====`);
  console.log(txt.slice(0, 1400));
}

await call("vera_get_signals", { limit: 3 });
await call("vera_get_signals", { limit: 3, category: "geopolitics", momentum_only: true });

// Grab a news_id + market_id from a plain feed call for the drill-down tools.
const feed = await client.callTool({ name: "vera_get_signals", arguments: { limit: 1 } });
const feedTxt = feed.content.map((c) => c.text).join("\n");
const nid = /news_id:\s*(\S+)/.exec(feedTxt)?.[1];
const mid = /market_id:\s*(\S+)/.exec(feedTxt)?.[1];
if (nid) await call("vera_get_event", { news_id: nid });
if (mid) await call("vera_get_market_signals", { market_id: mid, limit: 3 });

await client.close();
console.log("\nSMOKE OK");
