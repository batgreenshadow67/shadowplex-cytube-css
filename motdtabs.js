// ============================================================================
// motdtabs.js - turns the MOTD into clickable tabs
// ============================================================================
// Channel JS:
//   $.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/motdtabs.js");
// Channel CSS: none (styles are injected by this script).
//
// MOTD convention: every element matching the `heading` selector starts a tab
// (default: <div class="motd-tab">). Its text is the tab label and everything
// up to the next marker is the tab's content. Content before the first marker
// stays above the tabs. Fewer than 2 markers = no tabs.
//
// Optional end marker (default: .motd-end): everything AFTER it stays below
// the tabs instead of falling into the last tab. The marker itself is drawn as
// a divider line (same colour as the tab bar line).
//
// Colours: nothing is hard-coded and no text colours are read. Everything comes
// from the MOTD's own border (colour, width, style), found on #motd or the nearest
// box around it: the tab bar line, tab outlines, footer divider, and the tints and
// glow on hover/active tabs. Tab text uses the normal text colour. If the MOTD has
// no border, the text colour is used instead.
//
//   <h1>Title stays on top</h1>
//   <div class="motd-tab">Schedule</div>
//   <p>Tab 1 content...</p>
//   <div class="motd-tab">Other Stuff</div>
//   <p>Tab 2 content...</p>
//   <div class="motd-end">&nbsp;</div>
//   <p>Footer stays at the bottom, outside the tabs</p>
//
// Optional overrides (put before the getScript line in channel JS).
// `heading` and `end` are CSS selectors:
//   window.MOTDTabsConfig = { heading: ".motd-tab", storageKey: "shadowplex_motd_tab" };
//   window.MOTDTabsConfig = { heading: "h2, .motd-tab" };   // accept both
//   window.MOTDTabsConfig = { heading: "tab" };             // literal <tab> tag (CyTube may strip it)
//   window.MOTDTabsConfig = { border: "#39ff10" };          // force a specific line colour
// ============================================================================

