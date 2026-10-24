import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";

// Private useOpenCodeRuntime bridge: its caller must abort on disconnect/dispose.
// The pinned SDK's iterator.return() releases its reader lock, not the HTTP body.
export function configureOpenCodeEvents(client: OpencodeClient) {
  const subscribe = client.event.subscribe.bind(client.event);
  client.event.subscribe = async (parameters, options) => {
    if (!options?.signal) {
      throw new Error("opencode event subscriptions require a caller-owned AbortSignal");
    }
    const subscription = await subscribe(parameters, {
      ...options,
      onSseError: (error) => {
        options?.onSseError?.(error);
        throw error;
      },
    });
    // The pinned runtime treats subscribe resolution as a live connection, but the SDK is lazy.
    const first = await subscription.stream.next();
    if (first.done) throw new Error("opencode event stream ended before connecting");
    return {
      stream: (async function* () {
        try {
          yield first.value;
          yield* subscription.stream;
        } finally {
          await subscription.stream.return();
        }
      })(),
    };
  };
  return client;
}
