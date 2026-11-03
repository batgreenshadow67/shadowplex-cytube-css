$(function () {
  var CHAT_KEY = "chatHidden";
  var NND_KEY = "nndHidden";

  var $chatBtn = $('<button id="chat-toggle" type="button"><i class="fa"></i></button>');
  var $nndBtn = $('<button id="nnd-btn" type="button">NND</button>');

  function get(k) { try { return localStorage.getItem(k) === "1"; } catch (e) { return false; } }
  function set(k, v) { try { localStorage.setItem(k, v ? "1" : "0"); } catch (e) {} }

  function setTip($b, text, placement) {
    $b.attr("title", text);
    if ($.fn.tooltip) {
      $b.tooltip("destroy");
      $b.tooltip({ title: text, placement: placement, container: "body" });
    }
  }

  function place() {
    var hidden = $("body").hasClass("chat-hidden");
    var nndOff = $("body").hasClass("nnd-hidden");
    var $nav = $("#navtogglebtn");

    if (!hidden && $nav.length) {
      // chat toggle goes just left of the topbar button
      $chatBtn.attr("class", "btn btn-default btn-chat pull-right").insertBefore($nav);
      if ($chatBtn[0].getBoundingClientRect().left > $nav[0].getBoundingClientRect().left) {
        $chatBtn.insertAfter($nav);
      }
      // NND toggle goes just left of the chat toggle
      $nndBtn.attr("class", "btn btn-default btn-chat pull-right").insertBefore($chatBtn);
      if ($nndBtn[0].getBoundingClientRect().left > $chatBtn[0].getBoundingClientRect().left) {
        $nndBtn.insertAfter($chatBtn);
      }
    } else {
      // chat hidden: both become floating tabs on the right edge
      $chatBtn.attr("class", "btn btn-default btn-sm floating").appendTo("body");
      $nndBtn.attr("class", "btn btn-default btn-sm floating").appendTo("body");
    }

    $nndBtn.toggleClass("off", nndOff);

    var side = hidden ? "left" : "top";
    setTip($chatBtn, hidden ? "Show Chat" : "Hide Chat", side);
    setTip($nndBtn, nndOff ? "Show Scrolling Comments" : "Hide Scrolling Comments", side);
  }

  function applyChat(hidden) {
    $("body").toggleClass("chat-hidden", hidden);
    $chatBtn.find("i").attr("class", "fa " + (hidden ? "fa-angle-double-left" : "fa-angle-double-right"));
    set(CHAT_KEY, hidden);
    place();
    setTimeout(function () { $(window).trigger("resize"); }, 80);
  }

  function applyNnd(hidden) {
    $("body").toggleClass("nnd-hidden", hidden);
    set(NND_KEY, hidden);
    place();
  }

  $chatBtn.on("click", function () { applyChat(!$("body").hasClass("chat-hidden")); });
  $nndBtn.on("click", function () { applyNnd(!$("body").hasClass("nnd-hidden")); });

  // wait for KinoTube to build the footer, then restore saved states
  setTimeout(function () {
    $("body").toggleClass("nnd-hidden", get(NND_KEY));
    applyChat(get(CHAT_KEY));
  }, 300);
});
