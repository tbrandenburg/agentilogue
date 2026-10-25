import { accessSync, constants, statSync } from "node:fs";
import { isAbsolute } from "node:path";

/** Explicit server-owned API-key mode only; never starts an interactive login. */
export function getCodexConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.CODEX_ACP_ENABLED !== "1") return undefined;
  if (env.AGENT_TRUSTED_LOCAL !== "1") return undefined;
  const cwd = env.CODEX_ACP_CWD;
  const executable = env.CODEX_ACP_EXECUTABLE;
  if (!cwd || !isAbsolute(cwd) || !executable || !isAbsolute(executable)) return undefined;
  if (!env.CODEX_API_KEY && !env.OPENAI_API_KEY) return undefined;
  try {
    if (!statSync(cwd).isDirectory() || !statSync(executable).isFile()) return undefined;
    accessSync(executable, constants.X_OK);
    return { cwd, executable };
  } catch {
    return undefined;
  }
}

/** Build the small environment required by the pinned Codex ACP runtime. */
export function getCodexChildEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = { NODE_ENV: env.NODE_ENV };
  const inheritedNames = [
    "PATH",
    "HOME",
    "USERPROFILE",
    "CODEX_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "XDG_STATE_HOME",
    "XDG_RUNTIME_DIR",
    "CODEX_PATH",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SYSTEMROOT",
    "WINDIR",
    "APPDATA",
    "LOCALAPPDATA",
  ];
  for (const name of inheritedNames) {
    const value = env[name];
    if (value !== undefined) childEnv[name] = value;
  }
  const apiKey = env.CODEX_API_KEY || env.OPENAI_API_KEY;
  if (apiKey) childEnv.CODEX_API_KEY = apiKey;
  return {
    ...childEnv,
    NO_BROWSER: "1",
    INITIAL_AGENT_MODE: "read-only",
    DEFAULT_AUTH_REQUEST: undefined,
    APP_SERVER_LOGS: undefined,
  };
}
