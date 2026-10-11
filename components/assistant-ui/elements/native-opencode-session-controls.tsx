"use client";

import { useAuiState } from "@assistant-ui/react";
import { nativeModelId } from "@/lib/native-selection";
import type { NativeCatalog } from "@/lib/native-selection";
import type { SessionControlsConfig } from "@/components/assistant-ui/elements/session-controls";
import { Option, Picker } from "@/components/assistant-ui/elements/session-controls";

export function NativeOpenCodeSessionControls({
  config,
  catalog,
  selectionReason,
  onChange,
}: {
  config: SessionControlsConfig;
  catalog?: NativeCatalog;
  selectionReason?: string;
  onChange: (patch: Partial<SessionControlsConfig>) => void;
}) {
  const hasMessages = useAuiState((state) => state.thread.messages.length > 0);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isSubmitting = useAuiState((state) => state.composer.submission !== undefined);
  const locked = hasMessages || Boolean(config.nativeSessionId);
  const enabled = Boolean(catalog) && !locked && !isRunning && !isSubmitting;
  const hint =
    selectionReason ??
    (!catalog
      ? "Loading opencode models and agents…"
      : "Default delegates to opencode: the agent’s model, otherwise the session/server model. Choices lock after the first message; start a new session to reset them.");

  return (
    <>
      <Picker
        label="Agent"
        hint={hint}
        value={config.nativeAgent ?? ""}
        disabled={!enabled}
        formatValue={(value) => value || "Default"}
        onValueChange={(value) => onChange({ nativeAgent: value || undefined })}
      >
        <Option value="">Default</Option>
        {catalog?.agents.map((agent) => (
          <Option key={agent} value={agent}>
            {agent}
          </Option>
        ))}
      </Picker>
      <Picker
        label="Model"
        hint={hint}
        value={config.nativeModel ? nativeModelId(config.nativeModel) : ""}
        disabled={!enabled}
        formatValue={() =>
          config.nativeModel
            ? `${config.nativeModel.providerID}/${config.nativeModel.modelID}`
            : "Default"
        }
        onValueChange={(value) =>
          onChange({ nativeModel: catalog?.models.find((option) => option.id === value)?.model })
        }
      >
        <Option value="">Default</Option>
        {catalog?.models.map((option) => (
          <Option key={option.id} value={option.id}>
            {option.name}
          </Option>
        ))}
      </Picker>
    </>
  );
}
