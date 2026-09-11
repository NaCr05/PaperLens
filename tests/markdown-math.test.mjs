import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeLatexDelimiters, recoverTranslationNewlines } from "../app/markdown-math.ts";

function render(text) {
  return renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex],
    children: normalizeLatexDelimiters(text),
  }));
}
function annotations(html) {
  return [...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(match => match[1]);
}

test("preserves display formula contents with every surrounding newline layout", () => {
  for (const [before, after] of [["", ""], ["\n", ""], ["", "\n"], ["\n", "\n"]]) {
    const values = annotations(render(`Heading\n\n\\[${before}x'=y-x${after}\\]\n\nFooter`));
    assert.equal(values.length, 1);
    assert.match(values[0], /x.*=y-x/);
  }
});

test("renders multi-line systems without losing their first equation", () => {
  const values = annotations(render(String.raw`\[\begin{aligned}x'&=y-x\\y'&=x-z\end{aligned}\]`));
  assert.equal(values.length, 1);
  assert.match(values[0], /x.*=y-x/);
  assert.match(values[0], /y.*=x-z/);
});

test("recovers the observed lecture cache while preserving valid math and code", () => {
  const text = String.raw`\[\nmy''+\gamma y'+ky=F(t)
\]
\[\ni\hbar\frac{\partial\Psi}{\partial t}=-\frac{\hbar}{2m}\frac{\partial^2\Psi}{\partial x^2}+V\Psi
\]
\[\nx'=\sigma(y-x)
\]
\[\ny'=x(\rho-z)-y
\]
\[\nz'=xy-\beta z
\]
\[\nu=1\]
\[\nabla f=0\]
\nProf. Maximilian Klambauer`;
  const fixed = recoverTranslationNewlines(text);
  const values = annotations(render(fixed));
  assert.equal(values.length, 7);
  assert.ok(values.every(Boolean));
  assert.doesNotMatch(fixed, /\\n(?:my|i\\hbar|x'|y'|z'|Prof)/);
  assert.ok(fixed.includes(String.raw`\nu=1`));
  assert.ok(fixed.includes(String.raw`\nabla f=0`));
  const code = '`\\nExample`\n```tex\n\\[\\nExample\\]\n```';
  assert.equal(normalizeLatexDelimiters(recoverTranslationNewlines(code)), code);
  const valid = String.raw`\[\ni\hbar\]`;
  assert.equal(recoverTranslationNewlines(valid), valid);
});
