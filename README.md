# Human/Machine view

A web component that puts a **Human / Machine** pill on any website. Machine shows the site's
`llms.txt` — the plain-text reading written for language models — rendered in place, without
leaving the page. One file, about 6 KB gzipped.

No dependencies. No build step. No sign-up. Works on any stack, because it is one script tag
and one custom element.

```html
<script src="https://unpkg.com/human-machine-swapper" defer></script>
<human-machine-swapper data-position="bottom-center"></human-machine-swapper>
```

---

## Install

### One command

```bash
npx human-machine-swapper init
```

> Only here for the `llms.txt` and not the pill? [`npm create llms-txt`](https://www.npmjs.com/package/create-llms-txt)
> writes the file from your routes and offers the pill at the end. Same code, different
> front door.


Detects your framework, writes a starter `llms.txt` if you have none, declares it, loads the
component **pinned to a version with an integrity hash**, mounts the element, and adds the
`:not(:defined)` guard below. Idempotent, never overwrites an existing `llms.txt`, and
`--dry-run` shows the changes without making them.

Knows Next (app and pages router), Astro, SvelteKit, Nuxt, WordPress themes and plain HTML.
If it cannot identify your project it changes nothing and prints the manual steps.

### Script tag

```html
<script src="https://unpkg.com/human-machine-swapper" defer></script>
```

Or pin a version: `https://unpkg.com/human-machine-swapper@1.0.0`.

### npm

```bash
npm install human-machine-swapper
```

```js
import "human-machine-swapper";
```

---

## Required setup

Three things. `init` does all of them; this is what it is doing, and what to do by hand.
Skip any one and the pill will not appear, or will appear broken.

### 1. Publish an `llms.txt`

The component's only job is to hand a reader the machine reading of your site. **If you do not
have one, the pill does not render** and the console explains why.

Put a plain-text file at `/llms.txt`. A minimal one:

```
# Your Company

> One sentence on what you do.

## About

Two or three paragraphs a model can quote.

## Key facts

Q: What does Your Company do?
A: ...
```

See <https://llmstxt.org> for the convention.

### 2. Point at it

```html
<link rel="llms" href="/llms.txt" />
```

Optional but recommended. Without it the component probes `/llms.txt` then `/llms-full.txt`,
which costs one `HEAD` request on first load (cached per tab afterwards).

### 3. Add the `:defined` guard

```css
human-machine-swapper:not(:defined) {
  display: none;
}
```

**This one is not optional.** Until the script loads, the browser treats
`<human-machine-swapper>` as an unknown element and lays it out in normal flow, where it
measures about 50px tall and pushes whatever follows it down the page. On a slow connection
that is a visible jump; on a fixed-height layout it is broken geometry. A page cannot be styled
by a script that has not loaded yet, so this is the one thing the component cannot do for
itself.

---

## Framework snippets

### Plain HTML

```html
<!doctype html>
<html>
  <head>
    <link rel="llms" href="/llms.txt" />
    <style>
      human-machine-swapper:not(:defined) {
        display: none;
      }
    </style>
    <script src="https://unpkg.com/human-machine-swapper" defer></script>
  </head>
  <body>
    <!-- your page -->
    <human-machine-swapper data-position="bottom-center"></human-machine-swapper>
  </body>
</html>
```

### Next.js (App Router)

`app/layout.js`:

```jsx
import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="llms" href="/llms.txt" />
      </head>
      <body>
        {children}
        <human-machine-swapper data-position="bottom-center" />
        <Script src="https://unpkg.com/human-machine-swapper" strategy="afterInteractive" />
      </body>
    </html>
  );
}
```

`app/globals.css`:

```css
human-machine-swapper:not(:defined) {
  display: none;
}
```

Put `llms.txt` in `public/`.

### Astro

```astro
---
---
<link rel="llms" href="/llms.txt" slot="head" />
<human-machine-swapper data-position="bottom-center"></human-machine-swapper>
<script src="https://unpkg.com/human-machine-swapper"></script>
<style is:global>
  human-machine-swapper:not(:defined) { display: none; }
</style>
```

### WordPress

Add to your theme's `footer.php` before `</body>`, and the CSS to Customizer → Additional CSS.

---

## Options

| Attribute | Value | What it does |
| --- | --- | --- |
| `data-position` | `bottom-center` \| `top-center` | Where the pill sits, fixed to the viewport. Default `bottom-center`. |
| `data-llms` | `auto` \| URL | The machine reading to show. `auto` reads `link rel="llms"`, then probes `/llms.txt` and `/llms-full.txt`. |
| `data-accent` | CSS color | Accent for the current dot and hover. Default `#a8f326`. |
| `data-labels-human` | text | Override the Human label. |
| `data-labels-machine` | text | Override the Machine label. |

### Positioning it yourself

`data-position` picks an edge and a sensible inset. When that edge is occupied — a nav at the
top, a tab bar at the bottom, which on a phone is often both — set the offsets yourself. These
are custom properties, so they cross the shadow boundary and work from your own stylesheet:

```css
/* On phones this site has a 48px nav and a 58px bottom tab bar,
   so neither default edge is free. Sit above the tab bar. */
@media (max-width: 899px) {
  human-machine-swapper {
    --hms-top: auto;
    --hms-bottom: 70px;
  }
}
```

| Property | Default |
| --- | --- |
| `--hms-top` | `calc(14px + env(safe-area-inset-top))` when `data-position="top-center"`, else `auto` |
| `--hms-bottom` | `calc(20px + env(safe-area-inset-bottom))` when `data-position="bottom-center"`, else `auto` |

Set both when you override, so the edge you are moving away from is released.

### Hiding it during an intro animation

The element is styled by the host page like any other, and outer styles win over the
component's own. If your page has an opening sequence, hide it until that finishes:

```css
html.intro human-machine-swapper {
  opacity: 0;
  pointer-events: none;
}
```

Only scope the rule to your loading state. If you set `opacity` unconditionally you override
the component's own reveal, and the pill will appear before it knows whether it has anything
to show.

---

## How it behaves

- **Machine renders in place.** The file is fetched and shown over the page, with the pill still
  on screen. Human, <kbd>Escape</kbd>, or the browser's back button all return you.
- **Machine is a real link.** It is an `<a href>` pointing at the file, so crawlers follow it,
  cmd-click and middle-click open the raw text in a new tab, and it works with JavaScript off.
  Only an unmodified left click is upgraded to the in-page reader.
- **It hides itself when it has nothing to show.** No `llms.txt` means no pill, plus a console
  warning telling you how to publish one. A visible control that does nothing is worse than no
  control.
- **It never touches your content.** The component adds nothing to your page and removes
  nothing from it. Everything a crawler sees is what you already shipped.
- **Shadow DOM.** The pill renders in a closed-off shadow root, so it cannot collide with your
  CSS and your CSS cannot collide with it.

---

## Why this exists

Sites increasingly publish two readings: one for people, one for models. The second is usually
an `llms.txt` at a URL nobody guesses and nothing links to. This makes it one click away, and
tells a visitor it exists.

Built by [Advance Labs](https://advancelabs.dev). The reader's header credits us; there is no
badge on your page.

---

## Pinning and integrity

`https://unpkg.com/human-machine-swapper` always serves the latest release, which means you get
fixes automatically and you are trusting the CDN. If you would rather pin, use an exact version
and a Subresource Integrity hash:

```html
<script
  src="https://unpkg.com/human-machine-swapper@1.0.0/src/human-machine-swapper.js"
  integrity="sha384-VetnLEfznYITII6EqUattgN+0Zd72RZXzBhdJjM/mAi6300cT3fUfvg7hN9JeMbH"
  crossorigin="anonymous"
  defer
></script>
```

That hash is for **1.0.0**. Every version has its own, so generate the one you are pinning —
and generate it rather than taking ours, so you are trusting bytes you checked:

```bash
curl -s https://unpkg.com/human-machine-swapper@1.0.0/src/human-machine-swapper.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

### Provenance

From 1.0.2 this package is published by GitHub Actions through npm's trusted publishing, with
no long-lived token anywhere. Every release carries a signed attestation naming the commit and
the workflow that built it, so you can check the tarball came from this repo rather than from
somebody's credentials:

```bash
npm audit signatures
```

That is a stronger claim than an integrity hash. A hash says the bytes did not change in
transit; the attestation says where the bytes came from.

A pinned build does not update, so you take on watching for releases. Self-hosting the file is
the third option and works identically: it is one dependency-free script with no network calls
of its own beyond reading your `llms.txt`.

---

## Contributing

Releases are cut by pushing a tag; see [RELEASING.md](RELEASING.md). There is no npm token —
publishing uses trusted publishing, and every release carries a provenance attestation.

## Licence

Apache-2.0.
