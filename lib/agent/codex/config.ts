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
