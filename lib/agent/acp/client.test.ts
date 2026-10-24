import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAcpPrompt } from "./client";

it("uses configured arguments, API-key handshake, no host capabilities and suppresses load replay", async () => {
  const root = await mkdtemp(join(tmpdir(), "acp-client-"));
  const executable = join(root, "agent");
  const trace = join(root, "trace");
  await writeFile(
    executable,
    `#!${process.execPath}
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
const send = value => console.log(JSON.stringify({jsonrpc:'2.0',...value}));
appendFileSync(process.env.TRACE, JSON.stringify({args:process.argv.slice(2)})+'\\n');
createInterface({input:process.stdin}).on('line',line=>{
 const request=JSON.parse(line);
 appendFileSync(process.env.TRACE,JSON.stringify(request)+'\\n');
 let result={};
 if(request.method==='initialize')result={protocolVersion:1,agentCapabilities:{loadSession:true},authMethods:[{id:'api-key',name:'API key'}]};
 if(request.method==='session/new')result={sessionId:'owned-session'};
 if(request.method==='session/load')send({method:'session/update',params:{sessionId:'owned-session',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'historical'}}}});
 if(request.method==='session/prompt'){
  send({method:'session/update',params:{sessionId:'owned-session',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'fresh'}}}});
  result={stopReason:'end_turn'};
 }
 if(request.id!==undefined)send({id:request.id,result});
});
`,
    { mode: 0o700 },
  );
  try {
    const updates: string[] = [];
    for (const args of [[], ["acp"]]) {
      const result = await runAcpPrompt(
        {
          cwd: root,
          executable,
          args,
          env: { NODE_ENV: "test", TRACE: trace },
          authenticate: true,
          providerSessionId: "owned-session",
        },
        "hello",
        {
          onUpdate: (update) =>
            updates.push(
              update.sessionUpdate === "agent_message_chunk" && update.content.type === "text"
                ? update.content.text
                : "unexpected",
            ),
          onPermission: async () => ({ outcome: { outcome: "cancelled" } }),
          onSession: (session) => assert.equal(session, "owned-session"),
        },
      );
      assert.equal(result, "end_turn");
    }
    assert.deepEqual(updates, ["fresh", "fresh"]);
    const requests = (await readFile(trace, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      requests.filter((request) => request.args).map((request) => request.args),
      [[], ["acp"]],
    );
    assert.deepEqual(
      requests
        .filter((request) => request.method === "initialize")
        .map((request) => request.params.clientCapabilities),
      [{}, {}],
    );
    assert.equal(
      requests.filter(
        (request) => request.method === "authenticate" && request.params.methodId === "api-key",
      ).length,
      2,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
