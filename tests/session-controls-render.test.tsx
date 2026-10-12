import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiSdkSessionControls } from "@/components/assistant-ui/elements/ai-sdk-session-controls";
import { NativeOpenCodeSessionControls } from "@/components/assistant-ui/elements/native-opencode-session-controls";
import {
  AgentilogueSessionControlsSlot,
  SessionControlsProvider,
} from "@/components/assistant-ui/elements/session-controls-slot";
import type { SessionControlsConfig } from "@/components/assistant-ui/elements/session-controls";
import type { NativeCatalog } from "@/lib/native-selection";

type RenderOptions = {
  runTarget: SessionControlsConfig["runTarget"];
  providerControls?: ReactNode;
  messages?: ThreadMessageLike[];
  nativeSessionId?: string;
  hasOpenAIKey?: boolean;
  nativeCatalog?: NativeCatalog;
  nativeSelectionReason?: string;
};

const model = { providerID: "openai", modelID: "gpt-5-nano" };
const catalog: NativeCatalog = {
  models: [{ id: '["openai","gpt-5-nano"]', name: "openai/gpt-5-nano", model }],
  agents: ["build", "plan"],
};

function renderControls(options: RenderOptions) {
  const config: SessionControlsConfig = {
    projectName: "test-project",
    openCodeProjectName: "test-project",
    runTarget: options.runTarget,
    ...(options.nativeSessionId ? { nativeSessionId: options.nativeSessionId } : {}),
  };

  function Harness() {
    const runtime = useExternalStoreRuntime<ThreadMessageLike>({
      messages: options.messages ?? [],
      convertMessage: (message) => message,
      onNew: async () => {},
    });

    return createElement(
      AssistantRuntimeProvider,
      { runtime },
      createElement(
        SessionControlsProvider,
        {
          config,
          providerControls: options.providerControls,
          hasOpenAIKey: options.hasOpenAIKey ?? true,
          hasOpenCodeApi: true,
          hasOpenCodeNative: true,
          onChange: () => {},
        },
        createElement(AgentilogueSessionControlsSlot),
      ),
    );
  }

  return renderToStaticMarkup(createElement(Harness));
}

const nativeControls = (options: Partial<RenderOptions> = {}) =>
  createElement(NativeOpenCodeSessionControls, {
    config: {
      projectName: "test-project",
      openCodeProjectName: "test-project",
      runTarget: "opencode:native",
      nativeModel: model,
      nativeAgent: "build",
      ...(options.nativeSessionId ? { nativeSessionId: options.nativeSessionId } : {}),
    },
    catalog: Object.prototype.hasOwnProperty.call(options, "nativeCatalog")
      ? options.nativeCatalog
      : catalog,
    selectionReason: options.nativeSelectionReason,
    onChange: () => {},
  });

describe("provider-local session controls render state", () => {
  it("requires an assistant runtime around provider-specific controls", () => {
    const controls = createElement(AiSdkSessionControls, {
      config: {
        projectName: "test-project",
        openCodeProjectName: "test-project",
        runTarget: "openai:vercel-ai",
      },
      hasOpenAIKey: true,
      onChange: () => {},
    });

    assert.throws(() => renderToStaticMarkup(controls), /AssistantRuntimeProvider|AuiProvider/);
  });

  it("shows no provider selectors for ACP, which has no model or agent selection API", () => {
    const html = renderControls({ runTarget: "opencode:cli" });

    assert.match(html, /Run with/);
    assert.doesNotMatch(html, /aria-label="Agent"/);
    assert.doesNotMatch(html, /aria-label="Model"/);
  });

  it("renders AI SDK model controls only in the AI SDK provider slot", () => {
    const controls = createElement(AiSdkSessionControls, {
      config: {
        projectName: "test-project",
        openCodeProjectName: "test-project",
        runTarget: "openai:vercel-ai",
      },
      hasOpenAIKey: true,
      onChange: () => {},
    });
    const html = renderControls({ runTarget: "openai:vercel-ai", providerControls: controls });

    assert.match(html, /aria-label="Agent"/);
    assert.match(html, /aria-label="Model"/);
  });

  it("shows native catalog options and the saved model/agent selection", () => {
    const html = renderControls({
      runTarget: "opencode:native",
      nativeCatalog: catalog,
      providerControls: nativeControls({ nativeCatalog: catalog }),
    });

    assert.match(html, /aria-label="Agent"/);
    assert.match(html, /value="build"/);
    assert.match(html, /openai\/gpt-5-nano/);
    assert.match(html, /aria-label="Model"/);
  });

  it("keeps native controls disabled while catalog discovery is loading or unavailable", () => {
    const loadingHtml = renderControls({
      runTarget: "opencode:native",
      nativeCatalog: undefined,
      nativeSelectionReason: "Loading opencode models and agents…",
      providerControls: nativeControls({
        nativeCatalog: undefined,
        nativeSelectionReason: "Loading opencode models and agents…",
      }),
    });
    const unavailableHtml = renderControls({
      runTarget: "opencode:native",
      nativeCatalog: undefined,
      nativeSelectionReason: "opencode catalog discovery failed",
      providerControls: nativeControls({
        nativeCatalog: undefined,
        nativeSelectionReason: "opencode catalog discovery failed",
      }),
    });

    assert.match(loadingHtml, /<button(?=[^>]*aria-label="Agent")(?=[^>]*disabled)[^>]*>/);
    assert.match(unavailableHtml, /<button(?=[^>]*aria-label="Model")(?=[^>]*disabled)[^>]*>/);
  });

  it("locks native agent/model selection after a message or restored native session", () => {
    const controls = nativeControls({ nativeCatalog: catalog });
    const firstMessageHtml = renderControls({
      runTarget: "opencode:native",
      messages: [{ id: "user", role: "user", content: "hello" }],
      nativeCatalog: catalog,
      providerControls: controls,
    });
    const restoredSessionHtml = renderControls({
      runTarget: "opencode:native",
      nativeSessionId: "session-restored",
      nativeCatalog: catalog,
      providerControls: nativeControls({
        nativeCatalog: catalog,
        nativeSessionId: "session-restored",
      }),
    });

    assert.match(firstMessageHtml, /<button(?=[^>]*aria-label="Agent")(?=[^>]*disabled)[^>]*>/);
    assert.match(firstMessageHtml, /<button(?=[^>]*aria-label="Model")(?=[^>]*disabled)[^>]*>/);
    assert.match(restoredSessionHtml, /<button(?=[^>]*aria-label="Agent")(?=[^>]*disabled)[^>]*>/);
    assert.match(restoredSessionHtml, /<button(?=[^>]*aria-label="Model")(?=[^>]*disabled)[^>]*>/);
  });
});
