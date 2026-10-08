/**
 * Candidate HTTP request/control payloads for AGENTILOGUE's agent route.
 *
 * This is NOT an additional agent event or browser streaming protocol:
 * assistant-ui's chosen maintained runtime/transport owns streamed state.
 * The exact endpoint paths, HTTP verbs and wire shape are NOT locked.
 *
 * The HTTP handler MUST authenticate/authorize caller and project where
 * exposed beyond trusted local use, validate untrusted JSON at runtime,
 * resolve native session ownership and server execution configuration,
 * and create the RunId before invoking AgentProvider.start().
 */
import type {
  AgentInput,
  ConversationId,
  ControlReceipt,
  InteractionResponse,
  ProviderSessionId,
  RunBinding,
  RunId,
} from "./contracts";

/** Server allocates runId; browser may request only an authorized continuation. */
export interface StartAgentRunBody {
  readonly conversationId: ConversationId;
  readonly providerSessionId?: ProviderSessionId;
  readonly input: readonly AgentInput[];
  readonly model?: string;
  readonly agent?: string;
}

/** Admission is not completion of the run. */
export type StartAgentRunReceipt = RunBinding & {
  readonly status: "accepted";
};

/**
 * These controls MUST bypass any frontend command queue waiting for the
 * blocked agent stream; a conversationId is correlation, NOT authorization.
 */
export type AgentControlBody =
  | {
      readonly kind: "cancel";
      readonly conversationId: ConversationId;
      readonly runId: RunId;
    }
  | {
      readonly kind: "permission.respond";
      readonly conversationId: ConversationId;
      readonly runId: RunId;
      readonly response: InteractionResponse;
    };

/** A control acknowledgement is never evidence of a completed run. */
export type AgentControlReceipt =
  | {
      readonly kind: "cancel";
      readonly receipt: ControlReceipt;
    }
  | {
      readonly kind: "permission.respond";
      readonly receipt: "dispatched";
    };
