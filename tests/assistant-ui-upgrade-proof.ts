// Opt-in, real services/model/browser: bun tests/assistant-ui-upgrade-proof.ts
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { expect } from "playwright/test";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";

const root = process.cwd();
const uiOnly = process.argv.includes("--ui-only");
const ports = [
  Number(process.env.UPGRADE_APP_PORT ?? 14461),
  Number(process.env.UPGRADE_SERVER_PORT ?? 14462),
];
assert.equal(new Set(ports).size, 2, "Proof ports must differ");
for (const port of ports) {
  assert.ok(Number.isInteger(port) && port > 1024 && port <= 65535, "Invalid proof port");
  assert.ok(![3000, 5173, 4096].includes(port), "Shared service ports are forbidden");
}
async function free(port: number) {
  const socket = createServer();
  await new Promise<void>((done, fail) => {
    socket.once("error", fail);
    socket.listen(port, "127.0.0.1", () => socket.close((error) => (error ? fail(error) : done())));
  });
}
await Promise.all(ports.map(free));
const binary = process.env.UPGRADE_OPENCODE_BIN ?? "opencode";
const version = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 10_000 });
assert.equal(version.status, 0, "opencode binary unavailable");
assert.equal(version.stdout.trim(), "1.18.35", "Validate a changed native CLI separately");
const versions = Object.fromEntries(
  [
    "@assistant-ui/react",
    "@assistant-ui/ai-sdk",
    "@assistant-ui/react-opencode",
    "@opencode-ai/sdk",
    "playwright",
    "next",
  ].map((name) => [
    name,
    JSON.parse(readFileSync(resolve(root, "node_modules", name, "package.json"), "utf8"))
      .version as string,
  ]),
);
assert.equal(versions["@opencode-ai/sdk"], "1.18.35");
versions["opencode-cli"] = version.stdout.trim();
const dev = process.env.UPGRADE_APP_MODE === "dev";
if (!dev)
  assert.ok(
    existsSync(resolve(root, ".next/BUILD_ID")),
    "Run bun run build first, or explicitly set UPGRADE_APP_MODE=dev",
  );
const hasKey = Boolean(process.env.OPENAI_API_KEY) && !uiOnly;
console.log(
  JSON.stringify({
    preflight: "passed",
    ports,
    versions,
    modelCredentialsPresent: hasKey,
    mode: dev ? "dev" : "production",
  }),
);
if (process.argv.includes("--preflight")) process.exit(0);

const scratch = mkdtempSync("/tmp/opencode/assistant-ui-upgrade-");
const project = resolve(scratch, "project");
for (const directory of ["project", "home", "config", "data", "state", "cache"])
  mkdirSync(resolve(scratch, directory));
