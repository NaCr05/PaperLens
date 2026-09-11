import katex from "katex";
import type { PageSegment, SyncRect } from "./page-segmentation";
import { recoverTranslationNewlines } from "./markdown-math.ts";

export type VisualBlock = { translation: string; sourceText: string; rects: SyncRect[] };
export type VisualTranslation = {
  id: string; translation: string; formulaExplanation: string; visualBlocks?: VisualBlock[];
};

export function parseVisualBlocks(value: unknown): VisualBlock[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.length > 80) throw new Error("视觉对应区块数量无效");
  return value.map((block) => {
    if (typeof block?.translation !== "string" || !block.translation.trim()
      || typeof block?.sourceText !== "string" || !block.sourceText.trim()
      || !Array.isArray(block?.rects) || !block.rects.length || block.rects.length > 80) {
      throw new Error("视觉区块缺少译文、原文或位置");
    }
    const rects = block.rects.map((rect: SyncRect) => {
      if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
        || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
        || rect.x + rect.width > 1.001 || rect.y + rect.height > 1.001) throw new Error("视觉区块坐标超出页面");
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    return { translation: block.translation.trim(), sourceText: block.sourceText.trim(), rects };
  });
}

function bounds(rects: SyncRect[]) {
  const x = Math.min(...rects.map(r => r.x));
  const y = Math.min(...rects.map(r => r.y));
  return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x,
    height: Math.max(...rects.map(r => r.y + r.height)) - y };
}

function mathText(latex: string) {
  try {
    return katex.renderToString(latex, { output: "mathml", throwOnError: true, strict: "ignore" })
      .replace(/<annotation[\s\S]*?<\/annotation>/g, "").replace(/<[^>]*>/g, "")
      .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  } catch { return ""; }
}

function signature(text: string) {
  const counts = new Map<string, number>();
  for (const char of text.normalize("NFKC").replace(/[′’]/g, "'").replace(/−/g, "-").replace(/[\s{}()[\]|\u0000-\u001f]/g, "")) {
    counts.set(char, (counts.get(char) || 0) + 1);
  }
  return counts;
}
function similarity(left: string, right: string) {
  const a = signature(left), b = signature(right);
  let intersection = 0;
  for (const [char, count] of a) intersection += Math.min(count, b.get(char) || 0);
  const total = [...a.values(), ...b.values()].reduce((sum, n) => sum + n, 0);
  return total ? 2 * intersection / total : 0;
}

/** Preserve display math while splitting cached Markdown into readable units. */
export function splitVisualTranslation(text: string): string[] {
  const math: string[] = [];
  const protectedText = recoverTranslationNewlines(text).replace(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g, (match) => {
    math.push(match); return `\n\n@@PLMATH${math.length - 1}@@\n\n`;
  }).replace(/\n(?=#{1,6} )/g, "\n\n");
  const units = protectedText.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const result: string[] = [];
  let heading = false;
  for (const unit of units) {
    const restored = unit.replace(/@@PLMATH(\d+)@@/g, (_, i) => math[Number(i)]);
    if (/^@@PLMATH\d+@@$/.test(unit) && heading && result.length) {
      result[result.length - 1] += `\n\n${restored}`;
    } else {
      result.push(restored);
      heading = /^#{2,6} /.test(unit);
    }
  }
  return result;
}

type SourceGroup = { segments: PageSegment[]; math: string };
function sourceFormulaGroups(source: PageSegment[]): SourceGroup[] {
  const groups: SourceGroup[] = [];
  let group: SourceGroup | undefined;
  for (const segment of source) {
    if (!segment.rects.length) continue;
    const rect = bounds(segment.rects);
    if (rect.y < .12 || rect.y > .92) { group = undefined; continue; }
    const prose = /[A-Za-z]{3,}/.test(segment.text) && segment.kind !== "formula";
    const previous = group?.segments.at(-1);
    const previousRect = previous && bounds(previous.rects);
    const sameColumn = previousRect && Math.abs((previousRect.x + previousRect.width / 2) - (rect.x + rect.width / 2)) < .24;
    if (!group || !sameColumn || (prose && group.math)) {
      group = { segments: [], math: "" }; groups.push(group);
    }
    group.segments.push(segment);
    if (!prose) group.math += ` ${segment.text}`;
  }
  return groups.filter(group => group.math.includes("="));
}

/** Recover old formula-page links locally, only when a unique strong match exists. */
export function alignCachedVisualTranslation(text: string, source: PageSegment[]): VisualBlock[] {
  const units = splitVisualTranslation(text);
  const groups = sourceFormulaGroups(source);
  const used = new Set<SourceGroup>();
  const all = source.filter(s => s.rects.length);
  return units.map(translation => {
    const formulas = [...translation.matchAll(/\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g)]
      .map(match => mathText(match[1] || match[2])).join(" ");
    let matched: PageSegment[] = [];
    if (formulas.trim()) {
      const candidates = groups.filter(group => !used.has(group))
        .map(group => ({ group, score: similarity(formulas, group.math) })).sort((a, b) => b.score - a.score);
      const best = candidates[0];
      if (best && best.score >= .88 && best.score - (candidates[1]?.score || 0) >= .12) {
        matched = best.group.segments; used.add(best.group);
      }
    } else if (/^# /.test(translation)) {
      const titles = all.filter(s => bounds(s.rects).y < .12);
      if (titles.length === 1) matched = titles;
    } else {
      const words = translation.match(/[A-Za-z][A-Za-z\d]{2,}/g) || [];
      if (words.length >= 2) {
        const candidates = all.filter(s => words.every(word => s.text.includes(word)));
        if (candidates.length === 1) matched = candidates;
      }
    }
    const rects = matched.flatMap(s => s.rects);
    return { translation, sourceText: matched.map(s => s.text).join("\n"),
      rects: formulas.trim() && rects.length ? [bounds(rects)] : rects };
  });
}

export function visualPageMapping(page: number, translations: VisualTranslation[], source: PageSegment[]) {
  const visual = translations.length === 1 && translations[0].id === `p${page}-visual` ? translations[0] : undefined;
  if (!visual) return { translations, source };
  const blocks = visual.visualBlocks || alignCachedVisualTranslation(visual.translation, source);
  if (!blocks.length || !blocks.some(block => block.rects.length)) return { translations, source };
  const sources: PageSegment[] = blocks.filter(block => block.rects.length).map(block => ({
    id: `${visual.id}-b${blocks.indexOf(block) + 1}`, text: block.sourceText, kind: "paragraph", rects: block.rects,
  }));
  return {
    source: [...sources, ...source.filter(segment => !segment.rects.every(rect => sources.some(block => block.rects.some(area =>
      rect.x + rect.width / 2 >= area.x && rect.x + rect.width / 2 <= area.x + area.width
      && rect.y + rect.height / 2 >= area.y && rect.y + rect.height / 2 <= area.y + area.height))))],
    translations: blocks.map((block, index) => ({ id: `${visual.id}-b${index + 1}`, translation: block.translation, formulaExplanation: "" })),
  };
}

export function sourceSegmentAtPoint(segments: PageSegment[], x: number, y: number) {
  return segments.find(segment => segment.rects.some(rect => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height));
}
