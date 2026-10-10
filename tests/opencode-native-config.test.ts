import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOpenCodeNativeAvailability,
  isOpenCodeNativeOriginAllowed,
} from "../lib/opencode-native-config";

describe("OpenCode native server gate", () => {
  const valid = {
    enabled: "1",
    url: "http://127.0.0.1:4096",
    appOrigin: "http://localhost:3000",
  };

  it("permits the explicit trusted-local opt-in with verified loopback configuration", () => {
    assert.deepEqual(getOpenCodeNativeAvailability(valid), {
      enabled: true,
      baseUrl: "http://127.0.0.1:4096",
      appOrigin: "http://localhost:3000",
    });
  });

  it("keeps the native lane unavailable without its explicit opt-in", () => {
    assert.equal(
      getOpenCodeNativeAvailability({ ...valid, enabled: "0" }).enabled,
      false,
    );
  });

  it("rejects server URLs that are not root-only http loopback URLs", () => {
    for (const url of [
      "http://192.168.1.8:4096",
      "https://localhost:4096",
      "http://localhost:4096/subpath",
      "http://user:pass@localhost:4096",
      "http://localhost:4096?x=1",
      "http://localhost:4096#fragment",
      "file:///tmp",
    ]) {
      assert.equal(getOpenCodeNativeAvailability({ ...valid, url }).enabled, false, url);
    }
  });

  it("requires a root-only http loopback app origin without credentials, query, or hash", () => {
    for (const appOrigin of [
      "https://localhost:3000",
      "http://example.com:3000",
      "http://localhost:3000/path",
      "http://localhost:3000?query=1",
      "http://localhost:3000#hash",
      "http://user:pass@localhost:3000",
    ]) {
      assert.equal(
        getOpenCodeNativeAvailability({ ...valid, appOrigin }).enabled,
        false,
        appOrigin,
      );
    }
  });

  it("permits browser requests only when the actual origin exactly matches configuration", () => {
    assert.equal(
      isOpenCodeNativeOriginAllowed("http://localhost:3000", "http://localhost:3000"),
      true,
    );
    assert.equal(
      isOpenCodeNativeOriginAllowed("http://localhost:3000", "http://127.0.0.1:3000"),
      false,
    );
    assert.equal(
      isOpenCodeNativeOriginAllowed("http://localhost:3000", "http://localhost:3001"),
      false,
    );
  });
});
