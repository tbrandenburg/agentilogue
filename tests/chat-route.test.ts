import assert from "node:assert/strict";
import { it } from "node:test";
import { POST } from "@/app/api/chat/route";

it("rejects invalid explicit models before starting a stream", async () => {
  for (const modelName of ["unknown-model", null, 42, {}, []]) {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [], config: { modelName } }),
      }),
    );

    assert.equal(response.status, 400);
  }
});
