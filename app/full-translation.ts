export type TranslationUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
};

export function buildFullTranslationQueue(totalPages: number, currentPage: number, translatedPages: number[]) {
  const translated = new Set(translatedPages);
  const pages = Array.from({ length: Math.max(0, totalPages) }, (_, index) => index + 1);
  const pivot = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
  const prioritized = [
    pivot,
    ...pages.filter((page) => page > pivot),
    ...pages.filter((page) => page < pivot),
  ];
  return prioritized.filter((page, index) => page <= totalPages && !translated.has(page) && prioritized.indexOf(page) === index);
}

export function mergeTranslationUsage(current: TranslationUsage | undefined, next: TranslationUsage | undefined) {
  if (!current) return next;
  if (!next) return current;
  return {
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    totalTokens: current.totalTokens + next.totalTokens,
    cachedTokens: current.cachedTokens + next.cachedTokens,
    reasoningTokens: current.reasoningTokens + next.reasoningTokens,
  };
}
