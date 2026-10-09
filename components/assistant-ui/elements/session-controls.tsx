"use client";

import { Select } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import models from "@/data/models.json";
import { runTargets, type RunTargetId } from "@/lib/run-target";
import { useAuiState } from "@assistant-ui/react";
import { DEFAULT_OPTION_ID, creatorLabels, modelFromSelectorValue } from "@/lib/model-selection";
import {
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorRoot,
  ModelSelectorTrigger,
  ModelSelectorValue,
  type ModelOption,
} from "@/components/assistant-ui/elements/model-selector";
import { CommandItem } from "@/components/ui/command";

type Config = {
  projectName: string;
  openCodeProjectName: string;
  runTarget: RunTargetId | null;
  model?: string;
};
type Props = {
  config: Config;
  hasOpenAIKey: boolean;
  hasOpenCodeApi: boolean;
  onChange: (patch: Partial<Config>) => void;
};

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
  children,
  formatValue,
  onValueChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
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
      <Select.Trigger className={buttonClass} aria-label={label}>
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

export function SessionControls({ config, hasOpenAIKey, hasOpenCodeApi, onChange }: Props) {
  const hasMessages = useAuiState((state) => state.thread.messages.length > 0);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isSubmitting = useAuiState((state) => state.composer.submission !== undefined);
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const tierModels = Object.entries(models.openai.tiers).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  const modelEnabled =
    config.runTarget === "openai:vercel-ai" && hasOpenAIKey && !isRunning && !isSubmitting;
  const options: ModelOption[] = [
    { id: DEFAULT_OPTION_ID, name: "Default" },
    ...Object.entries(models).flatMap(([creator, catalog]) =>
      catalog.models.map((id) => ({
        id,
        name: id,
        ...(creator !== "openai" || !modelEnabled ? { disabled: true } : {}),
      })),
    ),
  ];
  const tierIds = new Set(tierModels.map(([, id]) => id));
  const modelById = new Map(options.map((option) => [option.id, option]));
  const projectName =
    config.runTarget === "opencode:cli" ? config.openCodeProjectName : config.projectName;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1">
      <span className="max-w-40 truncate px-1.5 py-1 text-xs text-muted-foreground">
        Project · {projectName}
      </span>
      <Picker
        label="Run with"
        value={config.runTarget ?? "none"}
        disabled={hasMessages}
        formatValue={(value) =>
          value === "none"
            ? "None"
            : (runTargets.find((runTarget) => runTarget.id === value)?.label ?? value)
        }
        onValueChange={(value) =>
          onChange({
            runTarget: value === "none" ? null : (value as RunTargetId),
            model: undefined,
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
                  : true
            }
          >
            {runTarget.label}
          </Option>
        ))}
      </Picker>
      <Picker label="Agent" value="default" disabled formatValue={() => "Default"}>
        <Option value="default">Default</Option>
      </Picker>
      <ModelSelectorRoot
        models={options}
        value={config.model ?? DEFAULT_OPTION_ID}
        onValueChange={(value) => onChange({ model: modelFromSelectorValue(value) })}
        onOpenChange={(open) => {
          if (!open) setModelsExpanded(false);
        }}
      >
        <ModelSelectorTrigger
          aria-label="Model"
          disabled={!modelEnabled}
          variant="ghost"
          size="sm"
          className={`${buttonClass} max-w-40`}
        >
          <span className="truncate">Model · </span>
          <ModelSelectorValue placeholder="Default" className="min-w-0 flex-1 [&>span]:truncate" />
        </ModelSelectorTrigger>
        <ModelSelectorContent searchable={false} className="max-h-[min(28rem,calc(100vh-2rem))]">
          <ModelSelectorList className="max-h-[min(28rem,calc(100vh-2rem))] overflow-y-auto">
            <ModelSelectorGroup heading="">
              <ModelSelectorItem model={options[0]!} disabled={!modelEnabled}>
                <span className="truncate">Default</span>
              </ModelSelectorItem>
            </ModelSelectorGroup>
            <ModelSelectorGroup heading="Preconfigured">
              {tierModels.map(([tier, id]) => {
                const model = modelById.get(id);
                if (!model) return null;
                return (
                  <ModelSelectorItem key={tier} model={model} disabled={!modelEnabled}>
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-5">
                      <span className="font-medium capitalize">{tier}</span>
                      <span className="text-muted-foreground truncate text-xs">{id}</span>
                    </span>
                  </ModelSelectorItem>
                );
              })}
            </ModelSelectorGroup>
            <CommandItem
              value="__models_disclosure__"
              onSelect={() => setModelsExpanded((expanded) => !expanded)}
              className="cursor-pointer"
            >
              {modelsExpanded ? "▾ Models" : "▸ Models"}
            </CommandItem>
            {modelsExpanded &&
              Object.entries(models).map(([creator, catalog]) => {
                const catalogOptions = catalog.models
                  .filter((id) => creator !== "openai" || !tierIds.has(id))
                  .map((id) => modelById.get(id))
                  .filter((model): model is ModelOption => model !== undefined);
                if (catalogOptions.length === 0) return null;
                return (
                  <ModelSelectorGroup key={creator} heading={creatorLabels[creator] ?? creator}>
                    {catalogOptions.map((model) => (
                      <ModelSelectorItem key={model.id} model={model} />
                    ))}
                  </ModelSelectorGroup>
                );
              })}
          </ModelSelectorList>
        </ModelSelectorContent>
      </ModelSelectorRoot>
    </div>
  );
}
