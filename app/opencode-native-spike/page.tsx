import { NativeOpenCodeSpike } from "./runtime";

export const dynamic = "force-dynamic";

export default function Page() {
  const baseUrl = process.env.OPENCODE_NATIVE_URL;
  if (!baseUrl) return <main>Set OPENCODE_NATIVE_URL to the loopback OpenCode server.</main>;

  return <NativeOpenCodeSpike baseUrl={baseUrl} />;
}
