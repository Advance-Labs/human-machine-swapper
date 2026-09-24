import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detect, readSiteFacts } from "../src/init/detect.mjs";
import { buildLlmsTxt, countTodos } from "../src/init/llms.mjs";
import { apply, buildScriptTag, isJsxLayout } from "../src/init/apply.mjs";

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "hms-init-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return dir;
}

const NEXT_LAYOUT = `export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>{children}</body>
    </html>
  );
}
`;

const HTML = `<!doctype html>
<html>
  <head>
    <title>Bramble Coffee</title>
    <meta name="description" content="Small-batch coffee." />
  </head>
  <body><h1>Hi</h1></body>
</html>
`;

test("detects a Next App Router project and its three insertion points", () => {
  const dir = fixture({
    "next.config.mjs": "export default {};",
    "app/layout.jsx": NEXT_LAYOUT,
    "app/globals.css": "body{}",
  });
  const f = detect(dir);
  assert.equal(f.id, "next-app");
  assert.equal(f.layout, "app/layout.jsx");
  assert.equal(f.styles, "app/globals.css");
  assert.equal(f.public, "public");
});

test("detects a static HTML site", () => {
  const dir = fixture({ "index.html": HTML });
  const f = detect(dir);
  assert.equal(f.id, "html");
  assert.equal(f.layout, "index.html");
});

test("returns null rather than guessing at an unknown project", () => {
  const dir = fixture({ "main.py": "print('hi')" });
  assert.equal(detect(dir), null);
});

/**
 * Detection is by FILE, never by dependency name. A project can list next in
 * devDependencies without being a Next app, and guessing wrong puts the :defined guard in
 * a stylesheet nothing imports, which breaks a stranger's layout silently.
 */
test("a package.json mentioning next does not make it a Next project", () => {
  const dir = fixture({
    "package.json": JSON.stringify({ devDependencies: { next: "15.0.0" } }),
    "index.html": HTML,
  });
  assert.equal(detect(dir).id, "html");
});

test("reads site facts from html title and meta description first", () => {
  const dir = fixture({
    "package.json": JSON.stringify({ name: "some-slug", description: "package blurb" }),
    "index.html": HTML,
  });
  const facts = readSiteFacts(dir);
  assert.equal(facts.name, "Bramble Coffee");
  assert.equal(facts.description, "Small-batch coffee.");
});

test("llms.txt is generated with the site's own words, and flags what is missing", () => {
  const txt = buildLlmsTxt({ name: "Acme", description: "Acme sells fasteners." });
  assert.match(txt, /^# Acme/);
  assert.match(txt, /> Acme sells fasteners\./);
  assert.ok(countTodos(txt) > 0, "a generated file should admit what it does not know");
  assert.match(txt, /llmstxt\.org/);
});

test("the generated file says it is a starting point", () => {
  const txt = buildLlmsTxt({ name: "Acme" });
  assert.match(txt, /starting point/i);
});

/**
 * JSX is not HTML. React wants crossOrigin; the lowercase spelling is not the DOM property,
 * and emitting it into a .jsx file is a real bug rather than a nit.
 */
test("script tag uses crossOrigin in JSX and crossorigin in HTML", () => {
  const args = { version: "9.9.9", integrity: "sha384-abc" };
  assert.match(buildScriptTag({ ...args, jsx: true }), /crossOrigin="anonymous"/);
  assert.match(buildScriptTag({ ...args, jsx: false }), /crossorigin="anonymous"/);
  assert.ok(isJsxLayout("app/layout.tsx"));
  assert.ok(!isJsxLayout("index.html"));
});

test("script tag pins the version with an integrity hash by default, and --latest opts out", () => {
  const pinned = buildScriptTag({ version: "9.9.9", integrity: "sha384-abc", pin: true });
  assert.match(pinned, /human-machine-swapper@9\.9\.9/);
  assert.match(pinned, /integrity="sha384-abc"/);

  const floating = buildScriptTag({ version: "9.9.9", integrity: "sha384-abc", pin: false });
  assert.match(floating, /unpkg\.com\/human-machine-swapper"/);
  assert.doesNotMatch(floating, /integrity/);
});

test("applies all four edits to a Next project", () => {
  const dir = fixture({
    "next.config.mjs": "export default {};",
    "app/layout.jsx": NEXT_LAYOUT,
    "app/globals.css": "body{}",
  });
  const f = detect(dir);
  const { actions } = apply({
    dir,
    framework: f,
    llmsTxt: buildLlmsTxt({ name: "X" }),
    scriptTag: buildScriptTag({ version: "1.0.0", integrity: "sha384-x", jsx: true }),
  });
  assert.equal(actions.filter((a) => a.status === "manual").length, 0);

  const layout = readFileSync(join(dir, "app/layout.jsx"), "utf8");
  assert.match(layout, /rel="llms"/);
  assert.match(layout, /<human-machine-swapper/);
  assert.match(readFileSync(join(dir, "app/globals.css"), "utf8"), /:not\(:defined\)/);
  assert.ok(existsSync(join(dir, "public/llms.txt")));
});

/** init runs inside somebody else's repo, so running it twice must change nothing. */
test("running twice changes nothing the second time", () => {
  const dir = fixture({
    "next.config.mjs": "export default {};",
    "app/layout.jsx": NEXT_LAYOUT,
    "app/globals.css": "body{}",
  });
  const f = detect(dir);
  const args = {
    dir,
    framework: f,
    llmsTxt: buildLlmsTxt({ name: "X" }),
    scriptTag: buildScriptTag({ version: "1.0.0", integrity: "sha384-x" }),
  };
  apply(args);
  const after1 = readFileSync(join(dir, "app/layout.jsx"), "utf8");

  const second = apply(args);
  const after2 = readFileSync(join(dir, "app/layout.jsx"), "utf8");

  assert.equal(after1, after2, "a second run must not append duplicates");
  assert.equal(second.actions.every((a) => a.status === "skipped"), true);
});

/** An existing llms.txt is the site's real machine reading and beats anything generated. */
test("an existing llms.txt is never overwritten", () => {
  const dir = fixture({
    "index.html": HTML,
    "llms.txt": "# Hand written, do not clobber\n",
  });
  const f = detect(dir);
  apply({ dir, framework: f, llmsTxt: buildLlmsTxt({ name: "Generated" }), scriptTag: "<script></script>" });
  assert.match(readFileSync(join(dir, "llms.txt"), "utf8"), /Hand written/);
});

/** The guard is the one edit that silently breaks a layout if it is missing. */
test("with no stylesheet the guard is inlined rather than skipped", () => {
  const dir = fixture({ "index.html": HTML });
  const f = detect(dir);
  const { actions } = apply({
    dir,
    framework: f,
    llmsTxt: buildLlmsTxt({ name: "X" }),
    scriptTag: "<script></script>",
  });
  const guard = actions.find((a) => a.what === ":defined guard");
  assert.equal(guard.status, "done");
  assert.match(readFileSync(join(dir, "index.html"), "utf8"), /human-machine-swapper:not\(:defined\)/);
});

test("dry run writes nothing", () => {
  const dir = fixture({ "index.html": HTML });
  const f = detect(dir);
  const before = readFileSync(join(dir, "index.html"), "utf8");
  apply({ dir, framework: f, llmsTxt: "x", scriptTag: "<script></script>", dryRun: true });
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), before);
  assert.equal(existsSync(join(dir, "llms.txt")), false);
});

