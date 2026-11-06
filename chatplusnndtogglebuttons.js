// ============================================================================
// SETUP: add this to your cytube channel settings for this script to work
// ============================================================================
// Channel JS:
//   $.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/chatplusnndtogglebuttons.js");
//
// Channel CSS: none. This script injects its own styles (#chattoggle-style).
//
// Needs on the page: the Nexus script (chat footer #chat-buttons-right and #navtogglebtn, plus
// the NND container #videochatContainer), Font Awesome and jQuery tooltips.
// Hiding the chat turns NND off too (the NND button shows its off position), but you can click
// NND to turn it back on while the chat is hidden. That choice only lasts until the chat is
// shown again, which restores your normal NND setting. The NND button is on by default; the
// chat state and your normal NND setting are remembered per browser (localStorage keys
// "chatHidden" and "nndHidden").
// While the chat is hidden, the footer buttons are invisible until you hover over them.
// NND comments are hidden with visibility (not display:none), so a comment that is
// mid-animation keeps running while hidden and cleans itself up instead of freezing on screen.
// Also adds scroll forwarding so the mouse wheel still scrolls over the empty area.
// If cytubeminiplayer.js is loaded, the chat toggle sits next to its button in the footer.
// ============================================================================


$(function () {
  var CHAT_KEY = "chatHidden";
  var NND_KEY = "nndHidden";
  // While the chat is hidden, NND starts off; this is true if the user turned it back on.
  var nndOnWhileChatOff = false;
  // How visible the footer buttons are while the chat is hidden and the mouse is NOT over them.
  // 0 = fully hidden; try 0.15 for a faint hint of where they are.
  var HIDDEN_BUTTONS_OPACITY = 0;

  var $chatBtn = $('<button id="chat-toggle" type="button"><i class="fa"></i></button>');
  var $nndBtn = $('<button id="nnd-btn" type="button">NND</button>');

  function get(k) { try { return localStorage.getItem(k) === "1"; } catch (e) { return false; } }
  function set(k, v) { try { localStorage.setItem(k, v ? "1" : "0"); } catch (e) {} }

  function setTip($b, text) {
    $b.attr("title", text);
    if ($.fn.tooltip) {
      $b.tooltip("destroy");
      $b.tooltip({ title: text, placement: "top", container: "body" });
    }
  }

  function injectCSS(id, css) {
    var old = document.getElementById(id);
    if (old) old.remove();              // re-running the script replaces the old copy
    var s = document.createElement("style");
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
  injectCSS("chattoggle-style", [
    ".tooltip { pointer-events: none !important; }",
    "#nnd-btn { font-weight: bold; font-size: 11px; }",
    "#nnd-btn.off { opacity: 0.45; }",
    "body.chat-hidden #chatwrap { position: fixed !important; top: 0 !important; right: 0 !important;",
    "  height: 100vh !important; width: var(--chat-w, 400px) !important;",
    "  pointer-events: none !important; z-index: 1000; }",
    "body.chat-hidden #chatwrap, body.chat-hidden #chatwrap * { visibility: hidden !important; }",
    "body.chat-hidden #chat-buttons-right, body.chat-hidden #chat-buttons-right * {",
    "  visibility: visible !important; pointer-events: auto !important; }",
    // while the chat is hidden the footer buttons fade out so they don't cover the video,
    // and fade back in when the mouse is over them (small delay on the way out, so moving
    // between buttons doesn't flicker). Touch screens have no hover, so they stay visible there.
    "body.chat-hidden #chat-buttons-right { opacity: " + HIDDEN_BUTTONS_OPACITY + "; transition: opacity .2s ease .3s; }",
    "body.chat-hidden #chat-buttons-right:hover, body.chat-hidden #chat-buttons-right:focus-within {",
    "  opacity: 1; transition-delay: 0s; }",
    "@media (hover: none) { body.chat-hidden #chat-buttons-right { opacity: 1; } }",
    "body.chat-hidden #videowrap { width: 100% !important; max-width: 100% !important; float: none !important; }",
    // (hiding the chat sets body.nnd-hidden from the script, so NND can be turned back on while it is hidden)
    "body.nnd-hidden #videochatContainer, body.nnd-hidden .videoText { visibility: hidden !important; }",
    "body.chat-hidden, body.chat-hidden #wrap { margin-right: 0 !important; padding-right: 0 !important; }",
    "body.chat-hidden .container-fluid { width: 100% !important; max-width: 100% !important; margin-right: 0 !important; }"
  ].join("\n"));
  function place() {
    var $nav = $("#miniplayer-toggle").length ? $("#miniplayer-toggle") : $("#navtogglebtn");
    if (!$nav.length) return;

    // chat toggle just left of the topbar button
    $chatBtn.attr("class", "btn btn-default btn-chat pull-right").insertBefore($nav);
    if ($chatBtn[0].getBoundingClientRect().left > $nav[0].getBoundingClientRect().left) {
      $chatBtn.insertAfter($nav);
    }
    // NND toggle just left of the chat toggle
    $nndBtn.attr("class", "btn btn-default btn-chat pull-right").insertBefore($chatBtn);
    if ($nndBtn[0].getBoundingClientRect().left > $chatBtn[0].getBoundingClientRect().left) {
      $nndBtn.insertAfter($chatBtn);
    }

    var chatOff = $("body").hasClass("chat-hidden");
    var nndOff = $("body").hasClass("nnd-hidden");
    $nndBtn.toggleClass("off", nndOff);
    setTip($chatBtn, chatOff ? "Show Chat" : "Hide Chat");
    setTip($nndBtn, nndOff ? "Show Scrolling Comments" : "Hide Scrolling Comments");
  }

  function applyChat(hidden) {
    var chat = document.getElementById("chatwrap");
    // remember the chat's width before hiding so it keeps the same footprint
    if (hidden && chat && !$("body").hasClass("chat-hidden")) {
      document.documentElement.style.setProperty("--chat-w", chat.getBoundingClientRect().width + "px");
    }
    if (hidden) nndOnWhileChatOff = false;   // every time the chat is hidden, NND starts off
    $("body").toggleClass("chat-hidden", hidden);
    $chatBtn.find("i").attr("class", "fa " + (hidden ? "fa-angle-double-left" : "fa-angle-double-right"));
    set(CHAT_KEY, hidden);
    syncNnd();
    setTimeout(function () { $(window).trigger("resize"); }, 80);
  }

  // NND is shown or hidden according to the current mode:
  //   chat visible: your saved NND setting
  //   chat hidden:  off, unless you turned it back on since hiding the chat
  function syncNnd() {
    var chatOff = $("body").hasClass("chat-hidden");
    var nndHidden = chatOff ? !nndOnWhileChatOff : get(NND_KEY);
    $("body").toggleClass("nnd-hidden", nndHidden);
    place();
  }

  function toggleNnd() {
    if ($("body").hasClass("chat-hidden")) {
      nndOnWhileChatOff = !nndOnWhileChatOff;   // temporary, not saved
    } else {
      set(NND_KEY, !get(NND_KEY));              // your normal setting, saved
    }
    syncNnd();
  }

  $chatBtn.on("click", function () { applyChat(!$("body").hasClass("chat-hidden")); });
  $nndBtn.on("click", toggleNnd);

  setTimeout(function () { applyChat(get(CHAT_KEY)); }, 300);
});

$(function () {
  var SPEED = 1;    // scroll distance multiplier
  var EASE = 0.15;  // smoothing: lower = floatier/slower to settle, higher = snappier (max 1)

  var scroller = null, target = 0, raf = null;

  function findScroller() {
    var se = document.scrollingElement || document.documentElement;
    if (se.scrollHeight > se.clientHeight + 1) return se;

    var best = null, bestH = 0;
    document.querySelectorAll("body *").forEach(function (el) {
      if (el.closest("#chatwrap")) return;
      var oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") &&
          el.scrollHeight > el.clientHeight + 1 &&
          el.clientHeight > bestH) {
        best = el;
        bestH = el.clientHeight;
      }
    });
    return best || se;
  }

  function step() {
    var cur = scroller.scrollTop;
    var diff = target - cur;
    if (Math.abs(diff) < 1) {
      scroller.scrollTop = target;
      raf = null;
      return;
    }
    var move = diff * EASE;
    if (Math.abs(move) < 1) move = diff > 0 ? 1 : -1; // avoid stalling on tiny steps
    scroller.scrollTop = cur + move;
    raf = requestAnimationFrame(step);
  }

  window.addEventListener("wheel", function (e) {
    if (!document.body.classList.contains("chat-hidden")) return;

    var w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chat-w")) || 400;
    if (e.clientX < window.innerWidth - w) return;

    var dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 19;
    else if (e.deltaMode === 2) dy *= window.innerHeight;

    if (!raf) {
      scroller = findScroller();
      target = scroller.scrollTop;
    }
    var max = scroller.scrollHeight - scroller.clientHeight;
    target = Math.max(0, Math.min(max, target + dy * SPEED));

    if (!raf) raf = requestAnimationFrame(step);
    e.preventDefault();
  }, { passive: false, capture: true });
});
