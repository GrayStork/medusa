/* Room 2 (hall of mirrors): grid layout, solution and the shared beam tracer.
 * Works as a browser global (G.room2Layout) and as a Node module (tools/solve-room2.js).
 *
 * Coordinates: col 0..6 left-to-right, row 0..4 top-to-bottom (geometric, not RTL).
 * Directions: "E" "W" "N" "S".
 * Mirror states: "/" , "\\" , "off" (pass-through, mirror 2 only).
 *   "/"  : E->N, N->E, W->S, S->W
 *   "\\" : E->S, S->E, W->N, N->W
 */
(function (root) {
  var DIRS = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };
  var REFLECT = {
    "/": { E: "N", N: "E", W: "S", S: "W" },
    "\\": { E: "S", S: "E", W: "N", N: "W" }
  };

  var L = {
    cols: 7,
    rows: 5,
    /* Beam enters cell (col,row) travelling dir; drawn as a lamp just outside that edge. */
    source: { col: 0, row: 4, dir: "E" },
    /* Door sensor: the beam must leave the grid from this cell in this direction. */
    door: { col: 1, row: 0, dir: "N" },
    mirrors: [
      { id: 1, col: 5, row: 4, states: ["/", "\\"] },
      { id: 2, col: 5, row: 1, states: ["/", "\\", "off"] },
      { id: 3, col: 1, row: 1, states: ["/", "\\"] }
    ],
    stones: [
      { id: 1, col: 2, row: 4 },
      { id: 2, col: 5, row: 2 },
      { id: 3, col: 3, row: 1 }
    ],
    statue: { col: 5, row: 0 },
    /* Secret clue: a floor crack that glows while the beam crosses it (flavour). */
    crack: { col: 4, row: 1 },
    initial: ["\\", "/", "/"],
    solution: ["/", "\\", "\\"]
  };

  /* Pure tracer. mirrorStates: array aligned with layout.mirrors.
   * Returns { path:[{col,row}], cells entered in order (source cell first),
   *           exit:{col,row,dir}|null, stones:[ids lit], statue:bool, door:bool, loop:bool } */
  function trace(layout, mirrorStates) {
    var mirrorAt = {}, stoneAt = {};
    layout.mirrors.forEach(function (m, i) { mirrorAt[m.col + "," + m.row] = mirrorStates[i]; });
    layout.stones.forEach(function (s) { stoneAt[s.col + "," + s.row] = s.id; });
    var c = layout.source.col, r = layout.source.row, d = layout.source.dir;
    var path = [], lit = [], seen = {}, res = { path: path, exit: null, stones: lit, statue: false, door: false, loop: false };
    for (var guard = 0; guard < 500; guard++) {
      if (c < 0 || r < 0 || c >= layout.cols || r >= layout.rows) {
        var pc = c - DIRS[d][0], pr = r - DIRS[d][1];
        res.exit = { col: pc, row: pr, dir: d };
        res.door = pc === layout.door.col && pr === layout.door.row && d === layout.door.dir;
        return res;
      }
      var key = c + "," + r;
      if (seen[key + d]) { res.loop = true; return res; }
      seen[key + d] = true;
      path.push({ col: c, row: r });
      if (layout.statue.col === c && layout.statue.row === r) { res.statue = true; return res; }
      if (stoneAt[key] != null && lit.indexOf(stoneAt[key]) === -1) lit.push(stoneAt[key]);
      var m = mirrorAt[key];
      if (m && m !== "off") d = REFLECT[m][d];
      c += DIRS[d][0]; r += DIRS[d][1];
    }
    res.loop = true;
    return res;
  }

  function solves(layout, res) {
    return res.door && !res.statue && res.stones.length === layout.stones.length;
  }

  L.trace = trace;
  L.solves = solves;

  if (typeof module !== "undefined" && module.exports) module.exports = L;
  else { root.G = root.G || {}; root.G.room2Layout = L; }
})(this);
