# create-llms-txt

Write an `llms.txt` for your site in one command.

```bash
npm create llms-txt
```

It reads your routes, so the file lists what is actually on the site rather than what your
README says about the project.

---

## What is llms.txt

A plain-text file at the root of your site, written for language models rather than for
people. When ChatGPT, Claude or Perplexity answer a question about you, this is the document
you would want them to have read.

It is a convention, not a standard, and no engine is obliged to read it. Publishing one is
cheap; the cost of not having one is that models answer from whatever they scraped.

More: <https://llmstxt.org>

---

## What the command does

1. Works out what kind of project this is — Next (app and pages router), Astro, SvelteKit,
   Nuxt, a WordPress theme, or plain HTML.
2. Reads your routes and their titles, skipping dynamic routes, build output and
   `node_modules`.
3. Writes `llms.txt` into wherever your static files are served from.
4. Offers to add a **Human/Machine pill** so visitors can read the file too.

It never overwrites an `llms.txt` you already have.

```bash
npm create llms-txt -- --dry-run    # show the changes, write nothing
npm create llms-txt -- --no-pill    # just the file
```

---

## What you get

```
# Northfield Dental

> A family dental practice in Waterloo taking new patients.

## About

A family dental practice in Waterloo taking new patients.

## Pages

- [Northfield Dental](/)
- [About our practice](/about)
- [Contact](/contact)
- [Pricing](/pricing)
- [AEO audits and what they cover](/services/aeo)

## Key facts

Q: What is Northfield Dental?
A: A family dental practice in Waterloo taking new patients.

Q: What can I do on Northfield Dental?
A: TODO
```

**It is a starting point and says so.** The `TODO`s are the parts it could not work out, and
the command tells you how many are left. This file is what a model reads about you, so it is
worth ten minutes of editing. Everything above the TODOs was generated from your own routes.

---

## The pill

Optional, and offered rather than assumed. It puts a **Human / Machine** toggle on the page;
Machine shows the `llms.txt` rendered in place, so a visitor can see what the machines see.

It is [`human-machine-swapper`](https://www.npmjs.com/package/human-machine-swapper), about
6 KB gzipped with no dependencies. Add it later with `npx human-machine-swapper init`.

---

## For coding agents

Non-interactive when there is no terminal, so this is safe to run unattended. Exit codes:
`0` written, `1` could not identify the project, `2` written but something needs a human.

Pass `--no-pill` if the task was only to publish a machine reading.

---

## Licence

Apache-2.0. Built by [Advance Labs](https://advancelabs.dev).
