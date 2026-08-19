#!/usr/bin/env node
/**
 * Fails when a hardcoded palette colour is used where a theme token exists.
 *
 * D-08 found 306 of these across 47 files. They were replaced in one sweep,
 * but a sweep only holds if the next one cannot start: `text-red-500` is
 * shorter to type than `text-primary` and looks right on screen, so it comes
 * back unless something says no.
 *
 * Deliberately narrow: it guards what is actually clean. That means the red
 * palette on text, bg, border, ring and shadow, and nothing else.
 *
 * Two things are out of scope on purpose, both waiting on a design decision
 * rather than an edit:
 *   - the gradient utilities (`from-`/`to-`/`via-`), because the CTA
 *     gradients need the `cta` button variant from D-03 first;
 *   - `text-white` / `bg-black`, because most of those sit on photographs
 *     and map tiles where no token applies. The ones that sit on a red
 *     surface are a separate question — white on `--primary` measures
 *     4.06:1, below AA, where `--primary-foreground` measures 4.79:1 — but
 *     switching them flips every red CTA from white to near-black text.
 *
 * A guard everyone has to bypass guards nothing, so it stays narrow until
 * those land.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const EXTENSIONS = [".ts", ".tsx"];
const PATTERN =
  /\b(?:[a-z-]+:)*(?:text|bg|border|ring|shadow)-red-\d{2,3}(?:\/\d+)?\b/g;

/** Vendored files keep their own palette; app code does not. */
const ALLOWLIST = ["src/components/ui/"];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "generated" || entry === "node_modules") continue;
      yield* walk(path);
    } else if (EXTENSIONS.some((e) => path.endsWith(e))) {
      yield path;
    }
  }
}

const offenders = [];
for (const file of walk(ROOT)) {
  if (ALLOWLIST.some((prefix) => file.startsWith(prefix))) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes("check-colors: allow")) return;
    for (const match of line.matchAll(PATTERN)) {
      offenders.push({ file, line: i + 1, text: match[0] });
    }
  });
}

if (offenders.length === 0) {
  console.log(
    "check-colors: no hardcoded palette colours outside the allowlist",
  );
  process.exit(0);
}

console.error(
  `check-colors: ${offenders.length} hardcoded colour(s); use a theme token ` +
    "(text-primary, hover:text-primary-hover, bg-primary/10, border-primary/20, " +
    "text-destructive) or add `check-colors: allow` to the line with a " +
    "reason.\n",
);
for (const o of offenders) console.error(`  ${o.file}:${o.line}  ${o.text}`);
process.exit(1);
