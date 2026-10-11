"use client";

import { useState } from "react";
import models from "@/data/models.json";
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
import { useAuiState } from "@assistant-ui/react";
import type { SessionControlsConfig } from "@/components/assistant-ui/elements/session-controls";
import { Option, Picker } from "@/components/assistant-ui/elements/session-controls";

export function AiSdkSessionControls({
  config,
  hasOpenAIKey,
  onChange,
}: {
  config: SessionControlsConfig;
  hasOpenAIKey: boolean;
  onChange: (patch: Partial<SessionControlsConfig>) => void;
}) {
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isSubmitting = useAuiState((state) => state.composer.submission !== undefined);
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const modelEnabled =
    config.runTarget === "openai:vercel-ai" && hasOpenAIKey && !isRunning && !isSubmitting;
  const tierModels = Object.entries(models.openai.tiers).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
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

  return (
    <>
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
          className="inline-flex max-w-40 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground/55"
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
    </>
  );
}
