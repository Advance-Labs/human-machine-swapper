=== Human/Machine View — llms.txt for WordPress ===
Contributors: advancelabs
Tags: llms.txt, ai search, seo, aeo, chatgpt
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: Apache-2.0
License URI: https://www.apache.org/licenses/LICENSE-2.0

Serves an llms.txt built from your own pages, so AI assistants read what you actually publish. Optionally shows visitors the same thing.

== Description ==

When ChatGPT, Claude, Perplexity or Google's AI answers a question about your business, it answers from whatever it scraped. An **llms.txt** is a plain-text file at the root of your site written for those models rather than for people: your name, what you do, your pages, and the facts you want quoted.

This plugin serves one at `yourdomain.com/llms.txt`, built from your published pages.

**No file to generate.** Most tools write an llms.txt once and it is stale the moment you publish a page. This one answers the request from your own content, so the machine reading is never behind your site. Nothing is written to disk, which also means it works on hosts with a read-only web root.

**It will not invent facts about you.** Anything you have not filled in is marked TODO rather than guessed at, because a machine reading that states something your site does not support is worse than none: a model will repeat it.

= What it does =

* Answers `/llms.txt` with a machine reading generated from your published pages and recent posts
* Adds the `<link rel="llms">` tag so tools can find it
* Lets you write the one-line summary, the About paragraph and your key facts
* Optionally adds a **Human / Machine** toggle so visitors can read the same file
* Excludes your privacy policy, password-protected content and untitled pages
* Regenerates automatically when you publish, edit or delete anything

= The Human/Machine toggle =

Optional and off-switchable. It puts a small pill on the page; Machine shows your `llms.txt` rendered in place, so a visitor can see exactly what the machines see. It is a 6 KB web component with no dependencies, loaded from a version-pinned CDN URL with a Subresource Integrity hash, so the file it loads cannot change without the tag changing too.

= Already have an llms.txt? =

Keep it. A real file at your web root is served before WordPress runs, so it always wins. You can also switch the generated one off and keep just the toggle pointing at your own file.

= Open source =

Apache-2.0. The component and the generator are at [github.com/Advance-Labs/human-machine-swapper](https://github.com/Advance-Labs/human-machine-swapper). Built by [Advance Labs](https://advancelabs.dev).

== Installation ==

1. Install and activate the plugin.
2. Visit **Settings → Human/Machine View**.
3. Write the one-line summary and the About paragraph. Two minutes.
4. Visit `yourdomain.com/llms.txt` to read what a model will read.

If `/llms.txt` returns a 404 immediately after activating, go to **Settings → Permalinks** and click Save. That rebuilds the rewrite rules WordPress uses to answer the URL.

== Frequently Asked Questions ==

= What is an llms.txt file? =

A plain-text file at the root of a website, written for language models rather than for people. It is a convention rather than a standard, and no engine is obliged to read it. Publishing one is cheap; the cost of not having one is that models answer from whatever they happened to scrape.

= Will this get my site into ChatGPT? =

No, and be suspicious of anything that says otherwise. An llms.txt makes what you publish easy to read and quote correctly. It does not make an engine cite you, and no plugin can promise that.

= Does it slow my site down? =

No. The `/llms.txt` output is cached and only rebuilt when you publish or edit something. The optional pill is a 6 KB script loaded with `defer`, after your page has rendered.

= Does it change how my site looks? =

Only if you turn the pill on, and that is one checkbox. Nothing else about your theme is touched.

= Can I control what goes in the file? =

Yes. The summary, the About paragraph and the key facts are yours to write. Pages come from your published pages in menu order, and you can cap how many are listed.

= What about private or protected content? =

Password-protected posts and pages are excluded, as is your privacy policy page, as is anything unpublished. The file only ever contains what is already public on your site.

= Is it free? =

Yes, and open source under Apache-2.0. No account, no upsell, no data sent anywhere.

== Screenshots ==

1. Settings → Human/Machine View: the summary, About and key facts that shape your llms.txt.
2. The generated llms.txt, built from the site's own pages.
3. The optional Human / Machine pill, showing the machine reading in place.

== Changelog ==

= 1.0.0 =
* First release. Serves llms.txt from your published pages, adds the discovery link, and optionally shows the Human/Machine pill.
