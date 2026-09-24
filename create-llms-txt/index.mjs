#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  detect,
  readSiteFacts,
  findPages,
  buildLlmsTxt,
  countTodos,
  apply,
  buildScriptTag,
  isJsxLayout,
} from "human-machine-swapper/init";

/**
 * `npm create llms-txt`
 *
 * The same machinery as `human-machine-swapper init`, pointed at the question people
 * actually ask. Nobody searches for a human/machine toggle: that category does not exist.
 * They search for how to add an llms.txt, or why AI does not cite their site. So the file
 * is the product here and the pill is the optional last step, which is the order the demand
 * runs in.
 *
 * Writes the llms.txt whatever happens. The pill is offered, never assumed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8"));
const DOCS = "https://advancelabs.dev/human-machine-swapper";

const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { dim: "\x1b[2m", b: "\x1b[1m", g: "\x1b[32m", y: "\x1b[33m", r: "\x1b[31m", x: "\x1b[0m" }
  : { dim: "", b: "", g: "", y: "", r: "", x: "" };

function usage() {
  console.log(`${C.b}create-llms-txt${C.x} ${PKG.version}

  npm create llms-txt

Writes an llms.txt for this site: the plain-text reading language models use when
they answer questions about you. Reads your routes, so the file lists what is
actually on the site rather than what the README says about it.

Options
  --no-pill     Only write the llms.txt. Skip the Human/Machine view
  --pill        Add the pill without asking (the default when not a terminal)
  --dry-run     Show what would change, write nothing
  --dir <path>  Project root (default: cwd)
  --help        This

What is llms.txt? https://llmstxt.org`);
}

function parseArgs(argv) {
  const a = { dryRun: false, pill: null, dir: process.cwd(), help: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--dry-run" || v === "-n") a.dryRun = true;
    else if (v === "--no-pill") a.pill = false;
    else if (v === "--pill" || v === "--yes" || v === "-y") a.pill = true;
    else if (v === "--dir") a.dir = argv[++i];
    else if (v === "--help" || v === "-h") a.help = true;
  }
  return a;
}

/**
 * Asks only when there is somebody to ask. An agent running this in CI has no answer to
 * give, and a prompt it cannot answer is a hang, so a non-TTY takes the default.
 */
async function askPill() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `\n  Add a Human/Machine pill so visitors can see it too? ${C.dim}[Y/n]${C.x} `
    );
    return !/^n/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/** sha384 of the component this package depends on, so the tag it writes is verifiable. */
function componentIntegrity() {
  try {
    const require = createRequire(import.meta.url);
    const file = require.resolve("human-machine-swapper");
    return {
      integrity: "sha384-" + createHash("sha384").update(readFileSync(file)).digest("base64"),
      version: JSON.parse(readFileSync(require.resolve("human-machine-swapper/package.json"), "utf8")).version,
    };
  } catch {
    return { integrity: null, version: null };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const framework = detect(args.dir);
  if (!framework) {
    console.error(`${C.r}Could not tell what kind of project this is.${C.x}

Looked for a Next, Astro, SvelteKit, Nuxt or WordPress project, or an index.html.
Nothing matched, so nothing was written.

An llms.txt is a plain text file at the root of your site. Write one by hand:

  # Your Site

  > One sentence on what this is.

  ## About

  A paragraph or two a model can quote.

Save it where your static files are served from, at /llms.txt.
The convention: https://llmstxt.org`);
    process.exit(1);
  }

  const facts = readSiteFacts(args.dir);
  const pages = findPages(args.dir, framework);
  const llmsTxt = buildLlmsTxt(facts, { framework: framework.name, pages });

  console.log(
    `\n${C.b}${framework.name}${C.x}` +
      (pages.length ? `  ${C.dim}${pages.length} page${pages.length === 1 ? "" : "s"} read${C.x}` : "") +
      (args.dryRun ? `  ${C.y}(dry run, nothing written)${C.x}` : "") +
      "\n"
  );

  const wantsPill = args.pill === null ? await askPill() : args.pill;
  const { integrity, version } = componentIntegrity();

  // The file always. The markup only if asked: this command's promise is the llms.txt.
  const framework2 = wantsPill ? framework : { ...framework, layout: null, styles: null };
  const { actions } = apply({
    dir: args.dir,
    framework: framework2,
    llmsTxt,
    scriptTag: buildScriptTag({ version, integrity, jsx: isJsxLayout(framework.layout) }),
    dryRun: args.dryRun,
  });

  const shown = wantsPill ? actions : actions.filter((a) => a.what === "llms.txt");
  const mark = { done: `${C.g}+${C.x}`, skipped: `${C.dim}=${C.x}`, manual: `${C.y}!${C.x}` };
  for (const a of shown) {
    console.log(`  ${mark[a.status]} ${a.what}${a.file ? ` ${C.dim}${a.file}${C.x}` : ""}${a.note ? ` ${C.dim}(${a.note})${C.x}` : ""}`);
  }

  const todos = countTodos(llmsTxt);
  const wrote = shown.some((a) => a.what === "llms.txt" && a.status === "done");
  console.log("");

  if (wrote && todos) {
    console.log(
      `${C.y}${todos} TODO${todos === 1 ? "" : "s"} left in it.${C.x} This file is what a model reads about you,\n` +
        `so it is worth ten minutes. Everything else here was generated from your routes.\n`
    );
  }
  if (!wantsPill) {
    console.log(`${C.dim}No pill added. Visitors cannot see the file, but crawlers and agents can.\n` +
      `Add it later with: npx human-machine-swapper init${C.x}`);
  } else {
    console.log(`${C.dim}The pill links to the file so people can read it too. Docs: ${DOCS}${C.x}`);
  }

  const needsHuman = shown.filter((a) => a.status === "manual");
  if (needsHuman.length) {
    console.log(`\n${C.y}Needs you:${C.x}`);
    for (const a of needsHuman) console.log(`  ! ${a.what}: ${a.note}`);
  }
  process.exit(needsHuman.length ? 2 : 0);
}

main();
