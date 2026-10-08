/**
 * Provider-neutral agent domain. These events are an internal application
 * observation model, NOT an ACP/AG-UI/A2A wire protocol. Native payloads must
 * be translated and redacted before they enter this model.
 */
import { z } from "zod";
import {
  ConversationIdSchema,
  MessageIdSchema,
  PermissionIdSchema,
  ProviderSessionIdSchema,
  RunIdSchema,
  ToolCallIdSchema,
} from "./identifiers";

export const AgentInputSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: z.string().min(1).max(65_536) }),
  z.strictObject({
    type: z.literal("file"),
    fileId: z.string().min(1).max(256),
    mimeType: z.string().min(3).max(128),
  }),
]);
export type AgentInput = z.infer<typeof AgentInputSchema>;

/**
 * Capabilities describe the *configured integration*, not protocol branding.
 * "durable" is only true when the application has implemented persistence.
 */
export const AgentCapabilitiesSchema = z.strictObject({
  input: z.strictObject({ text: z.literal(true), files: z.boolean() }),
  interactions: z.strictObject({ permissions: z.boolean(), questions: z.boolean() }),
  session: z.strictObject({
    continuation: z.boolean(),
    coldReattach: z.boolean(),
    modelSelection: z.boolean(),
    agentSelection: z.boolean(),
  }),
  observation: z.strictObject({
    live: z.literal(true),
    reconnect: z.enum(["none", "same-process", "durable"]),
    toolUpdates: z.boolean(),
    reasoning: z.boolean(),
  }),
  cancellation: z.boolean(),
});
export type AgentCapabilities = Readonly<z.infer<typeof AgentCapabilitiesSchema>>;

export const PermissionOptionSchema = z.strictObject({
  id: z.string().min(1).max(256),
  label: z.string().min(1).max(512),
  intent: z.enum(["allow", "deny", "other"]),
});
export type PermissionOption = Readonly<z.infer<typeof PermissionOptionSchema>>;

export const PermissionRequestSchema = z
  .strictObject({
    id: PermissionIdSchema,
    toolCallId: ToolCallIdSchema.optional(),
    title: z.string().min(1).max(1024),
    options: z.array(PermissionOptionSchema).min(1).max(32),
  })
  .refine(
    (permission) =>
      new Set(permission.options.map((option) => option.id)).size === permission.options.length,
    {
      message: "Permission option IDs must be unique",
      path: ["options"],
    },
  );
export type PermissionRequest = Readonly<z.infer<typeof PermissionRequestSchema>>;

/** Only one of the native request's currently offered option IDs is valid. */
export const PermissionDecisionSchema = z.strictObject({
  permissionId: PermissionIdSchema,
  optionId: z.string().min(1).max(256),
});
export type PermissionDecision = Readonly<z.infer<typeof PermissionDecisionSchema>>;

const SuccessOutcomeSchema = z.strictObject({ kind: z.literal("success") });
const CancelledOutcomeSchema = z.strictObject({ kind: z.literal("cancelled") });
const FailedOutcomeSchema = z.strictObject({
  kind: z.literal("failed"),
  message: z.string().min(1).max(2048),
});
const UnknownOutcomeSchema = z.strictObject({
  kind: z.literal("unknown"),
  message: z.string().min(1).max(2048),
});
const ConfirmedOutcomeSchema = z.discriminatedUnion("kind", [
  SuccessOutcomeSchema,
  CancelledOutcomeSchema,
  FailedOutcomeSchema,
]);
export const RunOutcomeSchema = z.discriminatedUnion("kind", [
  SuccessOutcomeSchema,
  CancelledOutcomeSchema,
  FailedOutcomeSchema,
  UnknownOutcomeSchema,
]);
export type RunOutcome = Readonly<z.infer<typeof RunOutcomeSchema>>;

export const ToolStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export type ToolStatus = z.infer<typeof ToolStatusSchema>;

/**
 * Deltas append; tool updates merge by toolCallId. An omitted patch field
 * means unchanged. The UI must never re-execute a provider-owned tool.
 */
export const AgentRunEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("message.delta"),
    messageId: MessageIdSchema,
    channel: z.enum(["assistant", "reasoning"]),
    text: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("tool.updated"),
    toolCallId: ToolCallIdSchema,
    title: z.string().min(1).max(1024).optional(),
    status: ToolStatusSchema.optional(),
    summary: z.string().max(8192).optional(),
  }),
  z.strictObject({ type: z.literal("permission.requested"), permission: PermissionRequestSchema }),
  z.strictObject({ type: z.literal("permission.resolved"), permissionId: PermissionIdSchema }),
  z.strictObject({ type: z.literal("session.bound"), providerSessionId: ProviderSessionIdSchema }),
  z.strictObject({ type: z.literal("run.finished"), outcome: RunOutcomeSchema }),
]);
export type AgentRunEvent = Readonly<z.infer<typeof AgentRunEventSchema>>;

export const RunMessageSchema = z.strictObject({
  id: MessageIdSchema,
  channel: z.enum(["assistant", "reasoning"]),
  text: z.string(),
});
export type RunMessage = Readonly<z.infer<typeof RunMessageSchema>>;

export const RunToolSchema = z.strictObject({
  id: ToolCallIdSchema,
  title: z.string().max(1024).optional(),
  status: ToolStatusSchema.optional(),
  summary: z.string().max(8192).optional(),
});
export type RunTool = Readonly<z.infer<typeof RunToolSchema>>;

/** Materialized state through lastSequence, NOT an unbounded event log. */
const SnapshotBaseSchema = z.strictObject({
  runId: RunIdSchema,
  conversationId: ConversationIdSchema,
  providerSessionId: ProviderSessionIdSchema.optional(),
  lastSequence: z.number().int().nonnegative(),
  messages: z.array(RunMessageSchema),
  tools: z.array(RunToolSchema),
  pendingPermissions: z.array(PermissionRequestSchema),
});

/** Running snapshots have no outcome; terminal/unknown states require one. */
export const RunSnapshotSchema = z.discriminatedUnion("phase", [
  SnapshotBaseSchema.extend({ phase: z.literal("running") }),
  SnapshotBaseSchema.extend({
    phase: z.literal("finished"),
    outcome: ConfirmedOutcomeSchema,
  }),
  SnapshotBaseSchema.extend({
    phase: z.literal("unknown"),
    outcome: UnknownOutcomeSchema,
  }),
]);
export type RunSnapshot = Readonly<z.infer<typeof RunSnapshotSchema>>;

export const RunObservationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("snapshot"), snapshot: RunSnapshotSchema }),
  z.strictObject({
    type: z.literal("event"),
    sequence: z.number().int().positive(),
    event: AgentRunEventSchema,
  }),
]);
export type RunObservation = Readonly<z.infer<typeof RunObservationSchema>>;

/** A local control receipt is not a native terminal outcome. */
export type ControlReceipt = "dispatched" | "already-ended";
