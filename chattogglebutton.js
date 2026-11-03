$(function () {
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
