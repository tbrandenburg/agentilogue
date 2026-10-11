export type RunTargetId =
  | "openai:vercel-ai"
  | "opencode:cli"
  | "opencode:native"
  | "pi:cli"
  | "codex:cli"
  | "claude-code:cli"
  | "github-copilot:cli";

export type RunTargetDefinition = {
  id: RunTargetId;
  label: string;
};

export const runTargets: readonly RunTargetDefinition[] = [
  { id: "openai:vercel-ai", label: "AI SDK · OpenAI" },
  { id: "opencode:cli", label: "opencode" },
  { id: "opencode:native", label: "OpenCode · Native" },
  { id: "pi:cli", label: "pi" },
  { id: "codex:cli", label: "codex" },
  { id: "claude-code:cli", label: "claude code" },
  { id: "github-copilot:cli", label: "github copilot" },
];
