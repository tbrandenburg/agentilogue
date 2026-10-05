"use client";

import { Select } from "@base-ui/react/select";
import { Popover } from "@base-ui/react/popover";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import models from "@/data/models.json";

type IntegrationId =
  | "openai:vercel-ai"
  | "opencode:cli"
  | "pi:cli"
  | "codex:cli"
  | "claude-code:cli"
  | "github-copilot:cli";
type Config = {
  projectName: string;
  integration: IntegrationId | null;
  agent?: string;
  model?: string;
  hasMessages: boolean;
};
type Props = {
  config: Config;
  hasOpenAIKey: boolean;
  reason: string;
  onChange: (patch: Partial<Config>) => void;
  onNewSession: () => void;
};

const integrations: { id: IntegrationId; label: string }[] = [
  { id: "openai:vercel-ai", label: "AI SDK · OpenAI" },
  { id: "opencode:cli", label: "opencode" },
  { id: "pi:cli", label: "pi" },
  { id: "codex:cli", label: "codex" },
  { id: "claude-code:cli", label: "claude code" },
  { id: "github-copilot:cli", label: "github copilot" },
];

const buttonClass =
  "inline-flex max-w-40 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground/55";
const popupClass =
  "z-50 min-w-52 max-w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg";
const itemClass =
  "flex cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:cursor-not-allowed data-[disabled]:text-muted-foreground/70";

function Picker({
  label,
  value,
  disabled,
  disabledReason,
  children,
  formatValue,
  onValueChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  disabledReason?: string;
  children: ReactNode;
  formatValue: (value: string) => string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => onValueChange(next ?? "")}
      disabled={disabled}
    >
      <Select.Trigger
        className={buttonClass}
        aria-label={label}
        title={disabled ? (disabledReason ?? `${label} is unavailable`) : label}
      >
        <span className="truncate">
          {label} · <Select.Value>{(selected) => formatValue(String(selected ?? ""))}</Select.Value>
        </span>
        <ChevronDownIcon className="size-3 shrink-0" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="z-50 outline-none" sideOffset={6}>
          <Select.Popup className={popupClass}>
            <Select.List>{children}</Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function Option({
  value,
  children,
  disabled,
}: {
  value: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Select.Item value={value} disabled={disabled} className={itemClass}>
      <Select.ItemText className="min-w-0 flex-1 truncate">{children}</Select.ItemText>
      <Select.ItemIndicator>
        <CheckIcon className="size-3.5" />
      </Select.ItemIndicator>
    </Select.Item>
  );
}

export function SessionControls({ config, hasOpenAIKey, reason, onChange, onNewSession }: Props) {
  const [lockedNotice, setLockedNotice] = useState(false);
  const ready = config.integration === "openai:vercel-ai" && hasOpenAIKey;
  const supported = config.integration === "openai:vercel-ai";
  const suggested = models.openai.tiers;
  const modelOptions = Object.entries(suggested).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );

  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1"
      aria-label="Session configuration"
    >
      <Popover.Root>
        <Popover.Trigger className={buttonClass} title="Project settings">
          <span className="truncate">Project · {config.projectName}</span>
          <ChevronDownIcon className="size-3 shrink-0" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="z-50 outline-none" sideOffset={6}>
            <Popover.Popup className={popupClass}>
              <Popover.Title className="px-2.5 py-2 text-sm font-medium">
                {config.projectName}
              </Popover.Title>
              <Popover.Description className="px-2.5 pb-2 text-xs text-muted-foreground">
                {config.hasMessages
                  ? "Project is fixed for this session."
                  : "This is the server working directory used by /api/chat. Changing it is not supported yet."}
              </Popover.Description>
              <button
                type="button"
                disabled
                className="w-full px-2.5 py-2 text-left text-sm text-muted-foreground"
              >
                Choose folder… · Not implemented
              </button>
              {config.hasMessages && (
                <button
                  type="button"
                  className="w-full px-2.5 py-2 text-left text-sm hover:bg-accent"
                  onClick={onNewSession}
                >
                  Start a new session
                </button>
              )}
              {config.hasMessages && (
                <Popover.Close
                  render={
                    <button
                      type="button"
                      className="w-full px-2.5 py-2 text-left text-sm hover:bg-accent"
                    />
                  }
                >
                  Cancel
                </Popover.Close>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Picker
        label="Integration"
        value={config.integration ?? "none"}
        formatValue={(value) =>
          value === "none"
            ? "None"
            : (integrations.find((integration) => integration.id === value)?.label ?? value)
        }
        onValueChange={(value) => {
          if (config.hasMessages) {
            setLockedNotice(true);
            return;
          }
          onChange({ integration: value === "none" ? null : (value as IntegrationId) });
        }}
      >
        <Option value="none">
          None <span className="text-xs text-muted-foreground">· no backend</span>
        </Option>
        {integrations.map((integration) => (
          <Option key={integration.id} value={integration.id}>
            <span>{integration.label}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {integration.id === "openai:vercel-ai"
                ? hasOpenAIKey
                  ? "Ready"
                  : "Missing API key"
                : "Not implemented yet"}
            </span>
          </Option>
        ))}
      </Picker>
      <Picker
        label="Agent"
        value={config.agent ?? "default"}
        formatValue={(value) => (value === "default" ? "Default" : value)}
        disabled
        disabledReason="Named agents are unavailable on OpenAI."
        onValueChange={(value) => onChange({ agent: value === "default" ? undefined : value })}
      >
        <Option value="default">Default · no override</Option>
        <Option value="unavailable" disabled>
          Agent discovery not implemented
        </Option>
      </Picker>
      <Picker
        label="Model"
        value={config.model ?? "default"}
        formatValue={(value) => (value === "default" ? "Default" : value)}
        disabled={!supported}
        onValueChange={(value) => onChange({ model: value === "default" ? undefined : value })}
      >
        <Option value="default">Default · route model</Option>
        {modelOptions.map(([tier, model]) => (
          <Option key={model} value={model}>
            {tier[0]?.toUpperCase()}
            {tier.slice(1)} · {model}
          </Option>
        ))}
      </Picker>
      {config.integration === "openai:vercel-ai" && hasOpenAIKey && !config.hasMessages && (
        <span className="px-1 text-[11px] text-muted-foreground">
          Auto-selected from OPENAI_API_KEY
        </span>
      )}
      {config.integration === "openai:vercel-ai" && (
        <span className="basis-full px-1 text-xs text-muted-foreground">
          Named agents are unavailable on OpenAI.
        </span>
      )}
      {!supported && (
        <span className="basis-full px-1 text-xs text-muted-foreground">{reason}</span>
      )}
      {supported && !ready && (
        <span className="basis-full px-1 text-xs text-muted-foreground">
          OPENAI_API_KEY is not configured.
        </span>
      )}
      {config.model && (
        <span className="basis-full px-1 text-xs text-muted-foreground">
          Model override is not wired yet.
        </span>
      )}
      {config.hasMessages && (
        <span className="basis-full px-1 text-xs text-muted-foreground">
          Project and Integration are fixed for this session.
        </span>
      )}
      {config.hasMessages && (
        <button
          type="button"
          className="px-1 text-xs underline underline-offset-2"
          onClick={onNewSession}
        >
          Start a new session
        </button>
      )}
      {lockedNotice && (
        <span role="status" className="basis-full px-1 text-xs text-muted-foreground">
          Integration is fixed for this session.{" "}
          <button type="button" className="underline underline-offset-2" onClick={onNewSession}>
            Start a new session
          </button>{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => setLockedNotice(false)}
          >
            Cancel
          </button>
        </span>
      )}
    </div>
  );
}
