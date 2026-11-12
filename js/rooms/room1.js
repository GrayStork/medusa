/* Room 1: the temple gate. Carved glyph sequence + broken legend + mirrored reading -> 5-digit code.
 * Text and data: G.content.rooms[0]. Persistent state (api.puzzle): revealed (bool), code (string, up to 5), done (bool). */
(function () {
  var timer = null;
  var rubbleEl = null;

  /* Simple carved glyphs, stroked in currentColor. Keyed by the Hebrew glyph name in content.sequence. */
  var GLYPHS = {
    "נחש": '<path d="M8 34c6 0 6-8 12-8s6 8 12 8 6-8 12-8" /><path d="M8 34c-3 0-4-3-2-5" /><circle cx="44" cy="25" r="1.6" fill="currentColor"/>',
    "שמש": '<circle cx="26" cy="26" r="8"/><path d="M26 6v6M26 40v6M6 26h6M40 26h6M12 12l4 4M36 36l4 4M12 40l4-4M36 16l4-4"/>',
    "מגן": '<path d="M26 6l16 6v12c0 10-7 17-16 22C17 41 10 34 10 24V12z"/><path d="M26 14v24M18 24h16"/>',
    "ירח": '<path d="M32 8a18 18 0 1 0 0 36a14 14 0 1 1 0-36z"/>',
    "כוכב": '<path d="M26 6l6 13 14 2-10 10 3 14-13-7-13 7 3-14L6 21l14-2z"/>'
  };
  function glyph(name) {
    return '<svg class="r1-glyph" viewBox="0 0 52 52" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      (GLYPHS[name] || "") + "</svg>";
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var CSS =
    ".room-1 .r1 { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-3); }" +
    ".room-1 .r1-seq { list-style: none; margin: 0; display: flex; justify-content: center; gap: var(--space-3); padding: var(--space-3); }" +
    ".room-1 .r1-tile { width: 96px; display: flex; flex-direction: column; align-items: center; gap: var(--space-1); padding: var(--space-2);" +
    "  background: var(--stone-600); border: 2px solid var(--stone-400); border-radius: var(--radius-sm); color: var(--gold-300);" +
    "  box-shadow: inset 0 3px 6px var(--scrim); }" +
    ".room-1 .r1-glyph { width: 48px; height: 48px; filter: drop-shadow(0 1px 0 var(--stone-900)); }" +
    ".room-1 .r1-tile-name { font-size: 18px; line-height: 24px; color: var(--text); font-weight: 700; }" +
    ".room-1 .r1-mid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); align-items: stretch; }" +
    ".room-1 .r1-tablet { display: flex; gap: var(--space-3); align-items: stretch; padding: var(--space-3); }" +
    ".room-1 .r1-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); flex: 1; }" +
    ".room-1 .r1-legend li { display: flex; align-items: center; gap: var(--space-2); font-size: 18px; line-height: 26px; }" +
    ".room-1 .r1-legend .r1-glyph { width: 26px; height: 26px; color: var(--gold-300); }" +
    ".room-1 .r1-val { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: var(--gold-500); margin-inline-start: auto; }" +
    ".room-1 .r1-legend li.r1-missing { color: var(--text-muted); }" +
    ".room-1 .r1-legend li.r1-missing .r1-val { color: var(--text-muted); }" +
    ".room-1 .r1-piece { border-inline-start: 2px dashed var(--stone-400); padding-inline-start: var(--space-3); display: flex; flex-direction: column; justify-content: center; min-width: 150px; }" +
    ".room-1 .r1-piece .r1-legend li { color: var(--text); }" +
    ".room-1 .r1-rubble { min-height: var(--touch-min); min-width: var(--touch-min); width: 100%; height: 100%; padding: var(--space-2);" +
    "  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-1);" +
    "  background: var(--stone-800); color: var(--text-muted); border: 2px solid var(--stone-400); border-radius: var(--radius-md);" +
    "  font-family: var(--font-body); font-size: 18px; cursor: pointer; transition: box-shadow .2s, border-color .2s; }" +
    ".room-1 .r1-rubble:hover { border-color: var(--gold-500); box-shadow: var(--glow-gold); color: var(--text); }" +
    ".room-1 .r1-rubble:focus-visible { outline: var(--focus-width) solid var(--gold-300); outline-offset: 3px; }" +
    ".room-1 .r1-rubble svg { width: 64px; height: 40px; fill: var(--stone-500); stroke: var(--stone-400); }" +
    ".room-1 .r1-rubble--glow { border-color: var(--gold-300); box-shadow: var(--glow-gold); animation: r1-glow 1.6s ease-in-out infinite; }" +
    "@keyframes r1-glow { 0%,100% { box-shadow: none; } 50% { box-shadow: var(--glow-gold); } }" +
    ".room-1 .r1-inscription { display: flex; align-items: center; padding: var(--space-4); }" +
    ".room-1 .r1-inscription p { font-family: var(--font-display); }" +
    ".room-1 .r1-entry { display: flex; justify-content: center; align-items: center; gap: var(--space-4); flex-wrap: wrap; }" +
    /* secret clue: a small eye carved into the gate, at the far end of the glyph row */
    ".room-1 .r1-gate { position: relative; }" +
    ".room-1 .r1-clue { position: absolute; inset-inline-end: var(--space-3); bottom: var(--space-2); width: 44px; height: 44px; padding: 0; display: grid; place-items: center; }" +
    ".room-1 .r1-clue::after { inset: 16px; }" +
    ".room-1 .r1-clue svg { width: 30px; height: 20px; fill: none; stroke: var(--stone-400); stroke-width: 2; stroke-linecap: round; opacity: .7; filter: drop-shadow(0 1px 0 var(--stone-900)); }" +
    ".room-1 .r1-clue.g-hotspot--found svg { stroke: var(--teal-400); opacity: 1; }" +
    "@media (max-width: 760px) { .room-1 .r1-clue { position: static; display: grid; margin: var(--space-1) auto 0; } }" +
    "@media (prefers-reduced-motion: reduce) { .room-1 .r1-rubble--glow { animation: none; } }";

  var EYE = '<svg viewBox="0 0 30 20" aria-hidden="true" focusable="false"><path d="M2 10c4-6 9-8 13-8s9 2 13 8c-4 6-9 8-13 8S6 16 2 10z"/><circle cx="15" cy="10" r="3.5"/></svg>';

  var ROCKS = '<svg viewBox="0 0 64 40" aria-hidden="true" focusable="false" stroke-width="2">' +
    '<path d="M4 38l6-14 12-4 6 18z"/><path d="M22 38l8-20 14-2 6 22z"/><path d="M46 38l4-12 10 2 2 10z"/><path d="M28 18l6-12 8 4 2 6z"/></svg>';

  G.rooms.register(1, {
    mount: function (root, api) {
      var room = api.room, ui = api.content.ui, P = api.puzzle;
      api.style(CSS);

      function legendRow(name, val, missing) {
        return '<li class="' + (missing ? "r1-missing" : "") + '">' + glyph(name) + "<span>" + esc(name) + '</span><span class="r1-val g-ltr">' +
          (missing ? "?" : val) + "</span></li>";
      }
      var visibleRows = "", key;
      // Legend order: visible values first, then broken lines for the hidden ones.
      for (key in room.legendVisible) visibleRows += legendRow(key, room.legendVisible[key], false);
      for (key in room.legendHidden) visibleRows += legendRow(key, null, true);

      var seq = room.sequence.map(function (n) {
        return '<li class="r1-tile">' + glyph(n) + '<span class="r1-tile-name">' + esc(n) + "</span></li>";
      }).join("");

      var digits = "";
      for (var i = 0; i < room.answer.length; i++) {
        digits += '<input class="g-digit" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="' +
          (i + 1) + " / " + room.answer.length + '">';
      }

      root.innerHTML =
        '<div class="r1">' +
          '<div class="r1-gate"><ol class="r1-seq g-stone" dir="rtl" aria-label="' + esc(room.subtitle) + '">' + seq + "</ol>" +
            '<button type="button" class="g-hotspot r1-clue">' + EYE + "</button></div>" +
          '<div class="r1-mid">' +
            '<div class="r1-tablet g-stone"><ul class="r1-legend">' + visibleRows + '</ul><div class="r1-piece"></div></div>' +
            '<div class="r1-inscription g-parchment"><p>״' + esc(room.inscription) + "״</p></div>" +
          "</div>" +
          '<div class="r1-entry">' +
            '<div class="g-code" role="group" aria-label="' + esc(room.name) + '">' + digits + "</div>" +
            '<button type="button" class="g-btn g-btn--primary r1-check">' + esc(ui.check) + "</button>" +
          "</div>" +
        "</div>";

      /* ---- secret clue ---- */
      var clueBtn = root.querySelector(".r1-clue");
      clueBtn.setAttribute("aria-label", api.clueInfo.label);
      if (api.clueFound()) clueBtn.classList.add("g-hotspot--found");
      clueBtn.addEventListener("click", function () {
        if (api.clueFound()) return;
        api.clue();
        clueBtn.classList.add("g-hotspot--found");
      });

      var piece = root.querySelector(".r1-piece");
      var code = root.querySelector(".g-code");
      var inputs = Array.prototype.slice.call(code.querySelectorAll(".g-digit"));
      var checkBtn = root.querySelector(".r1-check");

      /* ---- rubble / missing tablet piece ---- */
      function renderPiece() {
        if (P.revealed) {
          var rows = "";
          for (var k in room.legendHidden) rows += legendRow(k, room.legendHidden[k], false);
          piece.innerHTML = '<ul class="r1-legend">' + rows + "</ul>";
          rubbleEl = null;
          // The placeholder "?" lines on the broken tablet now point to the piece.
          root.querySelectorAll(".r1-tablet > .r1-legend .r1-missing").forEach(function (li) { li.hidden = true; });
        } else {
          piece.innerHTML = '<button type="button" class="r1-rubble" aria-label="' + esc(room.rubbleLabel) + '">' + ROCKS +
            "<span>" + esc(room.rubbleLabel) + "</span></button>";
          rubbleEl = piece.querySelector(".r1-rubble");
          if (api.hintsUsed() >= 1) rubbleEl.classList.add("r1-rubble--glow");
          rubbleEl.addEventListener("click", function () {
            P.revealed = true; api.save();
            renderPiece();
            var first = piece.querySelector("li");
            if (first) { first.setAttribute("tabindex", "-1"); first.focus(); }
          });
        }
      }
      renderPiece();

      /* ---- code input ---- */
      function value() { return inputs.map(function (x) { return x.value; }).join(""); }
      function store() { P.code = value(); api.save(); }
      function clearWrong() { code.classList.remove("g-code--wrong"); }
      function fill(from, str) {
        var d = String(str).replace(/\D/g, "");
        for (var j = 0; j < d.length && from + j < inputs.length; j++) inputs[from + j].value = d[j];
        var next = Math.min(from + d.length, inputs.length - 1);
        inputs[next].focus();
        store();
      }
      function lock() {
        inputs.forEach(function (x) { x.readOnly = true; });
        code.classList.remove("g-code--wrong");
        code.classList.add("g-code--right");
      }

      inputs.forEach(function (inp, idx) {
        inp.addEventListener("input", function () {
          clearWrong();
          var d = inp.value.replace(/\D/g, "");
          if (d.length > 1) { inp.value = ""; fill(idx, d); return; } // mobile keyboards may drop several digits at once
          inp.value = d;
          store();
          if (d && idx < inputs.length - 1) inputs[idx + 1].focus();
        });
        inp.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); submit(); return; }
          if (e.key === "Backspace" && !inp.value && idx > 0) {
            e.preventDefault(); clearWrong();
            inputs[idx - 1].value = ""; inputs[idx - 1].focus(); store(); return;
          }
          // Digits run left to right (LTR group), so arrows follow screen direction.
          if (e.key === "ArrowLeft" && idx > 0) { e.preventDefault(); inputs[idx - 1].focus(); }
          if (e.key === "ArrowRight" && idx < inputs.length - 1) { e.preventDefault(); inputs[idx + 1].focus(); }
        });
        inp.addEventListener("focus", function () { inp.select(); });
        inp.addEventListener("paste", function (e) {
          var t = (e.clipboardData || window.clipboardData).getData("text") || "";
          var d = t.replace(/\D/g, "");
          if (!d) { e.preventDefault(); return; }
          e.preventDefault(); clearWrong();
          fill(d.length >= inputs.length ? 0 : idx, d);
        });
      });

      function submit() {
        if (P.done) { api.solve(); return; }
        var v = value();
        if (v.length < inputs.length) {
          var empty = inputs.filter(function (x) { return !x.value; })[0];
          if (empty) empty.focus();
          return; // incomplete: no penalty
        }
        if (v === room.answer) {
          P.done = true; api.save();
          lock();
          api.say(room.solvedMessage, "right");
          checkBtn.disabled = true;
          timer = setTimeout(function () { timer = null; api.solve(); }, 1400);
        } else if (room.nearAnswers && room.nearAnswers[v]) {
          clearWrong();
          api.say(room.nearAnswers[v], "near");
        } else {
          code.classList.remove("g-code--wrong");
          void code.offsetWidth; // restart the shake
          code.classList.add("g-code--wrong");
          api.wrong(room.wrongMessage);
        }
      }
      checkBtn.addEventListener("click", submit);

      /* ---- restore ---- */
      if (P.code) for (var c = 0; c < inputs.length; c++) inputs[c].value = P.code[c] || "";
      if (P.done) {
        // Reloaded after the right code (e.g. during the pause): show it open and let them go on.
        lock();
        api.say(room.solvedMessage, "right");
        checkBtn.textContent = ui.next;
      }
    },

    unmount: function () {
      if (timer) { clearTimeout(timer); timer = null; }
      rubbleEl = null;
    },

    onHint: function (level) {
      if (level === 1 && rubbleEl) rubbleEl.classList.add("r1-rubble--glow");
    }
  });
})();
