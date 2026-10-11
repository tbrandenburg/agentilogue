import { createGetHandler, createPostHandler } from "@/lib/agent/http-handlers";
import { createOpenCodeProviderFromEnvironment } from "@/lib/agent/opencode/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const provider = createOpenCodeProviderFromEnvironment();

export const GET = createGetHandler(provider);
export const POST = createPostHandler(provider);
