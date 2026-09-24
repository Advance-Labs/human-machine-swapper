<?php
/**
 * Plugin Name:       Human/Machine View — llms.txt for WordPress
 * Plugin URI:        https://advancelabs.dev/human-machine-swapper
 * Description:       Serves an llms.txt built from your own pages, so AI assistants read what you actually publish. Optionally adds a Human / Machine toggle so visitors can see it too.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Advance Labs
 * Author URI:        https://advancelabs.dev
 * License:           Apache-2.0
 * License URI:       https://www.apache.org/licenses/LICENSE-2.0
 * Text Domain:       human-machine-view
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SERVES llms.txt INSTEAD OF WRITING A FILE
 * ─────────────────────────────────────────────────────────────────────────────
 * Every other generator writes llms.txt to disk once. On WordPress that is the wrong
 * shape twice over: plenty of hosts have a read-only or inconsistently writable web root,
 * and a file written today is stale the moment somebody publishes a page.
 *
 * So this serves /llms.txt from a rewrite rule, generated from the posts table at request
 * time and cached in a transient. Publish a page and the machine reading includes it. No
 * file, no permissions, nothing to regenerate.
 *
 * A real file at the web root still wins, because rewrite rules only run when WordPress
 * does. That is deliberate: a site that already publishes its own llms.txt keeps it.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'HMV_VERSION', '1.0.0' );
define( 'HMV_OPTION', 'hmv_settings' );
define( 'HMV_CACHE_KEY', 'hmv_llms_txt' );

/** The component, pinned. A floating CDN url cannot carry an integrity hash. */
define( 'HMV_COMPONENT_VERSION', '1.3.0' );
define(
	'HMV_COMPONENT_SRI',
	'sha384-VetnLEfznYITII6EqUattgN+0Zd72RZXzBhdJjM/mAi6300cT3fUfvg7hN9JeMbH'
);

require_once plugin_dir_path( __FILE__ ) . 'includes/class-hmv-generator.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/class-hmv-settings.php';

/**
 * Defaults, and the single place that decides what a missing option means.
 *
 * @return array<string,mixed>
 */
function hmv_settings() {
	$defaults = array(
		'serve_llms'  => 1,
		'show_pill'   => 1,
		'position'    => 'bottom-center',
		'accent'      => '#a8f326',
		'summary'     => '',
		'about'       => '',
		'facts'       => '',
		'max_pages'   => 40,
	);
	$saved = get_option( HMV_OPTION, array() );
	return wp_parse_args( is_array( $saved ) ? $saved : array(), $defaults );
}

/* -------------------------------------------------------------------------
 * Serving /llms.txt
 * ---------------------------------------------------------------------- */

add_action( 'init', 'hmv_add_rewrite' );
/** Registers /llms.txt as a route WordPress answers. */
function hmv_add_rewrite() {
	add_rewrite_rule( '^llms\.txt$', 'index.php?hmv_llms=1', 'top' );
	add_rewrite_tag( '%hmv_llms%', '1' );
}

add_filter( 'query_vars', 'hmv_query_vars' );
/**
 * @param array $vars Registered query vars.
 * @return array
 */
function hmv_query_vars( $vars ) {
	$vars[] = 'hmv_llms';
	return $vars;
}

add_filter( 'redirect_canonical', 'hmv_no_canonical_redirect', 10, 2 );
/**
 * Stops WordPress bouncing /llms.txt to /llms.txt/.
 *
 * With a trailing-slash permalink structure, redirect_canonical treats our route like any
 * other and 301s it to a slashed URL. llms.txt is a FILE path by convention: every tool
 * asks for /llms.txt, including this project's own component. Most clients follow the 301
 * and it works by luck, which is exactly the kind of thing that breaks against a fetcher
 * that does not.
 *
 * Caught by running the plugin in a real WordPress rather than by reading the code.
 *
 * @param string|false $redirect The URL WordPress wants to redirect to.
 * @param string       $requested The requested URL.
 * @return string|false
 */
function hmv_no_canonical_redirect( $redirect, $requested ) {
	if ( get_query_var( 'hmv_llms' ) ) {
		return false;
	}
	return $redirect;
}

add_action( 'template_redirect', 'hmv_maybe_serve_llms' );
/** Answers /llms.txt as plain text, or gets out of the way. */
function hmv_maybe_serve_llms() {
	if ( ! get_query_var( 'hmv_llms' ) ) {
		return;
	}
	$settings = hmv_settings();
	if ( empty( $settings['serve_llms'] ) ) {
		return; // Turned off: fall through to a 404 rather than serving an empty file.
	}

	$body = get_transient( HMV_CACHE_KEY );
	if ( false === $body ) {
		$body = HMV_Generator::build( $settings );
		set_transient( HMV_CACHE_KEY, $body, DAY_IN_SECONDS );
	}

	status_header( 200 );
	header( 'Content-Type: text/plain; charset=utf-8' );
	header( 'X-Content-Type-Options: nosniff' );
	header( 'Cache-Control: public, max-age=300' );
	echo $body; // phpcs:ignore WordPress.Security.EscapeOutput -- plain text, escaped at build.
	exit;
}

