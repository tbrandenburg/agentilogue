const { spawnSync } = require("node:child_process");

function supported(version, major, minor, patch) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [actualMajor, actualMinor, actualPatch] = match.slice(1).map(Number);
  return (
    actualMajor === major &&
    (actualMinor > minor || (actualMinor === minor && actualPatch >= patch))
  );
}

function check() {
  if (process.versions.bun || !supported(process.versions.node, 24, 22, 1)) {
    console.error("Node.js >=24.22.1 <25 is required; run this check with Node.js.");
    process.exitCode = 1;
    return;
  }

  const runners = ["bun"];
  if (process.env.npm_config_user_agent?.startsWith("bun/") && process.env.npm_execpath) {
    runners.push(process.env.npm_execpath);
  }
  for (const runner of runners) {
    const result = spawnSync(runner, ["--version"], { encoding: "utf8", timeout: 5000 });
    if (result.error || result.status !== 0 || !supported(result.stdout.trim(), 1, 4, 4)) {
      console.error(`Bun >=1.4.4 <2 is required (failed: ${runner}).`);
      process.exitCode = 1;
      return;
    }
  }
}

if (require.main === module) check();
module.exports = { supported };
