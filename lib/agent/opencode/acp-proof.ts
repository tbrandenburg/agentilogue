import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

export type AcpProofEvent =
  | {
      readonly type: "initialized";
      readonly protocolVersion: number;
      readonly capabilities?: acp.AgentCapabilities;
    }
  | { readonly type: "session"; readonly sessionId: string; readonly options: readonly string[] }
  | {
      readonly type: "update";
      readonly sessionUpdate: string;
      readonly messageId?: string;
      readonly toolCallId?: string;
      readonly status?: string;
      readonly text?: string;
    }
  | {
      readonly type: "permission";
      readonly toolCallId: string;
      readonly offeredOptionIds: readonly string[];
    }
  | { readonly type: "prompt-result"; readonly stopReason: string }
  | {
      readonly type: "process-exit";
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
    }
  | { readonly type: "observer-detached" }
  | { readonly type: "error"; readonly code: number; readonly message: string };

export type AcpSessionOperation =
  | { readonly kind: "new" }
  | { readonly kind: "load"; readonly sessionId: string }
  | { readonly kind: "resume"; readonly sessionId: string };

export interface OpenCodeAcpProofOptions {
  readonly cwd: string;
  readonly prompts: readonly string[];
  readonly sessionOperation?: AcpSessionOperation;
  readonly executable?: string;
  readonly permissionOptionId?: string;
  readonly cancelAfterFirstUpdate?: boolean;
  readonly cancelWhenPermissionPending?: boolean;
  readonly permissionCancelOrder?: "cancel-then-settle" | "settle-then-cancel";
  readonly detachObserverAfterFirstMessage?: boolean;
  readonly terminateAfterFirstMessage?: boolean;
  readonly signal?: AbortSignal;
  readonly onEvent: (event: AcpProofEvent) => void;
}

export function toAcpProofUpdate(
  update: acp.SessionUpdate,
): Extract<AcpProofEvent, { type: "update" }> {
  const content = "content" in update ? update.content : undefined;
  const text =
    content && !Array.isArray(content) && "type" in content && content.type === "text"
      ? content.text
      : undefined;
  return {
    type: "update",
    sessionUpdate: update.sessionUpdate,
    ...("messageId" in update && update.messageId ? { messageId: update.messageId } : {}),
    ...("toolCallId" in update ? { toolCallId: update.toolCallId } : {}),
    ...("status" in update && update.status ? { status: update.status } : {}),
    ...(text === undefined ? {} : { text }),
  };
}

function resolveProofPath(cwd: string, path: string): string {
  const rootRelative = cwd.slice(1);
  const target = isAbsolute(path)
    ? resolve(path)
    : path === rootRelative || path.startsWith(`${rootRelative}/`)
      ? resolve("/", path)
      : resolve(cwd, path);
  const fromRoot = relative(resolve(cwd), target);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error("ACP file path is outside the proof project");
  }
  return target;
}

