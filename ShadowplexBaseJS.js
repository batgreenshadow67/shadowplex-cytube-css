//All options below are optional and can be safely removed.
//Most of these options will only take effect the next time the script is loaded.

//Name to display in the top left of the screen
window.ChannelName = "The Green's Shadowplex";

//If set, only custom embeds added by this user will be auto-embedded.
//window.OnlyAutoAcceptEmbedsFrom = "TheGreenshadow";

//Discord link
window.Discord_URL = "";

//Background image URL. Can also be a base64 image (must start with data:image/png;base64,)
//window.Background_Image = "https://cdn.imgchest.com/files/3acdd851643a.png";
window.Background_Image = "https://cdn.imgchest.com/files/0d7e7ec1ccce.png";


//Enable/disable custom CSS and JS editors for all users. Requires users to refresh if changed.
window.EnableCSSPlugin = true;
window.EnableJSPlugin = false;

//If true, polls will become fake bets, where votes will act as "money"
window.UsePollBetPlugin = false;

//Multiplier for "poll bet" amounts per vote.
window.PollBetMultiplier = 1;

//Maximum amount of emotes allowed per message
window.EMOTESPERLINE = 3;

//If true, the "exact" antiflood option will be enabled for new users. Users can turn this option off in Script Settings.
window.EnableExactAntiflood = false;
window.ExactAntifloodCooldown = 10; //Cooldown for this option in seconds

//If true, the "similar" antiflood option will be enabled for new users.
window.EnableSimilarAntiflood = false;
window.SimilarAntifloodCooldown = 10; //Cooldown for this option in seconds

//Forced theme for all users. Current valid options are:

//custtheme_none
//custtheme_billtube
//custtheme_billtube_lw
//custtheme_billtube_halloween
//custtheme_glass
//custtheme_glass_dark
//custtheme_glass_halloween
//custtheme_harakiri

//You may also find theme IDs in the Themes menu by hovering over a theme selection.
//Leave blank to disable: ""
window.ThemeOverride = "custtheme_shadowplex";

//Forced default theme for all brand new users. This will only set the DEFAULT THEME for the first time for each user.
window.DefaultThemeOverride = "custtheme_shadowplex";


window.ExternalThemes = {
    "custtheme_shadowplex": {display_name: "The Green's Shadowplex", author: "Greenshadow", cssLink: "https://batgreenshadow67.github.io/shadowplex-cytube-css/shadowplexstyle.css"},
    "custtheme_jesus": {display_name: "Jesus", author: "God", cssLink: "https://cdn.jsdelivr.net/gh/jesus028-hash/cytube-themes@main/custtheme_jesus_v1.css?"},
    "custtheme_nonamed": {display_name: "The Theme With No Name", author: "BigBadBox", cssLink: "https://batgreenshadow67.github.io/shadowplex-cytube-css/thethemewithnoname.css"},
};

if (!window.RUNONCE) {
    window.RUNONCE = true;
    $.getScript("https://checkthesedubs.github.io/js/Nexus-beta.js")
}

//This applies the theme override, this will fire each time the channel JS is saved
if (window.CLIENT.Nexus) {
    window.CLIENT.Nexus.fn.applyTheme(window.ThemeOverride);
}

$.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/localtimestamps.js");
$.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/cytubeminiplayer.js");
$.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/additionaltexteffects.js");
$.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/chatplusnndtogglebuttons.js");
$.getScript("https://batgreenshadow67.github.io/shadowplex-cytube-css/motdtabs.js");
