"use client";

import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "../lib/markdown";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
};

/**
 * A lightweight markdown editor: a formatting toolbar over a textarea plus a
 * live preview tab rendered with the safe {@link renderMarkdown} renderer.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  disabled,
  id,
}: MarkdownEditorProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");

  /** Wraps or inserts markdown syntax around the current selection. */
  const applyWrap = (before: string, after = before, placeholderText = "") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || placeholderText;
    const next =
      value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + before.length;
      el.setSelectionRange(cursor, cursor + selected.length);
    });
  };

  const applyLinePrefix = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  };

  return (
    <div className="min-w-0 rounded-md border border-input">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-input p-1.5">
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            label="Bold"
            disabled={disabled || tab === "preview"}
            onClick={() => applyWrap("**", "**", "bold text")}
          >
            <BoldIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            disabled={disabled || tab === "preview"}
            onClick={() => applyWrap("*", "*", "italic text")}
          >
            <ItalicIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Inline code"
            disabled={disabled || tab === "preview"}
            onClick={() => applyWrap("`", "`", "code")}
          >
            <CodeIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Link"
            disabled={disabled || tab === "preview"}
            onClick={() => applyWrap("[", "](https://)", "label")}
          >
            <LinkIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="List"
            disabled={disabled || tab === "preview"}
            onClick={() => applyLinePrefix("- ")}
          >
            <ListIcon className="size-4" />
          </ToolbarButton>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "write" | "preview")}
        >
          <TabsList className="h-8">
            <TabsTrigger value="write" className="text-xs">
              Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs">
              Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "write" ? (
        <Textarea
          id={textareaId}
          ref={textareaRef}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-40 resize-y rounded-none border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      ) : (
        <div
          className={cn(
            "min-h-40 overflow-x-auto px-3 py-2 text-sm break-words",
            value.trim() === "" && "text-muted-foreground",
          )}
        >
          {value.trim() === "" ? (
            "Nothing to preview yet."
          ) : (
            <div className="text-sm">{renderMarkdown(value)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
