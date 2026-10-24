import { createGetHandler, createPostHandler } from "@/lib/agent/http-handlers";
import { createCodexProviderFromEnvironment } from "@/lib/agent/codex/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const provider = createCodexProviderFromEnvironment();
export const GET = createGetHandler(provider);
export const POST = createPostHandler(provider);
