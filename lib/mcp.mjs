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

const idField = { type: "string", description: "premise id" };
const statusNote = "candidate waits for repeats and reviews skip it. Default active.";
const repoField = { type: "string", description: "repo name. Empty lists every premise of the status." };
const scopeField = {
  type: "string",
  description:
    'scope of the repo from brain.config.json. An empty string is a repo in no scope: it gets only premises with scope "*" and repos "*". Omit to skip the scope filter.',
};
const serverInstructions = `Premises are user rules stored as Markdown, shared by the CLI and Obsidian.
Run brain scope in the working repo, then call premise_list with that repo and scope.
Apply every active always and never premise; quote each one you apply. Search results are incomplete and cannot replace premise_list.
Before you report a finding from a premise, call premise_get and read its body: the reason and the exceptions.
Strength interprets the text: always requires it; never forbids the action described by the text; prefer is a default.
A candidate is not an applicable rule. Search includes candidates to detect repeats; use premise_seen to record an observed repeat.
An explicit lasting instruction can become active. Other corrections start as candidates. Do not store ephemeral session facts as premises.
Use premise_add, premise_update, and premise_delete for changes, including changes requested through Obsidian. Deletion archives the note.
The source field links the decision evidence; it is not another rule. Read it when the rule needs context.
Search matches literal text or an id, not semantic similarity or translation. Use short terms in the stored language.
Obsidian and general memory search are browsing tools, not authorities for premise status or scope.`;
// The fields that premise_add sets and premise_update changes.
const premiseFields = {
  text: { type: "string", description: "one sentence" },
  strength: {
    type: "string",
    enum: ["always", "never", "prefer"],
    description: "always requires the text; never forbids the action in the text; prefer is a default",
  },
  scope: {
    type: "string",
    description: 'scope name from brain.config.json, or "*" for a rule that holds in every scope',
  },
  repos: {
    type: "array",
    minItems: 1,
    items: { type: "string", minLength: 1 },
    description: 'At least one repo name. "*" matches every repo.',
  },
  source: {
    type: "string",
    description: "relative path of the decision note inside the brain, such as memory/decisions/<file>.md",
  },
};

function idOnly(name, description, readOnlyHint = false) {
  return {
    name,
    description,
    annotations: { readOnlyHint, destructiveHint: !readOnlyHint, openWorldHint: false },
    inputSchema: { type: "object", additionalProperties: false, properties: { id: idField }, required: ["id"] },
  };
}

export const premiseTools = [
  {
    name: "premise_list",
    description:
      "Load the complete active rule set for the repo and scope before work or review. Includes matching global rules. Candidates are opt-in and do not apply.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        repo: repoField,
        scope: scopeField,
        status: { type: "string", enum: ["active", "candidate"], description: statusNote },
      },
    },
  },
  idOnly(
    "premise_get",
    "Read one rule by id, with its strength, status, scope, decision source, and body: the reason and the exceptions. Read the body before you report a finding from the rule.",
    true,
  ),
  {
    name: "premise_add",
    description:
      "Save a lasting user rule. Explicit instructions may be active; other corrections start as candidate. Search first for repeats. repeat_of is only a local model hint; repeat_error is the reason the local model gave no hint.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", description: "premise id. Empty uses a slug of the text." },
        ...premiseFields,
        status: { type: "string", enum: ["active", "candidate"], description: statusNote },
      },
      required: ["text", "strength", "scope", "repos"],
    },
  },
  {
    name: "premise_update",
    description:
      "Change fields of one premise. An omitted field keeps its value. Use premise_delete to drop a premise.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: idField,
        ...premiseFields,
        status: { type: "string", enum: ["active", "candidate"], description: "active promotes a candidate." },
      },
      required: ["id"],
    },
  },
  {
    name: "premise_seen",
    description: "Record one repeat of a premise: the date, the repo, and the origin.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: idField,
        repo: { type: "string", minLength: 1, description: "repo where the repeat happened" },
        origin: {
          type: "string",
          enum: ["correction", "defect"],
          description: "correction from the user, or defect found by a review",
        },
        date: { type: "string", description: "YYYY-MM-DD. Default today." },
      },
      required: ["id", "repo", "origin"],
    },
  },
  idOnly("premise_delete", "Archive a premise by id in memory/dropped; it stops applying and disappears from search."),
  {
    name: "premise_search",
    description:
      "Find active and candidate rules by literal text or id. Optional repo, scope, and status filters match premise_list. Use for discovery or repeats; use premise_list for all applicable rules.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "case-insensitive substring in rule text or id; no semantic search" },
        repo: repoField,
        scope: scopeField,
        status: {
          type: "string",
          enum: ["active", "candidate"],
          description: "Omit to search both active and candidate.",
        },
      },
      required: ["query"],
    },
  },
];

