import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const missingCodes = new Set(["ENOENT", "ENOTDIR"]);
// A diff of a large change, or a status with many untracked files, exceeds the default 1 MiB.
const maxBuffer = 64 * 1024 * 1024;

// ifMissing returns fallback when promise rejects because the path does not exist.
// Any other error, such as a denied permission, still throws.
export async function ifMissing(promise, fallback) {
  try {
    return await promise;
  } catch (err) {
    if (missingCodes.has(err.code)) {
      return fallback;
    }
    throw err;
  }
}

// readTextSync returns the text of path, or fallback when the file does not exist.
export function readTextSync(path, fallback) {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    if (missingCodes.has(err.code)) {
      return fallback;
    }
    throw err;
  }
}

// gitOrThrow runs git in cwd and returns stdout. A failure throws an error with code GIT and
// the stderr of git. A timeoutMs of 0 waits until git ends, as a commit with hooks needs.
export function gitOrThrow(cwd, args, timeoutMs = 0) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      maxBuffer,
    });
  } catch (err) {
    const message = String(err.stderr ?? "").trim() || `git ${args[0]} failed: ${err.message}`;
    throw Object.assign(new Error(message), { code: "GIT" });
  }
}

// git returns the stdout of git with trailing whitespace cut, or null when git fails or times
// out. Output split by NUL (-z) keeps the whitespace at the end of each path.
export function git(cwd, args, timeoutMs = 5000) {
  try {
    return gitOrThrow(cwd, args, timeoutMs).trimEnd();
  } catch {
    return null;
  }
}

// UsageError is a bad command line. The command prints its message, or the usage when the
// message is empty, and exits 1.
export class UsageError extends Error {}

// flags parses args with the flags of spec, which maps a name to "string", "list", or "boolean".
// A flag value comes from --name=value or from the next argument, and may be empty.
// A list flag defaults to [], and a boolean flag to false. -h and --help throw UsageError,
// as do an unknown flag and a string flag at the end with no value.
export function flags(args, spec) {
  const options = parseOptions(spec);
  const { values, positionals, tokens } = parseArgs({
    args,
    options,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  checkTokens(tokens, options);
  if (values.help) {
    throw new UsageError();
  }
  return { ...values, pos: positionals };
}

// parseOptions turns spec into the options of parseArgs, with -h and --help added.
function parseOptions(spec) {
  const options = { help: { type: "boolean", short: "h" } };
  for (const [name, kind] of Object.entries(spec)) {
    options[name] =
      kind === "boolean"
        ? { type: "boolean", default: false }
        : { type: "string", ...(kind === "list" && { multiple: true, default: [] }) };
  }
  return options;
}

// checkTokens throws UsageError for an unknown flag and for a string flag with no value.
function checkTokens(tokens, options) {
  for (const token of tokens.filter((t) => t.kind === "option")) {
    if (!Object.hasOwn(options, token.name)) {
      throw new UsageError(`unknown flag ${token.rawName}`);
    }
    if (options[token.name].type === "string" && token.value === undefined) {
      throw new UsageError(`flag ${token.rawName} needs a value`);
    }
  }
}
