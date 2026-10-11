import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, openSync, closeSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";

// Real processes, SDK, runtime and model; no browser routes or fabricated server events.
const appPort = Number(process.env.RECOVERY_APP_PORT ?? 14371);
const serverPort = Number(process.env.RECOVERY_SERVER_PORT ?? 14372);
const appUrl = `http://127.0.0.1:${appPort}`;
const serverUrl = `http://127.0.0.1:${serverPort}`;
const guidance =
  "Connection could not recover. Reload this page and reconnect by entering the OpenCode server password to restore this session.";
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const root = process.cwd();
const binary = process.env.RECOVERY_OPENCODE_BIN ?? "opencode";
assert.equal(execFileSync(binary, ["--version"], { encoding: "utf8" }).trim(), "1.18.35");
for (const [name, version] of [
  ["@assistant-ui/react-opencode", "0.2.30"],
  ["@opencode-ai/sdk", "1.18.35"],
]) {
  assert.equal(
    JSON.parse(readFileSync(resolve("node_modules", name, "package.json"), "utf8")).version,
    version,
  );
}
assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY must exist; its value is never logged");
for (const port of [appPort, serverPort]) {
  const socket = createServer();
  socket.listen(port, "127.0.0.1");
  await once(socket, "listening");
  await new Promise((done) => socket.close(done));
}
const scratch = mkdtempSync("/tmp/opencode/issue37-recovery-");
const project = resolve(scratch, "project");
mkdirSync(project);
for (const directory of ["home", "config", "data", "state", "cache"])
  mkdirSync(resolve(scratch, directory));
writeFileSync(
  resolve(project, "opencode.json"),
  JSON.stringify({
    model: "openai/gpt-4.1",
    small_model: "openai/gpt-4.1-mini",
    permission: { "*": "allow" },
  }),
);
const password = randomBytes(24).toString("hex");
const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
const owned = [];
function start(command, args, cwd, env, label) {
  const log = openSync(resolve(scratch, `${label}.log`), "a");
  // detached uses setsid(2): a private process group, unrelated to shared services.
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", log, log] });
  closeSync(log);
  owned.push(child);
  console.log("owned process", label, child.pid);
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([once(child, "exit"), delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) {
    process.kill(-child.pid, "SIGKILL");
    await once(child, "exit");
  }
}
async function ready(url, headers = {}) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      /* Startup failures are retried only until the explicit deadline. */
    }
    await delay(250);
  }
  throw new Error(`Startup deadline exceeded: ${url}`);
}
const serverEnv = {
  ...process.env,
  HOME: resolve(scratch, "home"),
  XDG_CONFIG_HOME: resolve(scratch, "config"),
  XDG_DATA_HOME: resolve(scratch, "data"),
  XDG_STATE_HOME: resolve(scratch, "state"),
  XDG_CACHE_HOME: resolve(scratch, "cache"),
  OPENCODE_SERVER_PASSWORD: password,
};
const startServer = () =>
  start(
    binary,
    ["serve", "--hostname", "127.0.0.1", "--port", String(serverPort), "--cors", appUrl],
    project,
    serverEnv,
    "server",
  );
