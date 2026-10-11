export type NativeSelection = {
  nativeModel?: { providerID: string; modelID: string };
  nativeAgent?: string;
};

export type NativeCatalog = {
  models: { id: string; name: string; model: NonNullable<NativeSelection["nativeModel"]> }[];
  agents: string[];
};

export const nativeModelId = (model: NonNullable<NativeSelection["nativeModel"]>) =>
  JSON.stringify([model.providerID, model.modelID]);

export function nativeCatalog(
  providers: { connected: string[]; all: { id: string; models: Record<string, { id: string }> }[] },
  agents: { name: string; hidden?: boolean; mode: "primary" | "subagent" | "all" }[],
): NativeCatalog {
  return {
    models: providers.all
      .filter((provider) => providers.connected.includes(provider.id))
      .flatMap((provider) =>
        Object.values(provider.models).map((model) => {
          const pair = { providerID: provider.id, modelID: model.id };
          return { id: nativeModelId(pair), name: `${provider.id}/${model.id}`, model: pair };
        }),
      )
      .sort((left, right) => left.name.localeCompare(right.name)),
    agents: agents
      .filter((agent) => !agent.hidden && agent.mode !== "subagent")
      .map((agent) => agent.name)
      .sort(),
  };
}

export function nativeSelectionAvailable(catalog: NativeCatalog, selection: NativeSelection) {
  const model = selection.nativeModel;
  return (
    (!model || catalog.models.some((option) => option.id === nativeModelId(model))) &&
    (!selection.nativeAgent || catalog.agents.includes(selection.nativeAgent))
  );
}
