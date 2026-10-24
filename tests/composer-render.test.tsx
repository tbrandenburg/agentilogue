import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { AGENT_THREAD_COMPONENTS } from "@/app/opencode-session";
import { Thread, type ThreadComponents } from "@/components/assistant-ui/elements/thread.aui";
import {
  AgentilogueSessionControlsSlot,
  SessionControlsProvider,
} from "@/components/assistant-ui/elements/session-controls-slot";

// Bun's built-in HTML parser keeps structural assertions dependency-free.
type HtmlElement = {
  tagName: string;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
};
type HtmlParser = {
  on(selector: string, handler: { element(element: HtmlElement): void }): HtmlParser;
  transform(response: Response): Response;
};
declare const HTMLRewriter: new () => HtmlParser;

async function elements(html: string, selector: string) {
  const matches: Array<{ tag: string; label: string | null; disabled: boolean }> = [];
  const parser = new HTMLRewriter().on(selector, {
    element(element) {
      matches.push({
        tag: element.tagName,
        label: element.getAttribute("aria-label"),
        disabled: element.hasAttribute("disabled"),
      });
    },
  });
  await parser.transform(new Response(html)).text();
  return matches;
}

function renderThread(
  options: {
    components?: ThreadComponents;
    isRunning?: boolean;
    isSendDisabled?: boolean;
    isDisabled?: boolean;
    canResume?: boolean;
  } = {},
) {
  function Harness() {
    const runtime = useExternalStoreRuntime<ThreadMessageLike>({
      messages: [],
      convertMessage: (message) => message,
      isRunning: options.isRunning ?? false,
      isSendDisabled: options.isSendDisabled ?? false,
      isDisabled: options.isDisabled ?? false,
      ...(options.canResume !== undefined && {
        canResume: options.canResume,
        onResume: async () => {},
      }),
      onNew: async () => {},
      onCancel: async () => {},
    });
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <SessionControlsProvider
          config={{
            projectName: "project",
            openCodeProjectName: "project",
            runTarget: "opencode:cli",
          }}
          hasOpenAIKey={false}
          hasOpenCodeApi
          onChange={() => {}}
        >
          <Thread components={options.components} autoFocus={false} />
        </SessionControlsProvider>
      </AssistantRuntimeProvider>
    );
  }
  return renderToStaticMarkup(<Harness />);
}

describe("released composer slot structure", () => {
  it("keeps stock no-slot markup without an accessory wrapper", async () => {
    const html = renderThread();
    assert.equal((await elements(html, ".aui-composer-action-start")).length, 0);
    assert.equal(
      (await elements(html, ".aui-composer-action-wrapper > .aui-composer-add-attachment")).length,
      1,
    );
    assert.equal((await elements(html, ".aui-composer-send")).length, 1);
    assert.equal((await elements(html, '[aria-label="Run with"]')).length, 0);
  });

  for (const isRunning of [false, true]) {
    it(`keeps the app accessory beside Attach and ${isRunning ? "Cancel" : "Send"} outside it`, async () => {
      assert.equal(AGENT_THREAD_COMPONENTS.ComposerExtra, AgentilogueSessionControlsSlot);
      const html = renderThread({ components: AGENT_THREAD_COMPONENTS, isRunning });
      const children = await elements(html, ".aui-composer-action-start > *");
      assert.deepEqual(
        children.map((element) => [element.tag, element.label]),
        [
          ["button", "Add Attachment"],
          ["div", null],
        ],
      );
      assert.equal(
        (await elements(html, '.aui-composer-action-start > div [aria-label="Run with"]')).length,
        1,
      );
      const action = isRunning ? ".aui-composer-cancel" : ".aui-composer-send";
      assert.equal(
        (await elements(html, `.aui-composer-action-wrapper > div > ${action}`)).length,
        1,
      );
      assert.equal((await elements(html, `.aui-composer-action-start ${action}`)).length, 0);
      assert.equal(
        (await elements(html, isRunning ? ".aui-composer-send" : ".aui-composer-cancel")).length,
        0,
      );
    });
  }

  it("keeps send disabled and offers no Resume without explicit checkpoint support", async () => {
    const html = renderThread({ components: AGENT_THREAD_COMPONENTS, isSendDisabled: true });
    const send = await elements(html, ".aui-composer-send");
    assert.equal(send.length, 1);
    assert.equal(send[0]?.disabled, true);
    assert.equal((await elements(html, ".aui-composer-resume")).length, 0);
    assert.equal((await elements(html, ".aui-composer-input")).at(0)?.disabled, false);
  });

  it("exposes stock Resume only for an enabled checkpoint-capable thread", async () => {
    const resumable = renderThread({ canResume: true });
    assert.equal((await elements(resumable, ".aui-composer-resume")).length, 1);
    assert.equal((await elements(resumable, ".aui-composer-resume")).at(0)?.disabled, false);
    assert.equal((await elements(resumable, ".aui-composer-send")).length, 0);
    const disabled = renderThread({ canResume: true, isDisabled: true });
    assert.equal((await elements(disabled, ".aui-composer-resume")).length, 0);
    assert.equal((await elements(disabled, ".aui-composer-send")).at(0)?.disabled, true);
  });
});
