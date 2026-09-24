#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { detect, readSiteFacts } from "../src/init/detect.mjs";
import { buildLlmsTxt, countTodos } from "../src/init/llms.mjs";
import { apply, buildScriptTag, isJsxLayout, ELEMENT_TAG, LINK_TAG, CSS_GUARD } from "../src/init/apply.mjs";

/**
 * `npx human-machine-swapper init`
 *
 * Non-interactive on purpose. The most common caller is a coding agent that was told "add a
 * human/machine toggle to this site", and a prompt it cannot answer is a hang. Everything
 * is decided from what is on disk; anything undecidable is reported as manual rather than
 * guessed at.
 *
 * Exit codes are meaningful, because an agent reads them:
 *   0  installed, or already installed
 *   1  could not tell what this project is
 *   2  installed, but something needs a human
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(HERE, "../package.json"), "utf8"));
const DOCS = "https://advancelabs.dev/human-machine-swapper";

const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { dim: "\x1b[2m", b: "\x1b[1m", g: "\x1b[32m", y: "\x1b[33m", r: "\x1b[31m", x: "\x1b[0m" }
  : { dim: "", b: "", g: "", y: "", r: "", x: "" };

function usage() {
  console.log(`${C.b}human-machine-swapper${C.x} ${PKG.version}

  npx human-machine-swapper init [options]

Adds the Human/Machine pill to this project: writes a starter llms.txt, declares it,
loads the component, mounts it, and adds the :not(:defined) guard that stops the
element being laid out in flow before the script arrives.

Options
  --dry-run     Show what would change, write nothing
  --latest      Use the floating CDN url instead of pinning this version with an
                integrity hash. Auto-updates, but cannot be verified
  --dir <path>  Project root (default: cwd)
  --help        This

Docs: ${DOCS}`);
}

function parseArgs(argv) {
  // The first NON-flag is the command. Taking argv[0] blindly made `--help` an unknown
  // command, which is the first thing anybody types.
  const args = { cmd: null, dryRun: false, pin: true, dir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || a === "-n") args.dryRun = true;
    else if (a === "--latest") args.pin = false;
    else if (a === "--dir") args.dir = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!a.startsWith("-") && !args.cmd) args.cmd = a;
  }
  return args;
}

/** sha384 of the file this very package will have published. Verifiable, not asserted. */
function integrityOfSelf() {
  try {
    const bytes = readFileSync(join(HERE, "../src/human-machine-swapper.js"));
    return "sha384-" + createHash("sha384").update(bytes).digest("base64");
  } catch {
    return null;
  }
}

function report(actions) {
  const mark = { done: `${C.g}+${C.x}`, skipped: `${C.dim}=${C.x}`, manual: `${C.y}!${C.x}` };
  for (const a of actions) {
    const where = a.file ? ` ${C.dim}${a.file}${C.x}` : "";
    const note = a.note ? ` ${C.dim}(${a.note})${C.x}` : "";
    console.log(`  ${mark[a.status]} ${a.what}${where}${note}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.cmd) {
    usage();
    process.exit(0);
  }
  if (args.cmd !== "init") {
    console.error(`Unknown command "${args.cmd}". Try: npx human-machine-swapper init`);
    process.exit(1);
  }

  const framework = detect(args.dir);
  if (!framework) {
    console.error(`${C.r}Could not tell what kind of project this is.${C.x}

Looked for a Next, Astro, SvelteKit, Nuxt or WordPress project, or an index.html.
Nothing matched, so nothing was changed.

Install it by hand, which is three things:

  1. ${LINK_TAG}
  2. ${buildScriptTag({ pin: false })}
  3. ${ELEMENT_TAG}

and this CSS, which is not optional:

${CSS_GUARD.split("\n").map((l) => "  " + l).join("\n")}

Then make sure the site serves an llms.txt. Full docs: ${DOCS}`);
    process.exit(1);
  }

  const facts = readSiteFacts(args.dir);
  const llmsTxt = buildLlmsTxt(facts, { framework: framework.name });
  const scriptTag = buildScriptTag({
    version: PKG.version,
    integrity: integrityOfSelf(),
    pin: args.pin,
    jsx: isJsxLayout(framework.layout),
  });

  console.log(`\n${C.b}${framework.name}${C.x}${args.dryRun ? `  ${C.y}(dry run, nothing written)${C.x}` : ""}\n`);

  const { actions, wrote } = apply({ dir: args.dir, framework, llmsTxt, scriptTag, dryRun: args.dryRun });
  report(actions);

  const todos = countTodos(llmsTxt);
  const needsHuman = actions.filter((a) => a.status === "manual");
  const wroteLlms = actions.some((a) => a.what === "llms.txt" && a.status === "done");

  console.log("");
  if (wroteLlms && todos) {
    console.log(
      `${C.y}The llms.txt is a starting point and has ${todos} TODO${todos === 1 ? "" : "s"} in it.${C.x}\n` +
        `Machine view shows that file verbatim, so whatever is in it is what an agent reads\n` +
        `about this site. Ten minutes editing it is the whole value of installing this.\n`
    );
  }
  if (needsHuman.length) {
    console.log(`${C.y}${needsHuman.length} thing${needsHuman.length === 1 ? "" : "s"} still need${needsHuman.length === 1 ? "s" : ""} you:${C.x}`);
    for (const a of needsHuman) console.log(`  ! ${a.what}: ${a.note}`);
    console.log("");
  }
  if (args.pin) {
    console.log(
      `${C.dim}Pinned to ${PKG.version} with an integrity hash, so the tag cannot change under you.\n` +
        `Re-run with --latest if you would rather auto-update. Docs: ${DOCS}${C.x}`
    );
  }

  if (args.dryRun) console.log(`\n${C.dim}Dry run. ${wrote.length} file${wrote.length === 1 ? "" : "s"} would change.${C.x}`);
  process.exit(needsHuman.length ? 2 : 0);
}

main();