const artifacts = resolve(root, ".playwright-mcp", `issue-46-47-${crypto.randomUUID()}`);
mkdirSync(artifacts, { recursive: true });
const app = `http://127.0.0.1:${ports[0]}`;
const server = `http://127.0.0.1:${ports[1]}`;
const password = crypto.randomUUID();
const config = JSON.stringify({
  model: "openai/gpt-4.1-mini",
  small_model: "openai/gpt-4.1-mini",
  default_agent: "build",
  enabled_providers: ["openai"],
  permission: { edit: "ask", bash: "ask", external_directory: "deny" },
});
writeFileSync(resolve(scratch, "config", "opencode.json"), config, { mode: 0o600 });
const env = {
  ...process.env,
  HOME: resolve(scratch, "home"),
  XDG_CONFIG_HOME: resolve(scratch, "config"),
  XDG_DATA_HOME: resolve(scratch, "data"),
  XDG_STATE_HOME: resolve(scratch, "state"),
  XDG_CACHE_HOME: resolve(scratch, "cache"),
  OPENAI_API_KEY: hasKey ? process.env.OPENAI_API_KEY : "",
  OPENCODE_CONFIG_CONTENT: config,
  OPENCODE_SERVER_PASSWORD: password,
  OPENCODE_SERVER_USERNAME: "opencode",
  OPENCODE_CONFIG: resolve(scratch, "config", "opencode.json"),
  OPENCODE_CONFIG_DIR: resolve(scratch, "config"),
  OPENCODE_NATIVE_ENABLED: "1",
  OPENCODE_NATIVE_URL: server,
  OPENCODE_NATIVE_APP_ORIGIN: app,
  AGENT_API_ENABLED: "1",
  AGENT_TRUSTED_LOCAL: "1",
  OPENCODE_CWD: project,
  OPENCODE_EXECUTABLE: binary,
};
const client = createOpencodeClient({
  baseUrl: server,
  headers: { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` },
});
const owned: ChildProcess[] = [];
const results: { name: string; status: string; at: string }[] = [];
let browser: Browser | undefined;
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
function record(name: string, status: string) {
  results.push({ name, status, at: new Date().toISOString() });
  writeFileSync(
    resolve(artifacts, "report.json"),
    JSON.stringify({ versions, mode: dev ? "dev" : "production", results }, null, 2),
  );
  console.log(`${status}: ${name}`);
}
function start(command: string, args: string[], cwd: string, label: string) {
  const log = openSync(resolve(scratch, `${label}.log`), "w", 0o600);
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", log, log] });
  closeSync(log);
  child.on("error", () => record(`${label} launch failed; inspect private log`, "BROKEN"));
  assert.ok(child.pid, `${label} has no owned PID`);
  owned.push(child);
}
function signal(pid: number, value: NodeJS.Signals) {
  try {
    process.kill(pid, value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}
let cleaning: Promise<void> | undefined;
const cleanup = () => (cleaning ??= stopOwned());
async function stopOwned() {
  await browser?.close().catch(() => {
    record("Browser close failed; service teardown continues", "BROKEN");
    process.exitCode = 1;
  });
  // Capture descendants before signalling: ACP children may establish their own group.
  const listing = spawnSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8", timeout: 5000 });
  if (listing.status !== 0) {
    record(
      "Descendant enumeration failed; stopping captured groups but cleanup proof is incomplete",
      "BROKEN",
    );
    process.exitCode = 1;
  }
  const rows = (listing.stdout ?? "")
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const descendants = new Set(owned.flatMap((child) => (child.pid ? [child.pid] : [])));
  for (let pass = 0; pass < rows.length; pass++) {
    for (const [pid, parent] of rows)
      if (pid && parent && descendants.has(parent)) descendants.add(pid);
  }
  for (const child of owned) if (child.pid) signal(-child.pid, "SIGTERM");
  for (const pid of [...descendants].reverse()) signal(pid, "SIGTERM");
  await delay(2000);
  for (const child of owned) if (child.pid) signal(-child.pid, "SIGKILL");
  for (const pid of descendants) signal(pid, "SIGKILL");
  await expect
    .poll(
      () =>
        [...descendants].every((pid) => {
          try {
            process.kill(pid, 0);
            return false;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
            throw error;
          }
        }),
      { timeout: 10_000, message: "Captured owned PIDs must be absent after teardown" },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        try {
          await Promise.all(ports.map(free));
          return true;
        } catch {
          return false;
        }
      },
      { timeout: 10_000, message: "Owned proof ports must be free after teardown" },
    )
    .toBe(true);
  if (listing.status === 0)
    record("Owned service groups/descendants stopped; proof ports free", "WORKING");
}
for (const event of ["SIGINT", "SIGTERM"] as const)
  process.once(event, () => {
    record(`Interrupted by ${event}`, "BROKEN");
    void cleanup().finally(() => process.exit(1));
  });
async function ready(url: string, authenticated = false) {
  await expect
    .poll(
      async () => {
        try {
          return (
            await fetch(url, {
              headers: authenticated
                ? {
                    Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
                  }
                : {},
              signal: AbortSignal.timeout(2000),
            })
          ).ok;
        } catch {
          return false;
        }
      },
      { timeout: 120_000, intervals: [500], message: "Owned service startup deadline" },
    )
    .toBe(true);
}

try {
  start(
    binary,
    ["serve", "--pure", "--hostname", "127.0.0.1", "--port", String(ports[1]), "--cors", app],
    project,
    "server",
  );
  start(
    "node",
    [
      resolve(root, "node_modules/next/dist/bin/next"),
      dev ? "dev" : "start",
      ...(dev ? ["--webpack"] : []),
      "--hostname",
      "127.0.0.1",
      "--port",
      String(ports[0]),
    ],
    root,
    "app",
  );
  await ready(`${server}/global/health`, true);
  await ready(app);
  assert.equal((await client.global.health()).data?.version, "1.18.35");
  browser = await chromium.launch({
    headless: true,
    ...(process.env.UPGRADE_BROWSER_CHANNEL
      ? { channel: process.env.UPGRADE_BROWSER_CHANNEL }
      : {}),
  });
  versions.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const mutations: {
    path: string;
    kind?: string;
    conversation?: string;
    model?: unknown;
    agent?: unknown;
  }[] = [];
  const failures: number[] = [];
  const errors: string[] = [];
  page.on("pageerror", () => errors.push("browser page error"));
  page.on("request", (request) => {
    if (!["POST", "PATCH", "DELETE", "PUT"].includes(request.method())) return;
    const url = new URL(request.url());
    if (![app, server].includes(url.origin)) return;
    const body = request.postDataJSON() as {
      kind?: string;
      conversationId?: string;
      config?: { modelName?: string };
      model?: unknown;
      agent?: unknown;
    } | null;
    mutations.push({
      path: url.pathname,
      kind: body?.kind,
      conversation: body?.conversationId,
      model: body?.config?.modelName ?? body?.model,
      agent: body?.agent,
    });
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      /\/api\/(chat|agent)|prompt_async|\/abort$|\/permission\/.*\/reply$/.test(response.url())
    )
      failures.push(response.status());
  });
  const panel = () => page.getByRole("tabpanel").filter({ visible: true });
  const input = () => panel().getByRole("textbox", { name: "Message input", exact: true });
  const sendButton = () => panel().getByRole("button", { name: "Send message", exact: true });
  const stopButton = () => panel().getByRole("button", { name: "Stop generating", exact: true });
  const assistant = () => panel().locator('[data-role="assistant"]').last();
  const count = (path: string, kind?: string) =>
    mutations.filter(
      (entry) => entry.path.endsWith(path) && (kind === undefined || entry.kind === kind),
    ).length;
  async function pick(label: string, name: string) {
    await panel().getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name, exact: true }).click();
  }
  async function send(text: string) {
    const turns = panel().locator('[data-role="assistant"]');
    const previous = await turns.count();
    // Retry controlled-input activation, never the mutation-producing send action.
    await expect(async () => {
      await expect(input()).toBeEditable();
      await input().fill(text);
      await expect(input()).toHaveValue(text);
      await expect(sendButton()).toBeEnabled();
    }).toPass({ timeout: 30_000 });
    await sendButton().click();
    await expect(turns).toHaveCount(previous + 1, { timeout: 120_000 });
    return turns.nth(previous);
  }
  async function idle() {
    await expect(stopButton()).toHaveCount(0, { timeout: 120_000 });
    await expect(
      panel().getByRole("button", { name: /^(Send message|Resume generating)$/ }),
    ).toBeVisible({ timeout: 120_000 });
  }
  async function reply(marker: string) {
    await expect(assistant().locator('[data-slot="aui_assistant-message-content"]')).toHaveText(
      marker,
      { timeout: 120_000 },
    );
    await idle();
  }
  async function screenshot(name: string) {
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      "Page has horizontal overflow",
    );
    await page.screenshot({
      path: resolve(artifacts, `${name}.png`),
      fullPage: true,
      mask: [page.locator('input[type="password"]')],
    });
  }
  async function layout(name: string) {
    await expect(input()).toBeVisible();
    const shell = panel().locator('[data-slot="aui_composer-shell"]');
    for (const label of ["Run with", "Model", "Agent"]) {
      const control = shell.getByRole("combobox", { name: label, exact: true });
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      assert.ok(
        box && box.x >= 0 && box.x + box.width <= 391,
        `${label} overflows narrow viewport`,
      );
    }
    await expect(shell.getByText(/^Project · /)).toBeVisible();
    const attachment = shell.getByRole("button", { name: "Add Attachment", exact: true });
    await expect(attachment).toBeVisible();
    assert.equal(
      await attachment.evaluate((element) => {
        const controls = element
          .closest(".aui-composer-action-wrapper")
          ?.querySelector('[aria-label="Run with"]');
        return Boolean(
          controls && element.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
      true,
      "Session controls must follow Attach in the same composer action rail",
    );
    const bounds = await shell.boundingBox();
    assert.ok(
      bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391,
      "Composer overflows narrow viewport",
    );
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      "Page has horizontal overflow",
    );
    await input().click();
    for (let tab = 0; tab < 12; tab++) {
      await page.keyboard.press("Tab");
      if (
        await panel()
          .getByRole("combobox", { name: "Run with", exact: true })
          .evaluate((element) => element === document.activeElement)
      )
        break;
    }
    await expect(panel().getByRole("combobox", { name: "Run with", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(input()).not.toBeFocused();
    const padding = await shell.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const point = { x: bounds.x + bounds.width / 2, y: bounds.y + 4 };
      return { ...point, hitsShell: document.elementFromPoint(point.x, point.y) === element };
    });
    assert.equal(
      padding.hitsShell,
      true,
      "Blank-padding click must hit shell, not a child control",
    );
    await page.mouse.click(padding.x, padding.y);
    await expect(input()).toBeFocused();
    await screenshot(name);
  }
  async function newSession(target?: string) {
    await page.getByRole("button", { name: "New session", exact: true }).click();
    if (target) await pick("Run with", target);
  }
  async function connect(value = password) {
    await panel().getByLabel("opencode server password", { exact: true }).fill(value);
    await panel().getByRole("button", { name: "Connect to opencode", exact: true }).click();
  }
  async function approval(turn: ReturnType<typeof assistant>, label: string) {
    const group = turn.getByRole("button", { name: /^\d+ tool calls?$/ }).last();
    await expect(group).toBeVisible({ timeout: 120_000 });
    if ((await group.getAttribute("aria-expanded")) === "false") await group.click();
    await expect(group).toHaveAttribute("aria-expanded", "true");
    const button = turn.getByRole("button", { name: label, exact: true });
    await expect(button).toBeVisible({ timeout: 120_000 });
    await expect(button).toBeEnabled();
    return button;
  }
  async function allow(turn: ReturnType<typeof assistant>, label = "Allow") {
    const button = await approval(turn, label);
    await button.click();
    await expect(
      turn.locator('[data-slot="tool-fallback-approval-receipt"][data-outcome="allowed"]').last(),
    ).toBeVisible();
  }

  await page.goto(app);
  await pick("Run with", "None");
  await layout("none-mobile");
  const beforeNone = mutations.length;
  await expect(panel().getByRole("button", { name: "Resume generating", exact: true })).toHaveCount(
    0,
  );
  const suggestion = panel().getByRole("button", { name: /What can you help me with\?/ });
  await expect(suggestion).toBeVisible();
  if (await suggestion.isEnabled()) await suggestion.click();
  await input().fill("NONE_MUST_NOT_SEND");
  await expect(sendButton()).toBeDisabled();
  await input().press("Enter");
  await delay(1000);
  assert.equal(mutations.length, beforeNone, "None must issue no network mutation");
  await expect(panel().locator('[data-role="assistant"]')).toHaveCount(0);
  await input().fill("");
  await pick("Run with", "opencode · Native");
  await connect("deliberately-wrong-proof-password");
  await expect(panel().getByRole("alert")).toContainText("opencode rejected the password");
  assert.equal(count("/prompt_async"), 0);
  await screenshot("native-rejected-auth");
  record(
    "None send policy/no mutation, narrow composer keyboard/layout, native rejected auth",
    "WORKING",
  );

  if (!hasKey) {
    record(
      "AI SDK/ACP/native model runs blocked: inherited OPENAI_API_KEY missing or --ui-only requested",
      "NOT TESTED",
    );
    if (!uiOnly) process.exitCode = 1;
  } else {
    await panel().getByRole("button", { name: "Choose another runtime", exact: true }).click();
    await pick("Run with", "AI SDK · OpenAI");
    await panel().getByRole("combobox", { name: "Model", exact: true }).click();
    await page.getByText("▸ Models", { exact: true }).click();
    await page.getByRole("option", { name: "gpt-4.1-mini", exact: true }).click();
    await layout("ai-ready-mobile");
    const aiTab = await page.getByRole("tab", { selected: true }).getAttribute("id");
    assert.ok(aiTab);
    await suggestion.click();
    await expect(assistant().locator('[data-slot="aui_assistant-message-content"]')).not.toBeEmpty({
      timeout: 120_000,
    });
    await idle();
    assert.equal(count("/api/chat"), 1, "Welcome suggestion must send exactly once");
    assert.equal(mutations.find((entry) => entry.path === "/api/chat")?.model, "gpt-4.1-mini");
    const chooser = page.waitForEvent("filechooser");
    await panel().getByRole("button", { name: "Add Attachment", exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: "upgrade-proof.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGP4jwMwDC0JALoev0Ewkwr8AAAAAElFTkSuQmCC",
        "base64",
      ),
    });
    await expect(
      panel().getByRole("button", { name: "Remove upgrade-proof.png", exact: true }),
    ).toBeVisible();
    await send("Reply exactly ATTACHMENT_46_47. Do not describe the attached image.");
    await reply("ATTACHMENT_46_47");
    await send(
      "Begin with STREAMING_46_47 on its own line. Then write a detailed 4000-word tutorial on implementing a red-black tree, including complete Python code, rotation algorithms, deletion cases, and worked examples. Do not summarize or omit the implementation.",
    );
    await expect(assistant()).toContainText("STREAMING_46_47", { timeout: 120_000 });
    await expect(stopButton()).toBeVisible();
    await expect(panel().getByRole("combobox", { name: "Model", exact: true })).toBeDisabled();
    await newSession("opencode");
    await expect(
      page.getByRole("button", { name: /Cannot close .* while a response is running/ }),
    ).toHaveCount(1);
    assert.equal(await panel().getByText("STREAMING_46_47", { exact: true }).count(), 0);
    await send("Reply exactly ACP_46_47. Do not use tools.");
    await page.locator(`[id="${aiTab}"]`).click();
    await expect(stopButton()).toBeVisible();
    await stopButton().click();
    await idle();
    assert.equal(count("/api/chat"), 3, "Switch/cancel must not resend AI prompts");
    record(
      "AI SDK suggestion once, effective model, real image send, partial stream, switch while running and cancel",
      "WORKING",
    );

    await page.getByRole("tab", { name: "chat 2", exact: true }).click();
    await reply("ACP_46_47");
    assert.equal(await panel().getByText("ATTACHMENT_46_47", { exact: true }).count(), 0);
    const acpWrite = await send(
      `Use the write tool to create ${project}/acp-approved.txt containing exactly ACP_APPROVED_46_47. Do not use bash.`,
    );
    await allow(acpWrite, "Allow once");
    await expect
      .poll(() => existsSync(resolve(project, "acp-approved.txt")), { timeout: 120_000 })
      .toBe(true);
    assert.equal(
      readFileSync(resolve(project, "acp-approved.txt"), "utf8").trim(),
      "ACP_APPROVED_46_47",
    );
    await idle();
    const acpCancel = await send("Use bash to run sleep 60. Do not use other tools.");
    const pending = await approval(acpCancel, "Allow once");
    const decisions = count("/api/agent", "permission.respond");
    await stopButton().click();
    await idle();
    await expect(acpCancel).toContainText("opencode confirmed this run was cancelled.");
    await expect(pending).toHaveCount(0);
    await expect(
      acpCancel.locator('[data-slot="tool-fallback-approval-receipt"][data-outcome="closed"]'),
    ).toBeVisible();
    assert.equal(
      count("/api/agent", "permission.respond"),
      decisions,
      "Cancellation must not answer the pending approval",
    );
    assert.equal(count("/api/agent", "cancel"), 1);
    assert.equal(count("/api/agent", "permission.respond"), 1);
    const conversations = new Set(
      mutations.filter((entry) => entry.path === "/api/agent").map((entry) => entry.conversation),
    );
    assert.equal(conversations.size, 1, "ACP controls must retain their conversation owner");
    assert.ok(!conversations.has(undefined));
    assert.ok(
      mutations
        .filter((entry) => entry.path === "/api/agent")
        .every((entry) => entry.model === undefined && entry.agent === undefined),
      "AI SDK selection must not leak into ACP requests",
    );
    await screenshot("acp-cancel-mobile");
    record("ACP real text, approved write/receipt, cancellation and control ownership", "WORKING");

    await newSession("opencode · Native");
    await connect();
    await expect(panel().getByRole("combobox", { name: "Model", exact: true })).toBeEnabled();
    await pick("Model", "openai/gpt-4.1-mini");
    await pick("Agent", "build");
    await send("Reply exactly NATIVE_46_47. Do not use tools.");
    await reply("NATIVE_46_47");
    const stored = () =>
      page.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem("agentilogue:native-sessions:v1") ?? "null") as {
            sessions: { nativeSessionId: string; title: string }[];
          } | null,
      );
    await expect.poll(async () => (await stored())?.sessions.length).toBe(1);
    const native = (await stored())!.sessions[0]!;
    const history = await client.session.messages(
      { sessionID: native.nativeSessionId },
      { throwOnError: true },
    );
    const user = history.data.find((entry) => entry.info.role === "user")?.info;
    assert.ok(user?.role === "user");
    assert.deepEqual(user.model, { providerID: "openai", modelID: "gpt-4.1-mini" });
    assert.equal(user.agent, "build");
    const effective = history.data.find((entry) => entry.info.role === "assistant")?.info;
    assert.ok(effective?.role === "assistant");
    assert.equal(effective.providerID, "openai");
    assert.equal(effective.modelID, "gpt-4.1-mini");
    assert.equal(effective.agent, "build");
    assert.equal(effective.error, undefined);
    const generatedTitle = async () =>
      (await client.session.get({ sessionID: native.nativeSessionId }, { throwOnError: true })).data
        .title;
    await expect.poll(generatedTitle, { timeout: 120_000 }).not.toMatch(/^New session/);
    const title = await generatedTitle();
    assert.ok(title.trim().length > 0);
    for (const label of ["Run with", "Model", "Agent"])
      await expect(panel().getByRole("combobox", { name: label, exact: true })).toBeDisabled();
    const nativeWrite = await send(
      `Use the write tool to create ${project}/native-approved.txt containing exactly NATIVE_APPROVED_46_47. Do not use bash.`,
    );
    await allow(nativeWrite);
    await expect
      .poll(() => existsSync(resolve(project, "native-approved.txt")), { timeout: 120_000 })
      .toBe(true);
    assert.equal(
      readFileSync(resolve(project, "native-approved.txt"), "utf8").trim(),
      "NATIVE_APPROVED_46_47",
    );
    await idle();
    const nativeSleep = await send("Use bash to run sleep 60. Do not use other tools.");
    await allow(nativeSleep);
    await expect
      .poll(
        async () => {
          const messages = (
            await client.session.messages(
              { sessionID: native.nativeSessionId },
              { throwOnError: true },
            )
          ).data;
          return messages.some((entry) =>
            entry.parts.some(
              (part) =>
                part.type === "tool" && part.tool === "bash" && part.state.status === "running",
            ),
          );
        },
        { timeout: 120_000 },
      )
      .toBe(true);
    await screenshot("native-active-tool-mobile");
    await stopButton().click();
    await idle();
    await expect
      .poll(
        async () =>
          (await client.session.status({}, { throwOnError: true })).data[native.nativeSessionId]
            ?.type ?? "idle",
        { timeout: 30_000 },
      )
      .toBe("idle");
    assert.equal(count("/abort"), 1);
    const cancelled = (
      await client.session.messages({ sessionID: native.nativeSessionId }, { throwOnError: true })
    ).data.at(-1)?.info;
    assert.ok(cancelled?.role === "assistant");
    // An idle server alone is not completion. Require the warning if no terminal evidence exists.
    if (!cancelled.finish && !cancelled.error)
      await expect(
        panel().getByText(/Outcome unknown — terminal completion could not be confirmed/),
      ).toBeVisible();
    const prompts = count("/prompt_async");
    assert.equal(prompts, 3, "Each native user action must send once");
    assert.equal(count("/session"), 1, "One native app session must create one server session");
    await page.reload();
    assert.equal(
      (await panel().getByLabel("opencode server password", { exact: true }).inputValue()).length,
      0,
      "Password input must be empty after reload",
    );
    await expect(
      panel().getByRole("button", { name: "Choose another runtime", exact: true }),
    ).toBeDisabled();
    const restoredMetadata = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === `/session/${native.nativeSessionId}` &&
        response.status() === 200,
    );
    await connect();
    assert.equal(((await (await restoredMetadata).json()) as { title: string }).title, title);
    await expect(panel().getByText("NATIVE_46_47", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    assert.equal((await stored())!.sessions[0]!.nativeSessionId, native.nativeSessionId);
    assert.equal(await generatedTitle(), title, "Generated server title must survive reload");
    await expect(page.getByRole("tab", { name: native.title, exact: true })).toBeVisible();
    assert.equal(
      count("/prompt_async"),
      prompts,
      "Reload/reconnect must not resend native prompts",
    );
    assert.equal(
      await page.evaluate(
        (secret) =>
          JSON.stringify({ session: { ...sessionStorage }, local: { ...localStorage } }).includes(
            secret,
          ),
        password,
      ),
      false,
      "Native password must not be persisted",
    );
    await screenshot("native-restored-mobile");
    record(
      "Native authenticated catalog/selection, approved write/receipt, active tool cancellation, password re-entry/session/server title restoration without resend",
      "WORKING",
    );
  }
  await newSession();
  await panel().getByRole("combobox", { name: "Run with", exact: true }).click();
  const pi = page.getByRole("option", { name: "pi", exact: true });
  if (await pi.isDisabled()) record("Pi stream/queue/host request: unavailable integration", "N/A");
  else {
    record(
      "Pi is available: add real stream/queue/host request proof before acceptance",
      "NOT TESTED",
    );
    process.exitCode = 1;
  }
  await page.keyboard.press("Escape");
  if (await panel().getByRole("button", { name: "Start voice input", exact: true }).count()) {
    record(
      "Voice control is advertised: real microphone/dictation proof still required",
      "NOT TESTED",
    );
    process.exitCode = 1;
  } else record("Voice/dictation: runtime does not advertise support", "N/A");
  assert.equal(errors.length, 0, "Browser page errors observed");
  assert.deepEqual(failures, [], "Runtime HTTP failures observed");
  writeFileSync(
    resolve(artifacts, "network-counts.json"),
    JSON.stringify(
      {
        mutations: mutations.length,
        chat: count("/api/chat"),
        acp: count("/api/agent"),
        nativePrompts: count("/prompt_async"),
        nativeAborts: count("/abort"),
        runtimeHttpFailures: failures.length,
        pageErrors: errors.length,
      },
      null,
      2,
    ),
  );
  record(
    "Long-outage same-mount recovery: existing limitation, not retested or claimed fixed",
    "NOT TESTED",
  );
} catch (error) {
  const failedPage = browser?.contexts()[0]?.pages()[0];
  if (failedPage)
    await failedPage
      .screenshot({
        path: resolve(artifacts, "failure.png"),
        fullPage: true,
        mask: [failedPage.locator('input[type="password"]')],
      })
      .catch(() => record("Failure screenshot unavailable", "NOT TESTED"));
  record(
    "Browser proof stopped at first failing assertion; acceptance remains incomplete",
    "BROKEN",
  );
  throw error;
} finally {
  await cleanup();
  console.log(
    `Evidence: ${artifacts.slice(root.length + 1)}/report.json; private service logs: ${scratch}`,
  );
}
