import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCodexConfig } from "./config";

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
});
