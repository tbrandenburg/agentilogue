import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

export interface AcpCallbacks {
  readonly onUpdate: (update: acp.SessionUpdate) => void;
  readonly onPermission: (
    params: acp.RequestPermissionRequest,
  ) => Promise<acp.RequestPermissionResponse>;
  readonly onSession: (sessionId: string, cancel: () => Promise<void>) => void;
}

export interface AcpPromptConfig {
  readonly cwd: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly authenticate?: boolean;
  readonly processGroup?: boolean;
  readonly providerSessionId?: string;
}

export async function runAcpPrompt(
  config: AcpPromptConfig,
  prompt: string,
  callbacks: AcpCallbacks,
): Promise<acp.StopReason> {
  const child = spawn(config.executable, [...config.args], {
    cwd: config.cwd,
    env: config.env ?? process.env,
    detached: config.processGroup,
    stdio: ["pipe", "pipe", "ignore"],
  });
  const input = child.stdout;
  const output = child.stdin;
  if (!input || !output) {
    child.kill("SIGTERM");
    throw new Error("ACP stdio unavailable");
  }
  let childExited = false;
  const exit = new Promise<void>((resolveExit) => {
    child.once("close", () => {
      childExited = true;
      resolveExit();
    });
    child.once("error", () => resolveExit());
  });
  let acceptUpdates = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  const startup = new Promise<never>((_resolve, reject) => {
    startupTimer = setTimeout(() => reject(new Error("ACP startup timed out")), 120_000);
  });
  const client = acp
    .client({ name: "agentilogue" })
    .onNotification(acp.methods.client.session.update, ({ params }) =>
      acceptUpdates ? callbacks.onUpdate(params.update) : undefined,
    )
    .onRequest(acp.methods.client.session.requestPermission, ({ params }) =>
      callbacks.onPermission(params),
    );

  try {
    const connection = client.connectWith(
      acp.ndJsonStream(
        Writable.toWeb(output) as WritableStream<Uint8Array>,
        Readable.toWeb(input) as ReadableStream<Uint8Array>,
      ),
      async (context) => {
        const initialized = await context.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {},
          clientInfo: { name: "agentilogue", version: "0.1.0" },
        });
        if (initialized.protocolVersion !== acp.PROTOCOL_VERSION)
          throw new Error("Unsupported ACP protocol version");
        if (config.authenticate) {
          if (!initialized.authMethods?.some((method) => method.id === "api-key"))
            throw new Error("ACP API-key authentication unavailable");
          await context.request(acp.methods.agent.authenticate, { methodId: "api-key" });
        }
        if (config.providerSessionId && !initialized.agentCapabilities?.loadSession)
          throw new Error("ACP does not support loading this conversation");
        let sessionId: string;
        if (config.providerSessionId) {
          await context.request(acp.methods.agent.session.load, {
            cwd: config.cwd,
            mcpServers: [],
            sessionId: config.providerSessionId,
          });
          sessionId = config.providerSessionId;
        } else {
          const session = await context.request(acp.methods.agent.session.new, {
            cwd: config.cwd,
            mcpServers: [],
          });
          sessionId = session.sessionId;
        }
        // session/load replays the full history before its response. The browser
        // already owns that transcript; only updates after load belong to this run.
        acceptUpdates = true;
        clearTimeout(startupTimer);
        const cancel = () => context.notify(acp.methods.agent.session.cancel, { sessionId });
        const promptResult = context.request(acp.methods.agent.session.prompt, {
          sessionId,
          prompt: [{ type: "text", text: prompt }],
        });
        callbacks.onSession(sessionId, cancel);
        return (await promptResult).stopReason;
      },
    );
    return await Promise.race([
      connection,
      startup,
      exit.then(() => {
        throw new Error("ACP process exited before prompt completion");
      }),
    ]);
  } finally {
    clearTimeout(startupTimer);
    output.end();
    const wait = () =>
      Promise.race([exit, new Promise<void>((resolveExit) => setTimeout(resolveExit, 1000))]);
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (config.processGroup && child.pid) process.kill(-child.pid, signal);
        else if (!childExited) child.kill(signal);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
      }
    };
    await wait();
    if (!childExited || config.processGroup) kill("SIGTERM");
    await wait();
    if (!childExited || config.processGroup) kill("SIGKILL");
    await wait();
  }
}
