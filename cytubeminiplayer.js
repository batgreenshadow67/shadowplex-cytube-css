// Mini video player: when the main video scrolls out of view, pin a small
// copy of it on screen (default: top, just left of the chat, below the navbar if it is open).
// The same player is reused (not reloaded); CSS in your channel CSS does the pinning.
//   - Drag the top strip of the pinned video to move it anywhere between the navbar and the
//     chat (double-click the strip to reset the position).
//   - Drag the bottom-left corner to resize it (double-click the corner to reset the size).
//   - Toggle the whole feature with the button in the video controls row, or the x on the
//     mini player (a "Show mini player" pill appears when it is off and the video is out of view).
// Size, position and on/off are remembered in this browser. The position is stored as a
// fraction of the free space, so it scales when the window is resized.
(function () {
  // If this script already ran (e.g. you re-saved the channel JS), shut the old copy down first.
  if (window.MINIPLAYER_STOP) { try { window.MINIPLAYER_STOP(); } catch (e) {} }

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
  var toggleBtn = null;  // on/off button in the video controls row
  var closeBtn = null;   // small x on the pinned player
  var restoreBtn = null; // "show mini player" pill, shown only while it is off
  var mini = false;
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
  // Button next to the other video controls (reload, fullscreen, ...).
  function ensureToggle() {
    var bar = q("#videocontrols");
    if (!bar) return;
    if (!toggleBtn) {
      toggleBtn = document.createElement("button");
      toggleBtn.id = "miniplayer-toggle";
      toggleBtn.type = "button";
      toggleBtn.className = "btn btn-sm btn-default";
      toggleBtn.innerHTML = '<span class="glyphicon glyphicon-resize-small"></span>';
      toggleBtn.addEventListener("click", function () { setEnabled(!enabled); });
    }
    if (toggleBtn.parentNode !== bar) bar.appendChild(toggleBtn);
    syncToggle();
  }

  function syncToggle() {
    if (!toggleBtn) return;
    toggleBtn.classList.toggle("active", enabled);
    toggleBtn.title = enabled ? "Mini player: on (click to turn off)"
                              : "Mini player: off (click to turn on)";
  }

  // Small x on the pinned player: turns the mini player off (turn it back on with the button).
  function getClose(frame) {
    if (!closeBtn) {
      closeBtn = document.createElement("div");
      closeBtn.id = "mini-close";
      closeBtn.title = "Turn off mini player";
      closeBtn.textContent = "×";
      closeBtn.style.cssText =
        "position:absolute;top:4px;right:4px;width:20px;height:20px;z-index:6;" +
        "border-radius:50%;background:rgba(0,0,0,.65);color:#fff;font:16px/19px sans-serif;" +
        "text-align:center;cursor:pointer;opacity:.55;display:none;";
      closeBtn.addEventListener("mouseenter", function () { closeBtn.style.opacity = "1"; });
      closeBtn.addEventListener("mouseleave", function () { closeBtn.style.opacity = ".55"; });
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        setEnabled(false);
      });
    }
    if (closeBtn.parentNode !== frame) frame.appendChild(closeBtn);
    return closeBtn;
  }

  // Small pill shown (only while the mini player is off and the video is out of view)
  // so there is always a way to turn it back on.
  function showRestore(on) {
    if (!restoreBtn) {
      if (!on || !document.body) return;
      restoreBtn = document.createElement("button");
      restoreBtn.id = "mini-restore";
      restoreBtn.type = "button";
      restoreBtn.className = "btn btn-xs btn-default";
      restoreBtn.textContent = "▶ Show mini player";
      restoreBtn.style.cssText =
        "position:fixed;top:var(--mini-top,60px);right:var(--mini-right,360px);" +
        "z-index:1000;display:none;";
      restoreBtn.addEventListener("click", function () { setEnabled(true); });
      document.body.appendChild(restoreBtn);
    }
    restoreBtn.style.display = on ? "block" : "none";
  }

  // ---- geometry -----------------------------------------------------------
  function chatWidth() {
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
    if (!frame) { if (mini) disable(); showRestore(false); return; }

    place();
    attachObservers();

    if (document.fullscreenElement) { if (mini) disable(); showRestore(false); return; }

    var limit = navBottom() + 20;

    if (!enabled) {
      // Mini player is off: if the video is scrolled out of view, offer a small
      // "show mini player" pill where the mini player would have been.
      if (mini) disable();
      var r0 = frame.getBoundingClientRect();
      showRestore(r0.height > 0 && r0.bottom < limit);
      return;
    }
    showRestore(false);

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
    window.removeEventListener("scroll", schedule, { capture: true });
    window.removeEventListener("resize", onResize);
    document.removeEventListener("fullscreenchange", schedule);
    document.removeEventListener("click", onClick);
    clearInterval(timer);
    observers.forEach(function (o) { o.disconnect(); });
    if (raf) cancelAnimationFrame(raf);
    disable();
    [sentinel, handle, moveBar, closeBtn, toggleBtn, restoreBtn].forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  };

  schedule();
})();
