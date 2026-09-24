import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";

/**
 * Finds the pages a site actually has, so the generated llms.txt can list them.
 *
 * This is what makes a generated file worth keeping. An llms.txt built from a README says
 * what the project calls itself; one built from the routes says what is *on the site*,
 * which is the thing a model needs in order to answer "where do I find X".
 *
 * Read-only and best-effort throughout. A site with an unusual layout gets fewer pages
 * listed, never a crash and never an invented route.
 */

const CODE = new Set([".js", ".jsx", ".ts", ".tsx", ".astro", ".vue", ".svelte"]);
const PROSE = new Set([".md", ".mdx", ".markdown"]);
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".svelte-kit", "dist", "build", "out",
  "coverage", ".vercel", ".astro", "public", "static", "assets",
]);

/** Hard ceiling. An llms.txt listing 400 routes is noise, not a machine reading. */
const MAX_PAGES = 60;

function walk(dir, root = dir, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".") continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(abs, root, out, depth + 1);
    } else {
      out.push(relative(root, abs));
    }
  }
  return out;
}

/** `app/blog/[slug]/page.tsx` -> `/blog/[slug]`, `app/page.tsx` -> `/` */
function routeFromNextApp(rel) {
  const parts = rel.split(sep);
  parts.pop(); // page.tsx
  const segs = parts
    .slice(1) // drop app/ or src/
    .filter((p) => p !== "app")
    // (marketing) and @slots are organisational, not URL segments
    .filter((p) => !(p.startsWith("(") && p.endsWith(")")) && !p.startsWith("@"));
  return "/" + segs.join("/");
}

function routeFromFile(rel, baseDir) {
  let p = rel.replace(new RegExp(`^${baseDir}\\${sep}?`), "");
  p = p.replace(new RegExp(`\\${extname(p)}$`), "");
  p = p.replace(/(^|\/)index$/, "");
  p = p.replace(/\+page$/, "").replace(/\/$/, "");
  return "/" + p.split(sep).filter(Boolean).join("/");
}

/**
 * A page's title, from whatever the file happens to declare. Checked in order of how
 * likely each is to be the real human-facing title.
 */
function titleOf(abs, route) {
  let text = "";
  try {
    text = readFileSync(abs, "utf8").slice(0, 8000);
  } catch {
    return titleiseRoute(route);
  }

  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (frontmatter) {
    const t = frontmatter[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
    if (t) return clean(t[1]);
  }
  // Next metadata: `title: "..."` inside an exported metadata object.
  const meta = text.match(/export\s+const\s+metadata[\s\S]{0,400}?title:\s*["'`](.+?)["'`]/);
  if (meta) return clean(meta[1]);

  const h1 = text.match(/<h1[^>]*>([^<]{2,120})<\/h1>/i);
  if (h1) return clean(h1[1]);

  const md = text.match(/^#\s+(.{2,120})$/m);
  if (md) return clean(md[1]);

  return titleiseRoute(route);
}

const clean = (s) => s.replace(/\s+/g, " ").trim();

function titleiseRoute(route) {
  const last = route.split("/").filter(Boolean).pop();
  if (!last) return "Home";
  return last
    .replace(/[[\]]/g, "")
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Dynamic routes are a template, not a page; listing `/blog/[slug]` helps nobody. */
const isDynamic = (route) => /\[.+\]|:\w+/.test(route);

/**
 * @returns {{route:string,title:string}[]} deduped, sorted, dynamic routes dropped
 */
export function findPages(dir, framework) {
  if (!framework) return [];
  const files = walk(dir);
  const found = [];

  const add = (route, abs) => {
    if (!route || isDynamic(route)) return;
    found.push({ route: route === "" ? "/" : route, abs });
  };

  for (const rel of files) {
    const ext = extname(rel);
    const abs = join(dir, rel);

    switch (framework.id) {
      case "next-app":
        if (/(^|\/)page\.(js|jsx|ts|tsx)$/.test(rel.split(sep).join("/")) && /^(src\/)?app\//.test(rel.split(sep).join("/"))) {
          add(routeFromNextApp(rel), abs);
        }
        break;
      case "next-pages":
        if (CODE.has(ext) && /^(src\/)?pages\//.test(rel.split(sep).join("/"))) {
          const name = basename(rel);
          if (name.startsWith("_") || rel.split(sep).join("/").includes("pages/api/")) break;
          add(routeFromFile(rel.replace(/^src\//, ""), "pages"), abs);
        }
        break;
      case "astro":
        if ((CODE.has(ext) || PROSE.has(ext)) && rel.split(sep).join("/").startsWith("src/pages/")) {
          add(routeFromFile(rel.replace(/^src\//, ""), "pages"), abs);
        }
        break;
      case "sveltekit":
        if (/\+page\.(svelte|md)$/.test(rel) && rel.split(sep).join("/").startsWith("src/routes/")) {
          add(routeFromFile(rel.replace(/^src\//, ""), "routes"), abs);
        }
        break;
      case "nuxt":
        if (ext === ".vue" && rel.split(sep).join("/").startsWith("pages/")) {
          add(routeFromFile(rel, "pages"), abs);
        }
        break;
      case "html":
        if (ext === ".html") add(routeFromFile(rel, ""), abs);
        break;
      default:
        break;
    }
  }

  // Markdown content collections are pages too on most of these stacks.
  if (framework.id !== "html") {
    for (const rel of files) {
      const unix = rel.split(sep).join("/");
      if (!PROSE.has(extname(rel))) continue;
      if (!/^(src\/)?content\//.test(unix)) continue;
      add("/" + unix.replace(/^(src\/)?content\//, "").replace(/\.[^.]+$/, ""), join(dir, rel));
    }
  }

  const seen = new Set();
  const pages = [];
  for (const f of found) {
    if (seen.has(f.route)) continue;
    seen.add(f.route);
    pages.push({ route: f.route, title: titleOf(f.abs, f.route) });
    if (pages.length >= MAX_PAGES) break;
  }

  pages.sort((a, b) => (a.route === "/" ? -1 : b.route === "/" ? 1 : a.route.localeCompare(b.route)));
  return pages;
}
