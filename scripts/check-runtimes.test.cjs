const { test } = require("node:test");
const assert = require("node:assert/strict");
const { supported } = require("./check-runtimes.cjs");

test("runtime version ranges reject older, unverified major and prerelease versions", () => {
  assert.equal(supported("24.22.1", 24, 22, 1), true);
  assert.equal(supported("24.23.0", 24, 22, 1), true);
  assert.equal(supported("24.22.0", 24, 22, 1), false);
  assert.equal(supported("25.0.0", 24, 22, 1), false);
  assert.equal(supported("24.22.1-rc.1", 24, 22, 1), false);
  assert.equal(supported("1.4.4", 1, 4, 4), true);
  assert.equal(supported("1.4.3", 1, 4, 4), false);
  assert.equal(supported("2.0.0", 1, 4, 4), false);
  assert.equal(supported("invalid", 1, 4, 4), false);
});
