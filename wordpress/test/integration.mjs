#!/usr/bin/env node
/**
 * Boots a real WordPress with the plugin mounted and checks the things that only break in
 * a real WordPress.
 *
 * The stub test in generator-test.php covers the generator, which is where the logic is.
 * This covers the parts that are thin enough to read and still wrong: rewrite rules,
 * canonical redirects, the enqueued guard, the SRI attribute. The trailing-slash bug this
 * asserts against was invisible to linting, invisible to the stub, and obvious within one
 * request of a real install.
 *
 * Not wired into CI: it downloads WordPress and takes a couple of minutes, which is a poor
 * trade against a fast suite. Run it before a release, and any time the routing changes.
 *
 *   node wordpress/test/integration.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, "../human-machine-view");
const PORT = Number(process.env.PORT || 9411);
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * Seeding runs from a mounted mu-plugin, not a blueprint runPHP step.
 *
 * The blueprint step was silently skipped on some boots, which is worse than failing: the
 * suite then tested an unseeded site and reported whatever that produced. Worse still, a
 * cached site directory from an earlier run made it look like it had passed. A mu-plugin
 * runs on every request, on this exact site, or the site does not work at all.
 */
const SEED_MU_PLUGIN = `<?php
add_action( 'init', function () {
	// mu-plugins load BEFORE regular plugins, so on the boot request that activates the
	// plugin its functions may not exist yet. Calling one is a fatal, which Playground
	// surfaces as a blueprint step failure rather than as anything resembling the cause.
	if ( ! function_exists( 'hmv_add_rewrite' ) ) {
		return;
	}
	if ( get_option( 'hmv_fixture_seeded' ) ) {
		return;
	}

	// WordPress ships a Sample Page and a Hello world post. They are not this fixture's
	// content and would mask whether OUR pages reached the file.
	$sample = get_page_by_path( 'sample-page' );
	if ( $sample ) { wp_delete_post( $sample->ID, true ); }
	foreach ( get_posts( array( 'name' => 'hello-world', 'post_type' => 'post', 'post_status' => 'any' ) ) as $p ) {
		wp_delete_post( $p->ID, true );
	}

	wp_insert_post( array(
		'post_title'  => 'A Real Page',
		'post_name'   => 'a-real-page',
		'post_type'   => 'page',
		'post_status' => 'publish',
	) );
	// Password-protected: must NOT reach a file written for machines to read.
	wp_insert_post( array(
		'post_title'     => 'Secret',
		'post_name'      => 'secret',
		'post_type'      => 'page',
		'post_status'    => 'publish',
		'post_password'  => 'x',
	) );

	update_option( 'blogname', 'Integration Fixture' );
	update_option( 'blogdescription', 'A fixture site.' );
	// The trailing slash is what provoked the canonical-redirect bug. Testing without it
	// would test the easy case.
	update_option( 'permalink_structure', '/%postname%/' );
	update_option( 'hmv_settings', array(
		'serve_llms' => 1,
		'show_pill'  => 1,
		'position'   => 'bottom-center',
		'accent'     => '#a8f326',
		'max_pages'  => 40,
		'summary'    => 'A fixture.',
		'about'      => 'About the fixture.',
		'facts'      => '',
	) );

	delete_transient( 'hmv_llms_txt' );
	hmv_add_rewrite();
	flush_rewrite_rules();
	update_option( 'hmv_fixture_seeded', 1 );
}, 99 );
`;

const BLUEPRINT = {
  landingPage: "/",
  // Deliberately NOT logging in. Playground's login step sets a cookie via a redirect, and
  // a bare fetch() does not keep cookies, so every request bounces and the boot check never
  // succeeds. Nothing asserted below needs an admin session: it is all what a logged-out
  // visitor and a crawler see, which is the case that matters.
  login: false,
  steps: [
    { step: "activatePlugin", pluginPath: "human-machine-view/human-machine-view.php" },
  ],
};

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
};

async function waitForServer(timeoutMs = 180000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(BASE + "/", { redirect: "follow" });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "hmv-int-"));
  const bp = join(dir, "blueprint.json");
  writeFileSync(bp, JSON.stringify(BLUEPRINT, null, 2));

  const muDir = join(dir, "mu-plugins");
  mkdirSync(muDir, { recursive: true });
  writeFileSync(join(muDir, "hmv-seed.php"), SEED_MU_PLUGIN);

  console.log("booting WordPress (this downloads it the first time)…");
  const server = spawn(
    "npx",
    [
      "--yes",
      "@wp-playground/cli@latest",
      "server",
      `--port=${PORT}`,
      `--blueprint=${bp}`,
      `--mount=${PLUGIN}:/wordpress/wp-content/plugins/human-machine-view`,
      `--mount=${muDir}:/wordpress/wp-content/mu-plugins`,
    ],
    { cwd: dir, stdio: process.env.HMV_DEBUG ? "inherit" : "ignore", detached: true }
  );

  try {
    if (!(await waitForServer())) throw new Error("WordPress never came up");
    console.log(`\nrouting\n`);

    // The bug this file exists for: with a trailing-slash permalink structure, WordPress
    // 301s /llms.txt to /llms.txt/. Every tool asks for the unslashed path.
    const direct = await fetch(`${BASE}/llms.txt`, { redirect: "manual" });
    check(
      "/llms.txt is served directly, with no canonical redirect",
      direct.status === 200,
      `got ${direct.status} -> ${direct.headers.get("location") || "-"}`
    );
    check(
      "served as plain text",
      (direct.headers.get("content-type") || "").startsWith("text/plain"),
      direct.headers.get("content-type") || "(none)"
    );
    check("nosniff is set", direct.headers.get("x-content-type-options") === "nosniff");

    const body = await direct.text();
    console.log(`\ncontent\n`);
    check("built from the site's own pages", body.includes("A Real Page"));
    check(
      "password-protected pages are excluded",
      !body.includes("Secret"),
      "a machine reading must only contain what is already public"
    );
    check("carries the owner's About", body.includes("About the fixture."));
    if (process.env.HMV_DEBUG) console.log("\n--- body ---\n" + body + "\n--- end ---\n");

    console.log(`\nfront end\n`);
    const home = await fetch(BASE + "/").then((r) => r.text());
    check("declares the discovery link", /rel=["']llms["']/.test(home));
    check("mounts the element", home.includes("<human-machine-swapper"));
    check(
      "enqueues the :defined guard",
      home.includes("human-machine-swapper:not(:defined)"),
      "without it the element is laid out in flow before the script loads"
    );
    check("pins the script with an integrity hash", /integrity=["']sha384-/.test(home));
    check("loads a version-pinned url", /human-machine-swapper@\d+\.\d+\.\d+/.test(home));
  } finally {
    try {
      process.kill(-server.pid);
    } catch {}
  }

  console.log(failures ? `\n${failures} failing\n` : "\nall passing\n");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("integration run failed:", err.message);
  process.exit(1);
});
