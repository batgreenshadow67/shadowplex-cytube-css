// ============================================================================
// SETUP: add this to your cytube channel settings for this script to work
// ============================================================================
// Channel JS:
//   $.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/additionaltexteffects.js");
//
// Channel CSS: none. The script injects its own styles (#glow-style, #rainbow-style).
//
// Needs on the page: the Nexus script (loaded from the channel JS), which provides the text
// effects bar #text-fx-menu where the Gl and R/B buttons go, plus #chatline, #messagebuffer
// and the NND container #videochatContainer.
// Only people who load this script see the effects; others see the plain [gl] / [rb] tags.
// ============================================================================

// Text effects for CyTube chat: [gl]glow[/gl] and [rb]rainbow[/rb], with Gl and RB buttons in the
// text effects bar. The glow part comes first on purpose, so [gl] inside [rb] is read before the
// rainbow splits the text into letters. Each part is self-contained and can be removed on its own.
// Both also apply to NND scrolling comments (the .videoText copies).

// Glowing chat text: wrap words in [gl]...[/gl] and they are shown with a soft, slowly
// pulsing glow in the text's own color. The brackets disappear; emotes and links are left alone.
//   hello [gl]glowing words[/gl] there   ->   only "glowing words" glows
// A [gl] with no closing [/gl] glows the rest of the message.
// Works together with [rb] rainbow text, e.g. [gl][rb]both[/rb][/gl] gives a rainbow glow
// (load this script BEFORE the rainbow one so [gl] inside [rb] is read first).
// A "Gl" button in the text effects bar wraps your selected text in [gl][/gl]
// (or inserts an empty pair with the cursor between them).
// Everyone with this script sees the effect (including older messages when they join);
// people without it just see the plain text with the [gl] tags.
// Opt out in one browser:  localStorage.setItem("glow_enabled", "0")
(function () {
  // If this script already ran (e.g. you re-saved the channel JS), shut the old copy down first.
  if (window.GLOW_STOP) { try { window.GLOW_STOP(); } catch (e) {} }

  var GLOW_COLOR = "";   // "" = glow in the text's own color; or a color like "#39ff10"
  var PULSE = 2.4;       // seconds for one glow pulse
  // Where the Gl button goes: the text effects bar. If it isn't found, it goes after the
  // Emote List button or before the chat box.
  var BUTTON_HOST = "#text-fx-menu";

  var TOKEN = /(\[\/?gl\])/i;
  var observer = null, timer = 0, btn = null, watching = false;
  var nndEl = null, nndObs = null;

  var sh = function (a, b, c) {
    var col = "var(--gl-c,currentColor)";
    return "0 0 " + a + "px " + col + ",0 0 " + b + "px " + col + ",0 0 " + c + "px " + col;
  };
  // NND draws its comments with a black outline made of text-shadows; keep it when glowing.
  var OUTLINE = "0 -0.063rem #000,0.063rem 0 #000,0 0.063rem #000,-0.063rem 0 #000";
  var style = document.createElement("style");
  style.id = "glow-style";
  style.textContent =
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
    "@media (prefers-reduced-motion:reduce){.gl,.videoText .gl{animation:none;}}";
  document.head.appendChild(style);

  function enabled() {
    try { return localStorage.getItem("glow_enabled") !== "0"; } catch (e) {}
    return true;
  }

  // Does the work on one container: tags -> effect. Safe to run again (no tags left = no-op).
  function applyTo(root) {
    if (!/\[\/?gl\]/i.test(root.textContent)) return;

    var texts = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) texts.push(walker.currentNode);

    var inside = false;     // carries across text nodes, so emotes in the middle are fine
    texts.forEach(function (t) {
      var par = t.parentNode;
      if (!t.nodeValue || (par.closest && (par.closest("a") || par.closest(".username")))) return;
      var frag = document.createDocumentFragment();
      t.nodeValue.split(TOKEN).forEach(function (piece) {
        if (!piece) return;
        if (/^\[gl\]$/i.test(piece)) { inside = true; return; }
        if (/^\[\/gl\]$/i.test(piece)) { inside = false; return; }
        if (inside) {
          var g = document.createElement("span");
          g.className = "gl";
          g.textContent = piece;
          frag.appendChild(g);
        } else {
          frag.appendChild(document.createTextNode(piece));
        }
      });
      par.replaceChild(frag, t);
    });
  }

  function convert(msgEl) {
    if (!msgEl || msgEl.nodeType !== 1 || msgEl.getAttribute("data-gl")) return;
    msgEl.setAttribute("data-gl", "1");
    if (!enabled()) return;

    // The message text is the last span in the line (after timestamp and username).
    var span = msgEl.lastElementChild;
    if (!span || span.tagName !== "SPAN" || span.classList.contains("timestamp")) return;
    applyTo(span);
  }

  // NND scrolling comments (.videoText): same job on the copy NND makes of the message.
  function convertNND(node) {
    if (!node || !enabled()) return;
    var el = node.nodeType === 1 ? node : node.parentNode;
    var vt = el && el.closest && el.closest(".videoText");
    if (vt) applyTo(vt);
  }

  function watch() {
    var buf = document.getElementById("messagebuffer");
    if (!buf) return false;
    Array.prototype.forEach.call(buf.children, convert); // messages already on screen
    if (window.MutationObserver) {
      observer = new MutationObserver(function (records) {
        records.forEach(function (r) {
          Array.prototype.forEach.call(r.addedNodes, convert);
        });
      });
      observer.observe(buf, { childList: true });
    }
    console.log("[glow] watching chat");
    return true;
  }

  // ---- NND (scrolling comments) -------------------------------------------
  function watchNND() {
    var c = document.getElementById("videochatContainer");
    if (!c || !window.MutationObserver) return;
    nndObs = new MutationObserver(function (records) {
      records.forEach(function (r) {
        Array.prototype.forEach.call(r.addedNodes, function (n) { convertNND(n); });
      });
    });
    nndObs.observe(c, { childList: true, subtree: true });
    nndEl = c;
    Array.prototype.forEach.call(c.querySelectorAll(".videoText"), convertNND);
  }

  // ---- Gl button ----------------------------------------------------------
  function wrapSelection() {
    var input = document.getElementById("chatline");
    if (!input) return;
    var open = "[gl]", close = "[/gl]";
    var s = input.selectionStart, e = input.selectionEnd, v = input.value;
    if (input.maxLength > 0 && v.length + open.length + close.length > input.maxLength) return;
    input.value = v.slice(0, s) + open + v.slice(s, e) + close + v.slice(e);
    var caret = (s === e) ? s + open.length : e + open.length + close.length;
    input.focus();
    input.setSelectionRange(caret, caret);
  }

  function ensureButton() {
    var input = document.getElementById("chatline");
    if (!input) return;
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "glow-btn";
      btn.type = "button";
      btn.className = "btn btn-sm btn-default";
      btn.title = "Glow"; // shown as a Bootstrap hint like the other buttons
      var label = document.createElement("span");
      label.className = "gl";
      label.textContent = "Gl";
      btn.appendChild(label);
      btn.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep the selection
      btn.addEventListener("click", wrapSelection);
      try { if (window.jQuery && jQuery.fn.tooltip) jQuery(btn).tooltip({ container: "body" }); } catch (e) {}
    }
    var host = BUTTON_HOST && document.querySelector(BUTTON_HOST);
    if (host) {
      // Only checks the parent (not "last"), so it never fights other buttons for the end spot.
      if (btn.parentNode !== host) host.appendChild(btn);
      return;
    }
    if (document.body.contains(btn)) return;
    var emote = document.getElementById("emotelistbtn");
    if (emote && emote.parentNode) emote.parentNode.insertBefore(btn, emote.nextSibling);
    else if (input.parentNode) input.parentNode.insertBefore(btn, input);
  }

  function tick() {
    if (!watching) watching = watch();
    if (nndEl && !document.body.contains(nndEl)) { nndObs.disconnect(); nndEl = null; }
    if (!nndEl) watchNND();
    ensureButton();
  }
  tick();
  timer = setInterval(tick, 1000);

  window.GLOW_STOP = function () {
    clearInterval(timer);
    if (observer) observer.disconnect();
    if (nndObs) nndObs.disconnect();
    try { if (btn && window.jQuery && jQuery.fn.tooltip) jQuery(btn).tooltip("destroy"); } catch (e) {}
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    if (style.parentNode) style.parentNode.removeChild(style);
  };
})();

