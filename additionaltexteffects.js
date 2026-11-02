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

  function convert(msgEl) {
    if (!msgEl || msgEl.nodeType !== 1 || msgEl.getAttribute("data-rb")) return;
    msgEl.setAttribute("data-rb", "1");
    if (!enabled()) return;

    // The message text is the last span in the line (after timestamp and username).
    var span = msgEl.lastElementChild;
    if (!span || span.tagName !== "SPAN" || span.classList.contains("timestamp")) return;
    if (!/\[\/?rb\]/i.test(span.textContent)) return;

    var texts = [];
    var walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) texts.push(walker.currentNode);

    var inside = false;     // carries across text nodes, so emotes in the middle are fine
    var n = { v: 0 };
    texts.forEach(function (t) {
      if (!t.nodeValue || (t.parentNode.closest && t.parentNode.closest("a"))) return;
      var frag = document.createDocumentFragment();
      t.nodeValue.split(TOKEN).forEach(function (piece) {
        if (!piece) return;
        if (/^\[rb\]$/i.test(piece)) { inside = true; return; }
        if (/^\[\/rb\]$/i.test(piece)) { inside = false; return; }
        if (inside) paint(piece, n, frag);
        else frag.appendChild(document.createTextNode(piece));
      });
      t.parentNode.replaceChild(frag, t);
    });
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
      btn.title = "Rainbow text: wraps the selected text in [rb][/rb]";
      var label = document.createElement("span");
      label.className = "rb-w";
      ["R", "b"].forEach(function (ch, i) {
        var c = document.createElement("span");
        c.className = "rb-c";
        c.style.setProperty("--i", i * 3);
        c.textContent = ch;
        label.appendChild(c);
      });
      btn.appendChild(label);
      btn.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep the selection
      btn.addEventListener("click", wrapSelection);
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
    ensureButton();
  }
  tick();
  timer = setInterval(tick, 1000);

  window.RAINBOW_STOP = function () {
    clearInterval(timer);
    if (observer) observer.disconnect();
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    if (style.parentNode) style.parentNode.removeChild(style);
  };
})();