// ── page discovery ────────────────────────────────────────────────────────────────────
import { findPages } from "../src/init/pages.mjs";

function nextApp(pages) {
  const files = {
    "next.config.mjs": "export default {};",
    "app/layout.jsx": NEXT_LAYOUT,
    "app/globals.css": "body{}",
  };
  Object.assign(files, pages);
  return fixture(files);
}

test("finds routes and reads their titles from metadata, h1 or the slug", () => {
  const dir = nextApp({
    "app/page.jsx": 'export const metadata = { title: "Northfield Dental" };',
    "app/about/page.jsx": 'export const metadata = { title: "About our practice" };',
    "app/services/aeo/page.jsx": "export default function P(){return <h1>AEO audits</h1>}",
    "app/contact/page.jsx": "export default function P(){return null}",
  });
  const pages = findPages(dir, detect(dir));
  const byRoute = Object.fromEntries(pages.map((p) => [p.route, p.title]));
  assert.equal(byRoute["/"], "Northfield Dental");
  assert.equal(byRoute["/about"], "About our practice");
  assert.equal(byRoute["/services/aeo"], "AEO audits");
  assert.equal(byRoute["/contact"], "Contact", "falls back to the slug, titleised");
});

/** A template is not a page. Listing /blog/[slug] in an llms.txt helps nobody. */
test("dynamic routes are left out", () => {
  const dir = nextApp({
    "app/page.jsx": "export default function P(){return null}",
    "app/blog/[slug]/page.jsx": "export default function P(){return null}",
  });
  const routes = findPages(dir, detect(dir)).map((p) => p.route);
  assert.deepEqual(routes, ["/"]);
});

/** Route groups are organisational. (marketing)/pricing is served at /pricing. */
test("route groups are stripped from the url", () => {
  const dir = nextApp({
    "app/page.jsx": "export default function P(){return null}",
    "app/(marketing)/pricing/page.jsx": 'export const metadata={title:"Pricing"}',
  });
  const routes = findPages(dir, detect(dir)).map((p) => p.route);
  assert.ok(routes.includes("/pricing"), `got ${routes.join(", ")}`);
  assert.ok(!routes.some((r) => r.includes("(")), "a route group must not reach the url");
});

test("build output and dependencies are never walked", () => {
  const dir = nextApp({
    "app/page.jsx": "export default function P(){return null}",
    ".next/server/app/ghost/page.js": "compiled",
    "node_modules/thing/app/other/page.jsx": "vendored",
  });
  const routes = findPages(dir, detect(dir)).map((p) => p.route);
  assert.deepEqual(routes, ["/"], `leaked: ${routes.join(", ")}`);
});

test("pages land in the generated llms.txt, and beat README headings", () => {
  const txt = buildLlmsTxt(
    { name: "Acme", headings: ["Ignored heading"] },
    { pages: [{ route: "/about", title: "About" }] }
  );
  assert.match(txt, /## Pages/);
  assert.match(txt, /- \[About\]\(\/about\)/);
  assert.doesNotMatch(txt, /Ignored heading/);
});

test("with no pages found it falls back to README headings", () => {
  const txt = buildLlmsTxt({ name: "Acme", headings: ["Install"] }, { pages: [] });
  assert.match(txt, /## Sections/);
  assert.match(txt, /- Install/);
});
