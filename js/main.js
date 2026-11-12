/* Boot: restore a saved game screen if one exists, otherwise the title.
 * ?reset=1 (or ?new=1) clears the saved game on this device, e.g. a teacher between groups on a shared Chromebook. */
(function () {
  if (/[?&](reset|new)=1\b/.test(location.search)) {
    G.engine.clear();
    try { history.replaceState(null, "", location.pathname + location.search.replace(/[?&](reset|new)=1\b/, "").replace(/^&/, "?")); } catch (e) {}
  }
  var saved = G.engine.load();
  if (saved && saved.started) G.state = saved;
  G.state.screen = G.state.screen || "title";
  /* Always land on the title first so the team can choose Continue or New game, unless dev jumps elsewhere. */
  if (!G.dev || !saved) G.state.screen = "title";
  if (saved && saved.started) { G.state.started = true; }
  G.ui.render();
})();