let browser;
try {
  let server = startServer();
  await ready(`${serverUrl}/global/health`, { Authorization: auth });
  const health = await (
    await fetch(`${serverUrl}/global/health`, { headers: { Authorization: auth } })
  ).json();
  assert.equal(health.version, "1.18.35");
  const appEnv = {
    ...process.env,
    OPENAI_API_KEY: "",
    OPENCODE_CWD: project,
    OPENCODE_NATIVE_ENABLED: "1",
    OPENCODE_NATIVE_URL: serverUrl,
    OPENCODE_NATIVE_APP_ORIGIN: appUrl,
  };
  start(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ],
    root,
    appEnv,
    "app",
  );
  await ready(appUrl);
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  console.log("browser version", browser.version());
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const network = [];
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.requestWillBeSent", ({ requestId, request }) => {
    if (!request.url.startsWith(serverUrl)) return;
    network.push({
      id: requestId,
      path: new URL(request.url).pathname,
      method: request.method,
      at: Date.now(),
    });
  });
  cdp.on("Network.responseReceived", ({ requestId, response }) => {
    const entry = network.find((item) => item.id === requestId);
    if (entry)
      Object.assign(entry, {
        status: response.status,
        connection: response.connectionId,
        protocol: response.protocol,
        elapsed: Date.now() - entry.at,
      });
  });
  cdp.on("Network.loadingFailed", ({ requestId, errorText }) => {
    const entry = network.find((item) => item.id === requestId);
    if (entry) entry.failure = errorText;
  });
  const panel = () => page.getByRole("tabpanel").filter({ visible: true });
  async function connect() {
    assert.equal(await panel().getByLabel("OpenCode server password").inputValue(), "");
    await panel().getByLabel("OpenCode server password").fill(password);
    await panel().getByRole("button", { name: "Connect to OpenCode", exact: true }).click();
    await panel().getByRole("button", { name: "Disconnect", exact: true }).waitFor();
    await panel().getByRole("textbox").and(page.locator(":enabled")).waitFor({ timeout: 35000 });
  }
  async function native() {
    await panel().getByRole("combobox", { name: "Run with", exact: true }).click();
    await page.getByRole("option", { name: "OpenCode · Native", exact: true }).click();
    await connect();
  }
  async function prompt(text) {
    await panel().getByRole("textbox").fill(text);
    await panel().getByRole("textbox").press("Enter");
  }
  const mapping = () =>
    page.evaluate(() => JSON.parse(sessionStorage.getItem("agentilogue:native-sessions:v1")));
  const prompts = () =>
    network.filter((entry) => entry.method === "POST" && entry.path.endsWith("/prompt_async"))
      .length;
  await page.goto(appUrl);
  await native();
  await prompt("Reply with only RECOVERY_NORMAL_A.");
  await panel()
    .getByText(/^RECOVERY_NORMAL_A\.?$/)
    .waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await native();
  await prompt("Reply with only RECOVERY_NORMAL_B.");
  await panel()
    .getByText(/^RECOVERY_NORMAL_B\.?$/)
    .waitFor({ timeout: 60000 });
  assert.equal(await page.getByRole("tabpanel", { includeHidden: true }).count(), 2);
  console.log("PASS normal sessions: two keepMounted native panels");
  const idleBegan = Date.now();
  await stop(server);
  await delay(2000);
  server = startServer();
  await ready(`${serverUrl}/global/health`, { Authorization: auth });
  await delay(3000);
  const idlePrompts = prompts();
  await prompt("Reply with only RECOVERY_SHORT_IDLE_OK.");
  try {
    await panel()
      .getByText(/^RECOVERY_SHORT_IDLE_OK\.?$/)
      .waitFor({ timeout: 15000 });
    console.log("PASS short idle outage same-mount continuation", Date.now() - idleBegan);
  } catch (error) {
    if (error.name !== "TimeoutError") throw error;
    console.log(
      "FAIL short idle outage same-mount continuation: no reply within 15s",
      Date.now() - idleBegan,
    );
    assert.equal(prompts(), idlePrompts + 1, "explicit continuation sent once");
    await page.reload();
    await connect();
    await panel()
      .getByText(/^RECOVERY_NORMAL_B\.?$/)
      .waitFor();
    await page.getByRole("tab").first().click();
    await connect();
    await page.getByRole("tab").nth(1).click();
    assert.equal(prompts(), idlePrompts + 1, "reload did not resend continuation");
  }
  for (const outage of [2000, 16000]) {
    const marker = `RECOVERY_PARTIAL_${outage}`;
    await prompt(
      `Say ${marker} first, then use the bash tool to run sleep 90, then say FINISHED. Do not skip the tool.`,
    );
    await panel().getByText(marker, { exact: true }).waitFor({ timeout: 60000 });
    const saved = await mapping();
    const sessionId = saved.sessions.find(
      (session) => session.id === saved.activeId,
    ).nativeSessionId;
    const deadline = Date.now() + 60000;
    let toolRunning = false;
    while (Date.now() < deadline && !toolRunning) {
      const history = await (
        await fetch(`${serverUrl}/session/${sessionId}/message`, {
          headers: { Authorization: auth },
          signal: AbortSignal.timeout(5000),
        })
      ).json();
      toolRunning = history.some((message) =>
        message.parts.some(
          (part) =>
            part.type === "tool" &&
            part.state.status === "running" &&
            part.state.input?.command?.includes("sleep 90"),
        ),
      );
      if (!toolRunning) await delay(250);
    }
    assert.ok(toolRunning, "real sleep tool must be running before server termination");
    const before = prompts();
    const began = Date.now();
    await stop(server);
    await delay(outage);
    if (outage >= 15000) {
      await panel().getByRole("button", { name: "Recheck status", exact: true }).waitFor();
      await panel().getByRole("button", { name: "Recheck status", exact: true }).click();
      await panel().getByText(guidance, { exact: true }).waitFor();
      await panel()
        .getByText(/Outcome unknown.*Retrying the prompt can repeat side effects/)
        .waitFor();
      assert.ok((await panel().innerText()).includes(marker));
      console.log("PASS outage guidance/transcript/unknown", outage, "elapsed", Date.now() - began);
    }
    const restartedAt = Date.now();
    server = startServer();
    await ready(`${serverUrl}/global/health`, { Authorization: auth });
    console.log("outage until healthy", outage, Date.now() - began);
    await panel().getByRole("button", { name: "Recheck status", exact: true }).waitFor();
    await panel().getByRole("button", { name: "Recheck status", exact: true }).click();
    await delay(12000);
    const probe = await page.evaluate(
      async ({ url, authorization }) => {
        const began = performance.now();
        try {
          const response = await fetch(`${url}/global/health`, {
            headers: { Authorization: authorization },
            signal: AbortSignal.timeout(5000),
          });
          return { status: response.status, ms: Math.round(performance.now() - began) };
        } catch (error) {
          return { error: error.name, ms: Math.round(performance.now() - began) };
        }
      },
      { url: serverUrl, authorization: auth },
    );
    const needsRecovery = await panel().getByText(guidance, { exact: true }).count();
    if (needsRecovery) {
      await panel()
        .getByText(/Outcome unknown.*Retrying the prompt can repeat side effects/)
        .waitFor();
      await panel().getByRole("button", { name: "Acknowledge", exact: true }).click();
      await panel().getByText(guidance, { exact: true }).waitFor();
      await panel()
        .getByText(/Outcome unknown.*Retrying the prompt can repeat side effects/)
        .waitFor();
      console.log("PASS failed recheck guidance survives acknowledgement", outage);
    }
    const recent = network.filter((entry) => entry.at >= restartedAt);
    const successful = (path) =>
      recent.some((entry) => entry.path === path && entry.status === 200 && !entry.failure);
    const evidence = {
      healthy: probe.status === 200,
      status: successful("/session/status"),
      history: successful(`/session/${sessionId}/message`),
      events: successful("/event") || successful("/global/event"),
    };
    const sameMountRecovery =
      !needsRecovery && evidence.healthy && evidence.status && evidence.history && evidence.events;
    const alias = await page.evaluate(
      async ({ url, authorization }) => {
        const began = performance.now();
        try {
          const response = await fetch(`${url.replace("127.0.0.1", "localhost")}/global/health`, {
            headers: { Authorization: authorization },
            signal: AbortSignal.timeout(5000),
          });
          return { status: response.status, ms: Math.round(performance.now() - began) };
        } catch (error) {
          return { error: error.name, ms: Math.round(performance.now() - began) };
        }
      },
      { url: serverUrl, authorization: auth },
    );
    console.log(
      "same-mount",
      outage,
      sameMountRecovery
        ? "PASS"
        : needsRecovery
          ? "FAIL: recovery guidance remains"
          : "FAIL/inconclusive: missing positive native reattach evidence",
      JSON.stringify({
        evidence,
        probe,
        alias,
        pending: recent.filter((entry) => !entry.status && !entry.failure).map(({ path }) => path),
        connections: [...new Set(recent.map((entry) => entry.connection).filter(Boolean))],
        sockets: execFileSync("ss", ["-tnH", `dport = :${serverPort}`], { encoding: "utf8" })
          .trim()
          .split("\n")
          .filter(Boolean).length,
      }),
    );
    assert.equal(prompts(), before, "no outage/recheck prompt resend");
    if (outage === 16000 || !sameMountRecovery) {
      await page.reload();
      await connect();
      await panel().getByText(marker, { exact: true }).waitFor({ timeout: 30000 });
      await panel().getByRole("button", { name: "Recheck status", exact: true }).click();
      await panel()
        .getByText(/Outcome unknown.*Retrying the prompt can repeat side effects/)
        .waitFor();
      const recovered = network
        .filter((entry) => entry.path.endsWith("/message") && entry.status === 200)
        .at(-1);
      console.log("restored history HTTP 200 elapsed", recovered?.elapsed);
      assert.deepEqual(await mapping(), saved);
      const storage = await page.evaluate(() =>
        JSON.stringify({ ...sessionStorage, ...localStorage }),
      );
      assert.ok(!storage.includes(password), "password absent from browser storage");
      assert.equal(prompts(), before, "no reload prompt resend");
      console.log("PASS reload/password/session/transcript/unknown/no resend", outage);
      // Reload restores mappings, but each mounted app tab still needs its own password.
      await page.getByRole("tab").first().click();
      await connect();
      await page.getByRole("tab").nth(1).click();
      assert.equal(
        await page
          .getByRole("button", { name: "Disconnect", exact: true, includeHidden: true })
          .count(),
        2,
      );
    }
  }
  console.log(
    "network counts",
    JSON.stringify({
      requests: network.length,
      prompts: prompts(),
      refused: network.filter((entry) => entry.failure === "net::ERR_CONNECTION_REFUSED").length,
      aborted: network.filter((entry) => entry.failure === "net::ERR_ABORTED").length,
      unanswered: network.filter((entry) => !entry.status && !entry.failure).length,
      protocols: [...new Set(network.map((entry) => entry.protocol).filter(Boolean))],
    }),
  );
  console.log(
    "PASS guidance/reload assertions; same-mount investigation results reported separately",
  );
} finally {
  if (browser) await browser.close();
  for (const child of owned.reverse()) await stop(child);
  for (const child of owned) {
    assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
  }
  console.log("PASS exact owned PIDs stopped", owned.map((child) => child.pid).join(","));
  console.log(
    "listeners",
    execFileSync("ss", ["-ltn", `( sport = :${appPort} or sport = :${serverPort} )`], {
      encoding: "utf8",
    }).trim(),
  );
  console.log("disposable logs/profile", scratch);
}