/** Runs one ACP v1 session against an explicitly selected OpenCode executable. */
export async function runOpenCodeAcpProof(options: OpenCodeAcpProofOptions): Promise<void> {
  if (!options.cwd.startsWith("/")) throw new Error("ACP cwd must be absolute");
  const child = spawn(options.executable ?? "opencode", ["acp"], {
    cwd: options.cwd,
    stdio: ["pipe", "pipe", "inherit"],
  });
  const input = child.stdout;
  const output = child.stdin;
  if (!input || !output) throw new Error("Failed to open OpenCode ACP stdio");
  const childExit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveExit) => {
      child.once("close", (code, signal) => {
        const exit = { code, signal };
        options.onEvent({ type: "process-exit", ...exit });
        resolveExit(exit);
      });
    },
  );

  let liveSessionId: string | undefined;
  let cancelActiveTurn: (() => Promise<void>) | undefined;
  let cancelRequested = false;
  let promptActive = false;
  let observerAttached = true;
  let firstAgentMessageSeen = false;
  const client = acp
    .client({ name: "agentilogue-acp-proof" })
    .onRequest(acp.methods.client.fs.readTextFile, async ({ params }) => {
      const contents = await readFile(resolveProofPath(options.cwd, params.path), "utf8");
      const lines = contents.split("\n");
      const start = Math.max(0, (params.line ?? 1) - 1);
      const end = params.limit == null ? undefined : start + params.limit;
      return { content: lines.slice(start, end).join("\n") };
    })
    .onRequest(acp.methods.client.fs.writeTextFile, async ({ params }) => {
      await writeFile(resolveProofPath(options.cwd, params.path), params.content, "utf8");
      return {};
    })
    .onNotification(acp.methods.client.session.update, ({ params }) => {
      const update = toAcpProofUpdate(params.update);
      if (observerAttached) options.onEvent(update);
      if (update.sessionUpdate === "agent_message_chunk" && !firstAgentMessageSeen) {
        firstAgentMessageSeen = true;
        if (options.detachObserverAfterFirstMessage) {
          observerAttached = false;
          options.onEvent({ type: "observer-detached" });
        }
        if (options.terminateAfterFirstMessage) child.kill("SIGTERM");
      }
      if (
        options.cancelAfterFirstUpdate &&
        promptActive &&
        !cancelRequested &&
        update.sessionUpdate === "agent_message_chunk"
      ) {
        cancelRequested = true;
        setTimeout(() => void cancelActiveTurn?.(), 250);
      }
    })
    .onRequest(acp.methods.client.session.requestPermission, async ({ params }) => {
      const offeredOptionIds = params.options.map((option) => option.optionId);
      options.onEvent({
        type: "permission",
        toolCallId: params.toolCall.toolCallId,
        offeredOptionIds,
      });
      if (options.cancelWhenPermissionPending) {
        if (options.permissionCancelOrder === "settle-then-cancel") {
          setImmediate(() => void cancelActiveTurn?.());
        } else {
          await cancelActiveTurn?.();
        }
        return { outcome: { outcome: "cancelled" as const } };
      }
      const selected = options.permissionOptionId;
      if (selected && offeredOptionIds.includes(selected)) {
        return { outcome: { outcome: "selected" as const, optionId: selected } };
      }
      return { outcome: { outcome: "cancelled" as const } };
    });

  try {
    await client.connectWith(
      acp.ndJsonStream(
        Writable.toWeb(output) as WritableStream<Uint8Array>,
        Readable.toWeb(input) as ReadableStream<Uint8Array>,
      ),
      async (context) => {
        const initialized = await context.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
          clientInfo: { name: "agentilogue-acp-proof", version: "0.1.0" },
        });
        options.onEvent({
          type: "initialized",
          protocolVersion: initialized.protocolVersion,
          capabilities: initialized.agentCapabilities,
        });

        const operation = options.sessionOperation ?? { kind: "new" as const };
        if (operation.kind === "load" && !initialized.agentCapabilities?.loadSession) {
          throw new Error("OpenCode ACP did not advertise session/load support");
        }
        if (
          operation.kind === "resume" &&
          !initialized.agentCapabilities?.sessionCapabilities?.resume
        ) {
          throw new Error("OpenCode ACP did not advertise session/resume support");
        }
        let configOptions: readonly string[] = [];
        if (operation.kind === "new") {
          const session = await context.request(acp.methods.agent.session.new, {
            cwd: options.cwd,
            mcpServers: [],
          });
          liveSessionId = session.sessionId;
          configOptions = (session.configOptions ?? []).map((option) => option.id);
        } else if (operation.kind === "load") {
          const session = await context.request(acp.methods.agent.session.load, {
            cwd: options.cwd,
            mcpServers: [],
            sessionId: operation.sessionId,
          });
          liveSessionId = operation.sessionId;
          configOptions = (session.configOptions ?? []).map((option) => option.id);
        } else {
          const session = await context.request(acp.methods.agent.session.resume, {
            cwd: options.cwd,
            mcpServers: [],
            sessionId: operation.sessionId,
          });
          liveSessionId = operation.sessionId;
          configOptions = (session.configOptions ?? []).map((option) => option.id);
        }
        if (!liveSessionId) throw new Error("OpenCode ACP session did not provide an ID");
        const sessionId = liveSessionId;
        options.onEvent({
          type: "session",
          sessionId,
          options: configOptions,
        });

        cancelActiveTurn = () => {
          if (!liveSessionId) return Promise.resolve();
          return context.notify(acp.methods.agent.session.cancel, { sessionId: liveSessionId });
        };
        const abort = () => {
          if (liveSessionId)
            void context.notify(acp.methods.agent.session.cancel, { sessionId: liveSessionId });
        };
        options.signal?.addEventListener("abort", abort, { once: true });
        try {
          for (const prompt of options.prompts) {
            promptActive = true;
            const result = await context.request(acp.methods.agent.session.prompt, {
              sessionId,
              prompt: [{ type: "text", text: prompt }],
            });
            promptActive = false;
            options.onEvent({ type: "prompt-result", stopReason: result.stopReason });
            if (result.stopReason === "cancelled") break;
          }
        } catch (error) {
          if (error instanceof acp.RequestError) {
            options.onEvent({ type: "error", code: error.code, message: error.message });
            throw error;
          }
          throw error;
        } finally {
          options.signal?.removeEventListener("abort", abort);
        }
      },
    );
  } finally {
    output.end();
    const gracefulExit = await Promise.race([
      childExit.then(() => true),
      new Promise<false>((resolveWait) => setTimeout(() => resolveWait(false), 2_000)),
    ]);
    if (!gracefulExit) {
      child.kill("SIGTERM");
      await childExit;
    }
  }
}
