<?php
/**
 * Runs HMV_Generator against stubbed WordPress functions.
 *
 * Linting proves the file parses. This proves the generator actually produces a sensible
 * machine reading, which is the part that would otherwise only be discovered on somebody's
 * live site. The stubs are deliberately thin: just enough of WordPress for the generator to
 * run, and no more, so a passing run says something about our code rather than about a
 * fixture.
 *
 * Run: php wordpress/test/generator-test.php
 *
 * @package human-machine-view
 */

define( 'ABSPATH', __DIR__ );
define( 'DAY_IN_SECONDS', 86400 );

$GLOBALS['hmv_test_pages'] = array();
$GLOBALS['hmv_test_posts'] = array();

// ── the thin slice of WordPress the generator touches ──────────────────────────────────

function wp_strip_all_tags( $text ) {
	return trim( strip_tags( (string) $text ) );
}
function get_bloginfo( $key ) {
	return 'name' === $key ? 'Harbour Cycles' : 'A bike shop and repair co-op in Halifax.';
}
function home_url( $path = '' ) {
	return 'https://harbourcycles.test' . $path;
}
function get_option( $key, $default = false ) {
	return 'wp_page_for_privacy_policy' === $key ? 7 : $default;
}
function get_the_title( $post ) {
	return $post->post_title;
}
function get_permalink( $post ) {
	return home_url( '/' . $post->slug );
}
function wp_reset_postdata() {}

/** Stands in for WP_Query, returning whichever fixture list the args ask for. */
class WP_Query {
	public $posts = array();
	public function __construct( $args ) {
		$key         = 'page' === $args['post_type'] ? 'hmv_test_pages' : 'hmv_test_posts';
		$this->posts = array_slice( $GLOBALS[ $key ], 0, (int) $args['posts_per_page'] );
	}
}

/** Minimal post object. */
class HMV_Test_Post {
	public $ID;
	public $post_title;
	public $slug;
	public function __construct( $id, $title, $slug ) {
		$this->ID         = $id;
		$this->post_title = $title;
		$this->slug       = $slug;
	}
}

require_once __DIR__ . '/../human-machine-view/includes/class-hmv-generator.php';

// ── assertions ─────────────────────────────────────────────────────────────────────────

$failures = 0;

/**
 * The two string helpers below exist because their built-in equivalents are PHP 8.0 and
 * this file must run on 7.4, the plugin's declared floor. Otherwise the suite quietly
 * stops testing the version users are actually on. CI caught it on the first run, because
 * it runs at the floor rather than at whatever the runner happens to ship.
 *
 * @param string $haystack Subject.
 * @param string $needle   Search.
 * @return bool
 */
function hmv_has( $haystack, $needle ) {
	return false !== strpos( $haystack, $needle );
}

/**
 * @param string $haystack Subject.
 * @param string $needle   Prefix.
 * @return bool
 */
function hmv_starts( $haystack, $needle ) {
	return 0 === strncmp( $haystack, $needle, strlen( $needle ) );
}

function check( $label, $condition, $detail = '' ) {
	global $failures;
	if ( $condition ) {
		echo "  ok   $label\n";
		return;
	}
	$failures++;
	echo "  FAIL $label" . ( $detail ? " — $detail" : '' ) . "\n";
}

$GLOBALS['hmv_test_pages'] = array(
	new HMV_Test_Post( 1, 'Repairs and servicing', 'repairs' ),
	new HMV_Test_Post( 7, 'Privacy Policy', 'privacy-policy' ),
	new HMV_Test_Post( 3, '', 'untitled' ),
	new HMV_Test_Post( 4, 'Join   the    co-op', 'membership' ),
);
$GLOBALS['hmv_test_posts'] = array(
	new HMV_Test_Post( 20, 'Winter tyre clinic', 'winter-tyre-clinic' ),
);

echo "generator, with everything filled in\n";
$out = HMV_Generator::build(
	array(
		'summary'   => 'A bike shop and repair co-op on the Halifax waterfront.',
		'about'     => "We have repaired bikes since 2011.\nMembers get workshop access.",
		'facts'     => "Q: What are your hours?\nA: Tuesday to Saturday, 10 to 6.",
		'max_pages' => 40,
	)
);

check( 'starts with the site name as an h1', hmv_starts( $out, '# Harbour Cycles' ) );
check( 'carries the one-line summary', hmv_has( $out, '> A bike shop and repair co-op on the Halifax waterfront.' ) );
check( 'lists a published page', hmv_has( $out, '- [Repairs and servicing](https://harbourcycles.test/repairs)' ) );
check( 'lists recent writing', hmv_has( $out, '- [Winter tyre clinic](' ) );
check( 'carries the owner key facts', hmv_has( $out, 'Q: What are your hours?' ) );

// The three exclusions that stop the file stating things the site does not.
check( 'excludes the privacy policy', ! hmv_has( $out, 'Privacy Policy' ), 'boilerplate, not a machine reading' );
check( 'skips an untitled page', ! hmv_has( $out, '](https://harbourcycles.test/untitled)' ) );
check( 'collapses whitespace in titles', hmv_has( $out, '- [Join the co-op]' ) );

echo "\ngenerator, with nothing filled in\n";
$bare = HMV_Generator::build( array( 'max_pages' => 40 ) );
check( 'falls back to the tagline for the summary', hmv_has( $bare, '> A bike shop and repair co-op in Halifax.' ) );
check( 'admits the gap rather than inventing an About', hmv_has( $bare, 'TODO' ), 'an invented About is worse than none' );
check( 'omits Key facts entirely when empty', ! hmv_has( $bare, '## Key facts' ) );

echo "\ngenerator, with HTML pasted into the prose fields\n";
$dirty = HMV_Generator::build(
	array(
		'about'     => '<script>alert(1)</script><p>We fix bikes.</p>',
		'max_pages' => 40,
	)
);
check( 'strips tags from owner prose', ! hmv_has( $dirty, '<script>' ) && ! hmv_has( $dirty, '<p>' ) );
check( 'keeps the text', hmv_has( $dirty, 'We fix bikes.' ) );

echo "\ngenerator, page cap\n";
$GLOBALS['hmv_test_pages'] = array();
for ( $i = 100; $i < 130; $i++ ) {
	$GLOBALS['hmv_test_pages'][] = new HMV_Test_Post( $i, "Page $i", "p$i" );
}
$capped = HMV_Generator::build( array( 'max_pages' => 5 ) );
check( 'honours the page cap', 5 === substr_count( $capped, '](https://harbourcycles.test/p1' ) );

echo "\n" . ( $failures ? "$failures failing\n" : "all passing\n" );
exit( $failures ? 1 : 0 );
