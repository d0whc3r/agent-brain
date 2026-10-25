// OpenCode has no SessionStart event. This plugin adds the same text before each model call.
// realpath keeps the brain root correct when install links this file into the plugin folder.
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const here = dirname(realpathSync(import.meta.filename));
const brainRoot = join(here, "..", "..");
const script = join(brainRoot, "bin", "session-premises.mjs");
const cache = new Map();

// runPremises feeds the session directory to the shared script. A non-zero exit rejects with
// the stderr of the script.
function runPremises(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("session-premises timed out"));
    }, 8000);
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(out);
      } else {
        reject(new Error(`session-premises exited ${code}: ${stderr.trim()}`));
      }
    });
    child.stdin.end(JSON.stringify({ cwd }));
  });
}

// markerTime returns the mtime of path, or 0 when path does not exist. Any other error throws.
export async function markerTime(path) {
  try {
    return (await stat(path)).mtimeMs;
  } catch (err) {
    if (err.code === "ENOENT") {
      return 0;
    }
    throw err;
  }
}

// loadPremiseText caches one directory until the premise folder changes.
export async function loadPremiseText(cwd, run = runPremises) {
  const mtime = await markerTime(join(brainRoot, "memory", "premises"));
  const hit = cache.get(cwd);
  if (hit && hit.mtime === mtime) {
    return hit.text;
  }
  const text = await run(cwd);
  cache.set(cwd, { mtime, text });
  return text;
}

// attach registers the context hook. A failure leaves the model call alone.
export async function attach(ctx, load = loadPremiseText) {
  await ctx.session.hook("context", async (event) => {
    try {
      const session = await ctx.session.get({ sessionID: event.sessionID });
      const cwd = session?.location?.directory;
      if (!cwd) {
        return;
      }
      const text = await load(cwd);
      if (!text) {
        return;
      }
      if (!Array.isArray(event.system)) {
        event.system = [];
      }
      event.system.push({ type: "text", text });
    } catch (err) {
      // Fail open. A premise lookup must not stop the turn.
      console.error("brain session-premises:", err);
    }
  });
}

export default {
  id: "brain.session-premises",
  setup(ctx) {
    return attach(ctx, loadPremiseText);
  },
};
