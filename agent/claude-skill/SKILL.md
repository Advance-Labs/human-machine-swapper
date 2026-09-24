---
name: llms-txt
description: Add or update an llms.txt for a website, and optionally a Human/Machine view pill. Use when asked to publish an llms.txt, make a site readable by AI or by language models, improve AEO or GEO or AI search visibility, or add a human/machine toggle to a site.
---

# llms.txt for a website

## Run the command, do not hand-edit

From the project root:

```bash
npm create llms-txt
```

That is the whole install. It detects the framework, reads the site's own routes, writes the
file, declares it, and offers the pill. Hand-editing gets the CSS guard wrong and invents
routes.

Flags:

- `--dry-run` — show every change, write nothing
- `--no-pill` — write only the `llms.txt`, leave the markup alone
- `--dir <path>` — run against a project elsewhere

## Read the exit code before reporting success

| Code | Meaning |
| --- | --- |
| `0` | Done. |
| `1` | Could not identify the project. **Nothing was changed.** Fall back to the manual install below. |
| `2` | Written, but something needs a human. The output names it. |

It also prints how many `TODO`s remain in the generated file. Say that number in your report
rather than implying the file is finished.

## Then improve the file

The generated `llms.txt` is a starting point and says so in its own text. Machine view shows
it **verbatim**, so it is literally what a model will read about this site. Offer to fill in
the `TODO`s from what you know of the project, and never invent a fact to clear one.

## If the command cannot identify the project

Four things, and the last is the one people skip:

1. `<link rel="llms" href="/llms.txt" />` in the head.
2. `<script src="https://unpkg.com/human-machine-swapper" defer></script>`.
3. `<human-machine-swapper data-position="bottom-center"></human-machine-swapper>` in the body.
4. **This CSS, which is not optional:**

```css
human-machine-swapper:not(:defined) { display: none; }
```

Until the script loads, the browser treats the unknown element as an ordinary in-flow box,
measures it at about 50px tall, and pushes the rest of the page down. A page cannot be styled
by a script that has not loaded, so the host site has to declare this itself.

Note the manual snippet uses the floating CDN url, which cannot carry an integrity hash. The
command writes a **pinned** tag with a `sha384` instead, which is one more reason to prefer
it over hand-editing.

## Rules

- **Never overwrite an existing `llms.txt`.** It is the site's real machine reading and beats
  anything generated.
- **Never add the pill to a site with no `llms.txt`.** It renders nothing by design, and the
  change will look broken to whoever asked for it. Write the file first.
- **Never invent routes.** If you are writing the file by hand, list only pages you have
  confirmed exist.
- A site's `llms.txt` is public. Do not put anything in it that is not already on the site.

## What llms.txt is

A plain-text file at the site root, written for language models rather than people. A
convention, not a standard: <https://llmstxt.org>. No engine is obliged to read it.

Reference: <https://advancelabs.dev/tools/llms-txt/llms.txt>
