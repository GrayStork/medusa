/* Game state, saving, scoring, navigation and the room contract.
 *
 * ROOM CONTRACT (for js/rooms/roomN.js):
 *   G.rooms.register(N, {
 *     mount(root, api) { ... },   // build the puzzle inside root (a <div>). Called on every entry, including after reload.
 *     unmount() { ... },          // optional: clear timers/listeners
 *     onHint(level) { ... }       // optional: called when hint `level` (1..3) is opened, and again on mount for each
 *                                 //           already-opened level, so highlights survive reloads.
 *   });
 *   api: see makeApi() below.
 */
window.G = window.G || {};
(function () {
  var SAVE_KEY = "gorgon-save-v1";
  var C = G.content;

  function fresh() {
    return {
      v: 1, screen: "title", room: 1,
      solved: {}, hints: {}, wrong: {}, bonus: {}, roomScore: {},
      inventory: [], selected: null,
      puzzle: {}, ending: null, myth: "", checks: [false, false],
      elapsedMs: 0, timeUpShown: false, started: false,
      /* M2 */
      team: { name: "", players: 2 }, roomMs: {}, clues: {}, achievements: {}, extra: 0
    };
  }

  G.state = fresh();

  function save(quiet) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.state)); } catch (e) { return; /* storage unavailable: play on */ }
    if (quiet !== true && G.ui && G.ui.flashSaved) G.ui.flashSaved();
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1) return null;
      var f = fresh();
      ["team", "roomMs", "clues", "achievements", "extra"].forEach(function (k) { if (s[k] == null) s[k] = f[k]; }); // saves from M1
      return s;
    } catch (e) { return null; }
  }
  function clear() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  function roomById(id) { return C.rooms[id - 1]; }

  function computeRoomScore(id) {
    var s = C.scoring, h = G.state.hints[id] || 0, w = G.state.wrong[id] || 0;
    var base = Math.max(s.roomFloor, s.solve - s.hint * h - s.wrong * w);
    if (h === 0) base += s.noHint;
    var b = G.state.bonus[id] || {};
    if (b.speed == null && !G.state.timeUpShown && (G.state.roomMs[id] || 0) <= C.scoring.speedMs) {
      b.speed = C.scoring.speed; G.state.bonus[id] = b;
      G.ui.toast(C.speedNote, "+" + C.scoring.speed, { calm: true });
    }
    for (var k in b) base += b[k];
    return base;
  }

  function totalScore() {
    var t = 0;
    for (var id in G.state.roomScore) t += G.state.roomScore[id];
    return t + (G.state.extra || 0);
  }

  function rankFor(score) {
    for (var i = 0; i < C.ranks.length; i++) if (score >= C.ranks[i].min) return C.ranks[i];
    return C.ranks[C.ranks.length - 1];
  }

  /* ---------- navigation ---------- */
  function go(screen, room) {
    G.state.screen = screen;
    if (room) G.state.room = room;
    if (screen !== "title") G.state.started = true;
    save();
    G.ui.render();
  }

  function newGame() { clear(); G.state = fresh(); go("team"); }
  function resume() { var s = load(); if (s) { G.state = s; G.ui.render(); } else newGame(); }
  /* Menu: save where we are, then show the title (Continue / New game) WITHOUT overwriting the saved screen. */
  function toTitle() { save(); G.state.screen = "title"; G.ui.render(); }

  /* ---------- inventory ---------- */
  function addItem(symId) {
    if (G.state.inventory.indexOf(symId) === -1) G.state.inventory.push(symId);
    save(); G.ui.renderBag();
  }
  function selectItem(symId) {
    G.state.selected = G.state.selected === symId ? null : symId;
    save(); G.ui.renderBag();
    selectListeners.forEach(function (fn) { try { fn(G.state.selected); } catch (e) { console.error(e); } });
  }
  var selectListeners = [];

  /* ---------- hints ---------- */
  function openHint(roomId) {
    var n = G.state.hints[roomId] || 0;
    if (n >= 3 || G.state.solved[roomId] || G.state.screen !== "room") return n;
    G.state.hints[roomId] = n + 1;
    save(); G.ui.renderTopbar();
    var mod = registry[roomId];
    if (mod && mod.onHint) { try { mod.onHint(n + 1); } catch (e) { console.error(e); } }
    return n + 1;
  }

  /* ---------- achievements and clues (M2) ---------- */
  function achieve(key) {
    if (!C.achievements[key] || G.state.achievements[key]) return false;
    G.state.achievements[key] = Date.now(); save();
    G.ui.toast(C.achievements[key].name, C.achievementKicker, { icon: "sym-stone-eye.svg" });
    return true;
  }
  function findClue(roomId) {
    if (G.state.clues[roomId]) return false;
    G.state.clues[roomId] = true;
    G.state.extra = (G.state.extra || 0) + C.scoring.clue;
    save(); G.ui.renderTopbar();
    G.ui.toast(C.clues[roomId].text, C.clueFound + " +" + C.scoring.clue, { calm: true });
    if (Object.keys(G.state.clues).length >= 5) achieve("hawk");
    return true;
  }

  /* ---------- rooms ---------- */
  var registry = {};
  var current = null;

  function makeApi(id, sayEl) {
    var room = roomById(id);
    if (!G.state.puzzle[id]) G.state.puzzle[id] = {};
    var api = {
      id: id,
      room: room,                 // this room's object from content.js
      content: C,                 // all content
      puzzle: G.state.puzzle[id], // persistent puzzle state: mutate, then api.save()
      dev: G.dev,
      save: function () { save(); },
      icon: function (file) { return "assets/img/icons/" + file; },
      symbol: function (symId) { return C.symbols[symId]; },
      /* Show a message in the room's feedback line. kind: "right" | "wrong" | "near" | "info" */
      say: function (text, kind) {
        sayEl.className = "g-feedback room-say" + (kind && kind !== "info" ? " g-feedback--" + kind : "");
        sayEl.innerHTML = "";
        var mark = kind === "right" ? "✓ " : kind === "wrong" ? "✕ " : "";
        sayEl.textContent = mark + text;
      },
      /* Wrong answer: −5 (room floor applies at solve time) and a kind message. */
      wrong: function (text) {
        G.state.wrong[id] = (G.state.wrong[id] || 0) + 1; save();
        api.say((text || "") + " (" + C.ui.wrongNote + ")", "wrong");
      },
      /* One-time bonus points, kept per key. Shows a toast. */
      bonus: function (key, points, message) {
        G.state.bonus[id] = G.state.bonus[id] || {};
        if (G.state.bonus[id][key] != null) return false;
        G.state.bonus[id][key] = points; save();
        G.ui.toast(message || ("+" + points), "+" + points, { icon: room.symbol ? C.symbols[room.symbol].icon : null });
        return true;
      },
      hintsUsed: function () { return G.state.hints[id] || 0; },
      /* M2: call when the room's hidden clue is clicked. Once per room; +15; toast with content.clues[id].text. */
      clue: function () { return findClue(id); },
      clueFound: function () { return !!G.state.clues[id]; },
      clueInfo: C.clues[id],
      /* M2: award an achievement by key (content.achievements). Once per game. */
      achieve: achieve,
      addItem: addItem,
      hasItem: function (symId) { return G.state.inventory.indexOf(symId) !== -1; },
      selectedItem: function () { return G.state.selected; },
      clearSelection: function () { if (G.state.selected) selectItem(G.state.selected); },
      onSelect: function (fn) { selectListeners.push(fn); },
      toast: function (title, kicker, opts) { G.ui.toast(title, kicker, opts); },
      /* Inject room CSS once. Use tokens only (var(--...)). Scope selectors under .room-N */
      style: function (css) {
        var sid = "room-css-" + id;
        if (document.getElementById(sid)) return;
        var st = document.createElement("style"); st.id = sid; st.textContent = css;
        document.head.appendChild(st);
      },
      /* Rooms 1-4: puzzle solved -> award symbol, score, go to the "symbol earned" screen. */
      solve: function () {
        if (G.state.solved[id]) { go("earned", id); return; }
        G.state.solved[id] = true;
        addItem(room.symbol);
        G.state.roomScore[id] = computeRoomScore(id);
        if (!(G.state.hints[id] || 0)) achieve("athena");
        G.state.selected = null;
        go("earned", id);
      },
      /* Room 5 only: final choice made -> score room 5, go to ending. */
      finish: function (choiceId) {
        var first = !G.state.solved[id];
        G.state.solved[id] = true;
        if (first) {
          G.state.roomScore[id] = computeRoomScore(id);
          if (!(G.state.hints[id] || 0)) achieve("athena");
        }
        if (choiceId === 3) achieve("fates");
        G.state.ending = choiceId;
        G.state.selected = null;
        go("ending");
      }
    };
    return api;
  }

  function mountRoom(id, root, sayEl) {
    unmountRoom();
    selectListeners = [];
    var mod = registry[id];
    if (!mod) { root.textContent = "חדר " + id + " עדיין בבנייה."; return; }
    current = mod;
    mod.mount(root, makeApi(id, sayEl));
    if (mod.onHint) for (var l = 1; l <= (G.state.hints[id] || 0); l++) { try { mod.onHint(l); } catch (e) { console.error(e); } }
  }
  function unmountRoom() {
    if (current && current.unmount) { try { current.unmount(); } catch (e) { console.error(e); } }
    current = null;
  }

  /* ---------- timer ---------- */
  var last = Date.now();
  setInterval(function () {
    var now = Date.now(), dt = Math.min(now - last, 5000); last = now;
    var s = G.state.screen;
    if (!(s === "room" || s === "earned")) return; // reading the intro doesn't cost time
    G.state.elapsedMs += dt;
    if (s === "room" && !G.state.solved[G.state.room]) G.state.roomMs[G.state.room] = (G.state.roomMs[G.state.room] || 0) + dt;
    if (!G.state.timeUpShown && G.state.elapsedMs >= C.totalMinutes * 60000) {
      G.state.timeUpShown = true;
      G.ui.toast(C.ui.timeUp, null, { calm: true });
    }
    if (Math.floor(G.state.elapsedMs / 1000) % 5 === 0) save(true);
    G.ui.renderTopbar();
  }, 1000);

  G.rooms = { register: function (id, mod) { registry[id] = mod; } };
  G.engine = {
    save: save, load: load, clear: clear, go: go, newGame: newGame, resume: resume, toTitle: toTitle,
    roomById: roomById, totalScore: totalScore, rankFor: rankFor,
    addItem: addItem, selectItem: selectItem, openHint: openHint,
    mountRoom: mountRoom, unmountRoom: unmountRoom, computeRoomScore: computeRoomScore,
    achieve: achieve, findClue: findClue
  };
})();
