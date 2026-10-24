import { createPostHandler } from "@/lib/agent/http-handlers";
import { createOpenCodeProviderFromEnvironment } from "@/lib/agent/opencode/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const provider = createOpenCodeProviderFromEnvironment();

export const GET = async () => "Disposable invalid route result; never merge";
export const POST = createPostHandler(provider);
