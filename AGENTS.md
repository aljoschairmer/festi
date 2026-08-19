<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Comments

Write code that does not need commentary. The comment budget is close to zero,
and it is spent only where the code genuinely cannot speak.

## The only allowed form is JSDoc

`/** … */` on a declaration. Nothing else:

- No `//` line comments. Not above a line, not at the end of one.
- No `/* … */` block comments.
- No `{/* … */}` in JSX.
- No commented-out code, ever. Delete it; git has it.
- No section banners, no `// --- helpers ---`, no file-header decoration.

Two exceptions, because they are instructions to a tool rather than prose:
`// biome-ignore …` and `// check-colors: allow`. Both must state a reason.

## JSDoc only when it earns its place

Default to none. A well-named function with typed parameters is already
documented. Add JSDoc only when it says something the signature cannot, and
only on an exported symbol:

- A unit or a range the type does not carry: "Seconds, not milliseconds."
  "Null when the job is unknown or expired."
- A constraint the caller must honour: "Combine via `AND`, never by
  spreading."
- A failure mode: "Fails open when the limiter is down."
- A non-obvious *why* behind a value that looks arbitrary: a measured
  contrast ratio, a limit chosen against a specific abuse.

Never write JSDoc that restates the name (`/** Gets the user. */` on
`getUser`), lists the parameters the signature already lists, narrates the
implementation, or records history ("was 30s before", "changed for F-12").
One or two sentences. If it needs three paragraphs, the reasoning belongs in
`AUDIT/` or the commit message, and the code should be simpler.

## Where the reasoning goes instead

Rationale, measurements, benchmark numbers, security analysis and rejected
alternatives belong in the commit message and in `AUDIT/`. That is the record;
the code is not. A reader who wants to know *why* runs `git log -p` or reads
the finding. A reader looking at the code wants to know *what it does*, and
that should be evident from the code.

## When you feel the urge to explain

The urge is a signal that the code is unclear. Fix the code first: rename the
variable, extract the condition into a named function, split the branch, give
the magic number a `const` with a real name. Reach for a comment only after
that has failed.
