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
// a divider line (same colour as the tab bar line). All colours follow the
// theme's text colour, nothing is hard-coded.
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
// `heading` is any CSS selector:
//   window.MOTDTabsConfig = { heading: ".motd-tab", storageKey: "shadowplex_motd_tab" };
//   window.MOTDTabsConfig = { heading: "h2, .motd-tab" };   // accept both
//   window.MOTDTabsConfig = { heading: "tab" };             // literal <tab> tag (CyTube may strip it)
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
        storageKey: 'shadowplex_motd_tab'
    }, window.MOTDTabsConfig || {});

    var CSS = [
        // Theme-agnostic: everything derives from the surrounding text colour
        // (currentColor), so it follows whatever theme the channel uses.
        // Each color-mix() line has a plain fallback line before it.
        '#motd .motd-end{display:block;height:0;overflow:hidden;font-size:0;line-height:0;padding:0;',
        '  margin:14px 0;border:0;border-top:1px solid currentColor;opacity:.4;clear:both;}',
        '#motd .sp-tabs{margin-top:12px;clear:both;}',
        '#motd .sp-tabbar{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px;',
        '  border-bottom:1px solid rgba(128,128,128,.5);',
        '  border-bottom:1px solid color-mix(in srgb,currentColor 40%,transparent);}',
        '#motd .sp-tab{font:inherit;font-weight:bold;cursor:pointer;color:inherit;opacity:.75;',
        '  background:rgba(128,128,128,.1);background:color-mix(in srgb,currentColor 6%,transparent);',
        '  border:1px solid rgba(128,128,128,.35);border:1px solid color-mix(in srgb,currentColor 25%,transparent);',
        '  border-bottom:none;border-radius:4px 4px 0 0;padding:6px 16px;margin-bottom:-1px;',
        '  transition:background .15s,opacity .15s;}',
        '#motd .sp-tab:hover{opacity:1;',
        '  background:rgba(128,128,128,.2);background:color-mix(in srgb,currentColor 14%,transparent);}',
        '#motd .sp-tab.active{opacity:1;',
        '  background:rgba(128,128,128,.28);background:color-mix(in srgb,currentColor 20%,transparent);',
        '  border-color:rgba(128,128,128,.7);border-color:color-mix(in srgb,currentColor 60%,transparent);}',
        '#motd .sp-tab:focus-visible{outline:2px solid currentColor;outline-offset:2px;}',
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
