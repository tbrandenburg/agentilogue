import { AcpProvider } from "../acp/provider";

export class OpenCodeProvider extends AcpProvider {
  constructor(config: {
    executable?: string;
    cwd: string;
    runPrompt?: ConstructorParameters<typeof AcpProvider>[0]["runPrompt"];
    now?: () => number;
  }) {
    super({
      ...config,
      id: "opencode-acp",
      executable: config.executable ?? "opencode",
      args: ["acp"],
    });
  }
}

export function createOpenCodeProviderFromEnvironment(): OpenCodeProvider | undefined {
  if (process.env.AGENT_API_ENABLED !== "1") return undefined;
  if (process.env.AGENT_TRUSTED_LOCAL !== "1")
    throw new Error("Agent API requires AGENT_TRUSTED_LOCAL=1 and loopback-only access");
  const cwd = process.env.OPENCODE_CWD;
  if (!cwd || !cwd.startsWith("/"))
    throw new Error("OPENCODE_CWD must be an absolute server-owned directory");
  return new OpenCodeProvider({
    cwd,
    ...(process.env.OPENCODE_EXECUTABLE ? { executable: process.env.OPENCODE_EXECUTABLE } : {}),
  });
}
