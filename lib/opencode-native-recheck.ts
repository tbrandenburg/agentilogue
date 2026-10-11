import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";
import { classifyOpenCodeHistoryOutcome, classifyOpenCodeOutcome } from "./opencode-native-outcome";

export async function readOpenCodeRecoveryOutcome(
  client: OpencodeClient,
  sessionId: string,
  current: () => boolean,
  timeout = 5_000,
) {
  const status = await client.session.status({}, { signal: AbortSignal.timeout(timeout) });
  if (!current()) return;
  if (status.error || status.response.status !== 200) {
    throw new Error("opencode status recheck failed");
  }
  if (classifyOpenCodeOutcome(status.data?.[sessionId]?.type, false) === "active") return "active";
  const history = await client.session.messages(
    { sessionID: sessionId },
    { signal: AbortSignal.timeout(timeout) },
  );
  if (!current()) return;
  if (history.error || history.response.status !== 200) {
    throw new Error("opencode history recheck failed");
  }
  return classifyOpenCodeHistoryOutcome(history.data ?? []);
}

export function createOpenCodeRecheck() {
  let revision = 0;
  let running: Promise<void> | undefined;
  let latest: ((current: () => boolean) => Promise<void>) | undefined;

  return (check: (current: () => boolean) => Promise<void>): Promise<void> => {
    revision += 1;
    latest = check;
    if (running) return running;
    running = Promise.resolve().then(async () => {
      try {
        while (latest) {
          const work = latest;
          const version = revision;
          latest = undefined;
          await work(() => version === revision);
        }
      } finally {
        // Release ownership before another microtask can enqueue a new check.
        running = undefined;
      }
    });
    return running;
  };
}
