import { runOpenCodeAcpProof } from "../lib/agent/opencode/acp-proof";

const [cwd, ...args] = process.argv.slice(2);
const permissionArgument = args.find((argument) => argument.startsWith("--permission="));
const permissionOptionId = permissionArgument?.slice("--permission=".length);
const prompts = args
  .filter((argument) => !argument.startsWith("--permission="))
  .join(" ")
  .split(" --turn ");
if (!cwd || !prompts[0]) {
  throw new Error(
    "Usage: bun run opencode:acp-proof <absolute-cwd> <prompt> [--turn <next prompt>]",
  );
}

await runOpenCodeAcpProof({
  cwd,
  prompts,
  ...(permissionOptionId ? { permissionOptionId } : {}),
  signal: AbortSignal.timeout(120_000),
  onEvent: (event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  },
});
