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
        strength: { type: "string", description: "always, never, or prefer" },
        repos: { type: "array", items: { type: "string" }, description: "repo names" },
        status: { type: "string", description: "active or dropped" },
        source: { type: "string", description: "source path" },
      },
      required: ["text", "strength"],
    },
  },
  {
    name: "premise_update",
    description: "Replace one premise.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "premise id" },
        text: { type: "string", description: "one sentence" },
        strength: { type: "string", description: "always, never, or prefer" },
        repos: { type: "array", items: { type: "string" }, description: "repo names" },
        status: { type: "string", description: "active or dropped" },
        source: { type: "string", description: "source path" },
      },
      required: ["id", "text", "strength"],
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
      return textResult(listOut(await store.list(args.repo ?? "")));
    case "premise_get":
      return textResult(oneOut(await store.get(args.id)));
    case "premise_add":
      return textResult(oneOut(await store.add({
        id: args.id ?? "",
        text: args.text ?? "",
        strength: args.strength ?? "",
        repos: args.repos,
        status: args.status ?? "",
        source: args.source ?? "",
      })));
    case "premise_update":
      return textResult(oneOut(await store.update(args.id, {
        text: args.text ?? "",
        strength: args.strength ?? "",
        repos: args.repos,
        status: args.status ?? "",
        source: args.source ?? "",
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
    repos: item.repos ?? [],
    status: item.status,
    source: item.source ?? "",
  };
}
