import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

export interface OpenCodeAcpCallbacks {
  readonly onUpdate: (update: acp.SessionUpdate) => void;
  readonly onPermission: (
    params: acp.RequestPermissionRequest,
  ) => Promise<acp.RequestPermissionResponse>;
  readonly onSession: (sessionId: string, cancel: () => Promise<void>) => void;
}

export async function runOpenCodeAcpPrompt(
  config: {
    readonly cwd: string;
    readonly executable: string;
    readonly providerSessionId?: string;
  },
  prompt: string,
  callbacks: OpenCodeAcpCallbacks,
): Promise<acp.StopReason> {
  const child = spawn(config.executable, ["acp"], {
    cwd: config.cwd,
    env: process.env,
    stdio: ["pipe", "pipe", "ignore"],
  });
  const input = child.stdout;
  const output = child.stdin;
  if (!input || !output) {
    child.kill("SIGTERM");
    throw new Error("OpenCode ACP stdio unavailable");
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
        if (config.providerSessionId && !initialized.agentCapabilities?.loadSession)
          throw new Error("OpenCode ACP does not support loading this conversation");
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
      exit.then(() => {
        throw new Error("OpenCode ACP process exited before prompt completion");
      }),
    ]);
  } finally {
    output.end();
    await Promise.race([exit, new Promise<void>((resolveExit) => setTimeout(resolveExit, 1000))]);
    if (!childExited) {
      child.kill("SIGTERM");
      await exit;
    }
  }
}
