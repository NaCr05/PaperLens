export type PaperTerm = {
  term: string;
  translation: string;
};

function cleanJsonAnswer(answer: string) {
  return answer.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export function parsePaperTerms(answer: string): PaperTerm[] {
  const parsed = JSON.parse(cleanJsonAnswer(answer)) as { terms?: Partial<PaperTerm>[] } | Partial<PaperTerm>[];
  const values = Array.isArray(parsed) ? parsed : parsed.terms;
  if (!Array.isArray(values)) throw new Error("AI 没有返回可用的术语结构");

  const seen = new Set<string>();
  const terms = values.flatMap((item) => {
    const term = typeof item.term === "string" ? item.term.trim().replace(/\s+/g, " ") : "";
    const translation = typeof item.translation === "string" ? item.translation.trim().replace(/\s+/g, " ") : "";
    const key = term.toLocaleLowerCase("en-US");
    if (!term || !translation || seen.has(key)) return [];
    seen.add(key);
    return [{ term, translation }];
  }).slice(0, 12);

  if (!terms.length) throw new Error("当前页没有提取到可靠术语");
  return terms;
}
