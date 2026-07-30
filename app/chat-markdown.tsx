import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

function normalizeLatexDelimiters(markdown: string) {
  // remark-math understands dollar delimiters. Convert the LaTeX delimiters
  // that assistants commonly emit, while leaving code examples untouched.
  return markdown
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g)
    .map((part, index) => index % 2 === 1 ? part : part
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula: string) => `\n\n$$${formula}$$\n\n`)
      .replace(/\\\(([^\n]*?)\\\)/g, (_match, formula: string) => `$${formula}$`))
    .join("");
}

function MarkdownTable({ children, ...props }: ComponentPropsWithoutRef<"table">) {
  return <div className="chat-markdown-table"><table {...props}>{children}</table></div>;
}

export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          table: MarkdownTable,
          a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
        }}
      >
        {normalizeLatexDelimiters(text)}
      </ReactMarkdown>
    </div>
  );
}
