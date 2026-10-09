import { AssistantTransportDecoder } from "assistant-stream";
import { RunObservationSchema } from "@/lib/agent/contracts/run";

const MAX_RETRIES = 5;

export function hasTerminalProjection(
  projection: { readonly messageId: string; readonly snapshot: { readonly phase: string } } | null,
  messageId: string,
): boolean {
  return projection?.messageId === messageId && projection.snapshot.phase !== "running";
}

export async function observeOpenCodeRun(
  runId: string,
  onObservation: (observation: unknown) => void,
  onConnectionState: (state: "connected" | "reconnecting" | "disconnected") => void,
  request: typeof fetch = fetch,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<void> {
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    try {
      const response = await request(`/api/agent?runId=${encodeURIComponent(runId)}`, {
        signal: controller.signal,
      });
      if (response.status === 403 || response.status === 404) throw new PermanentObserverError();
      if (!response.ok || !response.body) throw new Error("OpenCode observer is unavailable.");
      onConnectionState("connected");
      const reader = response.body
        .pipeThrough(new AssistantTransportDecoder({ strict: true }))
        .getReader();
      let finished = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value.type === "error") throw new Error("OpenCode observer reported an error.");
          if (value.type !== "update-state") continue;
          for (const operation of value.operations) {
            if (operation.type !== "set" || operation.path.length !== 0) continue;
            const observation = RunObservationSchema.safeParse(operation.value);
            if (!observation.success) throw new Error("OpenCode sent an invalid observation.");
            onObservation(observation.data);
            if (
              observation.data.type === "snapshot"
                ? observation.data.snapshot.phase !== "running"
                : observation.data.event.type === "run.finished"
            )
              finished = true;
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (finished) return;
      throw new Error("OpenCode observer ended before a terminal result.");
    } catch (error) {
      controller.abort();
      if (error instanceof PermanentObserverError || attempt >= MAX_RETRIES) {
        onConnectionState("disconnected");
        return;
      }
      onConnectionState("reconnecting");
      await wait(Math.min(250 * 2 ** attempt, 5_000));
      attempt += 1;
    }
  }
}

class PermanentObserverError extends Error {}
