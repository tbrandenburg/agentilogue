import { Assistant } from "./assistant";

export const dynamic = "force-dynamic";

export default function Home() {
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
  const hasOpenCodeApi =
    process.env.AGENT_API_ENABLED === "1" &&
    process.env.AGENT_TRUSTED_LOCAL === "1" &&
    Boolean(process.env.OPENCODE_CWD?.startsWith("/"));
  const projectName = process.cwd().split(/[\\/]/).filter(Boolean).at(-1) ?? "project";
  const openCodeProjectName =
    process.env.OPENCODE_CWD?.split(/[\\/]/).filter(Boolean).at(-1) ?? "project";

  return (
    <Assistant
      hasOpenAIKey={hasOpenAIKey}
      hasOpenCodeApi={hasOpenCodeApi}
      openCodeProjectName={openCodeProjectName}
      projectName={projectName}
    />
  );
}
