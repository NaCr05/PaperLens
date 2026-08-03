export type TranslationSource = { id: string };
export type ParsedTranslationSegment = { id: string; translation: string; formulaExplanation: string };

export const MAX_TRANSLATION_REPAIR_ATTEMPTS = 2;

export class TranslationRepairError extends Error {
  missingIds: string[];
  parseError: string;

  constructor(missingIds: string[], parseError = "") {
    super(parseError || `缺少 ${missingIds.length} 个段落`);
    this.name = "TranslationRepairError";
    this.missingIds = missingIds;
    this.parseError = parseError;
  }
}

function repairJsonEscapes(answer: string) {
  const cleaned = answer.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let repaired = "";
  for (let index = 0; index < cleaned.length; index += 1) {
    const character = cleaned[index];
    if (character !== "\\") {
      repaired += character;
      continue;
    }
    const next = cleaned[index + 1] || "";
    const afterNext = cleaned[index + 2] || "";
    const jsonPunctuationEscape = next === '"' || next === "\\" || next === "/";
    const jsonUnicodeEscape = next === "u" && /^[0-9a-fA-F]{4}$/.test(cleaned.slice(index + 2, index + 6));
    const jsonControlEscape = /[bfnrt]/.test(next) && !/[A-Za-z]/.test(afterNext);
    if (jsonUnicodeEscape) {
      repaired += cleaned.slice(index, index + 6);
      index += 5;
    } else if (jsonPunctuationEscape || jsonControlEscape) {
      repaired += `\\${next}`;
      index += 1;
    } else {
      repaired += "\\\\";
    }
  }
  return repaired;
}

export function parseTranslationResponse(answer: string, source: readonly TranslationSource[]) {
  const parsed = JSON.parse(repairJsonEscapes(answer)) as {
    segments?: { id?: string; translation?: string; formulaExplanation?: string }[];
  } | { id?: string; translation?: string; formulaExplanation?: string }[];
  const values = Array.isArray(parsed) ? parsed : parsed.segments;
  if (!Array.isArray(values)) throw new Error("AI 没有返回可同步的段落结构");

  const sourceIds = new Set(source.map((segment) => segment.id));
  const counts = new Map<string, number>();
  for (const item of values) {
    const id = typeof item?.id === "string" ? item.id : "";
    if (sourceIds.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
  }

  const valid = new Map<string, ParsedTranslationSegment>();
  for (const item of values) {
    const id = typeof item?.id === "string" ? item.id : "";
    const translation = typeof item?.translation === "string" ? item.translation.trim() : "";
    if (!sourceIds.has(id) || counts.get(id) !== 1 || !translation) continue;
    valid.set(id, {
      id,
      translation,
      formulaExplanation: typeof item?.formulaExplanation === "string" ? item.formulaExplanation.trim() : "",
    });
  }

  return {
    translated: source.flatMap((segment) => {
      const translation = valid.get(segment.id);
      return translation ? [translation] : [];
    }),
    missingIds: source.filter((segment) => !valid.has(segment.id)).map((segment) => segment.id),
  };
}

export function mergeTranslationBatches(
  source: readonly TranslationSource[],
  batches: readonly (readonly ParsedTranslationSegment[])[],
) {
  const byId = new Map(batches.flat().map((segment) => [segment.id, segment]));
  return source.flatMap((segment) => {
    const translation = byId.get(segment.id);
    return translation ? [translation] : [];
  });
}

export async function completeTranslationWithRepair<TSource extends TranslationSource, TResult extends { answer: string }>(
  source: readonly TSource[],
  invoke: (pending: readonly TSource[], repairAttempt: number, previousFailure: string) => Promise<TResult>,
  onRepair?: (pending: readonly TSource[], repairAttempt: number, previousFailure: string) => void,
) {
  const batches: ParsedTranslationSegment[][] = [];
  const results: TResult[] = [];
  let pending = [...source];
  let previousFailure = "";

  for (let attempt = 0; attempt <= MAX_TRANSLATION_REPAIR_ATTEMPTS; attempt += 1) {
    let result: TResult;
    try {
      result = await invoke(pending, attempt, previousFailure);
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "AbortError") throw error;
      previousFailure = error instanceof Error ? error.message : "AI 任务执行失败";
      if (attempt < MAX_TRANSLATION_REPAIR_ATTEMPTS) {
        onRepair?.(pending, attempt + 1, previousFailure);
        continue;
      }
      throw new TranslationRepairError(pending.map((segment) => segment.id), previousFailure);
    }
    results.push(result);
    try {
      const parsed = parseTranslationResponse(result.answer, pending);
      batches.push(parsed.translated);
      const completedIds = new Set(batches.flat().map((segment) => segment.id));
      pending = source.filter((segment) => !completedIds.has(segment.id));
      previousFailure = pending.length ? `响应缺少 ${pending.length} 个段落：${pending.slice(0, 6).map((segment) => segment.id).join("、")}` : "";
    } catch (error) {
      previousFailure = error instanceof Error ? error.message : "AI 响应不是有效 JSON";
    }

    if (!pending.length) {
      return {
        translated: mergeTranslationBatches(source, batches),
        results,
        repairAttempts: attempt,
      };
    }
    if (attempt < MAX_TRANSLATION_REPAIR_ATTEMPTS) onRepair?.(pending, attempt + 1, previousFailure);
  }

  throw new TranslationRepairError(pending.map((segment) => segment.id), previousFailure);
}
