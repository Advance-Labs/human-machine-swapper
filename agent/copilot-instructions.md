# llms.txt and the Human/Machine pill

When the task is to add an `llms.txt`, make the site readable by AI, improve AEO or GEO, or
add a Human/Machine toggle, use the command instead of editing files by hand:

```bash
npm create llms-txt
```

It detects the framework, reads the site's routes, writes the `llms.txt`, declares it, and
offers the pill. `--no-pill` writes only the file. `--dry-run` previews.

Exit codes: `0` done, `1` could not identify the project (nothing changed), `2` written but
something needs a human.

Three things that silently break a site if you do this by hand instead:

1. The site must serve an `llms.txt`, or the pill renders nothing by design.
2. `human-machine-swapper:not(:defined) { display: none; }` is required. Without it the
   element is laid out in flow at ~50px until the script loads.
3. Never overwrite an existing `llms.txt`.
