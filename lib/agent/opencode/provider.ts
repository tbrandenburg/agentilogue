import * as acp from "@agentclientprotocol/sdk";
import { runOpenCodeAcpPrompt } from "./acp-client";
import type { OpenCodeAcpCallbacks } from "./acp-client";
import { projectOpenCodeUpdate } from "./update-projection";
import {
  AgentRunEventSchema,
  AgentInputSchema,
  type PermissionRequest,
  PermissionRequestSchema,
  RunObservationSchema,
  RunSnapshotSchema,
  type AgentRunEvent,
  type RunMessage,
  type RunObservation,
  type RunPart,
  type RunOutcome,
  type RunSnapshot,
  type RunTool,
} from "../contracts/run";
import type { AgentProvider, StartRunRequest } from "../contracts/provider";
import {
  PermissionIdSchema,
  RunIdSchema,
  type ConversationId,
  type ProviderSessionId,
  type RunId,
} from "../contracts/identifiers";

interface PendingPermission {
  readonly id: string;
  readonly request: PermissionRequest;
  readonly resolve: (selected: string | undefined) => void;
}

type AcpStopReason = acp.StopReason;
type PromptRunner = (
  config: {
    readonly cwd: string;
    readonly executable: string;
    readonly providerSessionId?: string;
  },
  prompt: string,
  callbacks: OpenCodeAcpCallbacks,
) => Promise<acp.StopReason>;

interface Observer {
  readonly queue: RunObservation[];
  wake?: () => void;
  overflowed: boolean;
}

interface Run {
  readonly request: StartRunRequest;
  readonly cwd: string;
  readonly observers: Set<Observer>;
  readonly messages: Map<string, RunMessage>;
  readonly tools: Map<string, RunTool>;
  readonly parts: RunPart[];
  readonly permissions: Map<string, PendingPermission>;
  readonly fallbackMessageId: string;
  snapshot: RunSnapshot;
  sessionId?: string;
  promptActive: boolean;
  cancelSent: boolean;
  cancellationAccepted: boolean;
  cancel?: () => Promise<void>;
  cancelPromise?: Promise<void>;
  cancelFailure?: unknown;
  terminalOutcome?: RunOutcome;
  endedAt?: number;
}

const COMPLETED_RUN_RETENTION_MS = 30 * 60 * 1000;

function errorMessage(error: unknown): string {
  return error instanceof acp.RequestError
    ? "OpenCode ACP request failed"
    : "OpenCode ACP connection ended without a terminal result";
}

/** Single configured local OpenCode ACP provider; no browser-controlled process settings. */
export class OpenCodeProvider implements AgentProvider {
  readonly id = "opencode-acp";
  private readonly runs = new Map<RunId, Run>();
  private readonly conversationSessions = new Map<ConversationId, ProviderSessionId>();
  private readonly activeConversations = new Set<ConversationId>();
  private readonly executable: string;
  private readonly cwd: string;
  private readonly runPrompt: PromptRunner;
  private readonly now: () => number;

  constructor(config: {
    executable?: string;
    cwd: string;
    runPrompt?: PromptRunner;
    now?: () => number;
  }) {
    this.executable = config.executable ?? "opencode";
    this.cwd = config.cwd;
    this.runPrompt = config.runPrompt ?? runOpenCodeAcpPrompt;
    this.now = config.now ?? Date.now;
  }

  describe() {
    return {
      input: { text: true, files: false },
      interactions: { permissions: true, questions: false },
      session: {
        continuation: true,
        coldReattach: false,
        modelSelection: false,
        agentSelection: false,
      },
      observation: {
        live: true,
        reconnect: "same-process" as const,
        toolUpdates: true,
        reasoning: false,
      },
      cancellation: true,
    } as const;
  }

  async start(request: StartRunRequest) {
    this.expireCompletedRuns();
    if (!RunIdSchema.safeParse(request.runId).success || this.runs.has(request.runId))
      throw new Error("Run ID is invalid or already exists");
    if (request.model !== undefined || request.agent !== undefined)
      throw new Error("OpenCode model and agent overrides are disabled");
    if (request.input.length !== 1 || request.input[0]?.type !== "text")
      throw new Error("OpenCode ACP currently accepts one text input");
    AgentInputSchema.array().min(1).max(32).parse(request.input);
    if (this.activeConversations.has(request.conversationId))
      throw new Error("This conversation already has an active or unknown OpenCode run");
    const providerSessionId = this.conversationSessions.get(request.conversationId);
    const ownedRequest: StartRunRequest = {
      runId: request.runId,
      conversationId: request.conversationId,
      input: request.input,
      ...(providerSessionId === undefined ? {} : { providerSessionId }),
    };
    const run = this.newRun(ownedRequest);
    this.activeConversations.add(request.conversationId);
    this.runs.set(request.runId, run);
    void this.execute(run, request.input[0].text);
    return { runId: request.runId };
  }

