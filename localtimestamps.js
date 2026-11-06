// ============================================================================
// SETUP: add this to your cytube channel settings for this script to work
// ============================================================================
// Channel JS:
//   $.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/localtimestamps.js");
//
// Channel CSS: none.
//
// How to use: put Discord-style tags in the channel MOTD, with a 10-digit unix timestamp:
//   <t:1794081600:t>   time          <t:1794081600:f>   date and time
//   <t:1794081600:R>   relative ("in 1 day 20 hrs"); updates every 30 seconds
// Flags: d D t T f F s S R (no flag = f). Times show in each viewer's own timezone.
// Only the MOTD (#motd) is converted, not chat. Needs jQuery and the page's socket.
// ============================================================================


////////////////////////////////Local TimeStamps

(function() {
    function getOrdinalSuffix(day) {
        if (day > 3 && day < 21) return 'th';
        switch (day % 10) {
            case 1:  return "st";
            case 2:  return "nd";
            case 3:  return "rd";
            default: return "th";
        }
    }

    // Two-unit duration: "1 day 20 hrs", "1 hr 45 min", "25 min"
    function formatRelativeDuration(absSecs) {
        var mins = Math.floor(absSecs / 60);
        var hours = Math.floor(mins / 60);
        var days = Math.floor(hours / 24);

        function unit(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

        if (days >= 1) {
            var h = hours % 24;
            return unit(days, 'day', 'days') + (h ? ' ' + unit(h, 'hr', 'hrs') : '');
        }
        if (hours >= 1) {
            var m = mins % 60;
            return unit(hours, 'hr', 'hrs') + (m ? ' ' + m + ' min' : '');
        }
        return mins + ' min';
    }

    function formatDiscordTime(unixStr, flag) {
        var date = new Date(parseInt(unixStr, 10) * 1000);
        if (isNaN(date.getTime())) return "";

        var day = date.getDate();
        var year = date.getFullYear();
        var shortMonthNum = String(date.getMonth() + 1).padStart(2, '0');
        var shortDayNum = String(day).padStart(2, '0');
        var shortDate = shortMonthNum + '/' + shortDayNum + '/' + year;

        var tShort = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        var tLong = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        var longMonthName = date.toLocaleDateString('en-US', { month: 'long' });
        var weekdayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        var verboseDate = longMonthName + ' ' + day + getOrdinalSuffix(day) + ', ' + year;

        switch (flag) {
            case 'd': return shortDate;
            case 'D': return verboseDate;
            case 't': return tShort;
            case 'T': return tLong;
            case 'f': return verboseDate + ' ' + tShort;
            case 'F': return weekdayName + ', ' + verboseDate + ' ' + tShort;
            case 's': return shortDate + ' ' + tShort;
            case 'S': return shortDate + ' ' + tLong;
            case 'R':
                var diffMs = date.getTime() - Date.now();
                var absDiffSecs = Math.floor(Math.abs(diffMs) / 1000);

                // Within the first 60 seconds, display "Now"
                if (absDiffSecs < 60) return "Now";

                var dur = formatRelativeDuration(absDiffSecs);
                return diffMs >= 0 ? "in " + dur : dur + " ago";
            default: return verboseDate + ' ' + tShort;
        }
    }

    function parseDiscordTimeCodes() {
        var motd = $('#motd');
        if (!motd.length) return;

        var html = motd.html();
        var regex = /(?:&lt;|<)t:(\d{10})(?::([dDtTfFsSR]))?(?:&gt;|>)/g;

        var newHtml = html.replace(regex, function(match, unixTimestamp, flag) {
            var activeFlag = flag || 'f';
            return '<span class="discord-countdown-tracker" data-time="' + unixTimestamp + '" data-flag="' + activeFlag + '">' + formatDiscordTime(unixTimestamp, activeFlag) + '</span>';
        });

        if (html !== newHtml) {
            motd.html(newHtml);
        }
    }

    function updateLiveCountdownStrings() {
        $('.discord-countdown-tracker').each(function() {
            var unixStr = $(this).attr('data-time');
            var flag = $(this).attr('data-flag');
            if (unixStr) {
                var freshTimeDisplay = formatDiscordTime(unixStr, flag);
                if ($(this).html() !== freshTimeDisplay) {
                    $(this).html(freshTimeDisplay);
                }
            }
        });
    }

    $(document).ready(function() {
        parseDiscordTimeCodes();
        updateLiveCountdownStrings();
    });

    if (window.socket) {
        socket.on('setMotd', function() {
            setTimeout(function() {
                parseDiscordTimeCodes();
                updateLiveCountdownStrings();
            }, 200);
        });
    }

    // Checked every 30 seconds to update live increments smoothly
    setInterval(updateLiveCountdownStrings, 30000);
})();
