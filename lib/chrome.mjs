import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { readTextSync, UsageError } from "./io.mjs";
import { brainHome } from "./premise.mjs";
import { loadConfig, resolveRepo } from "./scope.mjs";

// The chrome-devtools MCP server lives in the brain home, so the user owns its flags. ${SCOPE}
// gives each scope its own Chrome profile and screenshots folder: the logins of one scope never
// reach another.
const configPath = join("mcp", "chrome-devtools.json");
// A folder in no scope fills ${SCOPE} with this name.
const noScope = "default";

// chromeServer reads the config in home and fills ${HOME}, ${BRAIN_HOME}, and ${SCOPE}.
export function chromeServer(home, scope, user = homedir()) {
  const path = join(home, configPath);
  const text = readTextSync(path, null);
  if (text === null) {
    throw Object.assign(new Error(`no ${path}: run scripts/install.sh to add it`), { code: "ENOENT" });
  }
  const filled = text
    .replaceAll("${HOME}", user)
    .replaceAll("${BRAIN_HOME}", home)
    .replaceAll("${SCOPE}", scope || noScope);
  return JSON.parse(filled);
}

// cmdChromeMCP serves the chrome-devtools MCP server of the brain home on stdio, with the Chrome
// profile and the screenshots folder of the scope of the current folder.
export function cmdChromeMCP(args) {
  if (args.length > 0) {
    throw new UsageError();
  }
  const home = brainHome();
  const { scope } = resolveRepo(process.cwd(), loadConfig(home));
  return serveChrome(chromeServer(home, scope));
}

// serveChrome runs server on the stdio of this process, passes a stop signal on to it, and
// resolves with its exit code.
function serveChrome(server) {
  const child = spawn(server.command, server.args ?? [], { stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}
