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
        "text-align:center;cursor:pointer;display:none;";
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

// !disco: when someone types !disco in chat, every viewer who has this script gets
// colored lights, swinging beams, a mirror ball and music for a short while.
//   !disco        starts it (ignored while one is already running)
//   !disco off    stops it for everyone (same permission as starting)
// Each viewer gets a small "Stop disco" button while it runs. To opt out for good in one
// browser:  localStorage.setItem("disco_enabled", "0")
// Music is a built-in synthesized disco beat, or set AUDIO_URL to play your own file.
(function () {
  // If this script already ran (e.g. you re-saved the channel JS), shut the old copy down first.
  if (window.DISCO_STOP) { try { window.DISCO_STOP(); } catch (e) {} }

  // ---- settings -----------------------------------------------------------
  var DURATION = 30000;     // ms the disco lasts
  var BPM = 120;            // beat speed (match it to your track if you use AUDIO_URL)
  var VOLUME = 0.35;        // 0..1
  var AUDIO_URL = "";       // optional: URL of an mp3/ogg. Empty = built-in synth beat
  var MIN_RANK = 0;         // 0 = anyone can start it, 2 = moderators and up
  var MAX_AGE = 15000;      // ms: ignore chat older than this (chat history replay on join)
  var STARTUP_GUARD = 4000; // ms after load during which commands are ignored
  var COLORS = ["#ff2bd6", "#00e5ff", "#ffe600", "#8a2be2", "#39ff14", "#ff7a00"];
  var BEAMS = [
    { x: 12, c: "#ff2bd6", d: 2.4, a: 30 },
    { x: 37, c: "#00e5ff", d: 3.1, a: 24 },
    { x: 63, c: "#ffe600", d: 2.8, a: 28 },
    { x: 88, c: "#39ff14", d: 3.5, a: 34 }
  ];
  // Chord progression for the synth (Am, F, C, G): root in Hz and third in semitones.
  var PROG = [
    { root: 110.00, third: 3 },
    { root: 87.31,  third: 4 },
    { root: 130.81, third: 4 },
    { root: 98.00,  third: 4 }
  ];

  var loadedAt = Date.now();
  var running = false;
  var beatTimer = 0, endTimer = 0, schedTimer = 0;
  var beatIdx = 0;
  var root = null, wash = null, banner = null;
  var ctx = null, master = null, noiseBuf = null, nextTime = 0, step = 0;
  var audioEl = null;

  // ---- styles -------------------------------------------------------------
  var styleEl = document.createElement("style");
  styleEl.id = "disco-style";
  styleEl.textContent =
    "#disco-root{position:fixed;top:0;right:0;bottom:0;left:0;z-index:900;pointer-events:none;" +
      "overflow:hidden;opacity:1;transition:opacity .6s;}" +
    "#disco-root.out{opacity:0;}" +
    "#disco-wash{position:absolute;top:0;right:0;bottom:0;left:0;mix-blend-mode:screen;opacity:0;}" +
    ".disco-beam{position:absolute;top:-5vh;width:46vw;height:110vh;margin-left:-23vw;" +
      "transform-origin:50% 0;mix-blend-mode:screen;opacity:.5;" +
      "background:linear-gradient(to bottom,var(--c),transparent 80%);" +
      "clip-path:polygon(47% 0,53% 0,100% 100%,0 100%);" +
      "animation:disco-swing var(--d) ease-in-out infinite alternate;}" +
    "@keyframes disco-swing{from{transform:rotate(calc(var(--a) * -1));}to{transform:rotate(var(--a));}}" +
    "#disco-string{position:absolute;top:0;left:50%;width:2px;height:50px;margin-left:-1px;" +
      "background:rgba(255,255,255,.6);}" +
    "#disco-ball{position:absolute;top:50px;left:50%;width:72px;height:72px;margin-left:-36px;" +
      "border-radius:50%;overflow:hidden;" +
      "background:radial-gradient(circle at 35% 30%,#fff 0,#d8d8d8 25%,#7a7a7a 70%,#333 100%);" +
      "box-shadow:0 0 30px 8px rgba(255,255,255,.5);}" +
    "#disco-ball::before{content:'';position:absolute;top:0;right:0;bottom:0;left:0;" +
      "background:repeating-linear-gradient(0deg,rgba(0,0,0,.45) 0 2px,transparent 2px 9px)," +
                 "repeating-linear-gradient(90deg,rgba(0,0,0,.45) 0 2px,transparent 2px 9px);" +
      "animation:disco-spin 1.2s linear infinite;}" +
    "@keyframes disco-spin{from{background-position:0 0,0 0;}to{background-position:0 0,9px 0;}}" +
    "#disco-banner{position:absolute;left:50%;bottom:8vh;transform:translateX(-50%);" +
      "font:700 22px/1 sans-serif;letter-spacing:.3em;color:#fff;white-space:nowrap;" +
      "text-shadow:0 0 10px var(--bc,#f0f),0 0 22px var(--bc,#f0f);}" +
    "#disco-stop{position:absolute;left:12px;bottom:12px;pointer-events:auto;}";
  document.head.appendChild(styleEl);

  // ---- helpers ------------------------------------------------------------
  function disabledHere() {
    try { if (localStorage.getItem("disco_enabled") === "0") return true; } catch (e) {}
    try {
      if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    } catch (e) {}
    return false;
  }

  // Best effort: reads the sender's rank from the userlist item (only used if MIN_RANK > 0).
  function userRank(name) {
    try {
      var el = window.findUserlistItem && window.findUserlistItem(name);
      if (el && el.length) {
        var r = el.data("rank");
        if (r != null) return +r;
      }
    } catch (e) {}
    return -1;
  }

  // ---- visuals ------------------------------------------------------------
  function buildOverlay(who) {
    root = document.createElement("div");
    root.id = "disco-root";

    wash = document.createElement("div");
    wash.id = "disco-wash";
    root.appendChild(wash);

    BEAMS.forEach(function (b) {
      var d = document.createElement("div");
      d.className = "disco-beam";
      d.style.cssText = "left:" + b.x + "%;--c:" + b.c + ";--d:" + b.d + "s;--a:" + b.a + "deg;";
      root.appendChild(d);
    });

    var str = document.createElement("div");
    str.id = "disco-string";
    root.appendChild(str);

    var ball = document.createElement("div");
    ball.id = "disco-ball";
    root.appendChild(ball);

    banner = document.createElement("div");
    banner.id = "disco-banner";
    banner.textContent = "\u2605 DISCO \u2605" + (who ? "  \u00b7  " + who : "");
    root.appendChild(banner);

    var btn = document.createElement("button");
    btn.id = "disco-stop";
    btn.type = "button";
    btn.className = "btn btn-xs btn-default";
    btn.textContent = "Stop disco";
    btn.addEventListener("click", stop);
    root.appendChild(btn);

    document.body.appendChild(root);
  }

  function beat() {
    if (!wash) return;
    var c = COLORS[beatIdx++ % COLORS.length];
    wash.style.background = c;
    if (wash.animate) {
      wash.animate([{ opacity: 0.35 }, { opacity: 0 }],
                   { duration: 60000 / BPM * 0.85, easing: "ease-out" });
    }
    if (banner) banner.style.setProperty("--bc", c);
  }

  // ---- music: synthesized beat -------------------------------------------
  function makeNoise(c) {
    var buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function kick(t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    env(g, t, 0.003, 0.22, 1);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.3);
  }

  function noiseHit(t, type, freq, peak, dur) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = type; f.frequency.value = freq;
    env(g, t, 0.002, dur, peak);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  function tone(t, freq, type, cutoff, peak, dur) {
    var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    f.type = "lowpass"; f.frequency.value = cutoff;
    env(g, t, 0.005, dur, peak);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function playStep(s, t) {
    var ch = PROG[Math.floor(s / 16) % PROG.length];
    var i = s % 16;
    if (i % 4 === 0) kick(t);                                   // four on the floor
    if (i % 4 === 2) noiseHit(t, "highpass", 7000, 0.25, 0.05); // off-beat hi-hat
    if (i === 4 || i === 12) noiseHit(t, "bandpass", 1500, 0.6, 0.14); // clap on 2 and 4
    if (i % 2 === 0) {                                          // octave bass on the eighths
      tone(t, ch.root * (((i / 2) % 2) ? 2 : 1), "sawtooth", 500, 0.5, 0.16);
    }
    if (i === 6 || i === 14) {                                  // chord stab
      [0, ch.third, 7].forEach(function (n) {
        tone(t, ch.root * 4 * Math.pow(2, n / 12), "sawtooth", 2200, 0.09, 0.12);
      });
    }
  }

  function schedule() {
    if (!ctx) return;
    var stepLen = 60 / BPM / 4; // one 16th note
    while (nextTime < ctx.currentTime + 0.12) {
      playStep(step, nextTime);
      nextTime += stepLen;
      step++;
    }
  }

  function synthStart() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      if (ctx.state === "suspended" && ctx.resume) ctx.resume().catch(function () {});
      master = ctx.createGain();
      master.gain.value = VOLUME;
      master.connect(ctx.destination);
      noiseBuf = makeNoise(ctx);
      step = 0;
      nextTime = ctx.currentTime + 0.05;
      schedTimer = setInterval(schedule, 25);
    } catch (e) { ctx = null; }
  }

  function startMusic() {
    if (AUDIO_URL) {
      try {
        audioEl = new Audio(AUDIO_URL);
        audioEl.volume = VOLUME;
        var p = audioEl.play();
        if (p && p.catch) p.catch(function () {}); // browser blocked autoplay: lights still run
      } catch (e) {}
      return;
    }
    synthStart();
  }

  function stopMusic() {
    clearInterval(schedTimer);
    schedTimer = 0;
    if (audioEl) { try { audioEl.pause(); } catch (e) {} audioEl = null; }
    if (ctx) {
      var c = ctx, m = master;
      ctx = null; master = null;
      try { m.gain.setTargetAtTime(0, c.currentTime, 0.15); } catch (e) {}
      setTimeout(function () { try { c.close(); } catch (e) {} }, 800);
    }
  }

  // ---- start / stop -------------------------------------------------------
  function start(who) {
    if (running || disabledHere() || !document.body) return;
    running = true;
    beatIdx = 0;
    buildOverlay(who);
    startMusic();
    beat();
    beatTimer = setInterval(beat, 60000 / BPM);
    endTimer = setTimeout(stop, DURATION);
  }

  function stop() {
    if (!running) return;
    running = false;
    clearInterval(beatTimer);
    clearTimeout(endTimer);
    stopMusic();
    if (root) {
      var r = root;
      root = null; wash = null; banner = null;
      r.classList.add("out");
      setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 700);
    }
  }

  // ---- chat listener ------------------------------------------------------
  function onChat(data) {
    if (!data || typeof data.msg !== "string") return;
    var now = Date.now();
    if (now - loadedAt < STARTUP_GUARD) return;
    if (data.time && now - data.time > MAX_AGE) return;
    var m = data.msg.replace(/<[^>]*>/g, "").trim().match(/^!disco(?:\s+(off|stop))?$/i);
    if (!m) return;
    if (MIN_RANK > 0 && userRank(data.username) < MIN_RANK) return;
    if (m[1]) stop(); else start(data.username);
  }

  if (window.socket && window.socket.on) window.socket.on("chatMsg", onChat);

  window.DISCO_STOP = function () {
    try { if (window.socket && window.socket.off) window.socket.off("chatMsg", onChat); } catch (e) {}
    stop();
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
  };
})();
