// ============================================================================
// SETUP: add these to your cytube channel settings for this script to work
// ============================================================================
// Channel JS:
//   $.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/cytubeminiplayer.js");
//
// Channel CSS (this script only measures space and sets --mini-top / --mini-right /
// --mini-width; the CSS below does the actual pinning and styling):
//   body.mini-video #videowrap .embed-responsive {
//     position: fixed !important;
//     top: var(--mini-top, 60px);
//     right: var(--mini-right, 360px);
//     width: var(--mini-width, 320px) !important;
//     height: calc(var(--mini-width, 320px) * 0.5625) !important;
//     min-height: 0 !important;
//     max-height: none !important;
//     padding: 0 !important;
//     z-index: 1000;
//     background: #000;
//     border: 0;
//     border-radius: 0;
//     overflow: hidden;
//     box-shadow: 0 4px 14px rgba(0,0,0,.6);
//   }
//   #mini-close { opacity: 0; transition: opacity .15s; }
//   body.mini-video #videowrap .embed-responsive:hover #mini-close { opacity: .8 !important; }
//   body.mini-video #videowrap .embed-responsive:hover #mini-close:hover { opacity: 1 !important; }
//   @media (hover: none) { #mini-close { opacity: .8; } }
//   body.mini-video #videochatContainer, body.mini-video .videoText { display: none !important; }
//   .tooltip { pointer-events: none !important; }
//   #miniplayer-toggle:not(.active) { opacity: 0.45; }   /* dims the footer button while off */
//
// Needs on the page: the Nexus script (loaded from the channel JS) for the chat footer
// (#chat-buttons-right, #navtogglebtn), plus jQuery tooltips and Font Awesome.
// Works with chatplusnndtogglebuttons.js: while the chat is hidden (body.chat-hidden),
// the mini player can move into the space the chat used.
// ============================================================================


