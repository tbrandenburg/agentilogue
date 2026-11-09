import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { Thread, type ThreadComponents } from "@/components/assistant-ui/elements/thread.aui";

function renderGroup(state: "pending" | "resolved" | "running", components?: ThreadComponents) {
  const messages: ThreadMessageLike[] = [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "write_file",
          args: { path: "example.txt" },
          ...(state !== "running" && {
            approval: { id: "approval-1", ...(state === "resolved" && { approved: true }) },
          }),
          ...(state === "resolved" && { result: "done" }),
        },
      ],
    },
  ];
  function Harness() {
    const runtime = useExternalStoreRuntime<ThreadMessageLike>({
      messages,
      convertMessage: (message) => message,
      isRunning: state === "running",
      onNew: async () => {},
    });
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <Thread components={components} autoFocus={false} />
      </AssistantRuntimeProvider>
    );
  }
  return renderToStaticMarkup(<Harness />);
}

describe("released Thread tool groups", () => {
  it("opens pending approval but closes for a running or resolved call", () => {
    const pending = renderGroup("pending");
    assert.match(
      pending,
      /data-slot="tool-group-trigger"[^>]*aria-expanded="true"|aria-expanded="true"[^>]*data-slot="tool-group-trigger"/,
    );
    assert.match(pending, /write_file/);
    for (const state of ["running", "resolved"] as const) {
      const html = renderGroup(state);
      assert.match(
        html,
        /data-slot="tool-group-trigger"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*data-slot="tool-group-trigger"/,
      );
      assert.doesNotMatch(html, /write_file/);
    }
  });

  it("passes pending and resolved counts to a custom group without imposing the default wrapper", () => {
    const components: ThreadComponents = {
      ToolGroup: ({ group, children }) => (
        <section data-action-count={group.counts.requiresAction}>{children}</section>
      ),
    };
    const pending = renderGroup("pending", components);
    const resolved = renderGroup("resolved", components);
    assert.match(pending, /data-action-count="1"/);
    assert.match(resolved, /data-action-count="0"/);
    assert.doesNotMatch(pending, /data-slot="tool-group-trigger"/);
    assert.match(pending, /write_file/);
  });
});
