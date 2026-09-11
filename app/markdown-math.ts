import katex from "katex";

export function normalizeLatexDelimiters(markdown: string) {
  return markdown
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g)
    .map((part, index) => index % 2 === 1 ? part : part
      // Put display fences on their own lines. Text on an opening fence is
      // metadata, so an expression followed by a newline would disappear.
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula: string) => `\n\n$$\n${formula.trim()}\n$$\n\n`)
      .replace(/\\\(([^\n]*?)\\\)/g, (_match, formula: string) => `$${formula}$`))
    .join("");
}

// Older translation caches could turn JSON newlines before English prose into
// literal backslash-n text. Limit recovery to prose at paragraph boundaries;
// leave math, code, and lowercase LaTeX commands such as \nu untouched.
export function recoverTranslationNewlines(markdown: string) {
  const hasLegacyNewline = /(^|\n)\\n(?=[A-Z\p{Script=Han}])/u.test(markdown);
  return markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)
    .map((part, index) => {
      if (index % 2 === 0) return part.replace(/(^|\n)\\n(?=[A-Z\p{Script=Han}])/gu, "$1\n");
      if (!hasLegacyNewline || !part.startsWith("\\[")) return part;
      const formula = part.slice(2, -2).trim();
      if (!formula.startsWith("\\n")) return part;
      let repaired = formula;
      try {
        katex.renderToString(formula, { throwOnError: true, strict: "ignore" });
        // The historical JSON bug also turned newline + imaginary i into the
        // valid \ni command. This exact damaged prefix is verified against the
        // lecture's source image; preserve legitimate \ni expressions otherwise.
        if (formula.startsWith("\\ni\\hbar")) repaired = formula.slice(2);
      } catch {
        const candidate = formula.slice(2);
        try {
          katex.renderToString(candidate, { throwOnError: true, strict: "ignore" });
          repaired = candidate;
        } catch { /* Leave uncertain content visible for review. */ }
      }
      return `\\[${repaired}\\]`;
    })
    .join("");
}
