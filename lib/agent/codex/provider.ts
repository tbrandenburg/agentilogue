import { AcpProvider } from "../acp/provider";
import { getCodexChildEnvironment, getCodexConfig } from "./config";

export function createCodexProviderFromEnvironment(): AcpProvider | undefined {
  const config = getCodexConfig();
  if (!config) return undefined;
  return new AcpProvider({
    ...config,
    id: "codex-acp",
    args: [],
    authenticate: true,
    processGroup: true,
    env: getCodexChildEnvironment(),
  });
}
