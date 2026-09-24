import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The three edits, applied to whatever the detector found.
 *
 * Everything here is idempotent and additive. `init` runs inside somebody else's
 * repository, so the rules are: never overwrite a file that already has content we did not
 * write, never touch a line we did not add, and when a file does not look the way we
 * expect, report it as manual rather than guessing. A wrong guess here breaks a stranger's
 * layout and reads as our bug.
 */

/**
 * The script tag init writes into somebody else's repository.
 *
 * Pinned with an integrity hash by default, because a floating CDN URL cannot be pinned at
 * all and this command is writing into a repo whose owner never chose to trust unpkg. The
 * hash is computed from the bytes on disk in the very package doing the writing, so it is
 * verifiable rather than asserted. `--latest` opts into auto-updating instead.
 */
export function buildScriptTag({ version, integrity, pin = true, jsx = false }) {
  // JSX is not HTML: React wants crossOrigin, and the lowercase spelling is not the DOM
  // property. Emitting the HTML spelling into a .jsx file is a real bug, not a nit.
  const cross = jsx ? "crossOrigin" : "crossorigin";
  if (!pin || !version || !integrity) {
    return '<script src="https://unpkg.com/human-machine-swapper" defer></script>';
  }
  const src = `https://unpkg.com/human-machine-swapper@${version}/src/human-machine-swapper.js`;
  return (
    `<script\n` +
    `  src="${src}"\n` +
    `  integrity="${integrity}"\n` +
    `  ${cross}="anonymous"\n` +
    `  defer\n` +
    `></script>`
  );
}

/** JSX-flavoured layouts, where attribute spelling differs from HTML. */
export function isJsxLayout(path) {
  return /\.(jsx|tsx)$/.test(path || "") || /\.vue$/.test(path || "");
}
export const LINK_TAG = '<link rel="llms" href="/llms.txt" />';
export const ELEMENT_TAG = '<human-machine-swapper data-position="bottom-center"></human-machine-swapper>';
export const CSS_GUARD = `/* Until the script loads the browser lays this unknown element out in flow, about
   50px tall, and pushes the page down. Added by human-machine-swapper init. */
human-machine-swapper:not(:defined) {
  display: none;
}`;

/** One entry per thing init tried to do, so the CLI can print an honest report. */
const done = (what, file, note) => ({ what, file, status: "done", note });
const skip = (what, file, note) => ({ what, file, status: "skipped", note });
const manual = (what, note) => ({ what, file: null, status: "manual", note });

function read(dir, rel) {
  return readFileSync(join(dir, rel), "utf8");
}

