export function isAbortError(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

export async function runWithCodexRecovery<T, TSettings extends { provider: string }>(options: {
  settings: TSettings;
  codexAvailable: boolean;
  run: (settings: TSettings, repairError: string) => Promise<T>;
  onRepair?: (errorMessage: string) => void;
}) {
  try {
    return { value: await options.run(options.settings, ""), recoveredByCodex: false };
  } catch (error) {
    if (isAbortError(error) || !options.codexAvailable) throw error;
    const errorMessage = error instanceof Error ? error.message : "AI 任务执行失败";
    options.onRepair?.(errorMessage);
    const codexSettings = {
      ...options.settings,
      ...(options.settings.provider !== "local-codex" ? { translationModel: "gpt-5.6-luna", chatModel: "gpt-5.6-sol", translationReasoningEffort: "medium", chatReasoningEffort: "high" } : {}),
      provider: "local-codex",
    } as TSettings;
    return {
      value: await options.run(codexSettings, errorMessage),
      recoveredByCodex: true,
    };
  }
}
