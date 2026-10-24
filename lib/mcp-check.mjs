import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { premiseTools, serverInfo } from "./mcp.mjs";
import { brainRoot, open } from "./premise.mjs";

// Check the wire contract and shared store without writing a premise.
export async function checkMCP(options = {}) {
  const client = new Client({ name: "brain-check", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../bin/brain.mjs", import.meta.url)), "mcp"],
    env: { ...process.env, BRAIN_ROOT: brainRoot() },
    stderr: "pipe",
    ...options,
  });
  const timeout = { timeout: 5000 };
  try {
    await client.connect(transport, timeout);
    const info = client.getServerVersion();
    if (!isDeepStrictEqual(info, serverInfo)) {
      throw new Error(
        `MCP version drift: expected ${serverInfo.version}, got ${info?.version}. Reconnect brain-premises.`,
      );
    }
    const { tools } = await client.listTools({}, timeout);
    if (!isDeepStrictEqual(tools, premiseTools)) {
      throw new Error("MCP tool contract drift. Reconnect brain-premises.");
    }
    const result = await client.callTool({ name: "premise_list", arguments: { scope: "" } }, undefined, timeout);
    if (result.isError) {
      throw new Error(result.content[0].text);
    }
    const root = options.env?.BRAIN_ROOT ?? brainRoot();
    const store = await open(root);
    const expected = await store.list("", "");
    const actual = JSON.parse(result.content[0].text);
    if (!isDeepStrictEqual(actual, expected)) {
      throw new Error("MCP premise store differs from the CLI store.");
    }
    return { version: info.version, tools: tools.map((tool) => tool.name) };
  } finally {
    await client.close();
  }
}