// Freeze the loaded code's identity. Requests reject a checkout changed after startup.
export function mcpVersion() {
  const hash = createHash("sha256");
  for (const name of [
    "mcp.mjs",
    "premise.mjs",
    "scope.mjs",
    "decide.mjs",
    "io.mjs",
    "../bin/brain.mjs",
    "../package.json",
    "../pnpm-lock.yaml",
  ]) {
    hash.update(name);
    hash.update(readFileSync(new URL(name, import.meta.url)));
  }
  return `0.1.0+${hash.digest("hex").slice(0, 12)}`;
}

export const serverInfo = { name: "brain-premises", version: mcpVersion() };

const schemas = new AjvJsonSchemaValidator();
const validators = new Map(premiseTools.map((tool) => [tool.name, schemas.getValidator(tool.inputSchema)]));

function createPremiseServer() {
  // oxlint-disable-next-line typescript/no-deprecated -- McpServer takes Zod shapes; the tools publish an exact JSON Schema contract.
  const server = new Server(serverInfo, { capabilities: { tools: {} }, instructions: serverInstructions });
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
    const done = () => {
      resolve();
    };
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
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const result = await client.callTool({ name, arguments: args });
    const block = result.content?.[0];
    const text = block && block.type === "text" ? block.text : "";
    return { isError: result.isError === true, text };
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

// Each tool handler takes the store and the checked arguments, and returns the value of the result.
const handlers = {
  premise_list: async (store, args) =>
    (await store.list(args.repo ?? "", args.scope ?? null, args.status ?? "active")).map((item) => oneOut(item)),
  premise_get: async (store, args) => {
    const item = await store.get(args.id);
    return { ...oneOut(item), body: item.body };
  },
  premise_add: async (store, args) => {
    const added = await store.add(args);
    // The repeat hint is optional. A model failure goes in repeat_error, and the premise stays added.
    try {
      const repeat = await repeatOf(loadConfig(brainRoot()), store, added);
      return repeat ? { ...oneOut(added), repeat_of: repeat } : oneOut(added);
    } catch (err) {
      return { ...oneOut(added), repeat_error: err.message };
    }
  },
  // update changes only the fields that args sets. The schema allows no seen field.
  premise_update: async (store, args) => oneOut(await store.update(args.id, args)),
  premise_seen: async (store, args) => {
    const date = args.date || new Date().toISOString().slice(0, 10);
    return oneOut(await store.see(args.id, `${date} ${args.repo} ${args.origin}`));
  },
  premise_delete: async (store, args) => {
    const item = await store.get(args.id);
    await store.delete(args.id);
    item.status = "dropped";
    return oneOut(item);
  },
  premise_search: async (store, args) =>
    (await store.search(args.query, { repo: args.repo, scope: args.scope, status: args.status })).map((item) =>
      oneOut(item),
    ),
};

async function handleCall(request) {
  if (serverInfo.version !== mcpVersion()) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "Brain code changed after this server started. Reconnect brain-premises to load the current version.",
        },
      ],
    };
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
  return textResult(await handlers[name](await open(brainRoot()), args));
}

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
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
