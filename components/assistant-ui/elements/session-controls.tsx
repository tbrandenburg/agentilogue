"use client";

import { Select } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { type ReactNode } from "react";
import { runTargets, type RunTargetId } from "@/lib/run-target";
import { useAuiState } from "@assistant-ui/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { NativeSelection } from "@/lib/native-selection";

export type SessionControlsConfig = NativeSelection & {
  projectName: string;
  openCodeProjectName: string;
  runTarget: RunTargetId | null;
  model?: string;
  nativeSessionId?: string;
};
type Props = {
  config: SessionControlsConfig;
  hasOpenAIKey: boolean;
  hasOpenCodeApi: boolean;
  hasOpenCodeNative?: boolean;
  nativeOpenCodeReason?: string;
  providerControls?: ReactNode;
  onChange: (patch: Partial<SessionControlsConfig>) => void;
};

const buttonClass =
  "inline-flex max-w-40 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground/55";
const popupClass =
  "z-50 min-w-52 max-w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg";
const itemClass =
  "flex cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:cursor-not-allowed data-[disabled]:text-muted-foreground/70";

export function Picker({
  label,
  value,
  disabled,
  hint,
  children,
  formatValue,
  onValueChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  hint?: string;
  children: ReactNode;
  formatValue: (value: string) => string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => onValueChange?.(next ?? "")}
      disabled={disabled}
    >
      <TooltipProvider delay={400}>
        <Tooltip>
          <TooltipTrigger
            disabled={!hint}
            render={
              <span
                className="inline-flex min-w-0"
                tabIndex={disabled && hint ? 0 : undefined}
                aria-label={disabled && hint ? `${label} details` : undefined}
              />
            }
          >
            <Select.Trigger className={buttonClass} aria-label={label}>
              <span className="truncate">
                {label} ·{" "}
                <Select.Value>{(selected) => formatValue(String(selected ?? ""))}</Select.Value>
              </span>
              <ChevronDownIcon className="size-3 shrink-0" />
            </Select.Trigger>
          </TooltipTrigger>
          {hint && <TooltipContent>{hint}</TooltipContent>}
        </Tooltip>
      </TooltipProvider>
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

export function Option({
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

export function SessionControls({
  config,
  hasOpenAIKey,
  hasOpenCodeApi,
  hasOpenCodeNative,
  nativeOpenCodeReason,
  providerControls,
  onChange,
}: Props) {
  const hasMessages = useAuiState((state) => state.thread.messages.length > 0);
  const isNative = config.runTarget === "opencode:native";
  const nativeLocked = hasMessages || Boolean(config.nativeSessionId);
  const projectName =
    config.runTarget === "opencode:cli" || config.runTarget === "opencode:native"
      ? config.openCodeProjectName
      : config.projectName;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1">
      <span className="max-w-40 truncate px-1.5 py-1 text-xs text-muted-foreground">
        Project · {projectName}
      </span>
      <Picker
        label="Run with"
        value={config.runTarget ?? "none"}
        disabled={hasMessages || (isNative && nativeLocked)}
        hint={
          hasOpenCodeNative === false && nativeOpenCodeReason
            ? `opencode · Native unavailable: ${nativeOpenCodeReason}`
            : undefined
        }
        formatValue={(value) =>
          value === "none"
            ? "None"
            : (runTargets.find((runTarget) => runTarget.id === value)?.label ?? value)
        }
        onValueChange={(value) =>
          onChange({
            runTarget: value === "none" ? null : (value as RunTargetId),
            model: undefined,
            nativeModel: undefined,
            nativeAgent: undefined,
          })
        }
      >
        <Option value="none">None</Option>
        {runTargets.map((runTarget) => (
          <Option
            key={runTarget.id}
            value={runTarget.id}
            disabled={
              runTarget.id === "openai:vercel-ai"
                ? !hasOpenAIKey
                : runTarget.id === "opencode:cli"
                  ? !hasOpenCodeApi
                  : runTarget.id === "opencode:native"
                    ? !hasOpenCodeNative
                    : true
            }
          >
            {runTarget.label}
          </Option>
        ))}
      </Picker>
      {providerControls}
    </div>
  );
}