function write(dir, rel, text, { dryRun }) {
  if (dryRun) return;
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

/**
 * Inserts `snippet` on its own line before the first occurrence of `marker`, matching the
 * marker line's indentation so the result does not look bolted on.
 */
function insertBefore(source, marker, snippet) {
  const at = source.indexOf(marker);
  if (at === -1) return null;
  const lineStart = source.lastIndexOf("\n", at) + 1;
  const before = source.slice(lineStart, at);
  const indent = before.match(/^\s*/)[0];

  // Indent every line of the snippet one level in from the closing tag, keeping the
  // snippet's own relative indentation so a multi-line tag's `></script>` does not end up
  // deeper than the tag it closes.
  const body = snippet
    .split("\n")
    .map((l) => (l.trim() ? indent + "  " + l : l))
    .join("\n");

  // Two shapes, and getting this wrong writes broken HTML into somebody's repo.
  //
  // When the closing tag starts its own line, insert a line above it. When it does NOT -
  // `<head><meta /><title>x</title></head>` all on one line - inserting "before the line"
  // puts the tags OUTSIDE the element entirely, above <head>. That is what happened to the
  // first Astro site this ran on. Split the line instead and keep the content inside.
  if (before.trim() === "") {
    return source.slice(0, lineStart) + body + "\n" + source.slice(lineStart);
  }
  return source.slice(0, at) + "\n" + body + "\n" + indent + source.slice(at);
}

/** Already installed? Then there is nothing to do and we say so instead of doubling up. */
const hasElement = (s) => s.includes("<human-machine-swapper");
const hasScript = (s) => s.includes("human-machine-swapper") && /<script[^>]+unpkg\.com\/human-machine-swapper/.test(s);
const hasLink = (s) => /rel=["']llms["']/.test(s);
const hasGuard = (s) => s.includes("human-machine-swapper:not(:defined)");

/**
 * Where `</head>` effectively is for this framework. SvelteKit's app.html has no literal
 * head close in some templates, and WordPress puts wp_head() where the tags belong.
 */
function headMarker(source, frameworkId) {
  if (frameworkId === "sveltekit" && source.includes("%sveltekit.head%")) return "%sveltekit.head%";
  if (frameworkId === "wordpress-theme" && source.includes("wp_head()")) return "<?php wp_head(); ?>";
  if (source.includes("</head>")) return "</head>";
  return null;
}

function bodyMarker(source) {
  if (source.includes("</body>")) return "</body>";
  return null;
}

/**
 * @param {object} opts
 * @param {string} opts.dir         project root
 * @param {object} opts.framework   from detect()
 * @param {string} opts.llmsTxt     generated llms.txt contents
 * @param {string} opts.scriptTag   from buildScriptTag(); pinned + hashed by default
 * @param {boolean} opts.dryRun
 * @returns {{actions: Array, wrote: string[]}}
 */
export function apply({ dir, framework, llmsTxt, scriptTag, dryRun = false }) {
  const SCRIPT = scriptTag || buildScriptTag({ pin: false });
  const actions = [];
  const wrote = [];

  // 1. llms.txt. Never overwritten: an existing one is the site's own machine reading and
  //    is certainly better than anything generated from a README.
  const llmsPath = join(framework.public === "." ? "" : framework.public, "llms.txt").replace(/^\//, "");
  if (existsSync(join(dir, llmsPath))) {
    actions.push(skip("llms.txt", llmsPath, "already exists, left untouched"));
  } else {
    write(dir, llmsPath, llmsTxt, { dryRun });
    wrote.push(llmsPath);
    actions.push(done("llms.txt", llmsPath, "starter file, edit before shipping"));
  }

  // 2. The markup: link, script, element.
  if (!framework.layout) {
    actions.push(manual("markup", "no layout file found; add the link, script and element by hand"));
  } else {
    let source = read(dir, framework.layout);
    const before = source;

    const head = headMarker(source, framework.id);
    if (!head) {
      actions.push(manual("head tags", `no <head> found in ${framework.layout}`));
    } else {
      if (hasLink(source)) {
        actions.push(skip("link rel=llms", framework.layout, "already declared"));
      } else {
        source = insertBefore(source, head, LINK_TAG) ?? source;
        actions.push(done("link rel=llms", framework.layout));
      }
      if (hasScript(source)) {
        actions.push(skip("script tag", framework.layout, "already loaded"));
      } else {
        source = insertBefore(source, head, SCRIPT) ?? source;
        actions.push(done("script tag", framework.layout));
      }
    }

    const body = bodyMarker(source);
    if (hasElement(before)) {
      actions.push(skip("<human-machine-swapper>", framework.layout, "already mounted"));
    } else if (!body) {
      actions.push(manual("element", `no </body> in ${framework.layout}; mount the element by hand`));
    } else {
      source = insertBefore(source, body, ELEMENT_TAG) ?? source;
      actions.push(done("<human-machine-swapper>", framework.layout));
    }

    if (source !== before) {
      write(dir, framework.layout, source, { dryRun });
      wrote.push(framework.layout);
    }
  }

  // 3. The guard. This is the one that silently breaks a layout if it is missing, so when
  //    there is no stylesheet to put it in we inline a <style> rather than skipping it.
  if (framework.styles && existsSync(join(dir, framework.styles))) {
    const css = read(dir, framework.styles);
    if (hasGuard(css)) {
      actions.push(skip(":defined guard", framework.styles, "already present"));
    } else {
      write(dir, framework.styles, css.trimEnd() + "\n\n" + CSS_GUARD + "\n", { dryRun });
      wrote.push(framework.styles);
      actions.push(done(":defined guard", framework.styles));
    }
  } else if (framework.layout) {
    const source = read(dir, framework.layout);
    if (hasGuard(source)) {
      actions.push(skip(":defined guard", framework.layout, "already present"));
    } else {
      const head = headMarker(source, framework.id);
      if (!head) {
        actions.push(manual(":defined guard", "add human-machine-swapper:not(:defined){display:none} to your CSS"));
      } else {
        const styled = insertBefore(source, head, `<style>\n${CSS_GUARD}\n</style>`);
        if (styled) {
          write(dir, framework.layout, styled, { dryRun });
          if (!wrote.includes(framework.layout)) wrote.push(framework.layout);
          actions.push(done(":defined guard", framework.layout, "inlined, no global stylesheet found"));
        } else {
          actions.push(manual(":defined guard", "could not find a place for it"));
        }
      }
    }
  } else {
    actions.push(manual(":defined guard", "add human-machine-swapper:not(:defined){display:none} to your CSS"));
  }

  return { actions, wrote };
}
