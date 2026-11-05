// ============================================================================
// motdtabs.js - turns the MOTD into clickable tabs
// ============================================================================
// Channel JS:
//   $.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/motdtabs.js");
// Channel CSS: none (styles are injected by this script).
//
// MOTD convention: every <h2> starts a tab. The h2 text is the tab label and
// everything up to the next <h2> is the tab's content. Content before the
// first <h2> stays above the tabs. Fewer than 2 <h2>s = no tabs.
//
// Optional overrides (put before the getScript line in channel JS):
//   window.MOTDTabsConfig = { heading: "h2", storageKey: "shadowplex_motd_tab" };
// ============================================================================

(function () {
    'use strict';

    // Re-running (e.g. channel JS saved again): clean up the previous instance.
    if (window.__spMotdTabs && typeof window.__spMotdTabs.destroy === 'function') {
        try { window.__spMotdTabs.destroy(); } catch (e) {}
    }

    var CFG = $.extend({
        heading: 'h2',
        storageKey: 'shadowplex_motd_tab'
    }, window.MOTDTabsConfig || {});

    var CSS = [
        '#motd .sp-tabs{margin-top:12px;}',
        '#motd .sp-tabbar{display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid rgba(57,255,16,.4);margin-bottom:14px;}',
        '#motd .sp-tab{font:inherit;font-weight:bold;cursor:pointer;color:#39ff10;',
        '  background:rgba(4,21,12,.65);border:1px solid rgba(57,255,16,.25);border-bottom:none;',
        '  border-radius:4px 4px 0 0;padding:6px 16px;margin-bottom:-1px;',
        '  text-shadow:0 0 4px rgba(57,255,16,.7);transition:background .15s,box-shadow .15s;}',
        '#motd .sp-tab:hover{background:rgba(57,255,16,.14);}',
        '#motd .sp-tab.active{background:rgba(57,255,16,.2);border-color:rgba(57,255,16,.6);',
        '  box-shadow:0 0 8px rgba(57,255,16,.35);color:#eaffe4;}',
        '#motd .sp-tab:focus-visible{outline:2px solid #39ff10;outline-offset:2px;}',
        '#motd .sp-panel[hidden]{display:none !important;}',
        '#motd .sp-panel-title{display:none;}',
        '#motd .sp-panel::after{content:"";display:table;clear:both;}'
    ].join('\n');

    var observer = null;
    var timer = null;

    function isHeading(n) {
        return n.nodeType === 1 && n.nodeName.toLowerCase() === CFG.heading.toLowerCase();
    }

    function countHeadings(el) {
        var c = 0;
        for (var i = 0; i < el.childNodes.length; i++) if (isHeading(el.childNodes[i])) c++;
        return c;
    }

    // Headings are normally direct children of #motd; also accept one wrapper element.
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

        var sections = [], cur = null;
        Array.prototype.slice.call(c.childNodes).forEach(function (n) {
            if (isHeading(n)) { cur = { head: n, nodes: [] }; sections.push(cur); }
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

        $(c).append($tabs);
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
