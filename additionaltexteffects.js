// ============================================================================
// SETUP: add this to your cytube channel settings for this script to work
// ============================================================================
// Channel JS:
//   $.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/additionaltexteffects.js");
//
// Channel CSS: none. The script injects its own styles (#glow-style, #rainbow-style).
//
// Needs on the page: the Nexus script (loaded from the channel JS), which provides the text
// effects bar #text-fx-menu where the Glw and Rbw buttons go, plus #chatline, #messagebuffer
// and the NND container #videochatContainer.
// Only people who load this script see the effects; others see the plain [gl] / [rb] tags.
// ============================================================================

// Text effects for CyTube chat. Wrap words in tags and they get an effect. The tags disappear;
// emotes and links are left alone. A tag with no closing tag affects the rest of the message.
//
//   [gl]glow[/gl]        soft, slowly pulsing glow in the text's own color
//   [rb]rainbow[/rb]     a different, slowly shifting color on every letter
//   [gl][rb]both[/rb][/gl]   a rainbow glow (glow is applied first on purpose, so it works inside [rb])
//
// A button for each effect in the text effects bar wraps your selected text in the tags
// (or inserts an empty pair with the cursor between them).
// Both also apply to NND scrolling comments (the .videoText copies).
// Everyone with this script sees the effects (including older messages when they join).
//
// Opt out in one browser:
//   localStorage.setItem("glow_enabled", "0")      localStorage.setItem("rainbow_enabled", "0")
(function () {
  // If an older copy ran already (e.g. you re-saved the channel JS), shut it down first.
  ["TEXTFX_STOP", "GLOW_STOP", "RAINBOW_STOP"].forEach(function (k) {
    if (window[k]) { try { window[k](); } catch (e) {} }
  });

  // ---- settings -----------------------------------------------------------
  var GLOW_COLOR = "";    // "" = glow in the text's own color; or a color like "#39ff10"
  var PULSE = 2.4;        // seconds for one glow pulse
  var MAX_LETTERS = 240;  // rainbow: colored letters per message (the rest stays plain)
  var SPEED = 6;          // rainbow: seconds for one full color cycle
  var STEP = 0.2;         // rainbow: seconds of offset between neighboring letters (bigger = more spread)
  // Where the buttons go: the text effects bar. If it isn't found, they go after the
  // Emote List button or before the chat box.
  var BUTTON_HOST = "#text-fx-menu";

  // ---- shared helpers -----------------------------------------------------
  function injectCSS(id, css) {
    var old = document.getElementById(id);
    if (old) old.remove();              // re-running the script replaces the old copy
    var s = document.createElement("style");
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // Glow shadow at three sizes, in the text's own color.
  function sh(a, b, c) {
    var col = "var(--gl-c,currentColor)";
    return "0 0 " + a + "px " + col + ",0 0 " + b + "px " + col + ",0 0 " + c + "px " + col;
  }
  // NND draws its comments with a black outline made of text-shadows; keep it when glowing.
  var OUTLINE = "0 -0.063rem #000,0.063rem 0 #000,0 0.063rem #000,-0.063rem 0 #000";

  // Rainbow: build a fragment of per-letter spans for a piece of text. state.v counts letters.
  function paintRainbow(text, frag, state) {
    text.split(/(\s+)/).forEach(function (p) {
      if (!p) return;
      if (/^\s+$/.test(p) || state.v >= MAX_LETTERS) {
        frag.appendChild(document.createTextNode(p));
        return;
      }
      var word = document.createElement("span"); // keeps a word from breaking mid-word
      word.className = "rb-w";
      var chars = Array.from(p), k = 0;
      for (; k < chars.length && state.v < MAX_LETTERS; k++) {
        var c = document.createElement("span");
        c.className = "rb-c";
        c.style.setProperty("--i", state.v++);
        c.textContent = chars[k];
        word.appendChild(c);
      }
      if (k < chars.length) word.appendChild(document.createTextNode(chars.slice(k).join("")));
      frag.appendChild(word);
    });
  }

  // ---- the effects --------------------------------------------------------
  // Order matters: glow is applied before rainbow, so [gl] inside [rb] is read first.
  var effects = [
    {
      tag: "gl", key: "glow_enabled", attr: "data-gl",
      styleId: "glow-style", btnId: "glow-btn", title: "Glow", last: false,
      css:
        ".gl{" + (GLOW_COLOR ? "--gl-c:" + GLOW_COLOR + ";" : "") +
          "text-shadow:" + sh(3, 8, 16) + ";" +
          "animation:gl-pulse " + PULSE + "s ease-in-out infinite alternate;}" +
        "@keyframes gl-pulse{" +
          "from{text-shadow:" + sh(2, 5, 10) + ";}" +
          "to{text-shadow:" + sh(4, 11, 22) + ";}}" +
        ".videoText .gl{text-shadow:" + OUTLINE + "," + sh(3, 8, 16) + ";animation-name:gl-pulse-nnd;}" +
        "@keyframes gl-pulse-nnd{" +
          "from{text-shadow:" + OUTLINE + "," + sh(2, 5, 10) + ";}" +
          "to{text-shadow:" + OUTLINE + "," + sh(4, 11, 22) + ";}}" +
        // Spoilers hide text by making it black on black. While one is still hidden, anything colored
        // inside it (effect letters, or color text) must inherit the spoiler's color and shadow, or it
        // shows through. While it is being revealed (hovered), the effects are left alone.
        ".spoiler:not(:hover) *{color:inherit !important;text-shadow:none !important;animation:none !important;}" +
        "#glow-btn{font-weight:700;}" +
        // Reduced motion: keep a steady glow, no pulsing.
        "@media (prefers-reduced-motion:reduce){.gl,.videoText .gl{animation:none;}}",
      paint: function (text, frag) {
        var g = document.createElement("span");
        g.className = "gl";
        g.textContent = text;
        frag.appendChild(g);
      },
      label: function () {
        var l = document.createElement("span");
        l.className = "gl";
        l.textContent = "Glw";
        return l;
      }
    },
    {
      tag: "rb", key: "rainbow_enabled", attr: "data-rb",
      styleId: "rainbow-style", btnId: "rainbow-btn", title: "Rainbow",
      last: true,   // keeps this button at the end of the bar
      // Medium lightness colors so the text reads on both dark and light themes.
      css:
        ".rb-w{white-space:nowrap;}" +
        ".rb-c{animation:rb-cycle " + SPEED + "s linear infinite;" +
          "animation-delay:calc(var(--i) * -" + STEP + "s);}" +
        "@keyframes rb-cycle{" +
          "0%,100%{color:hsl(0,85%,60%);}" +
          "16%{color:hsl(35,95%,52%);}" +
          "32%{color:hsl(100,70%,46%);}" +
          "48%{color:hsl(175,75%,44%);}" +
          "64%{color:hsl(215,85%,62%);}" +
          "80%{color:hsl(280,75%,66%);}" +
        "}" +
        "#rainbow-btn{font-weight:700;}" +
        // Reduced motion: keep a different color per letter, but don't animate.
        "@media (prefers-reduced-motion:reduce){.rb-c{animation-play-state:paused;}}",
      paint: paintRainbow,
      label: function () {
        var l = document.createElement("span");
        l.className = "rb-w";
        ["R", "b", "w"].forEach(function (ch, i) {
          var c = document.createElement("span");
          c.className = "rb-c";
          c.style.setProperty("--i", i * 3);
          c.textContent = ch;
          l.appendChild(c);
        });
        return l;
      }
    }
  ];

  effects.forEach(function (ef) {
    ef.token = new RegExp("(\\[/?" + ef.tag + "\\])", "i");    // splits text around the tags
    ef.any   = new RegExp("\\[/?" + ef.tag + "\\]", "i");      // is there a tag at all?
    ef.open  = new RegExp("^\\[" + ef.tag + "\\]$", "i");
    ef.close = new RegExp("^\\[/" + ef.tag + "\\]$", "i");
    ef.btn = null;
    injectCSS(ef.styleId, ef.css);
  });

  function isEnabled(ef) {
    try { return localStorage.getItem(ef.key) !== "0"; } catch (e) {}
    return true;
  }

  // ---- applying an effect -------------------------------------------------
  // Does the work on one container: tags -> effect. Safe to run again (no tags left = no-op).
  function applyTo(root, ef) {
    if (!ef.any.test(root.textContent)) return;

    var texts = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) texts.push(walker.currentNode);

    var inside = false;     // carries across text nodes, so emotes in the middle are fine
    var state = { v: 0 };   // letter counter for rainbow
    texts.forEach(function (t) {
      var par = t.parentNode;
      if (!t.nodeValue || (par.closest && (par.closest("a") || par.closest(".username")))) return;
      var frag = document.createDocumentFragment();
      t.nodeValue.split(ef.token).forEach(function (piece) {
        if (!piece) return;
        if (ef.open.test(piece)) { inside = true; return; }
        if (ef.close.test(piece)) { inside = false; return; }
        if (inside) ef.paint(piece, frag, state);
        else frag.appendChild(document.createTextNode(piece));
      });
      par.replaceChild(frag, t);
    });
  }

  // One chat line. The message text is the last span in the line (after timestamp and username).
  function convert(msgEl) {
    if (!msgEl || msgEl.nodeType !== 1) return;
    effects.forEach(function (ef) {
      if (msgEl.getAttribute(ef.attr)) return;
      msgEl.setAttribute(ef.attr, "1");
      if (!isEnabled(ef)) return;
      var span = msgEl.lastElementChild;
      if (!span || span.tagName !== "SPAN" || span.classList.contains("timestamp")) return;
      applyTo(span, ef);
    });
  }

  // NND scrolling comments (.videoText): same job on the copy NND makes of the message.
  function convertNND(node) {
    if (!node) return;
    var el = node.nodeType === 1 ? node : node.parentNode;
    var vt = el && el.closest && el.closest(".videoText");
    if (!vt) return;
    effects.forEach(function (ef) {
      if (isEnabled(ef)) applyTo(vt, ef);
    });
  }

  // ---- watching the chat and NND ------------------------------------------
  var chatObs = null, nndObs = null, nndEl = null, watching = false, timer = 0;

  function watchChat() {
    var buf = document.getElementById("messagebuffer");
    if (!buf) return false;
    Array.prototype.forEach.call(buf.children, convert); // messages already on screen
    if (window.MutationObserver) {
      chatObs = new MutationObserver(function (records) {
        records.forEach(function (r) {
          Array.prototype.forEach.call(r.addedNodes, convert);
        });
      });
      chatObs.observe(buf, { childList: true });
    }
    return true;
  }

  function watchNND() {
    var c = document.getElementById("videochatContainer");
    if (!c || !window.MutationObserver) return;
    nndObs = new MutationObserver(function (records) {
      records.forEach(function (r) {
        Array.prototype.forEach.call(r.addedNodes, convertNND);
      });
    });
    nndObs.observe(c, { childList: true, subtree: true });
    nndEl = c;
    Array.prototype.forEach.call(c.querySelectorAll(".videoText"), convertNND);
  }

  // ---- buttons ------------------------------------------------------------
  function wrapSelection(ef) {
    var input = document.getElementById("chatline");
    if (!input) return;
    var open = "[" + ef.tag + "]", close = "[/" + ef.tag + "]";
    var s = input.selectionStart, e = input.selectionEnd, v = input.value;
    if (input.maxLength > 0 && v.length + open.length + close.length > input.maxLength) return;
    input.value = v.slice(0, s) + open + v.slice(s, e) + close + v.slice(e);
    var caret = (s === e) ? s + open.length : e + open.length + close.length;
    input.focus();
    input.setSelectionRange(caret, caret);
  }

  function ensureButton(ef, input) {
    if (!ef.btn) {
      var b = document.createElement("button");
      b.id = ef.btnId;
      b.type = "button";
      b.className = "btn btn-sm btn-default";
      b.title = ef.title; // shown as a Bootstrap hint like the other buttons
      b.appendChild(ef.label());
      b.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep the selection
      b.addEventListener("click", function () { wrapSelection(ef); });
      try { if (window.jQuery && jQuery.fn.tooltip) jQuery(b).tooltip({ container: "body" }); } catch (e) {}
      ef.btn = b;
    }
    var host = BUTTON_HOST && document.querySelector(BUTTON_HOST);
    if (host) {
      // Only the last button insists on being last, so the others never fight over the end spot.
      if (ef.btn.parentNode !== host || (ef.last && ef.btn !== host.lastElementChild)) host.appendChild(ef.btn);
      return;
    }
    if (document.body.contains(ef.btn)) return;
    var emote = document.getElementById("emotelistbtn");
    if (emote && emote.parentNode) emote.parentNode.insertBefore(ef.btn, emote.nextSibling);
    else if (input.parentNode) input.parentNode.insertBefore(ef.btn, input);
  }

  // ---- start / stop -------------------------------------------------------
  function tick() {
    if (!watching) watching = watchChat();
    if (nndEl && !document.body.contains(nndEl)) { nndObs.disconnect(); nndEl = null; }
    if (!nndEl) watchNND();
    var input = document.getElementById("chatline");
    if (input) effects.forEach(function (ef) { ensureButton(ef, input); });
  }
  tick();
  timer = setInterval(tick, 1000);

  window.TEXTFX_STOP = function () {
    clearInterval(timer);
    if (chatObs) chatObs.disconnect();
    if (nndObs) nndObs.disconnect();
    effects.forEach(function (ef) {
      try { if (ef.btn && window.jQuery && jQuery.fn.tooltip) jQuery(ef.btn).tooltip("destroy"); } catch (e) {}
      if (ef.btn && ef.btn.parentNode) ef.btn.parentNode.removeChild(ef.btn);
      var st = document.getElementById(ef.styleId);
      if (st) st.remove();
    });
  };
})();
