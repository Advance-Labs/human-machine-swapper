import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Works out what kind of project this is, and where its three insertion points live.
 *
 * Detection is by file, never by dependency name: a project can list `next` in
 * devDependencies and not be a Next app, and plenty of real sites have no package.json at
 * all. What is on disk is the truth.
 *
 * Every framework resolves to the same three answers, because the install is always the
 * same three edits:
 *   head    - where <link rel="llms"> goes
 *   body    - where <human-machine-swapper> goes
 *   styles  - where the :not(:defined) guard goes
 */

const exists = (dir, ...parts) => existsSync(join(dir, ...parts));

/** The first of these that exists, or null. Order is the preference order. */
function firstFile(dir, candidates) {
  for (const c of candidates) if (exists(dir, c)) return c;
  return null;
}

/** Where a framework serves static files from, which is where llms.txt has to land. */
function publicDir(dir, candidates) {
  for (const c of candidates) if (exists(dir, c)) return c;
  return candidates[0];
}

/**
 * Finds the stylesheet a framework actually loads globally. Guessing wrong here is the
 * worst outcome the CLI has: the guard lands in a file nothing imports, the element is
 * laid out in flow at ~50px, and the page breaks in a way that looks like our fault.
 * When nothing matches we say so rather than picking one.
 */
function globalStylesheet(dir, candidates) {
  const found = firstFile(dir, candidates);
  return found;
}

const DETECTORS = [
  {
    id: "next-app",
    name: "Next.js (App Router)",
    test: (dir) =>
      firstFile(dir, ["next.config.js", "next.config.mjs", "next.config.ts"]) &&
      firstFile(dir, ["app/layout.js", "app/layout.jsx", "app/layout.tsx", "src/app/layout.js", "src/app/layout.jsx", "src/app/layout.tsx"]),
    resolve: (dir) => ({
      layout: firstFile(dir, [
        "app/layout.tsx", "app/layout.jsx", "app/layout.js",
        "src/app/layout.tsx", "src/app/layout.jsx", "src/app/layout.js",
      ]),
      styles: globalStylesheet(dir, [
        "app/globals.css", "src/app/globals.css", "styles/globals.css", "app/global.css",
      ]),
      public: publicDir(dir, ["public"]),
    }),
  },
  {
    id: "next-pages",
    name: "Next.js (Pages Router)",
    test: (dir) =>
      firstFile(dir, ["next.config.js", "next.config.mjs", "next.config.ts"]) &&
      firstFile(dir, ["pages/_document.js", "pages/_document.jsx", "pages/_document.tsx", "src/pages/_document.tsx"]),
    resolve: (dir) => ({
      layout: firstFile(dir, [
        "pages/_document.tsx", "pages/_document.jsx", "pages/_document.js",
        "src/pages/_document.tsx",
      ]),
      styles: globalStylesheet(dir, ["styles/globals.css", "src/styles/globals.css"]),
      public: publicDir(dir, ["public"]),
    }),
  },
  {
    id: "astro",
    name: "Astro",
    test: (dir) => firstFile(dir, ["astro.config.mjs", "astro.config.js", "astro.config.ts"]),
    resolve: (dir) => ({
      layout: firstFile(dir, [
        "src/layouts/Layout.astro", "src/layouts/BaseLayout.astro", "src/pages/index.astro",
      ]),
      styles: globalStylesheet(dir, ["src/styles/global.css", "src/styles/globals.css"]),
      public: publicDir(dir, ["public"]),
    }),
  },
  {
    id: "sveltekit",
    name: "SvelteKit",
    test: (dir) => firstFile(dir, ["svelte.config.js"]) && exists(dir, "src/app.html"),
    resolve: (dir) => ({
      layout: "src/app.html",
      styles: globalStylesheet(dir, ["src/app.css", "src/routes/styles.css"]),
      public: publicDir(dir, ["static"]),
    }),
  },
  {
    id: "nuxt",
    name: "Nuxt",
    test: (dir) => firstFile(dir, ["nuxt.config.ts", "nuxt.config.js"]),
    resolve: (dir) => ({
      layout: firstFile(dir, ["app.vue", "layouts/default.vue"]),
      styles: globalStylesheet(dir, ["assets/css/main.css", "assets/main.css"]),
      public: publicDir(dir, ["public"]),
    }),
  },
  {
    id: "wordpress-theme",
    name: "WordPress theme",
    test: (dir) => exists(dir, "functions.php") && exists(dir, "style.css"),
    resolve: (dir) => ({
      layout: firstFile(dir, ["header.php"]),
      styles: "style.css",
      public: publicDir(dir, ["."]),
    }),
  },
  {
    id: "html",
    name: "Static HTML",
    test: (dir) => firstFile(dir, ["index.html", "public/index.html", "src/index.html"]),
    resolve: (dir) => {
      const layout = firstFile(dir, ["index.html", "public/index.html", "src/index.html"]);
      // For a plain page the markup carries its own styles; we inject a <style> block
      // rather than hunting for a stylesheet that may not exist.
      return {
        layout,
        styles: null,
        public: publicDir(dir, [layout && layout.includes("/") ? layout.split("/")[0] : "."]),
      };
    },
  },
];

/**
 * @returns {{id:string,name:string,layout:string|null,styles:string|null,public:string}|null}
 */
export function detect(dir = process.cwd()) {
  for (const d of DETECTORS) {
    if (!d.test(dir)) continue;
    return { id: d.id, name: d.name, ...d.resolve(dir) };
  }
  return null;
}

/**
 * Facts about the site, scavenged from whatever this project happens to have. Everything
 * is optional; llms.txt generation degrades rather than failing, because a half-filled
 * llms.txt a human then edits is worth far more than an error telling them to write one.
 */
export function readSiteFacts(dir = process.cwd()) {
  const facts = { name: null, description: null, url: null, headings: [] };

  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (pkg.name) facts.name = titleise(pkg.name);
    if (pkg.description) facts.description = pkg.description;
    if (typeof pkg.homepage === "string") facts.url = pkg.homepage;
  } catch {}

  // An index.html usually states the real title and description, which beats a package name.
  for (const p of ["index.html", "public/index.html", "src/index.html"]) {
    if (!exists(dir, p)) continue;
    try {
      const html = readFileSync(join(dir, p), "utf8");
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (title) facts.name = title[1].trim();
      const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
      if (desc) facts.description = desc[1].trim();
    } catch {}
    break;
  }

  // A README's first heading and first real paragraph are usually the best prose on disk.
  for (const p of ["README.md", "readme.md"]) {
    if (!exists(dir, p)) continue;
    try {
      const md = readFileSync(join(dir, p), "utf8");
      const h1 = md.match(/^#\s+(.+)$/m);
      if (h1 && !facts.name) facts.name = h1[1].trim();
      if (!facts.description) {
        const para = md
          .split("\n")
          .find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("!") && !l.startsWith("["));
        if (para) facts.description = para.trim();
      }
      facts.headings = [...md.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim()).slice(0, 8);
    } catch {}
    break;
  }

  return facts;
}

function titleise(slug) {
  return String(slug)
    .replace(/^@[^/]+\//, "")
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Only used by the report, to say what we looked at. */
export function listDetectors() {
  return DETECTORS.map((d) => ({ id: d.id, name: d.name }));
}

export { exists, firstFile, readdirSync };
