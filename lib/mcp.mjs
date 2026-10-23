import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { brainRoot, open } from "./premise.mjs";

const tools = [
  {
    name: "premise_list",
    description: "List active premises. An empty repo lists every premise.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "repo name. Empty lists every active premise." },
        scope: { type: "string", description: "scope of the repo from brain.config.json. An empty string is a repo in no scope: it gets only premises with scope \"*\" and repos \"*\". Omit to skip the scope filter." },
      },
    },
  },
  {
    name: "premise_get",
    description: "Get one premise by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "premise id" },
      },
      required: ["id"],
    },
  },
  {
    name: "premise_add",
    description: "Add a premise.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "premise id. Empty uses a slug of the text." },
        text: { type: "string", description: "one sentence" },
        strength: { type: "string", enum: ["always", "never", "prefer"] },
        scope: { type: "string", description: "scope name from brain.config.json, or \"*\" for a rule that holds in every scope" },
        repos: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, description: "At least one repo name. \"*\" matches every repo." },
        source: { type: "string", description: "source path" },
      },
      required: ["text", "strength", "scope", "repos"],
    },
  },
  {
    name: "premise_update",
    description: "Change fields of one premise. An omitted field keeps its value. Use premise_delete to drop a premise.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "premise id" },
        text: { type: "string", description: "one sentence" },
        strength: { type: "string", enum: ["always", "never", "prefer"] },
        scope: { type: "string", description: "scope name from brain.config.json, or \"*\" for a rule that holds in every scope" },
        repos: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, description: "At least one repo name. \"*\" matches every repo." },
        source: { type: "string", description: "source path" },
      },
      required: ["id"],
    },
  },
  {
    name: "premise_delete",
    description: "Drop a premise by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "premise id" },
      },
      required: ["id"],
    },
  },
  {
    name: "premise_search",
    description: "Find premises whose text contains the query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "text to find in premise text" },
      },
      required: ["query"],
    },
  },
];

function createPremiseServer() {
  const server = new Server(
    { name: "brain-premises", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, handleCall);
  return server;
}

export async function serveMCP() {
  const server = createPremiseServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // connect returns after stdin starts. Stay up until the client closes it.
  await new Promise((resolve) => {
    const done = () => resolve();
    process.stdin.on("end", done);
    process.stdin.on("close", done);
    process.stdin.on("error", done);
  });
  await server.close();
}

export async function callPremiseTool(name, args) {
  const server = createPremiseServer();
  const client = new Client({ name: "test", version: "v0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  try {
    const result = await client.callTool({ name, arguments: args });
    const block = result.content?.[0];
    const text = block && block.type === "text" ? block.text : "";
    return { isError: result.isError === true, text };
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

async function handleCall(request) {
  const name = request.params.name;
  const args = request.params.arguments ?? {};
  const store = await open(brainRoot());
  switch (name) {
    case "premise_list":
      return textResult(listOut(await store.list(args.repo ?? "", args.scope ?? null)));
    case "premise_get":
      return textResult(oneOut(await store.get(args.id)));
    case "premise_add":
      return textResult(oneOut(await store.add({
        id: args.id ?? "",
        text: args.text ?? "",
        strength: args.strength ?? "",
        scope: args.scope ?? "",
        repos: args.repos,
        source: args.source ?? "",
      })));
    case "premise_update":
      return textResult(oneOut(await store.update(args.id, {
        text: args.text,
        strength: args.strength,
        scope: args.scope,
        repos: args.repos,
        source: args.source,
      })));
    case "premise_delete": {
      const item = await store.get(args.id);
      await store.delete(args.id);
      item.status = "dropped";
      return textResult(oneOut(item));
    }
    case "premise_search":
      return textResult(listOut(await store.search(args.query ?? "")));
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

function textResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
  };
}

function listOut(items) {
  return items.map(oneOut);
}

function oneOut(item) {
  return {
    id: item.id,
    text: item.text,
    strength: item.strength,
    scope: item.scope ?? "",
    repos: item.repos ?? [],
    status: item.status,
    source: item.source ?? "",
  };
}
