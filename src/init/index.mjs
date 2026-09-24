/**
 * The init toolkit, exported so a second front door can reuse it rather than fork it.
 *
 * `create-llms-txt` is the same machinery pointed at a different question: people search
 * for "how do I add llms.txt", not for "human machine toggle". One codebase, two entry
 * points, so the two can never drift into disagreeing about how to install this.
 */
export { detect, readSiteFacts } from "./detect.mjs";
export { findPages } from "./pages.mjs";
export { buildLlmsTxt, countTodos } from "./llms.mjs";
export { apply, buildScriptTag, isJsxLayout, LINK_TAG, ELEMENT_TAG, CSS_GUARD } from "./apply.mjs";
