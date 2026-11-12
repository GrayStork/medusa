/* Room 4: the curse laboratory. Pick two bottles whose energy sums to the target.
 * Text and data: G.content.rooms[3]. Persistent state (api.puzzle):
 *   slots: [bottleId|null, bottleId|null], pairs: ["blue+gold", ...] (sorted ids), opened: bool, checkShown: bool */
(function () {
  var timers = [];
  var rootEl = null;

  /* content tone -> design token */
  var TONE = { teal: "var(--teal-400)", error: "var(--error)", success: "var(--success)", gold: "var(--gold-500)" };

  /* New labels not (yet) in content.js. Override from content by adding the same keys to rooms[3]. */
  var FALLBACK = {
    mixLabel: "ערבבו",
    emptySlot: "מקום ריק בקדרה",
    revealLabel: "הציגו תשובה",
    cauldron: "קדרה"
  };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function flask(tone, empty) {
    return '<svg class="r4-flask" viewBox="0 0 48 64" aria-hidden="true" focusable="false">' +
      (empty ? "" : '<path class="r4-flask-liquid" style="fill:' + tone + '" d="M10 40h28l6 12c2 5-1 9-6 9H10c-5 0-8-4-6-9z"/>') +
      '<path class="r4-flask-glass" d="M18 4h12M20 4v18L5 52c-2 5 1 9 6 9h26c5 0 8-4 6-9L28 22V4"/></svg>';
  }

  var CSS =
    ".room-4 .r4 { max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: 1.2fr 1fr; gap: var(--space-4); align-items: start; }" +
    ".room-4 .r4-lab { display: flex; flex-direction: column; gap: var(--space-3); }" +
    ".room-4 .r4-shelf { display: flex; justify-content: center; gap: var(--space-3); padding: var(--space-3); }" +
    ".room-4 .r4-bottle { width: 104px; min-height: var(--touch-min); display: flex; flex-direction: column; align-items: center; gap: var(--space-1);" +
    "  padding: var(--space-2); background: var(--stone-800); color: var(--text); border: 2px solid var(--stone-400); border-radius: var(--radius-md);" +
    "  font-family: var(--font-body); cursor: pointer; transition: box-shadow .2s, border-color .2s; }" +
    ".room-4 .r4-bottle:hover:not([disabled]) { border-color: var(--gold-500); box-shadow: var(--glow-gold); }" +
    ".room-4 .r4-bottle:focus-visible, .room-4 .r4-slot:focus-visible { outline: var(--focus-width) solid var(--gold-300); outline-offset: 3px; }" +
    ".room-4 .r4-bottle[disabled] { cursor: not-allowed; border-style: dashed; color: var(--text-muted); }" +
    ".room-4 .r4-bottle[disabled] .r4-flask { opacity: .5; }" +
    ".room-4 .r4-flask { width: 34px; height: 46px; }" +
    ".room-4 .r4-flask-glass { fill: none; stroke: var(--text); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }" +
    ".room-4 .r4-name { font-size: 18px; line-height: 24px; font-weight: 700; }" +
    ".room-4 .r4-num { font-family: var(--font-display); font-size: 28px; line-height: 32px; font-weight: 700; color: var(--gold-500); }" +
    ".room-4 .r4-bottle[disabled] .r4-num { color: var(--text-muted); }" +
    ".room-4 .r4-bottle--hint { border-color: var(--teal-400); box-shadow: var(--glow-teal); }" +
    ".room-4 .r4-cauldron { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); padding: var(--space-3); }" +
    ".room-4 .r4-slots { display: flex; align-items: center; gap: var(--space-3); direction: ltr; }" +
    ".room-4 .r4-plus { font-size: 28px; font-weight: 700; color: var(--gold-500); }" +
    ".room-4 .r4-slot { width: 112px; height: 76px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;" +
    "  background: var(--stone-800); color: var(--text-muted); border: 2px dashed var(--stone-400); border-radius: var(--radius-md);" +
    "  font-family: var(--font-body); font-size: 18px; cursor: pointer; direction: rtl; }" +
    ".room-4 .r4-slot--filled { border-style: solid; border-color: var(--gold-500); color: var(--text); background: var(--stone-600); }" +
    ".room-4 .r4-slot--filled:hover { box-shadow: var(--glow-gold); }" +
    ".room-4 .r4-slot .r4-swatch { width: 28px; height: 10px; border-radius: var(--radius-round); }" +
    ".room-4 .r4-pot { width: 220px; height: 72px; border: 3px solid var(--stone-400); border-top-width: 6px; border-radius: 0 0 50% 50% / 0 0 100% 100%;" +
    "  background: var(--stone-900); overflow: hidden; position: relative; display: grid; place-items: center; }" +
    ".room-4 .r4-liquid { position: absolute; inset: 0; transition: background .4s, opacity .4s; }" +
    ".room-4 .r4-sum { position: relative; font-family: var(--font-display); font-size: 30px; font-weight: 700; color: var(--text);" +
    "  text-shadow: 0 1px 3px var(--stone-900), 0 0 6px var(--stone-900); direction: ltr; }" +
    ".room-4 .r4-pot--mix .r4-liquid { animation: r4-swirl .9s ease-in-out 1; }" +
    ".room-4 .r4-pot--fizzle .r4-liquid { animation: r4-fizzle .9s ease-in 1 forwards; }" +
    "@keyframes r4-swirl { 0% { filter: hue-rotate(0); } 50% { filter: hue-rotate(40deg) brightness(1.3); } 100% { filter: none; } }" +
    "@keyframes r4-fizzle { 0% { opacity: 1; } 30% { transform: translateY(-6px); } 100% { opacity: 0; transform: translateY(8px); } }" +
    /* secret clue: a small paper label tucked at the end of the shelf */
    ".room-4 .r4-clue { flex: none; align-self: flex-end; width: 44px; height: 44px; padding: 0; display: grid; place-items: center; }" +
    ".room-4 .r4-clue::after { inset: 15px; }" +
    ".room-4 .r4-clue svg { width: 30px; height: 22px; fill: var(--parchment-100); stroke: var(--stone-400); stroke-width: 1.5; opacity: .55; transform: rotate(8deg); }" +
    ".room-4 .r4-clue.g-hotspot--found svg { opacity: .9; stroke: var(--teal-400); }" +
    ".room-4 .r4-side { display: flex; flex-direction: column; gap: var(--space-3); }" +
    ".room-4 .r4-cabinet { display: flex; align-items: center; gap: var(--space-3); }" +
    ".room-4 .r4-door { flex: none; width: 88px; height: 104px; border: 3px solid var(--gold-700); border-radius: var(--radius-sm);" +
    "  background: var(--stone-800); display: grid; place-items: center; }" +
    ".room-4 .r4-door svg { width: 40px; height: 40px; fill: none; stroke: var(--gold-500); stroke-width: 3; stroke-linecap: round; }" +
    ".room-4 .r4-door img { width: 56px; height: 56px; filter: drop-shadow(0 0 8px var(--gold-300)); }" +
    ".room-4 .r4-cabinet--open .r4-door { border-color: var(--gold-300); box-shadow: var(--glow-gold); background: var(--stone-600); }" +
    ".room-4 .r4-target { font-family: var(--font-display); font-size: 40px; line-height: 44px; font-weight: 700; color: var(--gold-500); direction: ltr; }" +
    ".room-4 .r4-follow { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); font-size: 18px; line-height: 28px; }" +
    ".room-4 .r4-follow p { margin: 0; }" +
    ".room-4 .r4-q { font-weight: 700; }" +
    ".room-4 .r4-pairs { list-style: none; margin: 0; padding: 0; }" +
    ".room-4 .r4-pairs li::before { content: \"✓ \"; color: var(--success-ink); font-weight: 700; }" +
    ".room-4 .r4-answer { color: var(--ink-muted); }" +
    ".room-4 .r4-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); }" +
    "@media (max-width: 900px) { .room-4 .r4 { grid-template-columns: 1fr; } }" +
    "@media (prefers-reduced-motion: reduce) { .room-4 .r4-pot--mix .r4-liquid, .room-4 .r4-pot--fizzle .r4-liquid { animation: none; } }";

  var LOCK = '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="8" y="18" width="24" height="18" rx="3"/><path d="M13 18v-6a7 7 0 0 1 14 0v6"/><path d="M20 25v5"/></svg>';

  G.rooms.register(4, {
    mount: function (root, api) {
      var room = api.room, ui = api.content.ui, P = api.puzzle;
      api.style(CSS);
      rootEl = root;
      function t(k) { return room[k] || FALLBACK[k]; }

      // Normalise persisted state.
      if (!Array.isArray(P.slots) || P.slots.length !== 2) P.slots = [null, null];
      if (!Array.isArray(P.pairs)) P.pairs = [];
      var byId = {};
      room.bottles.forEach(function (b) { byId[b.id] = b; });
      P.slots = P.slots.map(function (s) { return byId[s] ? s : null; });

      root.innerHTML =
        '<div class="r4">' +
          '<div class="r4-lab">' +
            '<div class="r4-shelf g-stone" role="group"></div>' +
            '<div class="r4-cauldron g-stone">' +
              '<div class="r4-slots"><button type="button" class="r4-slot" data-i="0"></button><span class="r4-plus" aria-hidden="true">+</span>' +
              '<button type="button" class="r4-slot" data-i="1"></button></div>' +
              '<div class="r4-pot" role="img"><div class="r4-liquid"></div><span class="r4-sum" aria-hidden="true"></span></div>' +
              '<button type="button" class="g-btn g-btn--primary r4-mix">' + esc(t("mixLabel")) + "</button>" +
            "</div>" +
          "</div>" +
          '<div class="r4-side">' +
            '<div class="r4-cabinet g-stone"><div class="r4-door"></div><div class="r4-target" aria-hidden="true">= ' + room.target + "</div></div>" +
            '<div class="r4-follow g-parchment" hidden></div>' +
          "</div>" +
        "</div>";

      var shelf = root.querySelector(".r4-shelf");
      var slotEls = Array.prototype.slice.call(root.querySelectorAll(".r4-slot"));
      var pot = root.querySelector(".r4-pot");
      var liquid = root.querySelector(".r4-liquid");
      var sumEl = root.querySelector(".r4-sum");
      var mixBtn = root.querySelector(".r4-mix");
      var cabinet = root.querySelector(".r4-cabinet");
      var door = root.querySelector(".r4-door");
      var follow = root.querySelector(".r4-follow");
      var busy = false;

      shelf.setAttribute("aria-label", room.name);
      pot.setAttribute("aria-label", t("cauldron"));

      /* ---- bottles ---- */
      room.bottles.forEach(function (b) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "r4-bottle";
        btn.dataset.id = b.id;
        btn.setAttribute("aria-label", b.name + " " + b.value);
        btn.innerHTML = flask(TONE[b.tone] || "var(--teal-400)") +
          '<span class="r4-name">' + esc(b.name) + '</span><span class="r4-num g-ltr">' + b.value + "</span>";
        btn.addEventListener("click", function () { pick(b.id); });
        shelf.appendChild(btn);
      });
      var bottleEls = Array.prototype.slice.call(shelf.querySelectorAll(".r4-bottle"));

      /* ---- secret clue: shelf label ---- */
      var clueBtn = document.createElement("button");
      clueBtn.type = "button";
      clueBtn.className = "g-hotspot r4-clue";
      clueBtn.setAttribute("aria-label", api.clueInfo.label);
      clueBtn.innerHTML = '<svg viewBox="0 0 30 22" aria-hidden="true" focusable="false"><path d="M2 3h20l6 8-6 8H2z"/><circle cx="21" cy="11" r="2" fill="none"/></svg>';
      if (api.clueFound()) clueBtn.classList.add("g-hotspot--found");
      clueBtn.addEventListener("click", function () {
        if (api.clueFound()) return;
        api.clue();
        clueBtn.classList.add("g-hotspot--found");
      });
      shelf.appendChild(clueBtn);

      function pick(id) {
        if (busy || P.slots.indexOf(id) !== -1) return;
        var i = P.slots.indexOf(null);
        if (i === -1) return;
        P.slots[i] = id; api.save();
        render();
        if (P.slots.indexOf(null) === -1) { mixBtn.focus(); return; }
        // The used bottle is now disabled and drops focus: move to the next free bottle for keyboard players.
        var start = bottleEls.findIndex(function (el) { return el.dataset.id === id; });
        for (var k = 1; k <= bottleEls.length; k++) {
          var nb = bottleEls[(start + k) % bottleEls.length];
          if (!nb.disabled) { nb.focus(); break; }
        }
      }

      slotEls.forEach(function (el, i) {
        el.addEventListener("click", function () {
          if (busy || !P.slots[i]) return;
          var id = P.slots[i];
          P.slots[i] = null; api.save();
          render();
          var back = shelf.querySelector('[data-id="' + id + '"]');
          if (back) back.focus();
        });
      });

      /* ---- render ---- */
      function render() {
        bottleEls.forEach(function (el) {
          var used = P.slots.indexOf(el.dataset.id) !== -1;
          el.disabled = used || busy;
          var b = byId[el.dataset.id];
          el.querySelector(".r4-flask").outerHTML = flask(TONE[b.tone], used); // used bottle shows empty glass, not only a color change
        });
        var tones = [];
        slotEls.forEach(function (el, i) {
          var b = byId[P.slots[i]];
          el.classList.toggle("r4-slot--filled", !!b);
          if (b) {
            tones.push(TONE[b.tone]);
            el.innerHTML = '<span class="r4-swatch" style="background:' + TONE[b.tone] + '"></span><span>' + esc(b.name) +
              '</span><span class="r4-num g-ltr">' + b.value + "</span>";
            el.setAttribute("aria-label", b.name + " " + b.value);
          } else {
            el.innerHTML = '<span class="r4-num" aria-hidden="true">?</span>';
            el.setAttribute("aria-label", t("emptySlot"));
          }
        });
        liquid.style.background = tones.length === 2 ? "linear-gradient(90deg, " + tones[0] + ", " + tones[1] + ")" :
          tones.length === 1 ? tones[0] : "transparent";
        liquid.style.opacity = tones.length ? "0.85" : "0";
        var a = byId[P.slots[0]], c = byId[P.slots[1]];
        sumEl.textContent = (a ? a.value : "?") + " + " + (c ? c.value : "?");
        mixBtn.disabled = busy || !(a && c);
        renderCabinet();
      }

      function pairLabel(key) {
        var ids = key.split("+");
        return ids.map(function (id) { return byId[id].name + " " + byId[id].value; }).join(" + ") + " = " + room.target;
      }

      function renderCabinet() {
        cabinet.classList.toggle("r4-cabinet--open", !!P.opened);
        if (P.opened) {
          var sym = api.symbol(room.symbol);
          door.innerHTML = '<img src="' + api.icon(sym.icon) + '" alt="' + esc(sym.name) + '">';
        } else {
          door.innerHTML = LOCK;
        }
        follow.hidden = !P.opened;
        if (!P.opened) return;
        var pairs = P.pairs.map(function (k) { return '<li>' + esc(pairLabel(k)) + "</li>"; }).join("");
        follow.innerHTML =
          '<ul class="r4-pairs">' + pairs + "</ul>" +
          (P.pairs.length < 2 ? '<p class="r4-q">' + esc(room.moreQuestion) + "</p>" : "") +
          '<p class="r4-q">' + esc(room.checkQuestion) + "</p>" +
          (P.checkShown ? '<p class="r4-answer">' + esc(room.checkAnswer) + "</p>" : "") +
          '<div class="r4-actions">' +
            (P.checkShown ? "" : '<button type="button" class="g-btn g-btn--secondary r4-reveal">' + esc(t("revealLabel")) + "</button>") +
            '<button type="button" class="g-btn g-btn--primary r4-next">' + esc(ui.next) + "</button>" +
          "</div>";
        var rv = follow.querySelector(".r4-reveal");
        if (rv) rv.addEventListener("click", function () {
          P.checkShown = true; api.save(); renderCabinet();
          var ans = follow.querySelector(".r4-answer");
          if (ans) { ans.setAttribute("tabindex", "-1"); ans.focus(); }
        });
        follow.querySelector(".r4-next").addEventListener("click", function () { api.solve(); });
      }

      /* ---- mixing ---- */
      function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

      mixBtn.addEventListener("click", function () {
        if (busy) return;
        var a = byId[P.slots[0]], c = byId[P.slots[1]];
        if (!a || !c) return;
        var key = [a.id, c.id].sort().join("+");
        var sum = a.value + c.value;
        busy = true;
        sumEl.textContent = a.value + " + " + c.value + " = " + sum;
        pot.classList.remove("r4-pot--mix", "r4-pot--fizzle");
        void pot.offsetWidth;
        bottleEls.forEach(function (el) { el.disabled = true; });
        mixBtn.disabled = true;

        if (sum === room.target) {
          pot.classList.add("r4-pot--mix");
          var isNew = P.pairs.indexOf(key) === -1;
          if (isNew) P.pairs.push(key);
          var firstTime = !P.opened;
          P.opened = true;
          P.slots = [null, null];
          api.save();
          if (firstTime) api.say(room.firstPairMessage, "right");
          else if (isNew) { api.bonus("second", room.secondPairBonus, room.secondPairMessage); api.say(room.secondPairMessage, "right"); }
          else api.say(pairLabel(key), "info");
        } else {
          pot.classList.add("r4-pot--fizzle");
          P.slots = [null, null];
          api.save();
          api.wrong(room.fizzleMessage);
        }
        later(function () {
          busy = false;
          pot.classList.remove("r4-pot--mix", "r4-pot--fizzle");
          render();
          var focusEl = P.opened ? follow.querySelector(".r4-q, .r4-next") : bottleEls[0];
          if (focusEl && focusEl.tagName === "P") { focusEl.setAttribute("tabindex", "-1"); }
          if (focusEl) focusEl.focus();
        }, 1000);
      });

      render();
    },

    unmount: function () {
      timers.forEach(clearTimeout); timers = [];
      rootEl = null;
    },

    onHint: function (level) {
      // Level 3 says one pair includes the blue bottle: mark it with a teal ring (the hint text names it too).
      if (level === 3 && rootEl) {
        var b = rootEl.querySelector('.r4-bottle[data-id="blue"]');
        if (b) b.classList.add("r4-bottle--hint");
      }
    }
  });
})();
