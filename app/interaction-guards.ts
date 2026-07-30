export function normalizeCommittedPageInput(raw: string, currentPage: number, pageCount: number) {
  const trimmed = raw.trim();
  const parsed = trimmed ? Number(trimmed) : Number.NaN;
  const fallback = Number.isFinite(currentPage) ? Math.trunc(currentPage) : 1;
  const candidate = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  const lastPage = Math.max(1, Number.isFinite(pageCount) ? Math.trunc(pageCount) : 1);
  return Math.min(lastPage, Math.max(1, candidate));
}

export function isImeCompositionEvent(event: { isComposing?: boolean; keyCode?: number }) {
  // Safari can report the composition-confirmation Enter as keyCode 229 even
  // when isComposing has already flipped back to false.
  return event.isComposing === true || event.keyCode === 229;
}

export function isCurrentDocumentGeneration(expected: number, current: number) {
  return expected === current;
}
