// Tests für core.js – Ausführen: node --test test/core.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
global.Chess = require("../vendor/chess.js").Chess;
const C = require("../core.js");

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("winPct: 50 % bei 0, symmetrisch, monoton, begrenzt", () => {
  assert.equal(C.winPct(0), 50);
  assert.ok(Math.abs(C.winPct(300) + C.winPct(-300) - 100) < 1e-9);
  assert.ok(C.winPct(100) > C.winPct(50));
  assert.equal(C.winPct(5000), C.winPct(1000));
  assert.ok(C.winPct(1000) < 100 && C.winPct(-1000) > 0);
});

test("moveAcc: ~100 ohne Verlust, 0..100, fallend", () => {
  assert.ok(C.moveAcc(0) > 99.9);
  assert.ok(C.moveAcc(10) < C.moveAcc(5));
  assert.equal(C.moveAcc(100), 0);
  assert.ok(C.moveAcc(-5) > 99.9);
});

test("classify: Schwellen 5 / 10 / 15", () => {
  assert.deepEqual([0, 4.9, 5, 9.9, 10, 14.9, 15, 50].map(C.classify), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test("parseClocks und baseTime", () => {
  assert.deepEqual(C.parseClocks("1. e4 {[%clk 0:09:58.5]} e5 {[%clk 1:00:00]}"), [598.5, 3600]);
  assert.equal(C.baseTime("600+5"), 600);
  assert.equal(C.baseTime("1/86400"), null);
  assert.equal(C.baseTime(""), null);
});

test("openingFromUrl: Name und Familie", () => {
  const o = C.openingFromUrl("https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation-6.Be3");
  assert.equal(o.name, "Sicilian Defense Najdorf Variation");
  assert.equal(o.family, "Sicilian Defense");
  assert.equal(C.openingFromUrl(null), null);
});

test("pvLine: Zugnummern für Weiss und Schwarz, Länge begrenzt", () => {
  assert.equal(C.pvLine(START, ["e2e4", "e7e5", "g1f3", "b8c6"]), "1. e4 e5 2. Nf3 Nc6");
  const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
  assert.equal(C.pvLine(afterE4, ["e7e5", "g1f3"]), "1… e5 2. Nf3");
  assert.equal(C.pvLine(START, ["e2e4", "e7e5", "g1f3"], 2), "1. e4 e5");
  assert.equal(C.pvLine(START, ["e2e4", "e2e4"]), "1. e4"); // ungültiger Zug bricht ab
  assert.equal(C.pvLine(START, null), "");
});

// Mock-Engine: Bewertung pro Stellung (Sicht Seite am Zug), je nach Tiefe
function mockEngine(table) {
  const calls = [];
  return {
    calls,
    async eval(fen, { depth }) {
      calls.push({ fen, depth });
      const key = fen.split(" ").slice(0, 4).join(" ");
      const e = table[key];
      const r = e ? (typeof e === "function" ? e(depth) : e) : null;
      if (r) return r;
      const g = new Chess(fen);
      const m = g.moves({ verbose: true })[0];
      return { cp: 0, mate: null, best: m.from + m.to };
    },
  };
}
const k = fen => fen.split(" ").slice(0, 4).join(" ");
function fensOf(sans) {
  const g = new Chess(); const out = [g.fen()];
  for (const s of sans) { g.move(s); out.push(g.fen()); }
  return out;
}

// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#
const MATE_GAME = ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"];

test("analyzeGame: Patzer erkannt, Motiv, Karte, Varianten, Nachrechnung", async () => {
  const F = fensOf(MATE_GAME);
  const eng = mockEngine({
    [k(F[5])]: { cp: 0, mate: null, best: "g7g6", pv: ["g7g6", "c4f7"] }, // vor Nf6: g6 hält
    [k(F[6])]: { cp: 0, mate: 1, best: "h5f7", pv: ["h5f7"] },          // nach Nf6: Matt in 1
  });
  const r = await C.analyzeGame({ sans: MATE_GAME, me: "b" }, eng, 12, null, 18);
  assert.equal(r.cls[5], 3);
  assert.equal(r.mot["Matt zugelassen"], 1);
  assert.deepEqual(r.ex, [{ m: "Matt zugelassen", ply: 5 }]);
  assert.equal(r.cards.length, 1);
  assert.equal(r.cards[0].best, "g6");
  assert.equal(r.cards[0].line, "3… g6 4. Bxf7+");
  assert.equal(r.pv[5], "3… g6 4. Bxf7+");
  assert.equal(r.pv[6], "4. Qxf7#");
  assert.equal(r.pv[0], null); // keine Variante ohne Ungenauigkeit
  const deep = eng.calls.filter(c => c.depth === 18).map(c => k(c.fen));
  assert.deepEqual(deep, [k(F[5]), k(F[6])]);
});

test("analyzeGame: ohne deep keine Nachrechnung", async () => {
  const F = fensOf(MATE_GAME);
  const eng = mockEngine({ [k(F[6])]: { cp: 0, mate: 1, best: "h5f7" } });
  await C.analyzeGame({ sans: MATE_GAME, me: "b" }, eng, 12);
  assert.ok(eng.calls.every(c => c.depth === 12));
});

test("analyzeGame: Nachrechnung korrigiert Horizont-Fehler", async () => {
  const sans = ["e4", "e5", "Nf3", "Nc6"];
  const F = fensOf(sans);
  // Nach 2.Nf3 sieht Tiefe 12 Schwarz klar vorne (falsch), Tiefe 18 ausgeglichen
  const eng = mockEngine({ [k(F[3])]: d => ({ cp: d >= 18 ? 0 : 400, mate: null, best: "b8c6" }) });
  const shallow = await C.analyzeGame({ sans, me: "w" }, mockEngine({ [k(F[3])]: { cp: 400, mate: null, best: "b8c6" } }), 12);
  assert.ok(shallow.cls[2] >= 2);
  const r = await C.analyzeGame({ sans, me: "w" }, eng, 12, null, 18);
  assert.equal(r.cls[2], 0);
  assert.deepEqual(r.mot, {});
});

test("weaknesses, phaseAcc, openingStats", () => {
  const games = [
    { mot: { "Figur eingestellt": 2 }, ph: { o: 90, m: 70, e: null }, family: "Italian Game", me: "w", res: 1, acc: 80 },
    { mot: { "Figur eingestellt": 1, "Zeitnot": 1 }, ph: { o: 80, m: 60, e: 50 }, family: "Italian Game", me: "w", res: 0, acc: 60 },
  ];
  assert.deepEqual(C.weaknesses(games), [["Figur eingestellt", 1.5], ["Zeitnot", 0.5]]);
  assert.deepEqual(C.phaseAcc(games), { o: 85, m: 65, e: 50 });
  assert.deepEqual(C.openingStats(games).w, [{ name: "Italian Game", n: 2, score: 50, acc: 70 }]);
});

test("OPENINGS: alle Zugfolgen legal, je 3 Vor- und Nachteile", () => {
  const { OPENINGS } = require("../openings.js");
  for (const [k, o] of Object.entries(OPENINGS)) {
    const g = new Chess();
    for (const m of o.m) assert.ok(g.move(m), `${k}: ${m}`);
    assert.equal(o.p.length, 3, k); assert.equal(o.c.length, 3, k);
    assert.ok(o.n && o.d && o.e, k);
  }
});
