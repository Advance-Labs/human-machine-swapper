# human-machine-swapper

Instructions for coding agents adding this component to a site.

## What it is

A dependency-free web component that adds a Human / Machine pill. Machine shows the site's
`llms.txt` rendered in place. One script tag, one custom element, no build step.

## Do this first

```bash
npx human-machine-swapper init
```

It detects the framework, writes a starter `llms.txt` if the site has none, declares it,
loads the component pinned to a version with an integrity hash, mounts the element, and adds
the `:not(:defined)` guard. It is idempotent, so running it twice is safe, and it never
overwrites an existing `llms.txt`.

Add `--dry-run` to see the changes without writing them.

**Read the output.** It reports anything it could not work out rather than guessing, and it
tells you how many `TODO`s are left in the generated `llms.txt`. Exit codes: `0` installed,
`1` could not identify the project, `2` installed but something needs a human.

If the command cannot identify the project, or you are editing a site by hand, the install
is these three things plus one CSS rule.

## By hand, if you have to

1. **Load the script.**

   ```html
   <script src="https://unpkg.com/human-machine-swapper" defer></script>
   ```

   Or `npm install human-machine-swapper` and `import "human-machine-swapper"`.

2. **Mount the element**, anywhere in `<body>`. It is `position: fixed`, so placement in the
   DOM does not affect where it appears.

   ```html
   <human-machine-swapper data-position="bottom-center"></human-machine-swapper>
   ```

3. **Add this CSS.** Not optional.

   ```css
   human-machine-swapper:not(:defined) { display: none; }
   ```

   Without it, the element is laid out in flow at ~50px tall until the script loads and
   pushes the rest of the page down.

## The site must have an llms.txt

The component renders **nothing** if it cannot find one. If the site has no `/llms.txt`, write
one before adding the component, or the change will look broken.

Point at it so the component does not have to probe:

```html
<link rel="llms" href="/llms.txt" />
```

A minimal `llms.txt`:

```
# Site Name

> One sentence on what this site is.

## About

A paragraph or two a model can quote.

## Key facts

Q: What is <Site Name>?
A: ...
```

## Do not

- Do not wrap it in a client component or a portal. It is a custom element; mount it directly.
- Do not style it from the host page beyond the `:not(:defined)` rule. It renders in a shadow
  root and takes its colours from `data-accent`.
- Do not add `rel="nofollow"` or otherwise alter the reader's credit link.
- Do not set `data-llms` to a URL that does not exist. The component will render the pill and
  the reader will fail over to a navigation.

## Options

`data-position` (`bottom-center` | `top-center`), `data-llms` (`auto` | URL), `data-accent`
(CSS colour), `data-labels-human`, `data-labels-machine`.

## Docs

<https://advancelabs.dev/human-machine-swapper>