// Mini video player: when the main video scrolls out of view, pin a small
// copy of it on screen (default: top, just left of the chat, below the navbar if it is open).
// The same player is reused (not reloaded); CSS in your channel CSS does the pinning.
//   - Drag the top strip of the pinned video to move it anywhere between the navbar and the
//     chat (double-click the strip to reset the position).
//   - Drag the bottom-left corner to resize it (double-click the corner to reset the size).
//   - Toggle the whole feature with the button in the chat footer (left of NND), or turn it
//     off with the x on the mini player.
// Size, position and on/off are remembered in this browser. The position is stored as a
// fraction of the free space, so it scales when the window is resized.
(function () {
  // If this script already ran (e.g. you re-saved the channel JS), shut the old copy down first.
  if (window.MINIPLAYER_STOP) { try { window.MINIPLAYER_STOP(); } catch (e) {} }

  injectCSS("miniplayer-style", [
    "body.mini-video #videowrap .embed-responsive {",
    "  position: fixed !important; top: var(--mini-top, 60px); right: var(--mini-right, 360px);",
    "  width: var(--mini-width, 320px) !important;",
    "  height: calc(var(--mini-width, 320px) * 0.5625) !important;",
    "  min-height: 0 !important; max-height: none !important; padding: 0 !important;",
    "  z-index: 1000; background: #000; border: 0; border-radius: 0; overflow: hidden;",
    "  box-shadow: 0 4px 14px rgba(0,0,0,.6); }",
    "#mini-close { opacity: 0; transition: opacity .15s; }",
    "body.mini-video #videowrap .embed-responsive:hover #mini-close { opacity: .8 !important; }",
    "body.mini-video #videowrap .embed-responsive:hover #mini-close:hover { opacity: 1 !important; }",
    "@media (hover: none) { #mini-close { opacity: .8; } }",
    "body.mini-video #videochatContainer, body.mini-video .videoText { display: none !important; }",
    ".tooltip { pointer-events: none !important; }",
    "#miniplayer-toggle:not(.active) { opacity: 0.45; }"
  ].join("\n"));
  
  var DEFAULT_WIDTH = 320; // px, starting width of the small player
  var MIN_WIDTH = 200;     // px, smallest it can be dragged to
  var GAP = 10;            // px, space from the navbar/top, the chat and the window edges
  var STORE_KEY = "miniplayer_width";
  var POS_KEY = "miniplayer_pos";
  var ENABLED_KEY = "miniplayer_enabled";
  var DEFAULT_POS = { fx: 1, fy: 0 };   // far right (next to chat), top (under navbar)

  var MINI_WIDTH = loadWidth();
  var pos = loadPos();     // fx / fy: 0..1 position within the free space
  var enabled = loadEnabled();
  var toggleBtn = null;  // on/off button in the chat footer, left of NND
  var closeBtn = null;   // small x on the pinned player
  var mini = false;var anchor = q("#navtogglebtn");
  var sentinel = null;   // invisible spacer that holds the video's place while it is pinned
  var handle = null;     // the resize corner
  var moveBar = null;    // the drag strip along the top
  var dragging = null;   // resize drag state
  var moving = null;     // move drag state
  var raf = 0;
  var observers = [];
  var observed = { nav: false, chat: false };

  function q(s) { return document.querySelector(s); }
  function clamp01(v) { return Math.min(1, Math.max(0, v)); }

  function injectCSS(id, css) {
  var old = document.getElementById(id);
  if (old) old.remove();              // re-running the script replaces the old copy
  var s = document.createElement("style");
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
  }

  // ---- saved settings -----------------------------------------------------
  function loadWidth() {
    try {
      var v = parseInt(localStorage.getItem(STORE_KEY), 10);
      if (v > 0) return v;
    } catch (e) {}
    return DEFAULT_WIDTH;
  }

  function saveWidth() {
    try { localStorage.setItem(STORE_KEY, String(Math.round(MINI_WIDTH))); } catch (e) {}
  }

  function loadPos() {
    try {
      var p = JSON.parse(localStorage.getItem(POS_KEY));
      if (p && isFinite(p.fx) && isFinite(p.fy)) return { fx: clamp01(p.fx), fy: clamp01(p.fy) };
    } catch (e) {}
    return { fx: DEFAULT_POS.fx, fy: DEFAULT_POS.fy };
  }

  function savePos() {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ fx: pos.fx, fy: pos.fy })); } catch (e) {}
  }

  function loadEnabled() {
    try { return localStorage.getItem(ENABLED_KEY) !== "0"; } catch (e) {}
    return true;
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(ENABLED_KEY, on ? "1" : "0"); } catch (e) {}
    if (!on) disable();
    syncToggle();
    schedule();
  }

  // ---- on/off controls ----------------------------------------------------
  function hasTooltips() { return !!(window.jQuery && jQuery.fn.tooltip); }

  // Button in the chat footer, directly left of NND. This runs every cycle, so it
  // only moves the button when it is out of place.
  function ensureToggle() {
    var right = q("#chat-buttons-right");
    var anchor = q("#navtogglebtn");
    if (!right || !anchor) return;

    if (!toggleBtn) {
      toggleBtn = document.createElement("button");
      toggleBtn.id = "miniplayer-toggle";
      toggleBtn.type = "button";
      toggleBtn.className = "btn btn-default btn-chat pull-right";
      toggleBtn.innerHTML = '<i class="fa fa-compress"></i>';
      toggleBtn.addEventListener("click", function () {
        if (hasTooltips()) jQuery(toggleBtn).tooltip("hide");
        setEnabled(!enabled);
      });
      // same style of hover hint as the other footer buttons, created once
      if (hasTooltips()) {
        jQuery(toggleBtn).tooltip({
          placement: "top", container: "body", trigger: "hover",
          title: function () {
            return enabled ? "Mini player: on (click to turn off)"
                           : "Mini player: off (click to turn on)";
          }
        });
      }
    }

    // keep it directly left of the anchor; the footer buttons are floated right, so check visually
    if (toggleBtn.parentNode !== right) right.insertBefore(toggleBtn, anchor);
    var t = toggleBtn.getBoundingClientRect(), n = anchor.getBoundingClientRect();
    if (t.width && n.width) {
      var adjacent = toggleBtn.nextElementSibling === anchor || toggleBtn.previousElementSibling === anchor;
      if (t.left > n.left || !adjacent) {
        right.insertBefore(toggleBtn, anchor);
        if (toggleBtn.getBoundingClientRect().left > anchor.getBoundingClientRect().left) {
          right.insertBefore(toggleBtn, anchor.nextSibling);
        }
      }
    }
    syncToggle();
  }

  function syncToggle() {
    if (!toggleBtn) return;
    toggleBtn.classList.toggle("active", enabled);
    if (!hasTooltips()) {
      toggleBtn.title = enabled ? "Mini player: on (click to turn off)"
                                : "Mini player: off (click to turn on)";
    }
  }

  // Small x on the pinned player: turns the mini player off (turn it back on with the footer button).
  function getClose(frame) {
    if (!closeBtn) {
      closeBtn = document.createElement("div");
      closeBtn.id = "mini-close";
      closeBtn.title = "Turn off mini player";
      closeBtn.textContent = "×";
      closeBtn.style.cssText =
        "position:absolute;top:4px;right:4px;width:20px;height:20px;z-index:6;" +
        "border-radius:50%;background:rgba(0,0,0,.65);color:#fff;font:16px/19px sans-serif;" +
        "text-align:center;cursor:pointer;display:none;";
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        setEnabled(false);
      });
    }
    if (closeBtn.parentNode !== frame) frame.appendChild(closeBtn);
    return closeBtn;
  }

  // ---- geometry -----------------------------------------------------------
  function chatWidth() {
    if (document.body.classList.contains("chat-hidden")) return 0;
    var chat = q("#chatwrap");
    return chat ? chat.offsetWidth : 0;
  }

  // Bottom edge of the navbar, or 0 if it is hidden / toggled off.
  function navBottom() {
    var nav = q(".navbar");
    if (!nav) return 0;
    var cs = getComputedStyle(nav);
    if (cs.display === "none" || cs.visibility === "hidden") return 0;
    return Math.max(0, Math.round(nav.getBoundingClientRect().bottom));
  }

  // Never wider than the space between the window edge and the chat, or taller than
  // the space between the navbar and the bottom of the window.
  function clamp(w) {
    var de = document.documentElement;
    var maxW = de.clientWidth - chatWidth() - GAP * 2;
    var maxH = de.clientHeight - navBottom() - GAP * 2;
    var max = Math.max(MIN_WIDTH, Math.min(maxW, maxH * 16 / 9));
    return Math.min(Math.max(w, MIN_WIDTH), max);
  }

  // The rectangle the mini player may move in: from the left window edge to the chat,
  // and from the navbar to the bottom of the window.
  function geom() {
    var de = document.documentElement;
    var w = MINI_WIDTH, h = w * 9 / 16;
    var minX = GAP, minY = navBottom() + GAP;
    return {
      cw: de.clientWidth,
      w: w, h: h,
      minX: minX, minY: minY,
      spanX: Math.max(0, de.clientWidth - chatWidth() - GAP - minX - w),
      spanY: Math.max(0, de.clientHeight - GAP - minY - h)
    };
  }

  function currentLeftTop() {
    var g = geom();
    return { left: g.minX + pos.fx * g.spanX, top: g.minY + pos.fy * g.spanY };
  }

  // Set the stored position from a pixel position (left/top of the mini player).
  function setPosPx(left, top) {
    var g = geom();
    pos.fx = g.spanX > 0 ? clamp01((left - g.minX) / g.spanX) : DEFAULT_POS.fx;
    pos.fy = g.spanY > 0 ? clamp01((top - g.minY) / g.spanY) : DEFAULT_POS.fy;
  }

  function place() {
    MINI_WIDTH = clamp(MINI_WIDTH);
    var g = geom();
    var lt = { left: g.minX + pos.fx * g.spanX, top: g.minY + pos.fy * g.spanY };
    var s = document.documentElement.style;
    s.setProperty("--mini-top", Math.round(lt.top) + "px");
    s.setProperty("--mini-right", Math.round(g.cw - (lt.left + g.w)) + "px");
    s.setProperty("--mini-width", Math.round(g.w) + "px");
  }

  function getSentinel(frame) {
    if (!sentinel) {
      sentinel = document.createElement("div");
      sentinel.id = "mini-sentinel";
      sentinel.style.display = "none";
    }
    if (sentinel.parentNode !== frame.parentNode) {
      frame.parentNode.insertBefore(sentinel, frame);
    }
    return sentinel;
  }

  // ---- resize handle (bottom-left corner) ---------------------------------
  // Resizing keeps the top-right corner fixed, like before.
  function resizeTo(w, rightEdge, top) {
    MINI_WIDTH = clamp(w);
    setPosPx(rightEdge - MINI_WIDTH, top);
    place();
  }

  function getHandle(frame) {
    if (!handle) {
      handle = document.createElement("div");
      handle.id = "mini-resize-handle";
      handle.title = "Drag to resize (double-click to reset)";
      handle.style.cssText =
        "position:absolute;left:0;bottom:0;width:22px;height:22px;z-index:5;" +
        "cursor:nesw-resize;touch-action:none;display:none;background:transparent;";

      handle.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        var lt = currentLeftTop();
        dragging = { x: e.clientX, y: e.clientY, w: MINI_WIDTH,
                     right: lt.left + MINI_WIDTH, top: lt.top };
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      });
      handle.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var dx = dragging.x - e.clientX;               // dragging left = wider
        var dy = (e.clientY - dragging.y) * 16 / 9;    // dragging down = wider
        resizeTo(dragging.w + (Math.abs(dx) > Math.abs(dy) ? dx : dy), dragging.right, dragging.top);
      });
      var endDrag = function (e) {
        if (!dragging) return;
        dragging = null;
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        saveWidth();
        savePos();
      };
      handle.addEventListener("pointerup", endDrag);
      handle.addEventListener("pointercancel", endDrag);
      handle.addEventListener("dblclick", function () {
        var lt = currentLeftTop();
        resizeTo(DEFAULT_WIDTH, lt.left + MINI_WIDTH, lt.top);
        saveWidth();
        savePos();
      });
    }
    if (handle.parentNode !== frame) frame.appendChild(handle);
    return handle;
  }

  // ---- move strip (top edge) ----------------------------------------------
  function getMoveBar(frame) {
    if (!moveBar) {
      moveBar = document.createElement("div");
      moveBar.id = "mini-move-bar";
      moveBar.title = "Drag to move (double-click to reset position)";
      moveBar.style.cssText =
        "position:absolute;top:0;left:0;right:28px;height:18px;z-index:5;" +
        "cursor:move;touch-action:none;display:none;background:transparent;";
      moveBar.addEventListener("mouseenter", function () {
        moveBar.style.background = "linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,0))";
      });
      moveBar.addEventListener("mouseleave", function () {
        if (!moving) moveBar.style.background = "transparent";
      });

      moveBar.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        var lt = currentLeftTop();
        moving = { x: e.clientX, y: e.clientY, left: lt.left, top: lt.top };
        try { moveBar.setPointerCapture(e.pointerId); } catch (_) {}
      });
      moveBar.addEventListener("pointermove", function (e) {
        if (!moving) return;
        setPosPx(moving.left + (e.clientX - moving.x), moving.top + (e.clientY - moving.y));
        place();
      });
      var endMove = function (e) {
        if (!moving) return;
        moving = null;
        try { moveBar.releasePointerCapture(e.pointerId); } catch (_) {}
        moveBar.style.background = "transparent";
        savePos();
      };
      moveBar.addEventListener("pointerup", endMove);
      moveBar.addEventListener("pointercancel", endMove);
      moveBar.addEventListener("dblclick", function () {
        pos.fx = DEFAULT_POS.fx;
        pos.fy = DEFAULT_POS.fy;
        place();
        savePos();
      });
    }
    if (moveBar.parentNode !== frame) frame.appendChild(moveBar);
    return moveBar;
  }

  // ---- pinned / unpinned --------------------------------------------------
  function enable(frame, height) {
    var s = getSentinel(frame);
    s.style.height = height + "px";
    s.style.display = "block";
    getHandle(frame).style.display = "block";
    getMoveBar(frame).style.display = "block";
    getClose(frame).style.display = "block";
    mini = true;
    document.body.classList.add("mini-video");
  }

  function disable() {
    mini = false;
    dragging = null;
    moving = null;
    document.body.classList.remove("mini-video");
    if (sentinel) sentinel.style.display = "none";
    if (handle) handle.style.display = "none";
    if (moveBar) moveBar.style.display = "none";
    if (closeBtn) closeBtn.style.display = "none";
  }

  function check() {
    raf = 0;
    ensureToggle();
    var wrap = q("#videowrap");
    var frame = wrap && wrap.querySelector(".embed-responsive");
    if (!frame) { if (mini) disable(); return; }

    place();
    attachObservers();

    if (document.fullscreenElement) { if (mini) disable(); return; }

    // Mini player is off: nothing to pin.
    if (!enabled) { if (mini) disable(); return; }

    var limit = navBottom() + 20;

    if (!mini) {
      // Normal mode: watch the real video frame.
      var r = frame.getBoundingClientRect();
      if (r.height > 0 && r.bottom < limit) enable(frame, r.height);
    } else {
      // Pinned mode: the frame is fixed now, so watch the spacer that holds its place.
      var rs = sentinel.getBoundingClientRect();
      if (rs.bottom >= limit) disable();
      else { getHandle(frame); getMoveBar(frame); getClose(frame); }   // keep attached if the page rebuilt the frame
    }
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(check);
  }

  function onResize() { disable(); schedule(); }

  function onClick(e) {
    if (e.target && e.target.closest && e.target.closest("#navtogglebtn")) {
      setTimeout(schedule, 50);
      setTimeout(schedule, 450);
    }
  }

  // Re-check when the navbar is toggled or the chat is resized.
  function attachObservers() {
    if (!window.MutationObserver) return;
    var nav = q(".navbar");
    var chat = q("#chatwrap");
    if (nav && !observed.nav) {
      var m1 = new MutationObserver(schedule);
      m1.observe(nav, { attributes: true, attributeFilter: ["class", "style"] });
      observers.push(m1);
      observed.nav = true;
    }
    if (chat && !observed.chat) {
      var m2 = new MutationObserver(schedule);
      m2.observe(chat, { attributes: true, attributeFilter: ["style"] });
      observers.push(m2);
      observed.chat = true;
    }
  }

  // capture:true also catches scrolling inside inner containers, not just the window.
  window.addEventListener("scroll", schedule, { passive: true, capture: true });
  window.addEventListener("resize", onResize);
  document.addEventListener("fullscreenchange", schedule);
  document.addEventListener("click", onClick);

  // Safety net: also re-check a few times a second. This covers page reloads
  // (scroll position restored before the video exists) and anything else that
  // changes the layout without firing a scroll event.
  var timer = setInterval(schedule, 400);

  window.MINIPLAYER_STOP = function () {
    var st = document.getElementById("miniplayer-style"); if (st) st.remove();
    window.removeEventListener("scroll", schedule, { capture: true });
    window.removeEventListener("resize", onResize);
    document.removeEventListener("fullscreenchange", schedule);
    document.removeEventListener("click", onClick);
    clearInterval(timer);
    observers.forEach(function (o) { o.disconnect(); });
    if (raf) cancelAnimationFrame(raf);
    disable();
    if (toggleBtn && window.jQuery && jQuery.fn.tooltip) { try { jQuery(toggleBtn).tooltip("destroy"); } catch (e) {} }
    [sentinel, handle, moveBar, closeBtn, toggleBtn].forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  };

  schedule();
})();