/**
 * Publishing anything invalidates the machine reading, because the Pages list is built
 * from posts. Cheaper to drop the cache than to work out whether this particular post
 * would have appeared in it.
 */
add_action( 'save_post', 'hmv_flush_cache' );
add_action( 'deleted_post', 'hmv_flush_cache' );
add_action( 'update_option_blogname', 'hmv_flush_cache' );
add_action( 'update_option_blogdescription', 'hmv_flush_cache' );
add_action( 'update_option_' . HMV_OPTION, 'hmv_flush_cache' );
/** Drops the cached llms.txt. */
function hmv_flush_cache() {
	delete_transient( HMV_CACHE_KEY );
}

/* -------------------------------------------------------------------------
 * The front end
 * ---------------------------------------------------------------------- */

add_action( 'wp_head', 'hmv_discovery_link', 1 );
/** The tag the component looks for, so it never has to probe. */
function hmv_discovery_link() {
	$settings = hmv_settings();
	if ( empty( $settings['serve_llms'] ) ) {
		return;
	}
	printf(
		'<link rel="llms" href="%s" />' . "\n",
		esc_url( home_url( '/llms.txt' ) )
	);
}

add_action( 'wp_enqueue_scripts', 'hmv_enqueue' );
/**
 * Loads the component and, critically, the :defined guard.
 *
 * The guard is not optional and is the single thing a host site gets wrong by hand: until
 * the script loads, the browser treats <human-machine-swapper> as an ordinary in-flow box
 * about 50px tall and pushes the page down. Enqueuing it here means a plugin user cannot
 * skip it.
 */
function hmv_enqueue() {
	$settings = hmv_settings();
	if ( empty( $settings['show_pill'] ) || empty( $settings['serve_llms'] ) ) {
		return;
	}

	wp_register_style( 'human-machine-view', false, array(), HMV_VERSION );
	wp_enqueue_style( 'human-machine-view' );
	wp_add_inline_style(
		'human-machine-view',
		'human-machine-swapper:not(:defined){display:none}'
	);

	wp_enqueue_script(
		'human-machine-swapper',
		sprintf(
			'https://unpkg.com/human-machine-swapper@%s/src/human-machine-swapper.js',
			HMV_COMPONENT_VERSION
		),
		array(),
		null, // Version is already in the URL; a ?ver= query would break the SRI match.
		array(
			'strategy'  => 'defer',
			'in_footer' => true,
		)
	);
}

add_filter( 'script_loader_tag', 'hmv_script_integrity', 10, 3 );
/**
 * Adds integrity and crossorigin to our script tag only.
 *
 * WordPress has no API for SRI, so the tag has to be filtered. Scoped by handle so no
 * other plugin's script is touched.
 *
 * @param string $tag    The script tag.
 * @param string $handle Script handle.
 * @param string $src    Script source.
 * @return string
 */
function hmv_script_integrity( $tag, $handle, $src ) {
	if ( 'human-machine-swapper' !== $handle ) {
		return $tag;
	}
	return sprintf(
		'<script src="%s" integrity="%s" crossorigin="anonymous" defer></script>' . "\n",
		esc_url( $src ),
		esc_attr( HMV_COMPONENT_SRI )
	);
}

add_action( 'wp_footer', 'hmv_render_element' );
/** The element itself. position:fixed, so where it sits in the DOM does not matter. */
function hmv_render_element() {
	$settings = hmv_settings();
	if ( empty( $settings['show_pill'] ) || empty( $settings['serve_llms'] ) ) {
		return;
	}
	printf(
		'<human-machine-swapper data-position="%s" data-accent="%s" data-llms="%s"></human-machine-swapper>' . "\n",
		esc_attr( $settings['position'] ),
		esc_attr( $settings['accent'] ),
		esc_url( home_url( '/llms.txt' ) )
	);
}

/* -------------------------------------------------------------------------
 * Activation
 * ---------------------------------------------------------------------- */

register_activation_hook( __FILE__, 'hmv_activate' );
/** Rewrite rules only take effect once flushed, and flushing is expensive, so: once. */
function hmv_activate() {
	hmv_add_rewrite();
	flush_rewrite_rules();
}

register_deactivation_hook( __FILE__, 'hmv_deactivate' );
/** Leaves no dangling /llms.txt route behind. */
function hmv_deactivate() {
	delete_transient( HMV_CACHE_KEY );
	flush_rewrite_rules();
}

new HMV_Settings();
