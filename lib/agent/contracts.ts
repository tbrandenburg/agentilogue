/**
 * Candidate app-owned provider contract for the OpenCode ACP proof.
 * Boundaries and identity semantics are locked in docs/CONTRACTS.md;
 * these TypeScript signatures remain experimental until native validation.
 * Native event types come from maintained SDKs, never copied into this module.
 */

declare const idKind: unique symbol;
export type Id<Kind extends string> = string & { readonly [idKind]: Kind };
export type ConversationId = Id<"conversation">;
export type RunId = Id<"run">;
export type ProviderSessionId = Id<"provider-session">;

export type AgentInput =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "file"; readonly fileId: string; readonly mimeType: string };

export interface StartRunRequest {
  readonly runId: RunId;
  readonly conversationId: ConversationId;
  readonly providerSessionId?: ProviderSessionId;
  readonly input: readonly AgentInput[];
  readonly model?: string;
  readonly agent?: string;
}

export interface AgentCapabilities {
  readonly integration: string;
  readonly permissions: boolean;
  readonly cancellation: boolean;
  readonly contextContinuation: boolean;
  readonly sessionReattach: boolean;
  readonly liveObservation: boolean;
  readonly durableReplay: boolean;
  readonly files: boolean;
  readonly modelSelection: boolean;
  readonly agentSelection: boolean;
}

export interface RunBinding {
  readonly runId: RunId;
  /** Native identity may be learned after admission. */
  readonly providerSessionId?: ProviderSessionId;
}

export interface PermissionRequest {
  readonly kind: "permission";
  readonly id: string;
  readonly toolCallId?: string;
  readonly title: string;
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
    readonly kind: string;
  }[];
}

export type InteractionResponse = {
  readonly kind: "permission";
  readonly interactionId: string;
  readonly optionId: string;
};

export type RunOutcome =
  | { readonly kind: "success" | "cancelled"; readonly foreground: "stopped" }
  | { readonly kind: "failed"; readonly foreground: "stopped" | "unknown"; readonly message: string }
  | { readonly kind: "unknown"; readonly message: string };

/** Private app observation envelope. TNativeEvent is an official SDK type. */
export type AgentObservation<TNativeEvent> =
  | { readonly kind: "native"; readonly value: TNativeEvent }
  | { readonly kind: "session.bound"; readonly providerSessionId: ProviderSessionId }
  | { readonly kind: "interaction"; readonly value: PermissionRequest }
  | { readonly kind: "run.outcome"; readonly value: RunOutcome };

export interface SequencedObservation<TNativeEvent> {
  readonly seq: number;
  readonly event: AgentObservation<TNativeEvent>;
}

export interface RunSnapshot<TNativeEvent> {
  readonly runId: RunId;
  readonly conversationId: ConversationId;
  readonly providerSessionId?: ProviderSessionId;
  readonly phase: "running" | "stopped" | "unknown";
  readonly lastSeq: number;
  readonly events: readonly SequencedObservation<TNativeEvent>[];
  readonly pendingPermissions: readonly PermissionRequest[];
}

export interface RunObservationHandle<TNativeEvent> {
  /** Registration and snapshot capture must have no unreported event gap. */
  readonly snapshot: RunSnapshot<TNativeEvent>;
  unsubscribe(): void;
}

/** Receipt means local dispatch, not confirmed native cancellation. */
export type ControlReceipt = "dispatched" | "already-ended";

export interface AgentProvider<TNativeEvent> {
  readonly id: string;
  describe(): AgentCapabilities;
  start(request: StartRunRequest): Promise<RunBinding>;
  observe(
    runId: RunId,
    listener: (entry: SequencedObservation<TNativeEvent>) => void,
  ): Promise<RunObservationHandle<TNativeEvent>>;
  cancel(runId: RunId): Promise<ControlReceipt>;
  respond(runId: RunId, response: InteractionResponse): Promise<void>;
}