(function () {
    'use strict';

    // Re-running (e.g. channel JS saved again): clean up the previous instance.
    if (window.__spMotdTabs && typeof window.__spMotdTabs.destroy === 'function') {
        try { window.__spMotdTabs.destroy(); } catch (e) {}
    }

    var CFG = $.extend({
        heading: '.motd-tab',
        end: '.motd-end',
        border: 'auto',                 // 'auto' = copy the MOTD border, or any CSS colour
        storageKey: 'shadowplex_motd_tab'
    }, window.MOTDTabsConfig || {});

    // Everything is drawn from the MOTD's own border: --sp-line (colour),
    // --sp-line-width, --sp-line-style, set on #motd by build(). Without a border
    // the text colour is used.
    var LINE_COLOR = 'var(--sp-line,color-mix(in srgb,currentColor 40%,transparent))';
    var LINE = 'var(--sp-line-width,1px) var(--sp-line-style,solid) ' + LINE_COLOR;
    var TINT = 'var(--sp-line,currentColor)';

    var CSS = [
        // Each color-mix() line has a plain fallback line before it for browsers
        // without color-mix().
        '#motd .motd-end{display:block;height:0;overflow:hidden;font-size:0;line-height:0;padding:0;',
        '  margin:14px 0;border:0;clear:both;',
        '  border-top:1px solid rgba(128,128,128,.5);border-top:' + LINE + ';}',
        '#motd .sp-tabs{margin-top:12px;clear:both;}',
        '#motd .sp-tabbar{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px;',
        '  border-bottom:1px solid rgba(128,128,128,.5);border-bottom:' + LINE + ';}',
        '#motd .sp-tab{font:inherit;font-weight:bold;cursor:pointer;color:inherit;',
        '  background:rgba(128,128,128,.1);background:color-mix(in srgb,' + TINT + ' 8%,transparent);',
        '  border:1px solid rgba(128,128,128,.35);border:' + LINE + ';',
        '  border-bottom:none;border-radius:4px 4px 0 0;padding:6px 16px;margin-bottom:-1px;',
        '  transition:background .15s,box-shadow .15s;}',
        '#motd .sp-tab:hover{',
        '  background:rgba(128,128,128,.2);background:color-mix(in srgb,' + TINT + ' 16%,transparent);}',
        '#motd .sp-tab.active{',
        '  background:rgba(128,128,128,.28);background:color-mix(in srgb,' + TINT + ' 22%,transparent);',
        '  box-shadow:0 0 8px color-mix(in srgb,' + TINT + ' 35%,transparent);}',
        '#motd .sp-tab:focus-visible{outline:2px solid ' + TINT + ';outline-offset:2px;}',
        '#motd .sp-panel[hidden]{display:none !important;}',
        '#motd .sp-panel-title{display:none !important;}',
        '#motd .sp-panel::after{content:"";display:table;clear:both;}'
    ].join('\n');

    var observer = null;
    var timer = null;

    // A node starts a tab if it is an element matching the heading selector.
    function isHeading(n) {
        if (n.nodeType !== 1) return false;
        try { return $(n).is(CFG.heading); } catch (e) { return false; }
    }

    // A node ends the tab area if it matches the end selector.
    function isEnd(n) {
        if (n.nodeType !== 1 || !CFG.end) return false;
        try { return $(n).is(CFG.end); } catch (e) { return false; }
    }

    function countHeadings(el) {
        var c = 0;
        for (var i = 0; i < el.childNodes.length; i++) if (isHeading(el.childNodes[i])) c++;
        return c;
    }

    // Markers are normally direct children of #motd; also accept one wrapper element.
    function findContainer(m) {
        if (countHeadings(m) >= 2) return m;
        var kids = $(m).children();
        if (kids.length === 1 && countHeadings(kids[0]) >= 2) return kids[0];
        return null;
    }

    // Border to copy: the MOTD's own, from #motd or the nearest box around it.
    // Returns {color, width, style} or null (then the text colour is used).
    function detectBorder(m) {
        var b = CFG.border;
        if (b && b !== 'auto') return { color: b };
        var sides = ['Top', 'Left', 'Right', 'Bottom'];
        for (var el = m, i = 0; el && el.nodeType === 1 && el !== document.body && i < 6; el = el.parentElement, i++) {
            var cs = getComputedStyle(el);
            for (var j = 0; j < sides.length; j++) {
                var w = parseFloat(cs['border' + sides[j] + 'Width']);
                var st = cs['border' + sides[j] + 'Style'];
                var col = cs['border' + sides[j] + 'Color'];
                if (w > 0 && st !== 'none' && st !== 'hidden' && col && col !== 'transparent' &&
                    !/,\s*0\)$/.test(col)) {
                    return { color: col, width: cs['border' + sides[j] + 'Width'], style: st };
                }
            }
        }
        return null;
    }

    function storeKey() {
        return CFG.storageKey + '_' + (window.CHANNEL && window.CHANNEL.name ? window.CHANNEL.name : '');
    }
    function loadTab() { try { return localStorage.getItem(storeKey()); } catch (e) { return null; } }
    function saveTab(label) { try { localStorage.setItem(storeKey(), label); } catch (e) {} }

    function activate($tabs, idx, save) {
        var $btns = $tabs.children('.sp-tabbar').children('.sp-tab');
        var $panels = $tabs.children('.sp-panel');
        if (idx < 0) idx = $btns.length - 1;
        if (idx >= $btns.length) idx = 0;
        $btns.each(function (i) {
            var on = (i === idx);
            $(this).toggleClass('active', on).attr({ 'aria-selected': on ? 'true' : 'false', tabindex: on ? 0 : -1 });
        });
        $panels.each(function (i) { this.hidden = (i !== idx); });
        if (save) saveTab($btns.eq(idx).text());
        return idx;
    }

    function build() {
        var m = document.getElementById('motd');
        if (!m || m.querySelector('.sp-tabs')) return;      // missing or already built
        var c = findContainer(m);
        if (!c) return;                                       // no markers: leave MOTD alone

        var line = detectBorder(m);
        ['--sp-line', '--sp-line-width', '--sp-line-style'].forEach(function (k) { m.style.removeProperty(k); });
        if (line) {
            m.style.setProperty('--sp-line', line.color);
            if (line.width) m.style.setProperty('--sp-line-width', line.width);
            if (line.style) m.style.setProperty('--sp-line-style', line.style);
        }

        var sections = [], cur = null, endNode = null;
        Array.prototype.slice.call(c.childNodes).forEach(function (n) {
            if (endNode) return;                              // after the end marker: left untouched
            if (isEnd(n)) { endNode = n; cur = null; }
            else if (isHeading(n)) { cur = { head: n, nodes: [] }; sections.push(cur); }
            else if (cur) cur.nodes.push(n);
        });

        var $tabs = $('<div class="sp-tabs"></div>');
        var $bar = $('<div class="sp-tabbar" role="tablist"></div>').appendTo($tabs);
        var saved = loadTab(), start = 0;

        sections.forEach(function (s, i) {
            var label = $.trim($(s.head).text()).replace(/\s*[:\uFF1A]\s*$/, '') || ('Tab ' + (i + 1));
            if (label === saved) start = i;
            $('<button type="button" class="sp-tab" role="tab"></button>').text(label).appendTo($bar);
            var $p = $('<div class="sp-panel" role="tabpanel"></div>').appendTo($tabs);
            $(s.head).addClass('sp-panel-title');
            $p.append(s.head);
            // Nodes are MOVED, not copied/re-serialized, so timestamp spans stay intact.
            s.nodes.forEach(function (n) { $p.append(n); });
        });

        if (endNode) $(endNode).before($tabs);                // footer stays below the tabs
        else $(c).append($tabs);
        activate($tabs, start, false);
    }

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(build, 60);
    }

    // Runs after localtimestamps.js (which waits 200ms after setMotd).
    function onSetMotd() { setTimeout(build, 400); }

    function destroy() {
        $(document).off('.spmotdtabs');
        if (observer) { observer.disconnect(); observer = null; }
        clearTimeout(timer);
        try { if (window.socket && socket.removeListener) socket.removeListener('setMotd', onSetMotd); } catch (e) {}
        $('#sp-motd-tabs-css').remove();
        var m = document.getElementById('motd');
        if (m) ['--sp-line', '--sp-line-width', '--sp-line-style'].forEach(function (k) { m.style.removeProperty(k); });
    }

    function init() {
        $('#sp-motd-tabs-css').remove();
        $('<style id="sp-motd-tabs-css"></style>').text(CSS).appendTo('head');

        // Delegated on document: survives localtimestamps.js rewriting #motd's HTML.
        $(document).on('click.spmotdtabs', '#motd .sp-tab', function () {
            activate($(this).closest('.sp-tabs'), $(this).index(), true);
        });
        $(document).on('keydown.spmotdtabs', '#motd .sp-tab', function (e) {
            var d = e.which === 39 ? 1 : (e.which === 37 ? -1 : 0);
            if (!d) return;
            var $t = $(this).closest('.sp-tabs');
            var i = activate($t, $(this).index() + d, true);
            $t.children('.sp-tabbar').children('.sp-tab').eq(i).focus();
            e.preventDefault();
        });

        build();

        // Rebuild whenever #motd's contents get replaced (CyTube re-render, MOTD save).
        var m = document.getElementById('motd');
        if (m && window.MutationObserver) {
            observer = new MutationObserver(schedule);
            observer.observe(m, { childList: true });
        }
        if (window.socket && socket.on) socket.on('setMotd', onSetMotd);
    }

    window.__spMotdTabs = { destroy: destroy, rebuild: build };
    $(init);
})();
