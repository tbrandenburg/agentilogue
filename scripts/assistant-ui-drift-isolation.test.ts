import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const target = fileURLToPath(new URL("./assistant-ui-drift.test.ts", import.meta.url));

const runFixture = async (mode: "timeout" | "command-timeout" | "failure" | "config") => {
  const directory = await mkdtemp(join(tmpdir(), "drift-git-isolation-"));
  const repositories = await mkdtemp(join(directory, "repositories-"));
  const pid = join(directory, "pid");
  const wrapper = join(directory, "git");
  const config = join(directory, "global.gitconfig");
  const configuration =
    mode === "config" ? "[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = /nonexistent\n" : "";

  try {
    const git = execFileSync("which", ["git"], { encoding: "utf8", timeout: 1000 }).trim();
    // The wrapper executes real Git before injecting a bounded delay or failure.
    // Extra files expose pending cleanup; their count is not a timing guarantee.
    await writeFile(
      wrapper,
      `#!/bin/sh
if [ "$1" = init ]; then echo $$ > ${JSON.stringify(pid)}; fi
${JSON.stringify(git)} "$@" || exit $?
if [ "$1" = init ]; then
  if [ ${JSON.stringify(mode)} != config ]; then
    ${Array.from({ length: 256 }, (_, index) => `echo fixture > cleanup-${index}`).join("\n    ")}
    if [ ${JSON.stringify(mode)} = failure ]; then exit 23; fi
    exec /bin/sleep 2
  fi
fi
`,
    );
    await chmod(wrapper, 0o755);
    const fixture = join(directory, "01-fixture.test.ts");
    const following = join(directory, "02-following.test.ts");
    await writeFile(fixture, `import ${JSON.stringify(target)};\n`);
    await writeFile(
      following,
      `import { it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
it("following file still runs", () => {
  assert.deepEqual(readdirSync(${JSON.stringify(repositories)}), []);
  assert.equal(readFileSync(${JSON.stringify(config)}, "utf8"), ${JSON.stringify(configuration)});
  if (existsSync(${JSON.stringify(pid)})) {
    assert.throws(() => process.kill(Number(readFileSync(${JSON.stringify(pid)}, "utf8")), 0), { code: "ESRCH" });
  }
});
`,
    );
    await writeFile(config, configuration);
    const result = await execute(
      process.execPath,
      [
        "test",
        fixture,
        following,
        "--timeout",
        mode === "timeout" ? "800" : "5000",
        "-t",
        "committed source diff|following file still runs",
      ],
      {
        // Allow runtime startup outside the inner test's own deadline.
        timeout: 8000,
        env: {
          NODE_ENV: "test",
          PATH: `${directory}:${process.env.PATH}`,
          HOME: directory,
          TMPDIR: repositories,
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: config,
        },
      },
    ).then(
      (result) => ({ ...result, code: 0 }),
      (error: unknown) => {
        if (!(error instanceof Error) || !("code" in error) || error.code !== 1) throw error;
        assert.ok("stderr" in error && typeof error.stderr === "string");
        return { code: error.code, stderr: error.stderr };
      },
    );
    assert.deepEqual(await readdir(repositories), []);
    const processId = await readFile(pid, "utf8").catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    });
    if (processId) assert.throws(() => process.kill(Number(processId), 0), { code: "ESRCH" });
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

it(
  "contains a Git fixture runner timeout without breaking the following file",
  { timeout: 10000 },
  async () => {
    const result = await runFixture("timeout");
    assert.equal(result.code, 1);
    assert.match(result.stderr, /timed out after 800ms/);
    assert.match(result.stderr, /1 pass\s+\d+ filtered out\s+1 fail/);
    assert.doesNotMatch(result.stderr, /inside another test\(\)|Unhandled error between tests/);
  },
);

it(
  "contains an ordinary Git fixture failure and cleans its repository",
  { timeout: 10000 },
  async () => {
    const result = await runFixture("failure");
    assert.equal(result.code, 1);
    assert.match(result.stderr, /status: 23/);
    assert.match(result.stderr, /1 pass\s+\d+ filtered out\s+1 fail/);
    assert.doesNotMatch(result.stderr, /inside another test\(\)|Unhandled error between tests/);
  },
);

it(
  "bounds a slow Git command before the runner deadline and runs the following file",
  { timeout: 10000 },
  async () => {
    const result = await runFixture("command-timeout");
    assert.equal(result.code, 1);
    assert.match(result.stderr, /ETIMEDOUT/);
    assert.match(result.stderr, /1 pass\s+\d+ filtered out\s+1 fail/);
    assert.doesNotMatch(result.stderr, /timed out after|Unhandled error between tests/);
  },
);

it("creates real commits despite inherited signing configuration", { timeout: 10000 }, async () => {
  const result = await runFixture("config");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /2 pass\s+\d+ filtered out\s+0 fail/);
});

it("formats in memory without a formatter CLI, PATH lookup, or temporary files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "drift-format-isolation-"));
  const temporary = await mkdtemp(join(directory, "temporary-"));
  const implementation = fileURLToPath(new URL("./assistant-ui-drift.ts", import.meta.url));
  try {
    const result = await execute(
      process.execPath,
      [
        "--eval",
        `import { formattedDigest } from ${JSON.stringify(implementation)};
console.log(await formattedDigest('const answer="ready";', "thread.tsx"));`,
      ],
      {
        timeout: 3000,
        env: { NODE_ENV: "test", PATH: "/nonexistent", HOME: directory, TMPDIR: temporary },
      },
    );
    assert.equal(
      result.stdout.trim(),
      createHash("sha256").update('const answer = "ready";\n').digest("hex"),
    );
    assert.deepEqual(await readdir(temporary), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
