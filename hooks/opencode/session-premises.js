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

// runPremises feeds the session directory to the shared script. A non-zero exit fails open.
function runPremises(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("session-premises timed out"));
    }, 8000);
    child.stdout.on("data", (chunk) => {
      out += chunk;
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
        reject(new Error(`session-premises exited ${code}`));
      }
    });
    child.stdin.end(JSON.stringify({ cwd }));
  });
}

// loadPremiseText caches one directory until the premise folder changes.
export async function loadPremiseText(cwd, run = runPremises) {
  const marker = join(brainRoot, "memory", "premises");
  const mtime = (await stat(marker).catch(() => null))?.mtimeMs ?? 0;
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
    } catch {
      // Fail open. A premise lookup must not stop the turn.
    }
  });
}

export default {
  id: "brain.session-premises",
  setup(ctx) {
    return attach(ctx, loadPremiseText);
  },
};
