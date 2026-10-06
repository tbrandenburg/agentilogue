import assert from "node:assert/strict";
import { it } from "node:test";
import { POST } from "@/app/api/chat/route";
import { DEFAULT_OPTION_ID } from "@/lib/model-selection";

it("rejects invalid explicit models before starting a stream", async () => {
  for (const modelName of ["unknown-model", DEFAULT_OPTION_ID, null, 42, {}, []]) {
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
