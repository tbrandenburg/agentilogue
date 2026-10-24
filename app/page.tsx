import { randomUUID } from "node:crypto";
import { getOpenCodeNativeAvailability } from "@/lib/opencode-native-config";
import { Assistant } from "./assistant";
import { getCodexConfig } from "@/lib/agent/codex/config";

export const dynamic = "force-dynamic";

export default function Home() {
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
  const codex = getCodexConfig();
  const hasOpenCodeApi =
    process.env.AGENT_API_ENABLED === "1" &&
    process.env.AGENT_TRUSTED_LOCAL === "1" &&
    Boolean(process.env.OPENCODE_CWD?.startsWith("/"));
  const projectName = process.cwd().split(/[\\/]/).filter(Boolean).at(-1) ?? "project";
  const openCodeProjectName =
    process.env.OPENCODE_CWD?.split(/[\\/]/).filter(Boolean).at(-1) ?? "project";
  const nativeOpenCode = getOpenCodeNativeAvailability({
    enabled: process.env.OPENCODE_NATIVE_ENABLED,
    url: process.env.OPENCODE_NATIVE_URL,
    appOrigin: process.env.OPENCODE_NATIVE_APP_ORIGIN,
  });

  return (
    <Assistant
      hasOpenAIKey={hasOpenAIKey}
      hasOpenCodeApi={hasOpenCodeApi}
      hasCodexApi={Boolean(codex)}
      codexProjectName={codex?.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? "project"}
      nativeOpenCode={nativeOpenCode}
      initialConversationId={randomUUID()}
      openCodeProjectName={openCodeProjectName}
      projectName={projectName}
    />
  );
}