// Rainbow chat text: wrap words in [rb]...[/rb] and they are shown with a different, slowly
// shifting color on every letter. The brackets disappear; emotes and links are left alone.
//   hello [rb]rainbow words[/rb] there   ->   only "rainbow words" is colored
// A [rb] with no closing [/rb] colors the rest of the message.
// A small "RB" button next to the chat box wraps your selected text in [rb][/rb]
// (or inserts an empty pair with the cursor between them).
// Everyone with this script sees the effect (including older messages when they join);
// people without it just see the plain text with the [rb] tags.
// Opt out in one browser:  localStorage.setItem("rainbow_enabled", "0")
(function () {
  // If this script already ran (e.g. you re-saved the channel JS), shut the old copy down first.
  if (window.RAINBOW_STOP) { try { window.RAINBOW_STOP(); } catch (e) {} }

  var MAX_LETTERS = 240;  // colored letters per message (the rest stays plain)
  var SPEED = 6;          // seconds for one full color cycle
  var STEP = 0.2;         // seconds of offset between neighboring letters (bigger = more spread)
  // Where the RB button goes: the end of your text effects bar (after Colors).
  // If this element isn't found, it goes after the Emote List button or before the chat box.
  var BUTTON_HOST = "#text-fx-menu";

  var TOKEN = /(\[\/?rb\])/i;
  var observer = null, timer = 0, btn = null, watching = false;
  var nndEl = null, nndObs = null;

  // Medium lightness colors so the text reads on both dark and light themes.
  var style = document.createElement("style");
  style.id = "rainbow-style";
  style.textContent =
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
    "@media (prefers-reduced-motion:reduce){.rb-c{animation-play-state:paused;}}";
  document.head.appendChild(style);

  function enabled() {
    try { return localStorage.getItem("rainbow_enabled") !== "0"; } catch (e) {}
    return true;
  }

  // Build a fragment of per-letter spans for a piece of text. Returns the new letter count too.
  function paint(text, n, frag) {
    text.split(/(\s+)/).forEach(function (p) {
      if (!p) return;
      if (/^\s+$/.test(p) || n.v >= MAX_LETTERS) {
        frag.appendChild(document.createTextNode(p));
        return;
      }
      var word = document.createElement("span"); // keeps a word from breaking mid-word
      word.className = "rb-w";
      var chars = Array.from(p), k = 0;
      for (; k < chars.length && n.v < MAX_LETTERS; k++) {
        var c = document.createElement("span");
        c.className = "rb-c";
        c.style.setProperty("--i", n.v++);
        c.textContent = chars[k];
        word.appendChild(c);
      }
      if (k < chars.length) word.appendChild(document.createTextNode(chars.slice(k).join("")));
      frag.appendChild(word);
    });
  }

  // Does the work on one container: tags -> effect. Safe to run again (no tags left = no-op).
  function applyTo(root) {
    if (!/\[\/?rb\]/i.test(root.textContent)) return;

    var texts = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) texts.push(walker.currentNode);

    var inside = false;     // carries across text nodes, so emotes in the middle are fine
    var n = { v: 0 };
    texts.forEach(function (t) {
      var par = t.parentNode;
      if (!t.nodeValue || (par.closest && (par.closest("a") || par.closest(".username")))) return;
      var frag = document.createDocumentFragment();
      t.nodeValue.split(TOKEN).forEach(function (piece) {
        if (!piece) return;
        if (/^\[rb\]$/i.test(piece)) { inside = true; return; }
        if (/^\[\/rb\]$/i.test(piece)) { inside = false; return; }
        if (inside) paint(piece, n, frag);
        else frag.appendChild(document.createTextNode(piece));
      });
      par.replaceChild(frag, t);
    });
  }

  function convert(msgEl) {
    if (!msgEl || msgEl.nodeType !== 1 || msgEl.getAttribute("data-rb")) return;
    msgEl.setAttribute("data-rb", "1");
    if (!enabled()) return;

    // The message text is the last span in the line (after timestamp and username).
    var span = msgEl.lastElementChild;
    if (!span || span.tagName !== "SPAN" || span.classList.contains("timestamp")) return;
    applyTo(span);
  }

  // NND scrolling comments (.videoText): same job on the copy NND makes of the message.
  function convertNND(node) {
    if (!node || !enabled()) return;
    var el = node.nodeType === 1 ? node : node.parentNode;
    var vt = el && el.closest && el.closest(".videoText");
    if (vt) applyTo(vt);
  }

  function watch() {
    var buf = document.getElementById("messagebuffer");
    if (!buf) return false;
    Array.prototype.forEach.call(buf.children, convert); // messages already on screen
    if (window.MutationObserver) {
      observer = new MutationObserver(function (records) {
        records.forEach(function (r) {
          Array.prototype.forEach.call(r.addedNodes, convert);
        });
      });
      observer.observe(buf, { childList: true });
    }
    console.log("[rainbow] watching chat");
    return true;
  }

  // ---- NND (scrolling comments) -------------------------------------------
  function watchNND() {
    var c = document.getElementById("videochatContainer");
    if (!c || !window.MutationObserver) return;
    nndObs = new MutationObserver(function (records) {
      records.forEach(function (r) {
        Array.prototype.forEach.call(r.addedNodes, function (n) { convertNND(n); });
      });
    });
    nndObs.observe(c, { childList: true, subtree: true });
    nndEl = c;
    Array.prototype.forEach.call(c.querySelectorAll(".videoText"), convertNND);
  }

  // ---- RB button ----------------------------------------------------------
  function wrapSelection() {
    var input = document.getElementById("chatline");
    if (!input) return;
    var open = "[rb]", close = "[/rb]";
    var s = input.selectionStart, e = input.selectionEnd, v = input.value;
    if (input.maxLength > 0 && v.length + open.length + close.length > input.maxLength) return;
    input.value = v.slice(0, s) + open + v.slice(s, e) + close + v.slice(e);
    var caret = (s === e) ? s + open.length : e + open.length + close.length;
    input.focus();
    input.setSelectionRange(caret, caret);
  }

  function ensureButton() {
    var input = document.getElementById("chatline");
    if (!input) return;
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "rainbow-btn";
      btn.type = "button";
      btn.className = "btn btn-sm btn-default";
      btn.title = "Rainbow"; // shown as a Bootstrap hint like the other buttons
      var label = document.createElement("span");
      label.className = "rb-w";
      ["R", "b","w"].forEach(function (ch, i) {
        var c = document.createElement("span");
        c.className = "rb-c";
        c.style.setProperty("--i", i * 3);
        c.textContent = ch;
        label.appendChild(c);
      });
      btn.appendChild(label);
      btn.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep the selection
      btn.addEventListener("click", wrapSelection);
      try { if (window.jQuery && jQuery.fn.tooltip) jQuery(btn).tooltip({ container: "body" }); } catch (e) {}
    }
    var host = BUTTON_HOST && document.querySelector(BUTTON_HOST);
    if (host) {
      // Also moves the button into the bar if it was placed elsewhere before the bar existed.
      if (btn.parentNode !== host || btn !== host.lastElementChild) host.appendChild(btn);
      return;
    }
    if (document.body.contains(btn)) return;
    var emote = document.getElementById("emotelistbtn");
    if (emote && emote.parentNode) emote.parentNode.insertBefore(btn, emote.nextSibling);
    else if (input.parentNode) input.parentNode.insertBefore(btn, input);
  }

  function tick() {
    if (!watching) watching = watch();
    if (nndEl && !document.body.contains(nndEl)) { nndObs.disconnect(); nndEl = null; }
    if (!nndEl) watchNND();
    ensureButton();
  }
  tick();
  timer = setInterval(tick, 1000);

  window.RAINBOW_STOP = function () {
    clearInterval(timer);
    if (observer) observer.disconnect();
    if (nndObs) nndObs.disconnect();
    try { if (btn && window.jQuery && jQuery.fn.tooltip) jQuery(btn).tooltip("destroy"); } catch (e) {}
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    if (style.parentNode) style.parentNode.removeChild(style);
  };
})();
