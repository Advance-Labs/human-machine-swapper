import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "src/human-machine-swapper.js"), "utf8");
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const AGENTS = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
const LLMS = readFileSync(join(ROOT, "llms.txt"), "utf8");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

/**
 * The one that matters. Anyone who installs from npm into Next, Astro, Nuxt or Remix will
 * import this on the server first, where there is no window and no customElements. If that
 * throws, the component breaks the host's build rather than its own feature.
 */
test("importing it on a server, with no DOM, does not throw", async () => {
  assert.equal(typeof globalThis.window, "undefined", "test is meaningless with a window");
  await import("../src/human-machine-swapper.js");
});

test("it guards on window before touching the registry", () => {
  const body = SOURCE.slice(0, SOURCE.indexOf("\n", SOURCE.indexOf("customElements.get")));
  assert.match(body, /typeof window === "undefined"/);
  assert.ok(
    body.indexOf('typeof window === "undefined"') < body.indexOf("customElements.get"),
    "the window guard has to come first, or the registry lookup runs on the server"
  );
});

test("it registers exactly the element the docs tell people to write", () => {
  assert.match(SOURCE, /customElements\.define\("human-machine-swapper"/);
  assert.match(README, /<human-machine-swapper/);
  assert.match(AGENTS, /<human-machine-swapper/);
});

/**
 * The :defined guard is the single thing a host site must add and the single thing that
 * silently breaks their layout if they skip it. If it ever falls out of one of the three
 * places we tell people about it, an agent reading that file ships a broken page.
 */
test("every doc states the :defined guard", () => {
  const rule = /human-machine-swapper:not\(:defined\)/;
  for (const [name, text] of [
    ["README.md", README],
    ["AGENTS.md", AGENTS],
    ["llms.txt", LLMS],
  ]) {
    assert.match(text, rule, `${name} does not mention the :defined guard`);
  }
});

test("every doc says an llms.txt is required", () => {
  for (const [name, text] of [
    ["README.md", README],
    ["AGENTS.md", AGENTS],
    ["llms.txt", LLMS],
  ]) {
    assert.match(text, /llms\.txt/, `${name} never mentions llms.txt`);
  }
  assert.match(SOURCE, /PROBE_PATHS = \["\/llms\.txt", "\/llms-full\.txt"\]/);
});

test("the credit points at the documented page, and is not nofollowed", () => {
  assert.match(SOURCE, /EMBED_URL = "https:\/\/advancelabs\.dev\/human-machine-swapper"/);
  assert.doesNotMatch(SOURCE, /nofollow/);
});

test("package entry points all resolve to the one source file", () => {
  const entry = "src/human-machine-swapper.js";
  assert.equal(PKG.main, entry);
  assert.equal(PKG.module, entry);
  assert.equal(PKG.unpkg, entry, "unpkg is the URL people paste; it must not drift");
  assert.equal(PKG.jsdelivr, entry);
  assert.equal(PKG.exports["."], `./${entry}`);
});

test("the published tarball carries the files an agent reads", () => {
  for (const f of ["src", "llms.txt", "AGENTS.md", "README.md", "LICENSE"]) {
    assert.ok(PKG.files.includes(f), `${f} is missing from package.json files`);
  }
});
