import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { getCodexChildEnvironment, getCodexConfig } from "./config";

describe("Codex server-owned configuration", () => {
  const env = {
    NODE_ENV: "test" as const,
    CODEX_ACP_ENABLED: "1",
    AGENT_TRUSTED_LOCAL: "1",
    CODEX_ACP_CWD: process.cwd(),
    CODEX_ACP_EXECUTABLE: process.execPath,
    OPENAI_API_KEY: "synthetic-test-key",
  };
  it("requires opt-in, trusted-local assertion, executable and API-key presence", () => {
    assert.equal(getCodexConfig({ NODE_ENV: "test" }), undefined);
    for (const key of Object.keys(env).filter((key) => key !== "NODE_ENV")) {
      assert.equal(getCodexConfig({ ...env, [key]: undefined }), undefined, key);
    }
    assert.deepEqual(getCodexConfig(env), {
      cwd: process.cwd(),
      executable: process.execPath,
    });
    assert.deepEqual(
      getCodexConfig({ ...env, OPENAI_API_KEY: undefined, CODEX_API_KEY: "synthetic" }),
      getCodexConfig(env),
    );
  });
  it("rejects missing, relative, and wrong-kind server paths", () => {
    for (const executable of ["codex-acp", "/missing-codex-acp", process.cwd()])
      assert.equal(getCodexConfig({ ...env, CODEX_ACP_EXECUTABLE: executable }), undefined);
    for (const cwd of ["relative", "/missing-project", process.execPath])
      assert.equal(getCodexConfig({ ...env, CODEX_ACP_CWD: cwd }), undefined);
  });

  it("passes only required runtime and platform settings, selects one API key, and keeps safe defaults", () => {
    const childEnv = getCodexChildEnvironment({
      NODE_ENV: "test",
      PATH: "/runtime/bin",
      HOME: "/isolated/home",
      CODEX_HOME: "/isolated/codex",
      XDG_CONFIG_HOME: "/isolated/config",
      XDG_DATA_HOME: "/isolated/data",
      XDG_CACHE_HOME: "/isolated/cache",
      XDG_STATE_HOME: "/isolated/state",
      XDG_RUNTIME_DIR: "/isolated/runtime",
      TMPDIR: "/isolated/tmp",
      SYSTEMROOT: "C:\\Windows",
      CODEX_PATH: "/runtime/codex",
      CODEX_API_KEY: "synthetic-codex-key",
      OPENAI_API_KEY: "synthetic-openai-key",
      UNRELATED_PROVIDER_SECRET: "synthetic-canary",
      DATABASE_URL: "synthetic-database-url",
    });

    assert.deepEqual(
      Object.keys(childEnv).sort(),
      [
        "APP_SERVER_LOGS",
        "CODEX_API_KEY",
        "CODEX_HOME",
        "CODEX_PATH",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "XDG_CACHE_HOME",
        "XDG_STATE_HOME",
        "XDG_RUNTIME_DIR",
        "DEFAULT_AUTH_REQUEST",
        "HOME",
        "INITIAL_AGENT_MODE",
        "NODE_ENV",
        "NO_BROWSER",
        "PATH",
        "SYSTEMROOT",
        "TMPDIR",
      ].sort(),
    );
    assert.equal(childEnv.CODEX_API_KEY, "synthetic-codex-key");
    assert.equal(childEnv.NO_BROWSER, "1");
    assert.equal(childEnv.INITIAL_AGENT_MODE, "read-only");
    assert.equal(childEnv.CODEX_PATH, "/runtime/codex");
    assert.equal(childEnv.XDG_CONFIG_HOME, "/isolated/config");
    assert.equal(childEnv.XDG_DATA_HOME, "/isolated/data");
    assert.equal(childEnv.XDG_CACHE_HOME, "/isolated/cache");
    assert.equal(childEnv.XDG_STATE_HOME, "/isolated/state");
    assert.equal(childEnv.XDG_RUNTIME_DIR, "/isolated/runtime");
    assert.equal(childEnv.UNRELATED_PROVIDER_SECRET, undefined);
    assert.equal(childEnv.DATABASE_URL, undefined);
    assert.equal(childEnv.DEFAULT_AUTH_REQUEST, undefined);
    assert.equal(childEnv.APP_SERVER_LOGS, undefined);
  });

  it("supports either API key name and falls back to OPENAI_API_KEY", () => {
    assert.equal(
      getCodexChildEnvironment({ NODE_ENV: "test", CODEX_API_KEY: "codex-only" }).CODEX_API_KEY,
      "codex-only",
    );
    assert.equal(
      getCodexChildEnvironment({ NODE_ENV: "test", OPENAI_API_KEY: "openai-only" }).CODEX_API_KEY,
      "openai-only",
    );
    assert.equal(
      getCodexChildEnvironment({
        NODE_ENV: "test",
        CODEX_API_KEY: "",
        OPENAI_API_KEY: "openai-fallback",
      }).CODEX_API_KEY,
      "openai-fallback",
    );
  });

  it("passes the filtered environment to a real child process", () => {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        "process.stdout.write(JSON.stringify({ path: Boolean(process.env.PATH), key: process.env.CODEX_API_KEY === 'synthetic-key', canary: 'UNRELATED_PROVIDER_SECRET' in process.env, auth: 'DEFAULT_AUTH_REQUEST' in process.env }))",
      ],
      {
        env: getCodexChildEnvironment({
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH,
          CODEX_API_KEY: "synthetic-key",
          UNRELATED_PROVIDER_SECRET: "synthetic-canary",
        }),
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      path: true,
      key: true,
      canary: false,
      auth: false,
    });
  });
});
