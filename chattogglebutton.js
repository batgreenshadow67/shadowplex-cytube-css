$(function () {
  var KEY = "chatHidden";
  var $btn = $('<button id="chat-toggle" type="button"><i class="fa"></i></button>');

  function place() {
    var hidden = $("body").hasClass("chat-hidden");
    var $nav = $("#navtogglebtn");

    if (!hidden && $nav.length) {
      $btn.attr("class", "btn btn-default btn-chat pull-right").insertBefore($nav);
      // make sure it ends up visually LEFT of the topbar button
      if ($btn[0].getBoundingClientRect().left > $nav[0].getBoundingClientRect().left) {
        $btn.insertAfter($nav);
      }
    } else {
      $btn.attr("class", "btn btn-default btn-sm floating").appendTo("body");
    }
  }

  function apply(hidden) {
    $("body").toggleClass("chat-hidden", hidden);
    $btn.find("i").attr("class", "fa " + (hidden ? "fa-angle-double-left" : "fa-angle-double-right"));
    $btn.attr("title", hidden ? "Show chat" : "Hide chat");
    try { localStorage.setItem(KEY, hidden ? "1" : "0"); } catch (e) {}
    place();
    setTimeout(function () { $(window).trigger("resize"); }, 80);
  }

  var saved = false;
  try { saved = localStorage.getItem(KEY) === "1"; } catch (e) {}
  setTimeout(function () { apply(saved); }, 300);

  $btn.on("click", function () {
    apply(!$("body").hasClass("chat-hidden"));
  });
});$(function () {
  var KEY = "chatHidden";

  var $btn = $('<button id="chat-toggle" type="button"></button>');

  function findTopbarBtn() {
    var $t = $('#chatwrap').find('[id*="topbar" i], [class*="topbar" i], [title*="topbar" i]').first();
    if ($t.length) return $t.closest('button, .btn, a');
    // Fallback: the element just left of the AFK button
    var $afk = $('#chatwrap').find('button, .btn, a').filter(function () {
      return $.trim($(this).text()).toUpperCase() === "AFK";
    }).first();
    return $afk.prev();
  }

  function place() {
    var hidden = $("body").hasClass("chat-hidden");
    var $target = findTopbarBtn();
    if (!hidden && $target.length) {
      // copy the neighbor's look so it matches the row
      $btn.attr("class", $target.attr("class")).removeClass("floating active");
      $btn.insertBefore($target);
    } else {
      $btn.attr("class", "btn btn-default btn-sm floating").appendTo("body");
    }
  }

  function apply(hidden) {
    $("body").toggleClass("chat-hidden", hidden);
    $btn.text(hidden ? "‹" : "›").attr("title", hidden ? "Show chat" : "Hide chat");
    try { localStorage.setItem(KEY, hidden ? "1" : "0"); } catch (e) {}
    place();
    setTimeout(function () { $(window).trigger("resize"); }, 80);
  }

  var saved = false;
  try { saved = localStorage.getItem(KEY) === "1"; } catch (e) {}
  $("body").append($btn);
  setTimeout(function () { apply(saved); }, 300);

  $btn.on("click", function () {
    apply(!$("body").hasClass("chat-hidden"));
  });
});$(function () {
  var KEY = "chatHidden";

  var $btn = $('<button id="chat-toggle" class="btn btn-default btn-sm"></button>');
  $("body").append($btn);

  function apply(hidden) {
    $("body").toggleClass("chat-hidden", hidden);
    $btn.text(hidden ? "Show Chat" : "Hide Chat");
    try { localStorage.setItem(KEY, hidden ? "1" : "0"); } catch (e) {}
    // Let the video player resize to the new width
    setTimeout(function () { $(window).trigger("resize"); }, 50);
  }

  var saved = false;
  try { saved = localStorage.getItem(KEY) === "1"; } catch (e) {}
  apply(saved);

  $btn.on("click", function () {
    apply(!$("body").hasClass("chat-hidden"));
  });
});
