import { z } from "zod";
import type { NativeSelection } from "./native-selection";

export type NativeChatSession = NativeSelection & {
  id: string;
  title: string;
  projectName: string;
  openCodeProjectName: string;
  runTarget: "opencode:native";
  nativeSessionId: string;
  model?: string;
};

const storedSessionsSchema = z.object({
  version: z.literal(1),
  projectName: z.string(),
  openCodeProjectName: z.string(),
  activeId: z.string(),
  sessions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      projectName: z.string(),
      openCodeProjectName: z.string(),
      runTarget: z.literal("opencode:native"),
      nativeSessionId: z.string().min(1),
      model: z.string().optional(),
      nativeModel: z
        .object({ providerID: z.string().min(1), modelID: z.string().min(1) })
        .optional(),
      nativeAgent: z.string().min(1).optional(),
    }),
  ),
});

export function parseStoredNativeSessions(
  raw: string | null,
  projectName: string,
  openCodeProjectName: string,
): { sessions: NativeChatSession[]; activeId: string } | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const stored = storedSessionsSchema.safeParse(value);
  if (!stored.success) return null;
  if (stored.data.projectName !== projectName) return null;
  if (stored.data.openCodeProjectName !== openCodeProjectName) return null;
  const sessions = stored.data.sessions.filter(
    (session) =>
      session.projectName === projectName && session.openCodeProjectName === openCodeProjectName,
  );
  if (sessions.length === 0) return null;
  const activeId = sessions.some((session) => session.id === stored.data.activeId)
    ? stored.data.activeId
    : sessions[0]!.id;
  return { sessions, activeId };
}

export function serializeNativeSessions(
  sessions: readonly (NativeSelection & {
    id: string;
    title: string;
    projectName: string;
    openCodeProjectName: string;
    runTarget: string | null;
    nativeSessionId?: string;
    model?: string;
  })[],
  activeId: string,
  projectName: string,
  openCodeProjectName: string,
): string | null {
  const nativeSessions = sessions.filter(
    (session): session is NativeChatSession =>
      session.runTarget === "opencode:native" && Boolean(session.nativeSessionId),
  );
  if (nativeSessions.length === 0) return null;
  const persistedActiveId = nativeSessions.some((session) => session.id === activeId)
    ? activeId
    : nativeSessions[0]!.id;
  return JSON.stringify({
    version: 1,
    projectName,
    openCodeProjectName,
    activeId: persistedActiveId,
    sessions: nativeSessions,
  });
}