  async *observe(
    runId: RunId,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<RunObservation> {
    this.expireCompletedRuns();
    const run = this.runs.get(runId);
    if (!run) throw new Error("Unknown run");
    const snapshot = structuredClone(run.snapshot);
    const initial = RunObservationSchema.parse({ type: "snapshot", snapshot });
    if (snapshot.phase !== "running" || options.signal?.aborted) {
      yield initial;
      return;
    }
    const observer: Observer = { queue: [], overflowed: false };
    run.observers.add(observer);
    try {
      yield initial;
      while (!options.signal?.aborted) {
        if (observer.overflowed)
          throw new Error("Observer fell behind; reconnect for a fresh snapshot");
        const event = observer.queue.shift();
        if (event) {
          yield event;
          if (event.type === "event" && event.event.type === "run.finished") return;
          continue;
        }
        let wake!: () => void;
        await new Promise<void>((resolve) => {
          wake = () => resolve();
          observer.wake = wake;
          options.signal?.addEventListener("abort", wake, { once: true });
        });
        options.signal?.removeEventListener("abort", wake);
        observer.wake = undefined;
      }
    } finally {
      run.observers.delete(observer);
    }
  }

  async cancel(runId: RunId) {
    this.expireCompletedRuns();
    const run = this.runs.get(runId);
    if (!run) throw new Error("Unknown run");
    if (!run.promptActive) return "already-ended" as const;
    run.cancellationAccepted = true;
    this.settlePermissions(run);
    if (run.cancel) this.dispatchCancel(run);
    if (run.cancelPromise) await run.cancelPromise;
    return "dispatched" as const;
  }

  async respond(runId: RunId, decision: { permissionId: string; optionId: string }) {
    this.expireCompletedRuns();
    const run = this.getRun(runId);
    const permissionId = PermissionIdSchema.parse(decision.permissionId);
    const pending = run.permissions.get(permissionId);
    if (!pending || !pending.request.options.some((option) => option.id === decision.optionId))
      throw new Error("Permission is stale or option was not offered");
    run.permissions.delete(permissionId);
    pending.resolve(decision.optionId);
    this.publish(run, { type: "permission.resolved", permissionId: permissionId as never });
    return "dispatched" as const;
  }

  private newRun(request: StartRunRequest): Run {
    const run = {
      request,
      cwd: this.cwd,
      observers: new Set(),
      messages: new Map(),
      tools: new Map(),
      parts: [],
      permissions: new Map(),
      fallbackMessageId: `msg_${crypto.randomUUID()}`,
      promptActive: true,
      cancelSent: false,
      cancellationAccepted: false,
      snapshot: RunSnapshotSchema.parse({
        runId: request.runId,
        conversationId: request.conversationId,
        lastSequence: 0,
        phase: "running",
        messages: [],
        tools: [],
        parts: [],
        pendingPermissions: [],
      }),
    } as Run;
    return run;
  }

  private getRun(runId: RunId): Run {
    const run = this.runs.get(runId);
    if (!run) throw new Error("Unknown run");
    if (run.snapshot.phase !== "running") throw new Error("Run has ended");
    return run;
  }

  private expireCompletedRuns() {
    const expiry = this.now() - COMPLETED_RUN_RETENTION_MS;
    for (const [runId, run] of this.runs) {
      if (run.endedAt !== undefined && run.endedAt <= expiry) this.runs.delete(runId);
    }
  }

  private publish(run: Run, event: AgentRunEvent) {
    const sequence = run.snapshot.lastSequence + 1;
    const validated = AgentRunEventSchema.parse(event);
    const observation = RunObservationSchema.parse({ type: "event", sequence, event: validated });
    if (validated.type === "run.finished") run.terminalOutcome = validated.outcome;
    run.snapshot = this.materialize(run, sequence);
    for (const observer of run.observers) {
      if (observer.queue.length >= 256) observer.overflowed = true;
      else observer.queue.push(observation);
      observer.wake?.();
    }
  }

  private materialize(run: Run, lastSequence: number): RunSnapshot {
    const base = {
      runId: run.request.runId,
      conversationId: run.request.conversationId,
      ...(run.sessionId ? { providerSessionId: run.sessionId } : {}),
      lastSequence,
      messages: [...run.messages.values()],
      tools: [...run.tools.values()],
      parts: [...run.parts],
      pendingPermissions: [...run.permissions.values()].map((permission) => permission.request),
    };
    if (run.terminalOutcome) {
      if (run.terminalOutcome.kind === "unknown")
        return RunSnapshotSchema.parse({
          ...base,
          phase: "unknown",
          outcome: run.terminalOutcome,
        });
      return RunSnapshotSchema.parse({
        ...base,
        phase: "finished",
        outcome: run.terminalOutcome,
      });
    }
    return RunSnapshotSchema.parse({ ...base, phase: "running" });
  }

  private async execute(run: Run, prompt: string): Promise<void> {
    try {
      const stopReason = await this.runPrompt(
        {
          cwd: run.cwd,
          executable: this.executable,
          ...(run.request.providerSessionId === undefined
            ? {}
            : { providerSessionId: run.request.providerSessionId }),
        },
        prompt,
        {
          onUpdate: (update) =>
            projectOpenCodeUpdate(run, update, (event) => this.publish(run, event)),
          onPermission: (params) => this.requestPermission(run, params),
          onSession: (sessionId, cancel) => {
            run.sessionId = sessionId;
            run.cancel = cancel;
            if (run.cancellationAccepted) this.dispatchCancel(run);
            this.conversationSessions.set(
              run.request.conversationId,
              sessionId as ProviderSessionId,
            );
            this.publish(run, {
              type: "session.bound",
              providerSessionId: sessionId as never,
            });
          },
        },
      );
      run.promptActive = false;
      if (run.cancelFailure !== undefined) throw run.cancelFailure;
      this.finish(run, this.mapStopReason(stopReason));
    } catch (error) {
      this.finish(
        run,
        run.cancelFailure !== undefined
          ? { kind: "unknown", message: errorMessage(run.cancelFailure) }
          : error instanceof acp.RequestError
            ? { kind: "failed", message: errorMessage(error) }
            : { kind: "unknown", message: errorMessage(error) },
      );
    } finally {
      this.settlePermissions(run);
    }
  }

  private async requestPermission(
    run: Run,
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    if (run.cancellationAccepted || run.snapshot.phase !== "running")
      return { outcome: { outcome: "cancelled" } };
    const id = crypto.randomUUID();
    let settle!: (selected: string | undefined) => void;
    const selected = new Promise<string | undefined>((resolve) => {
      settle = resolve;
    });
    const permission = PermissionRequestSchema.parse({
      id,
      toolCallId: params.toolCall.toolCallId,
      title: params.toolCall.title || "OpenCode permission",
      options: params.options.map((option) => ({
        id: option.optionId,
        label: option.name,
        intent:
          option.kind === "allow_once" || option.kind === "allow_always"
            ? ("allow" as const)
            : option.kind === "reject_once" || option.kind === "reject_always"
              ? ("deny" as const)
              : ("other" as const),
      })),
    });
    run.permissions.set(id, { id, request: permission, resolve: settle });
    this.publish(run, { type: "permission.requested", permission });
    const optionId = await selected;
    const wasPending = run.permissions.delete(id);
    if (wasPending && run.snapshot.phase === "running")
      this.publish(run, { type: "permission.resolved", permissionId: id as never });
    return {
      outcome:
        optionId === undefined ? { outcome: "cancelled" } : { outcome: "selected", optionId },
    };
  }

  private finish(run: Run, outcome: RunOutcome) {
    if (run.snapshot.phase !== "running") return;
    run.promptActive = false;
    if (outcome.kind !== "unknown") this.activeConversations.delete(run.request.conversationId);
    if (outcome.kind !== "unknown") run.endedAt = this.now();
    this.settlePermissions(run);
    this.publish(run, { type: "run.finished", outcome });
  }

  private settlePermissions(run: Run) {
    for (const [permissionId, permission] of run.permissions) {
      run.permissions.delete(permissionId);
      permission.resolve(undefined);
      if (run.snapshot.phase === "running")
        this.publish(run, { type: "permission.resolved", permissionId: permissionId as never });
    }
  }

  private dispatchCancel(run: Run) {
    if (run.cancelSent || !run.cancel) return;
    run.cancelSent = true;
    const cancel = run.cancel;
    run.cancelPromise = Promise.resolve().then(() => cancel());
    void run.cancelPromise.catch((error: unknown) => {
      run.cancelFailure = error;
    });
  }

  private mapStopReason(reason: AcpStopReason): RunOutcome {
    switch (reason) {
      case "cancelled":
        return { kind: "cancelled" };
      case "end_turn":
        return { kind: "success" };
      case "max_tokens":
      case "max_turn_requests":
      case "refusal":
        return { kind: "stopped", reason };
      default: {
        const exhaustive: never = reason;
        return exhaustive;
      }
    }
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
