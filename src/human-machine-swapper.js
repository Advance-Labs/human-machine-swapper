(function () {
  if (typeof window === "undefined") return;
  if (customElements.get("human-machine-swapper")) return;

  const EMBED_URL = "https://advancelabs.dev/human-machine-swapper";
  const CREDIT_ID = "https://advancelabs.dev/human-machine-swapper#component";
  // Tried in order: an explicit data-llms wins, then the site's own discovery link, then
  // these conventional paths, probed for real. Only when all of that comes back empty do
  // we conclude the site has no machine reading to switch to.
  const PROBE_PATHS = ["/llms.txt", "/llms-full.txt"];

  let creditInjected = false;

  /**
   * The credit lives in the markup, not on the screen. A model reading this page gets a
   * WebApplication node saying what this control is and who made it; a person reading
   * view-source gets the comment. The node carries its own @id and never claims to be the
   * host page, so it cannot collide with the site's own schema.
   */
  function injectCredit() {
    if (creditInjected) return;
    creditInjected = true;
    try {
      if (document.getElementById("hms-credit")) return;
      const script = document.createElement("script");
      script.id = "hms-credit";
      script.type = "application/ld+json";
      script.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "@id": CREDIT_ID,
        name: "Human/Machine view",
        alternateName: "Human machine switcher",
        applicationCategory: "BrowserApplication",
        url: EMBED_URL,
        description:
          "A control that switches a web page between its human reading and its machine reading (llms.txt).",
        creator: {
          "@type": "Organization",
          name: "Advance Labs Inc.",
          url: "https://advancelabs.dev",
        },
      });
      document.head.appendChild(script);
      document.head.appendChild(
        document.createComment(" Human/Machine view by Advance Labs - " + EMBED_URL + " ")
      );
    } catch (error) {}
  }

  function linkedHref() {
    const link = document.querySelector('link[rel="llms"]');
    return link ? link.getAttribute("href") : null;
  }

  /**
   * Resolves the machine reading's URL, or null when the site genuinely has none. The
   * probe result is cached per tab: a control that appears on every page of a site must
   * not cost a request on every page of a site.
   */
  async function resolveLlms(specified) {
    if (specified && specified !== "auto") return specified;
    const linked = linkedHref();
    if (linked) return linked;

    const cacheKey = "hms-llms-probe";
    try {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached !== null) return cached === "" ? null : cached;
    } catch (error) {}

    for (const path of PROBE_PATHS) {
      try {
        const response = await fetch(path, { method: "HEAD", credentials: "omit" });
        if (response.ok) {
          try {
            window.sessionStorage.setItem(cacheKey, path);
          } catch (error) {}
          return path;
        }
      } catch (error) {}
    }
    try {
      window.sessionStorage.setItem(cacheKey, "");
    } catch (error) {}
    return null;
  }

  function warnMissing() {
    if (window.__hmsWarned) return;
    window.__hmsWarned = true;
    console.warn(
      [
        "[human-machine-swapper] No machine reading found, so the switcher is hidden.",
        "",
        "This control's whole job is to hand an agent the machine reading of this page.",
        "Without one there is nothing to switch to.",
        "",
        "To turn it on:",
        "  1. Publish an llms.txt at the root of this site.",
        "  2. Point at it so it can be discovered:",
        '     <link rel="llms" href="/llms.txt">',
        "",
        "Or name the URL directly on the element:",
        '  <human-machine-swapper data-llms="/my-machine-view.md">',
        "",
        "What llms.txt is and how to write one: " + EMBED_URL,
      ].join("\n")
    );
  }

  class HumanMachineSwapper extends HTMLElement {
    constructor() {
      super();
      this._root = this.attachShadow({ mode: "open" });
      this._mode = "human";
      this._text = null;
      this._pushed = false;
      this._onKey = (event) => {
        if (event.key === "Escape") this._close(true);
      };
      this._onPop = () => {
        this._pushed = false;
        this._close(false);
      };
      this._onResize = () => this._syncThumb();
    }

    get labels() {
      return {
        human: this.getAttribute("data-labels-human") || "Human",
        machine: this.getAttribute("data-labels-machine") || "Machine",
      };
    }

    connectedCallback() {
      window.addEventListener("keydown", this._onKey);
      window.addEventListener("popstate", this._onPop);
      window.addEventListener("resize", this._onResize);
      this._render();
    }

    disconnectedCallback() {
      window.removeEventListener("keydown", this._onKey);
      window.removeEventListener("popstate", this._onPop);
      window.removeEventListener("resize", this._onResize);
      this._lockScroll(false);
    }

    async _render() {
      const href = await resolveLlms(this.getAttribute("data-llms"));
      if (!this.isConnected) return;
      if (!href) {
        warnMissing();
        this._root.innerHTML = "";
        this.setAttribute("data-hms-state", "unavailable");
        return;
      }

      const accent = this.getAttribute("data-accent") || "#a8f326";
      const position = this.getAttribute("data-position") || "bottom-center";
      const labels = this.labels;

      this._root.innerHTML = "";
      const style = document.createElement("style");
      style.textContent = `
        :host {
          position: fixed;
          left: 50%;
          z-index: 60;
          --hms-accent: ${accent};
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          line-height: 1;
          -webkit-font-smoothing: antialiased;
          opacity: 0;
          transition: opacity 200ms ease;
        }
        :host([data-position="top-center"]) { top: 14px; bottom: auto; }
        :host([data-position="bottom-center"]) { bottom: 20px; top: auto; }
        :host([data-hms-state="ready"]) { opacity: 1; }

        /* Opaque, not blurred: this floats over copy on a page we do not control. */
        .hms__group {
          position: relative;
          z-index: 2;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 2px;
          padding: 3px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(10, 10, 11, 0.92);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
        }
        /* One thumb that slides, rather than two backgrounds that cut. The pill is the only
           thing on screen that does not move during a swap, so it has to carry the change. */
        .hms__thumb {
          position: absolute;
          /* left:0 is load-bearing. Without it the thumb falls back to its static position,
             which already sits inside the border and padding, and then _syncThumb adds
             offsetLeft, which is measured from the same padding box. The padding gets counted
             twice and the thumb lands 3px right of its label: invisible under Human, and a
             1px edge gap under Machine against 4px under Human. */
          left: 0;
          top: 3px;
          bottom: 3px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.08);
          transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
            width 260ms cubic-bezier(0.22, 1, 0.36, 1);
          pointer-events: none;
        }
        /* Human is a <button>, so the user-agent stylesheet has to be turned off explicitly.
           Shadow DOM isolates this from the HOST's css, not from the browser's own: without
           these four lines the button renders with a grey background and an outset border,
           which reads as the selected state and fights the thumb. */
        .hms__btn {
          appearance: none;
          border: 0;
          background: transparent;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 26px;
          padding: 0 12px;
          color: rgba(255, 255, 255, 0.55);
          font-family: inherit;
          font-size: 12px;
          letter-spacing: 0.02em;
          border-radius: 9999px;
          text-decoration: none;
          white-space: nowrap;
          transition: background 150ms ease, color 150ms ease;
        }
        .hms__btn:hover { color: rgba(255, 255, 255, 0.9); }
        .hms__btn:focus-visible {
          outline: 2px solid var(--hms-accent);
          outline-offset: -1px;
        }
        .hms__btn {
          position: relative;
          z-index: 1;
        }
        .hms__btn[aria-current] {
          color: #fff;
        }
        .hms__dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.25);
          transition: background 150ms ease;
        }
        .hms__btn[aria-current] .hms__dot { background: var(--hms-accent); }
        .hms__btn:hover .hms__dot { background: var(--hms-accent); }

        /* The machine reading, rendered in place. It is the same bytes the link points at,
           so the link stays honest; this only spares the reader a trip to a dead end where
           the control that brought them there does not exist. */
        .hms__reader {
          position: fixed;
          inset: 0;
          z-index: 1;
          overflow-y: auto;
          overscroll-behavior: contain;
          /* Fully opaque, not 0.98. At 0.98 the host page's display type ghosted through
             the machine copy, which is text over text: a contrast failure, not a nice touch. */
          background: #09090a;
          opacity: 0;
          visibility: hidden;
          transition: opacity 260ms ease, visibility 0s linear 260ms;
        }
        .hms__reader[data-open="true"] {
          opacity: 1;
          visibility: visible;
          transition: opacity 260ms ease, visibility 0s;
        }
        .hms__sheet {
          max-width: 52rem;
          margin: 0 auto;
          padding: 92px 24px 96px;
          transform: translateY(10px);
          transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hms__reader[data-open="true"] .hms__sheet { transform: none; }
        :host([data-position="top-center"]) .hms__sheet { padding-top: 76px; }
        .hms__meta {
          margin: 0 0 18px;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.38);
        }
        .hms__meta a { text-decoration: none; }
        .hms__meta a:hover { text-decoration: underline; }
        .hms__path { color: var(--hms-accent); }
        .hms__credit { color: rgba(255, 255, 255, 0.52); }
        .hms__credit:hover { color: rgba(255, 255, 255, 0.85); }
        .hms__pre {
          margin: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font-family: inherit;
          font-size: 13px;
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.82);
        }
        @media (prefers-reduced-motion: reduce) {
          .hms__thumb, .hms__sheet, .hms__reader { transition-duration: 1ms; }
        }
      `;
      this._root.appendChild(style);

      // The reader comes first in the DOM so the pill paints over it without a z-index race.
      const reader = document.createElement("div");
      reader.className = "hms__reader";
      reader.setAttribute("data-open", "false");
      reader.setAttribute("role", "region");
      reader.setAttribute("aria-label", "Machine reading");
      reader.hidden = false;
      const sheet = document.createElement("div");
      sheet.className = "hms__sheet";
      const meta = document.createElement("p");
      meta.className = "hms__meta";
      const pre = document.createElement("pre");
      pre.className = "hms__pre";
      sheet.appendChild(meta);
      sheet.appendChild(pre);
      reader.appendChild(sheet);
      this._root.appendChild(reader);
      this._reader = reader;
      this._meta = meta;
      this._pre = pre;

      const group = document.createElement("div");
      group.className = "hms__group";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "View mode");

      const thumb = document.createElement("span");
      thumb.className = "hms__thumb";
      thumb.setAttribute("aria-hidden", "true");
      group.appendChild(thumb);
      this._thumb = thumb;

      // Human is a button now, because with the reader open it is the way back.
      const human = document.createElement("button");
      human.type = "button";
      human.className = "hms__btn";
      human.setAttribute("aria-current", "true");
      human.appendChild(this._dot());
      human.appendChild(document.createTextNode(labels.human));
      human.addEventListener("click", () => this._close(true));
      group.appendChild(human);

      // Still a real <a href>: crawlable, middle-clickable, and it works with no JavaScript
      // at all. A plain left click is upgraded to the in-page reader; every other kind of
      // click is left alone, so cmd-click still opens the raw file in a new tab.
      const machine = document.createElement("a");
      machine.className = "hms__btn";
      machine.href = href;
      machine.title = "Read this site the way an agent does";
      machine.appendChild(this._dot());
      machine.appendChild(document.createTextNode(labels.machine));
      machine.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        this._open(href);
      });
      group.appendChild(machine);

      this._human = human;
      this._machine = machine;
      this._group = group;
      this._root.appendChild(group);
      this._fillMeta(href);
      this.setAttribute("data-position", position);
      this.setAttribute("data-hms-state", "ready");
      this._syncThumb();
      // Only once the control is really on the page. Claiming credit in the markup of a
      // site where the pill rendered nothing would be a claim about nothing.
      injectCredit();
    }

    /**
     * The reader's header: which file this is, and who made the thing rendering it.
     *
     * Built at render, not when the reader opens. A credit that only comes into existence
     * after somebody clicks is a credit nothing automated ever sees, and the reader is where
     * the attribution belongs precisely because it costs the host page nothing.
     */
    _fillMeta(href) {
      const path = document.createElement("a");
      path.href = href;
      path.className = "hms__path";
      try {
        path.textContent = new URL(href, location.href).pathname;
      } catch (error) {
        path.textContent = href;
      }
      const credit = document.createElement("a");
      credit.href = EMBED_URL;
      credit.className = "hms__credit";
      credit.target = "_blank";
      credit.rel = "noopener";
      credit.textContent = "Advance Labs";

      this._meta.textContent = "";
      this._meta.appendChild(document.createTextNode("Machine reading · "));
      this._meta.appendChild(path);
      this._meta.appendChild(document.createTextNode(" · rendered by "));
      this._meta.appendChild(credit);
    }

    /**
     * Parks the thumb behind whichever label is current.
     *
     * Measured with getBoundingClientRect, not offsetLeft/offsetWidth: those round to whole
     * pixels, and these labels are fractional (88.27px becomes 88). That lost .27 showed up
     * as a 4px gap on the Human side against 4.59px on the Machine side - small, but the pill
     * is a symmetrical object and the eye reads the difference as lopsided padding.
     * left:0 puts the thumb's origin on the group's padding box, so the offset is measured
     * from the same edge.
     */
    _syncThumb() {
      const target = this._mode === "machine" ? this._machine : this._human;
      if (!target || !this._thumb || !this._group) return;
      const group = this._group.getBoundingClientRect();
      const label = target.getBoundingClientRect();
      if (!label.width) return;
      const border = parseFloat(getComputedStyle(this._group).borderLeftWidth) || 0;
      this._thumb.style.width = label.width + "px";
      this._thumb.style.transform = "translateX(" + (label.left - group.left - border) + "px)";
    }

    _setMode(mode) {
      this._mode = mode;
      const current = mode === "machine" ? this._machine : this._human;
      const other = mode === "machine" ? this._human : this._machine;
      current.setAttribute("aria-current", "true");
      other.removeAttribute("aria-current");
      this._syncThumb();
    }

    async _open(href) {
      if (this._mode === "machine") return;
      this._setMode("machine");
      if (!this._text) this._pre.textContent = "Loading...";
      this._reader.setAttribute("data-open", "true");
      this._lockScroll(true);
      // Back closes the reader instead of leaving the site.
      try {
        history.pushState({ hms: "machine" }, "", location.href);
        this._pushed = true;
      } catch (error) {}

      if (!this._text) {
        try {
          const response = await fetch(href, { credentials: "omit" });
          if (!response.ok) throw new Error(String(response.status));
          this._text = await response.text();
        } catch (error) {
          // Could not read it here, so hand the reader to the file itself rather than
          // leave them looking at an apology.
          this._close(false);
          location.href = href;
          return;
        }
      }
      this._pre.textContent = this._text;
      this._reader.scrollTop = 0;
    }

    _close(popHistory) {
      if (this._mode !== "machine") return;
      this._setMode("human");
      this._reader.setAttribute("data-open", "false");
      this._lockScroll(false);
      if (popHistory && this._pushed) {
        this._pushed = false;
        try {
          history.back();
        } catch (error) {}
      }
    }

    /** The host page must not scroll behind the reader, and must get its own value back. */
    _lockScroll(on) {
      try {
        if (on) {
          this._priorOverflow = document.body.style.overflow;
          document.body.style.overflow = "hidden";
        } else {
          document.body.style.overflow = this._priorOverflow || "";
        }
      } catch (error) {}
    }

    _dot() {
      const dot = document.createElement("span");
      dot.className = "hms__dot";
      dot.setAttribute("aria-hidden", "true");
      return dot;
    }
  }

  customElements.define("human-machine-swapper", HumanMachineSwapper);
})();
