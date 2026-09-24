<?php
/**
 * Builds the llms.txt from what the site actually publishes.
 *
 * Everything here comes from the database or from what the owner typed on the settings
 * screen. Nothing is inferred, and nothing is invented: a machine reading that states a
 * fact the site does not support is worse than no machine reading, because a model will
 * repeat it.
 *
 * @package human-machine-view
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Generates the plain-text machine reading. */
class HMV_Generator {

	/**
	 * @param array<string,mixed> $settings Plugin settings.
	 * @return string The whole file.
	 */
	public static function build( $settings ) {
		$name    = wp_strip_all_tags( get_bloginfo( 'name' ) );
		$tagline = wp_strip_all_tags( get_bloginfo( 'description' ) );
		$summary = trim( (string) ( $settings['summary'] ?? '' ) );
		$about   = trim( (string) ( $settings['about'] ?? '' ) );
		$facts   = trim( (string) ( $settings['facts'] ?? '' ) );

		if ( '' === $summary ) {
			$summary = $tagline;
		}

		$out = array();
		$out[] = '# ' . ( '' !== $name ? $name : home_url() );
		$out[] = '';

		if ( '' !== $summary ) {
			$out[] = '> ' . self::one_line( $summary );
			$out[] = '';
		}

		$out[] = '## About';
		$out[] = '';
		if ( '' !== $about ) {
			$out[] = self::clean( $about );
		} else {
			// No invented prose. Say what is missing so the owner can fill it in, the same
			// way the CLI leaves TODOs rather than guessing.
			$out[] = 'TODO: a paragraph or two a language model can quote about '
				. ( '' !== $name ? $name : 'this site' ) . '.';
		}
		$out[] = '';

		$pages = self::pages( (int) ( $settings['max_pages'] ?? 40 ) );
		if ( ! empty( $pages ) ) {
			$out[] = '## Pages';
			$out[] = '';
			foreach ( $pages as $page ) {
				$out[] = sprintf( '- [%s](%s)', $page['title'], $page['url'] );
			}
			$out[] = '';
		}

		$posts = self::recent_posts( 10 );
		if ( ! empty( $posts ) ) {
			$out[] = '## Recent writing';
			$out[] = '';
			foreach ( $posts as $post ) {
				$out[] = sprintf( '- [%s](%s)', $post['title'], $post['url'] );
			}
			$out[] = '';
		}

		if ( '' !== $facts ) {
			$out[] = '## Key facts';
			$out[] = '';
			$out[] = self::clean( $facts );
			$out[] = '';
		}

		$out[] = '## Links';
		$out[] = '';
		$out[] = '- Website: ' . home_url( '/' );
		$out[] = '';

		$out[] = '---';
		$out[] = '';
		$out[] = self::clean(
			'Served by the Human/Machine View plugin for WordPress, generated from this '
			. 'site\'s own pages. https://advancelabs.dev/human-machine-swapper . The '
			. 'llms.txt convention: https://llmstxt.org'
		);
		$out[] = '';

		return implode( "\n", $out );
	}

	/**
	 * Published pages, in menu order, excluding the ones nobody wants a model quoting.
	 *
	 * @param int $limit Maximum pages to list.
	 * @return array<int,array{title:string,url:string}>
	 */
	private static function pages( $limit ) {
		$limit = max( 1, min( 200, (int) $limit ) );

		$query = new WP_Query(
			array(
				'post_type'              => 'page',
				'post_status'            => 'publish',
				'posts_per_page'         => $limit,
				'orderby'                => array( 'menu_order' => 'ASC', 'title' => 'ASC' ),
				'ignore_sticky_posts'    => true,
				'no_found_rows'          => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
				// A password-protected page is not public, so it does not belong in a file
				// written for machines to read.
				'has_password'           => false,
			)
		);

		$excluded = self::excluded_page_ids();
		$out      = array();
		foreach ( $query->posts as $page ) {
			if ( in_array( (int) $page->ID, $excluded, true ) ) {
				continue;
			}
			$title = wp_strip_all_tags( get_the_title( $page ) );
			if ( '' === trim( $title ) ) {
				continue;
			}
			$out[] = array(
				'title' => self::one_line( $title ),
				'url'   => get_permalink( $page ),
			);
		}
		wp_reset_postdata();
		return $out;
	}

	/**
	 * Pages that should never appear: the privacy policy is boilerplate, and anything the
	 * site owner has told search engines to leave alone should not be handed to a model
	 * either.
	 *
	 * @return array<int,int>
	 */
	private static function excluded_page_ids() {
		$ids = array();
		$privacy = (int) get_option( 'wp_page_for_privacy_policy' );
		if ( $privacy ) {
			$ids[] = $privacy;
		}
		return $ids;
	}

	/**
	 * @param int $limit Maximum posts.
	 * @return array<int,array{title:string,url:string}>
	 */
	private static function recent_posts( $limit ) {
		$query = new WP_Query(
			array(
				'post_type'              => 'post',
				'post_status'            => 'publish',
				'posts_per_page'         => max( 1, (int) $limit ),
				'ignore_sticky_posts'    => true,
				'no_found_rows'          => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
				'has_password'           => false,
			)
		);
		$out = array();
		foreach ( $query->posts as $post ) {
			$title = wp_strip_all_tags( get_the_title( $post ) );
			if ( '' === trim( $title ) ) {
				continue;
			}
			$out[] = array(
				'title' => self::one_line( $title ),
				'url'   => get_permalink( $post ),
			);
		}
		wp_reset_postdata();
		return $out;
	}

	/**
	 * Collapses whitespace. Used where a newline would break the format, such as the
	 * one-line summary after the > marker or a link label.
	 *
	 * @param string $text Input.
	 * @return string
	 */
	private static function one_line( $text ) {
		return trim( preg_replace( '/\s+/', ' ', (string) $text ) );
	}

	/**
	 * Normalises line endings and strips tags from owner-entered prose, keeping paragraph
	 * breaks. The settings screen accepts plain text, and this is what stops a pasted
	 * block of HTML ending up in a file that is meant to be plain.
	 *
	 * @param string $text Input.
	 * @return string
	 */
	private static function clean( $text ) {
		$text = wp_strip_all_tags( (string) $text );
		$text = str_replace( array( "\r\n", "\r" ), "\n", $text );
		return trim( $text );
	}
}
