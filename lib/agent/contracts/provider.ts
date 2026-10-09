/**
 * The sole app-owned provider port. Concrete adapters translate official
 * protocol/SDK events into the app's neutral run model.
 *
 * No assistant-ui, ACP, AG-UI, or A2A dependencies belong in this module.
 */
import type { ConversationId, ProviderSessionId, RunId } from "./identifiers";
import type {
  AgentCapabilities,
  AgentInput,
  ControlReceipt,
  PermissionDecision,
  RunObservation,
} from "./run";

/** All executable paths, environment and credentials are server-owned. */
export interface StartRunRequest {
  readonly runId: RunId;
  readonly conversationId: ConversationId;
  /** Supplied by the server after validating the session binding. */
  readonly providerSessionId?: ProviderSessionId;
  readonly input: readonly AgentInput[];
  /** Explicit, validated selection only. Omission uses defined session policy. */
  readonly model?: string;
  readonly agent?: string;
}

export interface RunAdmission {
  readonly runId: RunId;
  /** Native identity may arrive in a later session.bound event. */
  readonly providerSessionId?: ProviderSessionId;
}

export interface ObserveOptions {
  /** Closing observation stops the observer, never the native agent. */
  readonly signal?: AbortSignal;
}

/**
 * Contract invariants:
 * - start resolves on admission, not on native prompt completion.
 * - observation begins with exactly one atomic snapshot; subsequent event
 *   sequences are strictly contiguous from snapshot.lastSequence + 1.
 * - run observation can be detached without cancelling the run.
 * - cancel dispatch is distinct from observed run.finished.
 * - respond accepts one live, offered option for this run; reject any stale,
 *   duplicate, foreign or unoffered decision, including cancellation races.
 * - one active ACP prompt per native session is enforced by its adapter.
 */
export interface AgentProvider {
  readonly id: string;
  describe(): AgentCapabilities;
  start(request: StartRunRequest): Promise<RunAdmission>;
  observe(runId: RunId, options?: ObserveOptions): AsyncIterable<RunObservation>;
  cancel(runId: RunId): Promise<ControlReceipt>;
  respond(runId: RunId, decision: PermissionDecision): Promise<"dispatched">;
}
