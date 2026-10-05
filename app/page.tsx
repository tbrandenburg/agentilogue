import { Assistant } from "./assistant";

export const dynamic = "force-dynamic";

export default function Home() {
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
  const projectName = process.cwd().split(/[\\/]/).filter(Boolean).at(-1) ?? "project";

  return <Assistant hasOpenAIKey={hasOpenAIKey} projectName={projectName} />;
}
