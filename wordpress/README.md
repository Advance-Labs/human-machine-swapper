# Human/Machine View for WordPress

The plugin source. WordPress runs a large share of the web and its plugin directory is a
search surface with its own SEO, which makes this the one artifact in the whole project with
a plausible path to four figures of installs.

## Why it serves llms.txt rather than writing one

Every other generator writes the file to disk once. On WordPress that is wrong twice over:
plenty of hosts have a read-only or inconsistently writable web root, and a file written
today is stale the moment somebody publishes a page.

This answers `/llms.txt` from a rewrite rule, generated from the posts table and cached in a
transient that is dropped whenever anything is published, edited or deleted. No file, no
permissions, nothing to regenerate.

A real file at the web root still wins, because rewrite rules only run when WordPress does.
That is deliberate: a site already publishing its own llms.txt keeps it.

## Layout

```
human-machine-view/
  human-machine-view.php          plugin header, routing, enqueue, SRI filter
  readme.txt                      the directory listing, and the discovery surface
  includes/
    class-hmv-generator.php       builds the file from posts and settings
    class-hmv-settings.php        Settings → Human/Machine View
test/
  generator-test.php              runs the generator against a thin WordPress stub
```

## Testing

```bash
npm run test:wp                              # the generator, against stubs
find wordpress -name '*.php' -exec php -l {} \;   # syntax
```

CI lints at **PHP 7.4**, the plugin's declared floor, not at whatever the runner ships.
Syntax that is fine on 8.x and fatal on 7.4 is precisely the failure a user hits and we
would not.

There is no full WordPress integration test. The stub covers the generator, which is where
the logic is; the routing, enqueue and settings code is thin enough to read, and is the part
to check by hand in a real install before any release.

## Publishing to the plugin directory

Not automated, and not attempted yet. WordPress.org is a manual submission followed by a
human review queue, then SVN rather than git. In order:

1. Submit the plugin for review at <https://wordpress.org/plugins/developers/add/>.
2. Wait for the reviewer. Expect a round of feedback.
3. On approval you get an SVN repo. `trunk/` gets the plugin, `tags/1.0.0/` the release,
   `assets/` the screenshots and banner.

The `readme.txt` matters more than it looks: it is the listing copy **and** the text the
directory's own search indexes, so it is written for somebody typing "llms.txt" or "AI
search" into the plugin installer, not for somebody who already knows what this is.

Screenshots referenced in `readme.txt` still need taking against a real install.
