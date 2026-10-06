import models from "@/data/models.json";

export const DEFAULT_OPTION_ID = "__agentilogue_default__";
export const DEFAULT_MODEL = "gpt-6-luna";

export function modelFromSelectorValue(value: string): string | undefined {
  return value === DEFAULT_OPTION_ID ? undefined : value;
}

export function isAllowedModel(value: unknown): value is string {
  return typeof value === "string" && models.openai.models.includes(value);
}

export const creatorLabels: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  xai: "xAI",
  deepseek: "DeepSeek",
  moonshotai: "Moonshot AI",
  alibaba: "Alibaba",
  zhipuai: "Zhipu AI",
  minimax: "MiniMax",
  mistral: "Mistral",
  cohere: "Cohere",
};
