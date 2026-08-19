import type React from "react";

/**
 * A tiny, dependency-free Markdown renderer that returns React nodes.
 *
 * It intentionally supports only a safe subset (headings, bold, italic, inline
 * code, links, lists, blockquotes, paragraphs) and never uses
 * `dangerouslySetInnerHTML`, so user content cannot inject HTML. Link URLs are
 * restricted to http(s) and mailto schemes.
 */

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

function sanitizeHref(href: string): string | null {
  const trimmed = href.trim();
  return SAFE_LINK.test(trimmed) ? trimmed : null;
}

/** Renders inline markdown (bold, italic, code, links) within a text string. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];

  const pattern =
    /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  match = pattern.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-i${i++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const label = linkMatch?.[1] ?? token;
      const href = linkMatch ? sanitizeHref(linkMatch[2]) : null;
      if (href) {
        nodes.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2 hover:text-primary-hover"
          >
            {label}
          </a>,
        );
      } else {
        nodes.push(label);
      }
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "quote"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; lines: string[] };

/** Groups raw lines into block-level structures. */
function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let current: Block | null = null;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flush();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      if (current?.type === "quote") current.lines.push(quote[1]);
      else {
        flush();
        current = { type: "quote", lines: [quote[1]] };
      }
      continue;
    }

    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (current?.type === "ul") current.items.push(ul[1]);
      else {
        flush();
        current = { type: "ul", items: [ul[1]] };
      }
      continue;
    }

    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      if (current?.type === "ol") current.items.push(ol[1]);
      else {
        flush();
        current = { type: "ol", items: [ol[1]] };
      }
      continue;
    }

    if (current?.type === "p") current.lines.push(line);
    else {
      flush();
      current = { type: "p", lines: [line] };
    }
  }

  flush();
  return blocks;
}

/** Renders a markdown string into safe React nodes. */
export function renderMarkdown(source: string): React.ReactNode {
  const blocks = parseBlocks(source);

  return blocks.map((block, index) => {
    const key = `b${index}`;

    switch (block.type) {
      case "heading": {
        const cls =
          block.level === 1
            ? "mt-4 mb-2 text-xl font-bold first:mt-0"
            : block.level === 2
              ? "mt-3 mb-1.5 text-lg font-semibold first:mt-0"
              : "mt-3 mb-1 text-base font-semibold first:mt-0";
        if (block.level === 1)
          return (
            <h3 key={key} className={cls}>
              {renderInline(block.text, key)}
            </h3>
          );
        if (block.level === 2)
          return (
            <h4 key={key} className={cls}>
              {renderInline(block.text, key)}
            </h4>
          );
        return (
          <h5 key={key} className={cls}>
            {renderInline(block.text, key)}
          </h5>
        );
      }
      case "quote":
        return (
          <blockquote
            key={key}
            className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground italic"
          >
            {renderInline(block.lines.join(" "), key)}
          </blockquote>
        );
      case "ul":
        return (
          <ul key={key} className="my-2 list-disc space-y-1 pl-5">
            {block.items.map((item, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static markdown order
              <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol key={key} className="my-2 list-decimal space-y-1 pl-5">
            {block.items.map((item, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static markdown order
              <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
            ))}
          </ol>
        );
      default:
        return (
          <p key={key} className="my-2 leading-relaxed first:mt-0 last:mb-0">
            {block.lines.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable order
              <span key={i}>
                {i > 0 && <br />}
                {renderInline(line, `${key}-${i}`)}
              </span>
            ))}
          </p>
        );
    }
  });
}
