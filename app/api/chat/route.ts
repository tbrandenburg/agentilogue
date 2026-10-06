import { openai } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/ai-sdk";
import { type JSONSchema7, streamText, convertToModelMessages, type UIMessage } from "ai";
import { DEFAULT_MODEL, isAllowedModel } from "@/lib/model-selection";

export const maxDuration = 30;

export async function POST(req: Request) {
  const body: unknown = await req.json();
  if (typeof body !== "object" || body === null || !("messages" in body)) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { messages, system, tools, config } = body as {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
    config?: unknown;
  };
  const requestedModel =
    typeof config === "object" && config !== null && "modelName" in config
      ? config.modelName
      : undefined;
  if (requestedModel !== undefined && !isAllowedModel(requestedModel)) {
    return Response.json({ error: "Invalid model selection" }, { status: 400 });
  }
  const modelId = requestedModel ?? DEFAULT_MODEL;

  const result = streamText({
    model: openai(modelId),
    messages: await convertToModelMessages(messages),
    tools: {
      ...frontendTools(tools ?? {}),
    },
    ...(system === undefined ? {} : { system }),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  });
}
