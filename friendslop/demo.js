/* friendslop live demo — drives the emscripten build in docs/wasm/demo.js */
(function () {
  "use strict";
  var IW = 640, IH = 360;               // internal render resolution
  var mod = null, img = null, running = true, speed = 1;
  var lastLog = -1;

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("cube"), ctx = canvas ? canvas.getContext("2d") : null;
  var statusEl = $("status");

  function hex(c) { return "#" + ("000000" + (c >>> 0).toString(16)).slice(-6); }

  function setStatus(txt, cls) {
    if (!statusEl) return;
    statusEl.textContent = txt;
    statusEl.className = "badge " + (cls || "live");
  }

  async function boot(seed, crew, noshift) {
    if (!mod) mod = await createCubeDemo();
    mod._web_set_noshift(noshift ? 1 : 0);
    mod._web_init(seed | 0, crew | 0, IW, IH);
    mod._web_set_follow(0);
    canvas.width = mod._web_width();
    canvas.height = mod._web_height();
    img = ctx.createImageData(canvas.width, canvas.height);
    lastLog = -1;
    paint();
  }

  function paint() {
    if (!mod) return;
    var p = mod._web_pixels();
    var px = mod.HEAPU8.subarray(p, p + IW * IH * 4);
    img.data.set(px);
    ctx.putImageData(img, 0, 0);
  }

  var statIds = ["statTime", "statShift", "statDeaths", "statRevives", "statAlive"];
  function updateHud() {
    if (!mod) return;
    var alive = mod._web_alive(), esc = mod._web_escaped(), wipe = mod._web_wiped();
    if (esc) setStatus("ESCAPED", "esc");
    else if (wipe) setStatus("ALL HANDS LOST", "wipe");
    else setStatus("LIVE", "live");

    $("statTime").textContent = mod._web_elapsed().toFixed(0) + "s";
    $("statShift").textContent = mod._web_shift_count();
    $("statDeaths").textContent = mod._web_deaths();
    $("statRevives").textContent = mod._web_revives();
    $("statAlive").textContent = countAlive();
    $("statCrew").textContent = mod._web_crew_count();

    // crew panel
    var cn = mod._web_crew_count(), wrap = $("crew"), html = "";
    for (var i = 0; i < cn; i++) {
      var nm = mod.UTF8ToString(mod._web_crew_name(i));
      var cl = mod.UTF8ToString(mod._web_crew_class(i));
      var hp = mod._web_crew_hp(i);
      var al = mod._web_crew_alive(i);
      var col = hex(mod._web_crew_color(i));
      html += '<div class="prow' + (al ? "" : " dead") + '">' +
        '<span class="chip" style="background:' + col + '"></span>' +
        '<div><div class="pname"><span>' + nm + '</span><span class="cls">' + cl +
        (al ? "" : " · DOWN") + '</span></div>' +
        '<div class="bar"><i style="width:' + Math.max(0, Math.min(100, hp)).toFixed(0) + '%"></i></div></div></div>';
    }
    wrap.innerHTML = html;

    // log feed (rebuild when it grows)
    var ln = mod._web_log_count();
    if (ln !== lastLog) {
      lastLog = ln;
      var start = Math.max(0, ln - 9), f = "";
      for (var j = start; j < ln; j++) {
        var who = mod.UTF8ToString(mod._web_log_who(j));
        var txt = mod.UTF8ToString(mod._web_log_text(j));
        var c = hex(mod._web_log_col(j));
        f += '<div class="ln"><span class="who">[' + who + ']</span> <span style="color:' + c + '">' + txt + '</span></div>';
      }
      var feed = $("feed"); feed.innerHTML = f; feed.scrollTop = feed.scrollHeight;
    }
  }
  function countAlive() {
    var n = 0; for (var i = 0; i < mod._web_crew_count(); i++) if (mod._web_crew_alive(i)) n++; return n;
  }

  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = (now - last) / 1000; last = now;
    if (!mod) return;
    if (running) {
      var sdt = dt * speed;
      if (sdt > 0.05 * speed) sdt = 0.05 * speed;
      if (sdt < 0) sdt = 0;
      mod._web_step(sdt);
      mod._web_render();
      paint();
    }
    updateHud();
  }

  function readControls() {
    var seed = parseInt($("seed").value, 10) || 1;
    var crew = parseInt($("crew").value, 10) || 5;
    var noshift = $("noshift").checked;
    return { seed: seed, crew: crew, noshift: noshift };
  }

  function wire() {
    if (!canvas) return;
    $("restart").addEventListener("click", function () {
      var c = readControls(); boot(c.seed, c.crew, c.noshift);
    });
    $("seed").addEventListener("change", function () {
      var c = readControls(); boot(c.seed, c.crew, c.noshift);
    });
    $("crew").addEventListener("change", function () {
      $("crewVal").textContent = $("crew").value;
      var c = readControls(); boot(c.seed, c.crew, c.noshift);
    });
    $("noshift").addEventListener("change", function () {
      mod._web_set_noshift($("noshift").checked ? 1 : 0);
      var c = readControls(); boot(c.seed, c.crew, c.noshift);
    });
    $("pause").addEventListener("click", function () {
      running = !running;
      $("pause").textContent = running ? "◼ Pause" : "▶ Play";
      setStatus(running ? "LIVE" : "PAUSED", running ? "live" : "live");
    });
    document.querySelectorAll("[data-speed]").forEach(function (b) {
      b.addEventListener("click", function () {
        speed = parseFloat(b.getAttribute("data-speed"));
        document.querySelectorAll("[data-speed]").forEach(function (x) { x.classList.remove("primary"); });
        b.classList.add("primary");
      });
    });
    document.querySelectorAll("[data-follow]").forEach(function (b) {
      b.addEventListener("click", function () {
        var idx = parseInt(b.getAttribute("data-follow"), 10);
        if (mod) mod._web_set_follow(idx);
        document.querySelectorAll("[data-follow]").forEach(function (x) { x.classList.remove("primary"); });
        b.classList.add("primary");
      });
    });
    $("crewVal").textContent = $("crew").value;
    requestAnimationFrame(frame);
    var c = readControls(); boot(c.seed, c.crew, c.noshift);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
