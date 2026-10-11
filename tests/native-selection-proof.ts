// Disposable real-server proof: bun tests/native-selection-proof.ts
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, openSync, closeSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { chromium } from "playwright";
import { expect } from "playwright/test";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";

const app = "http://127.0.0.1:14381";
const server = "http://127.0.0.1:14382";
assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY must be inherited, never printed");
for (const port of [14381, 14382]) {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(port, "127.0.0.1", () => socket.close(() => resolve()));
  });
}
const root = mkdtempSync("/tmp/opencode/issue38-");
const project = `${root}/project`;
mkdirSync(project);
const password = crypto.randomUUID();
const config = JSON.stringify({
  model: "openai/gpt-4.1-mini",
  small_model: "openai/gpt-4.1-mini",
  default_agent: "build",
  enabled_providers: ["openai"],
  permission: { edit: "ask", bash: "ask" },
});
const env = {
  ...process.env,
  HOME: root,
  XDG_CONFIG_HOME: `${root}/config`,
  XDG_DATA_HOME: `${root}/data`,
  XDG_CACHE_HOME: `${root}/cache`,
  XDG_STATE_HOME: `${root}/state`,
  OPENCODE_CONFIG_CONTENT: config,
  OPENCODE_SERVER_PASSWORD: password,
  OPENCODE_NATIVE_ENABLED: "1",
  OPENCODE_NATIVE_URL: server,
  OPENCODE_NATIVE_APP_ORIGIN: app,
  AGENT_API_ENABLED: "1",
  AGENT_TRUSTED_LOCAL: "1",
  OPENCODE_CWD: project,
};
const children: number[] = [];
function start(command: string, args: string[], cwd: string, label: string) {
  const log = openSync(`/tmp/detach-issue38-${label}.log`, "w", 0o600);
  // setsid gives each owned service its own process group, independent of this tool invocation.
  const child = spawn("setsid", [command, ...args], { cwd, env, stdio: ["ignore", log, log] });
  closeSync(log);
  assert.ok(child.pid);
  children.push(child.pid);
  return child;
}
function signalOwned(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}
async function wait(check: () => Promise<boolean>, label: string, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out: ${label}`);
}
const client = createOpencodeClient({
  baseUrl: server,
  headers: { Authorization: `Basic ${btoa(`opencode:${password}`)}` },
});
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const requests: { path: string; body: Record<string, unknown> }[] = [];
page.on("request", (request) => {
  if (
    request.method() === "POST" &&
    /prompt_async|\/abort$|\/api\/chat|\/api\/agent$/.test(request.url())
  ) {
    requests.push({
      path: new URL(request.url()).pathname,
      body: request.postDataJSON() as Record<string, unknown>,
    });
  }
});
const panel = () => page.getByRole("tabpanel").filter({ visible: true });
async function pick(label: string, name: string) {
  await panel().getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function connect() {
  await panel().getByLabel("OpenCode server password", { exact: true }).fill(password);
  await panel().getByRole("button", { name: "Connect to OpenCode", exact: true }).click();
  try {
    await panel().getByText("Default delegates to OpenCode:", { exact: false }).waitFor();
  } catch (error) {
    console.log(await panel().innerText());
    throw error;
  }
}
async function send(text: string) {
  const active = panel().and(page.locator('[tabindex="0"]:not([inert])'));
  const input = active.getByRole("textbox", { name: "Message input", exact: true });
  const button = active.getByRole("button", { name: "Send message", exact: true });
  try {
    // Activation can reset controlled text; retry entry, never the send click.
    await expect(async () => {
      await expect(active).toHaveCount(1, { timeout: 5000 });
      await expect(input).toBeEnabled({ timeout: 5000 });
      await expect(input).toBeEditable({ timeout: 5000 });
      await input.click();
      await input.fill("");
      await input.pressSequentially(text);
      await expect(input).toHaveValue(text, { timeout: 5000 });
      await expect(button).toBeEnabled({ timeout: 5000 });
      await expect(input).toHaveValue(text, { timeout: 5000 });
    }).toPass({ timeout: 120_000, intervals: [100, 250, 500] });
    await button.click({ timeout: 120_000 });
  } catch (error) {
    console.log(await panel().innerText());
    throw error;
  }
}
async function stored() {
  return page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("agentilogue:native-sessions:v1") ?? "null") as {
        sessions: {
          id: string;
          nativeSessionId: string;
          nativeAgent?: string;
          nativeModel?: { providerID: string; modelID: string };
        }[];
      } | null,
  );
}
async function allow() {
  try {
    await panel().getByText("1 tool call", { exact: true }).last().click({ timeout: 120_000 });
    await panel().getByRole("button", { name: "Allow", exact: true }).click({ timeout: 120_000 });
  } catch (error) {
    console.log(await panel().innerText());
    throw error;
  }
}
async function evidence(sessionID: string, turns: number, modelID: string, agent: string) {
  await wait(async () => {
    const result = await client.session.messages({ sessionID }, { throwOnError: true });
    const users = result.data.filter((message) => message.info.role === "user");
    const assistants = result.data.filter((message) => message.info.role === "assistant");
    const last = assistants.at(-1)?.info;
    if (users.length < turns || last?.role !== "assistant" || !last.time.completed) return false;
    for (const message of users) {
      assert.equal(message.info.role, "user");
      if (message.info.role !== "user") continue;
      assert.deepEqual(message.info.model, { providerID: "openai", modelID });
      assert.equal(message.info.agent, agent);
    }
    for (const message of assistants) {
      if (message.info.role !== "assistant") continue;
      assert.equal(message.info.providerID, "openai");
      assert.equal(message.info.modelID, modelID);
      assert.equal(message.info.agent, agent);
      assert.equal(message.info.error, undefined);
    }
    return true;
  }, `server effective selection: ${agent}/${modelID}, ${turns} turns`);
  console.log(
    `PASS server user+assistant selection openai/${modelID} agent=${agent} turns=${turns}`,
  );
}
try {
  start(
    "opencode",
    ["serve", "--pure", "--hostname", "127.0.0.1", "--port", "14382", "--cors", app],
    project,
    "server",
  );
  start(
    "bun",
    ["x", "--no-install", "next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "14381"],
    process.cwd(),
    "app",
  );
  await wait(async () => {
    try {
      return (
        (await client.global.health({ signal: AbortSignal.timeout(1000) })).data?.healthy === true
      );
    } catch {
      return false;
    }
  }, "OpenCode startup");
  assert.equal((await client.global.health()).data?.version, "1.18.35");
  await client.provider.list({}, { throwOnError: true });
  await client.app.agents({}, { throwOnError: true });
  await wait(async () => {
    try {
      return (await fetch(app, { signal: AbortSignal.timeout(2000) })).ok;
    } catch {
      return false;
    }
  }, "app startup");
  await page.goto(app);
  // Keep an AI SDK lane mounted in the background.
  await panel().getByRole("combobox", { name: "Model", exact: true }).click();
  await page.getByText("▸ Models", { exact: true }).click();
  await page.getByRole("option", { name: "gpt-4.1-mini", exact: true }).click();
  await send("Reply exactly BACKGROUND_AI_38, no tools.");
  await panel().getByText("BACKGROUND_AI_38", { exact: true }).waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await pick("Run with", "opencode");
  await send("Reply exactly BACKGROUND_ACP_38, no tools.");
  await panel().getByText("BACKGROUND_ACP_38", { exact: true }).waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await pick("Run with", "OpenCode · Native");
  await connect();
  await pick("Model", "openai/gpt-4.1");
  await pick("Agent", "plan");
  await pick("Model", "Default");
  await pick("Agent", "Default");
  await send("Reply exactly NATIVE_DEFAULT_38, no tools.");
  await wait(async () => (await stored())?.sessions.length === 1, "first native mapping");
  const first = (await stored())!.sessions[0]!;
  await evidence(first.nativeSessionId, 1, "gpt-4.1-mini", "build");
  assert.equal(
    await panel().getByRole("combobox", { name: "Model", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await panel().getByRole("combobox", { name: "Agent", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await panel().getByRole("combobox", { name: "Run with", exact: true }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await pick("Run with", "OpenCode · Native");
  await connect();
  await pick("Model", "openai/gpt-4.1");
  await pick("Agent", "plan");
  // Default reset before the first message must really remove the explicit pair.
  await pick("Model", "Default");
  await pick("Agent", "Default");
  await pick("Model", "openai/gpt-4.1");
  await pick("Agent", "plan");
  await send("Reply exactly NATIVE_EXPLICIT_38, no tools.");
  await wait(async () => (await stored())?.sessions.length === 2, "second native mapping");
  const second = (await stored())!.sessions[1]!;
  assert.notEqual(first.nativeSessionId, second.nativeSessionId);
  await evidence(second.nativeSessionId, 1, "gpt-4.1", "plan");
  await send("Reply exactly NATIVE_EXPLICIT_SECOND_38, no tools.");
  await evidence(second.nativeSessionId, 2, "gpt-4.1", "plan");
  await page.getByRole("tab", { name: "chat 3", exact: true }).click();
  await send("Reply exactly NATIVE_DEFAULT_SECOND_38, no tools.");
  await evidence(first.nativeSessionId, 2, "gpt-4.1-mini", "build");
  await page.getByRole("tab").first().click();
  await panel().getByText("BACKGROUND_AI_38", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "chat 2", exact: true }).click();
  try {
    await panel().getByText("BACKGROUND_ACP_38", { exact: true }).waitFor({ timeout: 120_000 });
  } catch (error) {
    console.log(await panel().innerText());
    throw error;
  }
  assert.equal(
    requests.find((request) => request.path === "/api/chat")?.body.config &&
      (
        requests.find((request) => request.path === "/api/chat")!.body.config as {
          modelName: string;
        }
      ).modelName,
    "gpt-4.1-mini",
  );
  console.log("PASS two native tabs and background real AI SDK/ACP responses independent");
  const nativeRequests = requests.filter((request) => request.path.endsWith("/prompt_async"));
  assert.equal(nativeRequests.length, 4);
  assert.equal(nativeRequests[0]!.body.model, undefined);
  assert.equal(nativeRequests[0]!.body.agent, undefined);
  assert.deepEqual(nativeRequests[1]!.body.model, second.nativeModel);
  assert.equal(nativeRequests[1]!.body.agent, "plan");
  await page.reload();
  await page.getByRole("tab", { name: "chat 4", exact: true }).click();
  assert.equal(
    await panel().getByRole("button", { name: "Choose another runtime", exact: true }).isDisabled(),
    true,
  );
  await connect();
  assert.equal(
    await panel().getByRole("combobox", { name: "Run with", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await panel().getByRole("combobox", { name: "Model", exact: true }).isDisabled(),
    true,
  );
  await send("Reply exactly NATIVE_EXPLICIT_REOPEN_38, no tools.");
  await evidence(second.nativeSessionId, 3, "gpt-4.1", "plan");
  await page.getByRole("tab", { name: "chat 3", exact: true }).click();
  await connect();
  await send("Reply exactly NATIVE_DEFAULT_REOPEN_38, no tools.");
  await evidence(first.nativeSessionId, 3, "gpt-4.1-mini", "build");
  assert.deepEqual(
    (await stored())!.sessions.map((session) => session.nativeSessionId),
    [first.nativeSessionId, second.nativeSessionId],
  );
  assert.equal(
    (await page.evaluate(() => JSON.stringify(sessionStorage))).includes(password),
    false,
  );
  // Native build's real permission flow remains usable with selectors locked.
  await send(
    `Use the write tool to create ${project}/approval38.txt containing APPROVED38. Do not use bash.`,
  );
  await allow();
  try {
    await wait(async () => existsSync(`${project}/approval38.txt`), "real approved write");
  } catch (error) {
    console.log(await panel().innerText());
    throw error;
  }
  await panel().getByRole("button", { name: "Send message", exact: true }).waitFor();
  await send("Use bash to run sleep 60. Do not use other tools.");
  await panel().getByText("1 tool call", { exact: true }).last().waitFor();
  await panel().getByRole("button", { name: "Stop generating", exact: true }).click();
  await panel().getByRole("button", { name: "Send message", exact: true }).waitFor();
  await wait(async () => {
    const statuses = (await client.session.status({}, { throwOnError: true })).data;
    return !statuses[first.nativeSessionId] || statuses[first.nativeSessionId]?.type === "idle";
  }, "cancelled native server session idle");
  assert.equal(requests.filter((request) => request.path.endsWith("/abort")).length, 1);
  console.log("PASS reload mappings/selections, real approval/write and cancellation");
  // Separate disposable server session proves omission inherits an explicit model.
  const probe = (await client.session.create({}, { throwOnError: true })).data;
  for (const model of [{ providerID: "openai", modelID: "gpt-4.1" }, undefined]) {
    await client.session.prompt(
      {
        sessionID: probe.id,
        model,
        noReply: true,
        parts: [{ type: "text", text: "selection semantics only" }],
      },
      { throwOnError: true },
    );
  }
  const probeMessages = (
    await client.session.messages({ sessionID: probe.id }, { throwOnError: true })
  ).data;
  assert.deepEqual(
    probeMessages.map((message) =>
      message.info.role === "user" ? message.info.model.modelID : null,
    ),
    ["gpt-4.1", "gpt-4.1"],
  );
  console.log("PASS real server explicit→omission inherits gpt-4.1; reset requires new session");
} finally {
  await browser.close();
  const processes = spawnSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" })
    .stdout.split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const owned = new Set(children);
  for (let count = 0; count < processes.length; count++) {
    for (const [pid, parent] of processes) if (pid && parent && owned.has(parent)) owned.add(pid);
  }
  for (const pid of [...owned].reverse()) {
    signalOwned(pid, "SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
  for (const pid of owned) {
    signalOwned(pid, "SIGKILL");
  }
  const listeners = spawnSync("ss", ["-ltn", "( sport = :14381 or sport = :14382 )"], {
    encoding: "utf8",
  })
    .stdout.trim()
    .split("\n");
  assert.equal(listeners.length, 1, "owned ports must have no listeners after teardown");
  console.log("PASS owned service teardown; ports 14381/14382 have zero listeners");
}
