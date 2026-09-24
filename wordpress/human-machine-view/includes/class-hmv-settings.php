<?php
/**
 * Settings screen.
 *
 * Deliberately short. The plugin's job is to publish a good machine reading, and every
 * field here either changes what that file says or where the pill sits. There is no
 * analytics opt-in, no upsell panel and no dashboard widget.
 *
 * @package human-machine-view
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Registers and renders Settings → Human/Machine View. */
class HMV_Settings {

	const PAGE  = 'human-machine-view';
	const GROUP = 'hmv_settings_group';

	/** Hooks. */
	public function __construct() {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'register' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( dirname( __DIR__ ) . '/human-machine-view.php' ),
			array( $this, 'action_links' )
		);
	}

	/** Adds the options page. */
	public function menu() {
		add_options_page(
			__( 'Human/Machine View', 'human-machine-view' ),
			__( 'Human/Machine View', 'human-machine-view' ),
			'manage_options',
			self::PAGE,
			array( $this, 'render' )
		);
	}

	/**
	 * @param array $links Existing action links.
	 * @return array
	 */
	public function action_links( $links ) {
		$url = admin_url( 'options-general.php?page=' . self::PAGE );
		array_unshift(
			$links,
			'<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'human-machine-view' ) . '</a>'
		);
		return $links;
	}

	/** Registers the single option, sanitised as a whole. */
	public function register() {
		register_setting(
			self::GROUP,
			HMV_OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * Everything that reaches the database passes through here.
	 *
	 * The prose fields are stripped of tags rather than escaped, because their destination
	 * is a plain-text file: HTML in llms.txt is noise to the thing meant to read it.
	 *
	 * @param mixed $input Raw submitted values.
	 * @return array<string,mixed>
	 */
	public function sanitize( $input ) {
		$input = is_array( $input ) ? $input : array();

		$position = isset( $input['position'] ) ? (string) $input['position'] : 'bottom-center';
		if ( ! in_array( $position, array( 'bottom-center', 'top-center' ), true ) ) {
			$position = 'bottom-center';
		}

		$accent = isset( $input['accent'] ) ? sanitize_hex_color( (string) $input['accent'] ) : '';
		if ( ! $accent ) {
			$accent = '#a8f326';
		}

		$max_pages = isset( $input['max_pages'] ) ? (int) $input['max_pages'] : 40;
		$max_pages = max( 1, min( 200, $max_pages ) );

		return array(
			'serve_llms' => empty( $input['serve_llms'] ) ? 0 : 1,
			'show_pill'  => empty( $input['show_pill'] ) ? 0 : 1,
			'position'   => $position,
			'accent'     => $accent,
			'summary'    => sanitize_textarea_field( (string) ( $input['summary'] ?? '' ) ),
			'about'      => sanitize_textarea_field( (string) ( $input['about'] ?? '' ) ),
			'facts'      => sanitize_textarea_field( (string) ( $input['facts'] ?? '' ) ),
			'max_pages'  => $max_pages,
		);
	}

	/** Renders the page. */
	public function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$s   = hmv_settings();
		$url = home_url( '/llms.txt' );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Human/Machine View', 'human-machine-view' ); ?></h1>

			<p style="max-width:44rem">
				<?php
				printf(
					/* translators: %s: the site's llms.txt URL. */
					esc_html__( 'Your machine reading is served at %s, built from your published pages. Publish a page and it appears there; there is no file to regenerate.', 'human-machine-view' ),
					'<a href="' . esc_url( $url ) . '" target="_blank" rel="noopener"><code>' . esc_html( $url ) . '</code></a>'
				);
				?>
			</p>

			<form method="post" action="options.php">
				<?php settings_fields( self::GROUP ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Serve llms.txt', 'human-machine-view' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( HMV_OPTION ); ?>[serve_llms]" value="1" <?php checked( $s['serve_llms'], 1 ); ?> />
								<?php esc_html_e( 'Answer /llms.txt with a machine reading of this site', 'human-machine-view' ); ?>
							</label>
							<p class="description">
								<?php esc_html_e( 'Turn this off if you publish your own llms.txt file. A real file at the web root always wins anyway.', 'human-machine-view' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'One-line summary', 'human-machine-view' ); ?></th>
						<td>
							<input type="text" class="large-text" name="<?php echo esc_attr( HMV_OPTION ); ?>[summary]" value="<?php echo esc_attr( $s['summary'] ); ?>" placeholder="<?php echo esc_attr( get_bloginfo( 'description' ) ); ?>" />
							<p class="description">
								<?php esc_html_e( 'The sentence a model is most likely to quote. Defaults to your tagline.', 'human-machine-view' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'About', 'human-machine-view' ); ?></th>
						<td>
							<textarea class="large-text" rows="4" name="<?php echo esc_attr( HMV_OPTION ); ?>[about]"><?php echo esc_textarea( $s['about'] ); ?></textarea>
							<p class="description">
								<?php esc_html_e( 'Two or three plain sentences. Facts, not adjectives: what you do, where you are, who you serve. Left empty, the file says TODO rather than inventing something.', 'human-machine-view' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Key facts', 'human-machine-view' ); ?></th>
						<td>
							<textarea class="large-text code" rows="6" name="<?php echo esc_attr( HMV_OPTION ); ?>[facts]" placeholder="Q: What does it cost?&#10;A: From $X, depending on Y."><?php echo esc_textarea( $s['facts'] ); ?></textarea>
							<p class="description">
								<?php esc_html_e( 'One question and answer per pair of lines. Engines lift single lines, so write each answer so it still makes sense on its own.', 'human-machine-view' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Pages to list', 'human-machine-view' ); ?></th>
						<td>
							<input type="number" min="1" max="200" name="<?php echo esc_attr( HMV_OPTION ); ?>[max_pages]" value="<?php echo esc_attr( (string) $s['max_pages'] ); ?>" />
							<p class="description">
								<?php esc_html_e( 'A file listing four hundred pages is noise. Published pages only, in menu order.', 'human-machine-view' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Show the pill', 'human-machine-view' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( HMV_OPTION ); ?>[show_pill]" value="1" <?php checked( $s['show_pill'], 1 ); ?> />
								<?php esc_html_e( 'Add a Human / Machine toggle so visitors can read it too', 'human-machine-view' ); ?>
							</label>
							<p class="description">
								<?php esc_html_e( 'Off by preference, not by necessity: the llms.txt is served either way.', 'human-machine-view' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Pill position', 'human-machine-view' ); ?></th>
						<td>
							<select name="<?php echo esc_attr( HMV_OPTION ); ?>[position]">
								<option value="bottom-center" <?php selected( $s['position'], 'bottom-center' ); ?>><?php esc_html_e( 'Bottom centre', 'human-machine-view' ); ?></option>
								<option value="top-center" <?php selected( $s['position'], 'top-center' ); ?>><?php esc_html_e( 'Top centre', 'human-machine-view' ); ?></option>
							</select>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Accent colour', 'human-machine-view' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( HMV_OPTION ); ?>[accent]" value="<?php echo esc_attr( $s['accent'] ); ?>" placeholder="#a8f326" />
							<p class="description"><?php esc_html_e( 'Hex only.', 'human-machine-view' ); ?></p>
						</td>
					</tr>
				</table>

				<?php submit_button(); ?>
			</form>

			<hr />
			<p class="description" style="max-width:44rem">
				<?php esc_html_e( 'Open source, Apache-2.0. The pill is a 6 KB web component loaded from a pinned CDN URL with an integrity hash, so the file it loads cannot change without the tag changing too.', 'human-machine-view' ); ?>
				<a href="https://advancelabs.dev/human-machine-swapper" target="_blank" rel="noopener">advancelabs.dev</a>
			</p>
		</div>
		<?php
	}
}
