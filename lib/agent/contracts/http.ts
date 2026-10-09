/**
 * Validated *application-owned* start/control bodies and receipts.
 * HTTP handlers MUST call .parse/.safeParse on untrusted JSON. These schemas
 * do NOT define the browser stream: use the selected maintained assistant-ui
 * or AG-UI transport protocol instead.
 */
import { z } from "zod";
import { ConversationIdSchema, RunIdSchema } from "./identifiers";
import { AgentInputSchema, PermissionDecisionSchema } from "./run";

export const StartAgentRunBodySchema = z.strictObject({
  conversationId: ConversationIdSchema,
  input: z.array(AgentInputSchema).min(1).max(32),
  model: z.string().min(1).max(256).optional(),
  agent: z.string().min(1).max(256).optional(),
});
export type StartAgentRunBody = z.infer<typeof StartAgentRunBodySchema>;

/** The server allocates runId; the browser never supplies native session IDs. */
export const StartAgentRunReceiptSchema = z.strictObject({
  status: z.literal("accepted"),
  runId: RunIdSchema,
});
export type StartAgentRunReceipt = z.infer<typeof StartAgentRunReceiptSchema>;

/** Independent HTTP controls must work while a stream remains blocked. */
export const AgentControlBodySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("cancel"),
    runId: RunIdSchema,
    conversationId: ConversationIdSchema,
  }),
  z.strictObject({
    kind: z.literal("permission.respond"),
    runId: RunIdSchema,
    conversationId: ConversationIdSchema,
    decision: PermissionDecisionSchema,
  }),
]);
export type AgentControlBody = z.infer<typeof AgentControlBodySchema>;

export const AgentControlReceiptSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("cancel"),
    receipt: z.enum(["dispatched", "already-ended"]),
  }),
  z.strictObject({
    kind: z.literal("permission.respond"),
    receipt: z.literal("dispatched"),
  }),
]);
export type AgentControlReceipt = z.infer<typeof AgentControlReceiptSchema>;
