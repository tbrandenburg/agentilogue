import { AcpProvider } from "../acp/provider";
import { getCodexConfig } from "./config";

export function createCodexProviderFromEnvironment(): AcpProvider | undefined {
  const config = getCodexConfig();
  if (!config) return undefined;
  return new AcpProvider({
    ...config,
    id: "codex-acp",
    args: [],
    authenticate: true,
    processGroup: true,
    env: {
      ...process.env,
      NO_BROWSER: "1",
      INITIAL_AGENT_MODE: "read-only",
      DEFAULT_AUTH_REQUEST: undefined,
      APP_SERVER_LOGS: undefined,
    },
  });
}
