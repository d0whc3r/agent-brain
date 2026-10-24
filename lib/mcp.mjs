import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";

import { repeatOf } from "./decide.mjs";
import { brainRoot, open } from "./premise.mjs";
import { loadConfig } from "./scope.mjs";

export const premiseTools = [
  {
    name: "premise_list",
    description: "List premises with one status, active by default. An empty repo lists every premise.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        repo: { type: "string", description: "repo name. Empty lists every premise of the status." },
        scope: { type: "string", description: "scope of the repo from brain.config.json. An empty string is a repo in no scope: it gets only premises with scope \"*\" and repos \"*\". Omit to skip the scope filter." },
        status: { type: "string", enum: ["active", "candidate"], description: "candidate waits for repeats and reviews skip it. Default active." },
      },
    },
  },
  {
    name: "premise_get",
    description: "Get one premise by id.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", description: "premise id" },
      },
      required: ["id"],
    },
  },
  {
    name: "premise_add",
    description: "Add a premise. With the local decision model on, repeat_of names a premise of the same scope that may state the same rule.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", description: "premise id. Empty uses a slug of the text." },
        text: { type: "string", description: "one sentence" },
        strength: { type: "string", enum: ["always", "never", "prefer"] },
        scope: { type: "string", description: "scope name from brain.config.json, or \"*\" for a rule that holds in every scope" },
        repos: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, description: "At least one repo name. \"*\" matches every repo." },
        source: { type: "string", description: "relative path of the decision note inside the brain, such as memory/decisions/<file>.md" },
        status: { type: "string", enum: ["active", "candidate"], description: "candidate waits for repeats and reviews skip it. Default active." },
      },
      required: ["text", "strength", "scope", "repos"],
    },
  },
  {
    name: "premise_update",
    description: "Change fields of one premise. An omitted field keeps its value. Use premise_delete to drop a premise.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", description: "premise id" },
        text: { type: "string", description: "one sentence" },
        strength: { type: "string", enum: ["always", "never", "prefer"] },
        scope: { type: "string", description: "scope name from brain.config.json, or \"*\" for a rule that holds in every scope" },
        repos: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, description: "At least one repo name. \"*\" matches every repo." },
        source: { type: "string", description: "relative path of the decision note inside the brain, such as memory/decisions/<file>.md" },
        status: { type: "string", enum: ["active", "candidate"], description: "active promotes a candidate." },
      },
      required: ["id"],
    },
  },
  {
    name: "premise_seen",
    description: "Record one repeat of a premise: the date, the repo, and the origin.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", description: "premise id" },
        repo: { type: "string", minLength: 1, description: "repo where the repeat happened" },
        origin: { type: "string", enum: ["correction", "defect"], description: "correction from the user, or defect found by a review" },
        date: { type: "string", description: "YYYY-MM-DD. Default today." },
      },
      required: ["id", "repo", "origin"],
    },
  },
  {
    name: "premise_delete",
    description: "Drop a premise by id.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", description: "premise id" },
      },
      required: ["id"],
    },
  },
  {
    name: "premise_search",
    description: "Find active and candidate premises whose text contains the query.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "text to find in premise text" },
      },
      required: ["query"],
    },
  },
];

// Freeze the loaded code's identity. Requests reject a checkout changed after startup.
export function mcpVersion() {
  const hash = createHash("sha256");
  for (const name of ["mcp.mjs", "premise.mjs", "scope.mjs", "decide.mjs", "../bin/brain.mjs", "../package.json", "../pnpm-lock.yaml"]) {
    hash.update(name);
    hash.update(readFileSync(new URL(name, import.meta.url)));
  }
  return `0.1.0+${hash.digest("hex").slice(0, 12)}`;
}

export const serverInfo = { name: "brain-premises", version: mcpVersion() };

const schemas = new AjvJsonSchemaValidator();
const validators = new Map(premiseTools.map((tool) => [tool.name, schemas.getValidator(tool.inputSchema)]));

function createPremiseServer() {
  const server = new Server(
    serverInfo,
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: premiseTools }));
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
  if (serverInfo.version !== mcpVersion()) {
    return { isError: true, content: [{ type: "text", text: "Brain code changed after this server started. Reconnect brain-premises to load the current version." }] };
  }
  const name = request.params.name;
  const args = request.params.arguments ?? {};
  const validate = validators.get(name);
  if (!validate) {
    throw new McpError(ErrorCode.InvalidParams, `unknown tool ${name}`);
  }
  const result = validate(args);
  if (!result.valid) {
    throw new McpError(ErrorCode.InvalidParams, `${name}: ${result.errorMessage}`);
  }
  const store = await open(brainRoot());
  switch (name) {
    case "premise_list":
      return textResult(listOut(await store.list(args.repo ?? "", args.scope ?? null, args.status ?? "active")));
    case "premise_get":
      return textResult(oneOut(await store.get(args.id)));
    case "premise_add": {
      const added = await store.add({
        id: args.id ?? "",
        text: args.text ?? "",
        strength: args.strength ?? "",
        scope: args.scope ?? "",
        repos: args.repos,
        source: args.source ?? "",
        status: args.status ?? "active",
      });
      // The repeat hint is optional. A model failure keeps the plain result.
      const repeat = await repeatOf(loadConfig(brainRoot()), store, added).catch(() => null);
      return textResult(repeat ? { ...oneOut(added), repeat_of: repeat } : oneOut(added));
    }
    case "premise_update":
      return textResult(oneOut(await store.update(args.id, {
        text: args.text,
        strength: args.strength,
        scope: args.scope,
        repos: args.repos,
        source: args.source,
        status: args.status,
      })));
    case "premise_seen": {
      const date = args.date || new Date().toISOString().slice(0, 10);
      return textResult(oneOut(await store.see(args.id, `${date} ${args.repo} ${args.origin}`)));
    }
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
    seen: item.seen ?? [],
  };
}
