import { randomUUID } from "node:crypto";
import { AssistantTransportEncoder, type AssistantStreamChunk } from "assistant-stream";
import type { ReadonlyJSONValue } from "assistant-stream/utils";
import {
  AgentControlBodySchema,
  AgentControlReceiptSchema,
  StartAgentRunBodySchema,
  StartAgentRunReceiptSchema,
} from "@/lib/agent/contracts/http";
import { RunIdSchema } from "@/lib/agent/contracts/identifiers";
import type { RunObservation } from "@/lib/agent/contracts/run";
import type { AgentProvider } from "@/lib/agent/contracts/provider";
import { createOpenCodeProviderFromEnvironment } from "@/lib/agent/opencode/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const provider = createOpenCodeProviderFromEnvironment();
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });

const isTrustedLocalRequest = (request: Request, requireJson: boolean): boolean => {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!host || (!origin && !referer)) return false;
  if (!/^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/i.test(host)) return false;
  if (
    requireJson &&
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
  )
    return false;
  try {
    const url = new URL(request.url);
    const requestOrigin = origin ?? referer;
    if (!requestOrigin) return false;
    const parsedSource = new URL(requestOrigin);
    const expectedOrigin = `http://${host.toLowerCase()}`;
    return (
      url.protocol === "http:" &&
      parsedSource.origin === expectedOrigin &&
      (!request.headers.has("sec-fetch-site") ||
        request.headers.get("sec-fetch-site") === "same-origin")
    );
  } catch {
    return false;
  }
};

export function createPostHandler(postProvider: AgentProvider | undefined) {
  return async function POST(request: Request) {
    if (!isTrustedLocalRequest(request, true))
      return json({ error: "Untrusted agent request" }, 403);
    if (!postProvider) return json({ error: "Agent API is disabled" }, 404);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid agent request" }, 400);
    }
    const start = StartAgentRunBodySchema.safeParse(body);
    if (start.success) {
      try {
        const runId = RunIdSchema.parse(randomUUID());
        const admission = await postProvider.start({ ...start.data, runId });
        return json(
          StartAgentRunReceiptSchema.parse({ status: "accepted", runId: admission.runId }),
          202,
        );
      } catch {
        return json({ error: "Run could not be admitted" }, 409);
      }
    }
    const control = AgentControlBodySchema.safeParse(body);
    if (!control.success) return json({ error: "Invalid agent request" }, 400);
    const runId = RunIdSchema.parse(control.data.runId);
    const observer = postProvider.observe(runId)[Symbol.asyncIterator]();
    let first: IteratorResult<RunObservation>;
    try {
      first = await observer.next();
    } catch {
      await observer.return?.();
      return json({ error: "Run not found" }, 404);
    }
    await observer.return?.();
    if (
      !first.value ||
      first.value.type !== "snapshot" ||
      first.value.snapshot.conversationId !== control.data.conversationId
    )
      return json({ error: "Run not found" }, 404);
    try {
      const receipt =
        control.data.kind === "cancel"
          ? await postProvider.cancel(runId)
          : await postProvider.respond(runId, control.data.decision);
      const kind = control.data.kind;
      return json(AgentControlReceiptSchema.parse({ kind, receipt }));
    } catch {
      return json({ error: "Control could not be dispatched" }, 409);
    }
  };
}

export const POST = createPostHandler(provider);

export async function GET(request: Request) {
  if (!isTrustedLocalRequest(request, false))
    return json({ error: "Untrusted agent request" }, 403);
  if (!provider) return json({ error: "Agent API is disabled" }, 404);
  const url = new URL(request.url);
  const parsed = RunIdSchema.safeParse(url.searchParams.get("runId"));
  if (!parsed.success) return json({ error: "Invalid run ID" }, 400);
  const encoder = new AssistantTransportEncoder();
  const observerAbort = new AbortController();
  const abortObserver = () => observerAbort.abort();
  request.signal.addEventListener("abort", abortObserver, { once: true });
  if (request.signal.aborted) abortObserver();
  const writer = encoder.writable.getWriter();
  const writeObservation = (value: unknown): Promise<void> => {
    const jsonValue = JSON.parse(JSON.stringify(value)) as ReadonlyJSONValue;
    const chunk: AssistantStreamChunk = {
      type: "update-state",
      path: [],
      operations: [{ type: "set", path: [], value: jsonValue }],
    };
    return writer.write(chunk);
  };
  void (async () => {
    try {
      for await (const observation of provider.observe(parsed.data, {
        signal: observerAbort.signal,
      })) {
        await writeObservation(observation);
      }
      await writer.close();
    } catch {
      if (!observerAbort.signal.aborted) {
        try {
          await writer.write({ type: "error", path: [], error: "Run observation unavailable" });
          await writer.close();
        } catch {
          observerAbort.abort();
        }
      }
    } finally {
      request.signal.removeEventListener("abort", abortObserver);
    }
  })();
  return new Response(encoder.readable, {
    headers: {
      ...Object.fromEntries(encoder.headers),
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
