/**
 * Distinct IDs protect internal call sites from accidental substitution.
 * Branded types are erased at runtime: validate JSON with these schemas.
 *
 * RunId and PermissionId are issued by this server; ConversationId is
 * correlated to a server-owned conversation; ProviderSessionId is opaque.
 */
import { z } from "zod";

export const ConversationIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  .brand<"ConversationId">();
export type ConversationId = z.infer<typeof ConversationIdSchema>;

export const RunIdSchema = z.uuid().brand<"RunId">();
export type RunId = z.infer<typeof RunIdSchema>;

export const ProviderSessionIdSchema = z.string().min(1).max(2048).brand<"ProviderSessionId">();
export type ProviderSessionId = z.infer<typeof ProviderSessionIdSchema>;

export const PermissionIdSchema = z.uuid().brand<"PermissionId">();
export type PermissionId = z.infer<typeof PermissionIdSchema>;

export const MessageIdSchema = z.string().min(1).max(256).brand<"MessageId">();
export type MessageId = z.infer<typeof MessageIdSchema>;

export const ToolCallIdSchema = z.string().min(1).max(256).brand<"ToolCallId">();
export type ToolCallId = z.infer<typeof ToolCallIdSchema>;
