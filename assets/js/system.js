/* ==========================================================================
   THE SYSTEM — game logic: data model, formulas, daily cycle, storage.
   Pure logic. No DOM access. Every mutating function returns an array of
   events; the UI turns those into notifications and sounds.
   ========================================================================== */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'arise:hunter:v1';
  var SAVE_NAME = 'the-system-save.json';
  var LOG_CAP = 250;
  var POINTS_PER_LEVEL = 3;
  var DAILY_BONUS = { xp: 60, gold: 25 };
  var MISS_PENALTY = 25;
  var REST_PASS_COST = 150;

  var STATS = ['str', 'vit', 'agi', 'int', 'per', 'wil'];

  var STAT_INFO = {
    str: { label: 'STR', name: 'Strength',     desc: 'Trained by resistance: push-ups, lifting, carrying load.' },
    vit: { label: 'VIT', name: 'Vitality',     desc: 'Trained by recovery: sleep, water, food, rest days kept honestly.' },
    agi: { label: 'AGI', name: 'Agility',      desc: 'Trained by movement: running, mobility, sport.' },
    int: { label: 'INT', name: 'Intelligence', desc: 'Trained by focused work: study, deep work, building skills.' },
    per: { label: 'PER', name: 'Perception',   desc: 'Trained by attention: reading, journaling, noticing.' },
    wil: { label: 'WIL', name: 'Willpower',    desc: 'Trained by discipline: quiet time, cold starts, the hard thing first.' }
  };

  var DIFFICULTY = {
    EASY:   { xp: 15,  gold: 5,  statXp: 10 },
    NORMAL: { xp: 35,  gold: 12, statXp: 22 },
    HARD:   { xp: 70,  gold: 28, statXp: 45 },
    BRUTAL: { xp: 140, gold: 60, statXp: 90 }
  };
  var DIFFICULTIES = ['EASY', 'NORMAL', 'HARD', 'BRUTAL'];

  var GATE_RANK = {
    E: { xp: 150,  gold: 80 },
    D: { xp: 350,  gold: 180 },
    C: { xp: 700,  gold: 350 },
    B: { xp: 1400, gold: 700 },
    A: { xp: 2600, gold: 1300 },
    S: { xp: 5000, gold: 2500 }
  };
  var GATE_RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];

  /* Hunter rank — derived from level, never stored. */
  var HUNTER_RANKS = [
    { min: 80, id: 'NATIONAL', color: '#ff3556' },
    { min: 60, id: 'S',        color: '#f5b942' },
    { min: 45, id: 'A',        color: '#ff8f4d' },
    { min: 30, id: 'B',        color: '#8b6cff' },
    { min: 20, id: 'C',        color: '#4fc3ff' },
    { min: 10, id: 'D',        color: '#3ddc97' },
    { min: 0,  id: 'E',        color: '#7fa3c4' }
  ];

  var TITLES = [
    { id: 'awakened', name: 'The Awakened',     req: 'Granted at start',           test: function () { return true; } },
    { id: 'first',    name: 'First Blood',      req: 'Clear 1 quest',              test: function (s) { return s.hunter.questsDone >= 1; } },
    { id: 'week',     name: 'Relentless',       req: 'Reach a 7-day best streak',  test: function (s) { return s.hunter.bestStreak >= 7; } },
    { id: 'rising',   name: 'Rising Hunter',    req: 'Reach level 10',             test: function (s) { return s.hunter.level >= 10; } },
    { id: 'gate',     name: 'Gate Breaker',     req: 'Clear 3 gates',              test: function (s) { return gatesCleared(s) >= 3; } },
    { id: 'grinder',  name: 'The Grinder',      req: 'Clear 100 quests',           test: function (s) { return s.hunter.questsDone >= 100; } },
    { id: 'spec',     name: 'Specialist',       req: 'Raise any attribute to 30',  test: function (s) { return highestStat(s.stats) >= 30; } },
    { id: 'unbroken', name: 'Unbroken',         req: 'Reach a 30-day best streak', test: function (s) { return s.hunter.bestStreak >= 30; } },
    { id: 'shadow',   name: 'Shadow Aspirant',  req: 'Reach level 25',             test: function (s) { return s.hunter.level >= 25; } },
    { id: 'monarch',  name: 'Monarch’s Vessel', req: 'Reach level 50',        test: function (s) { return s.hunter.level >= 50; } }
  ];

  /* ---------- formulas ---------- */

  function xpNeed(level) { return Math.floor(70 * Math.pow(level, 1.32)); }
  function statNeed(val) { return Math.floor(45 * Math.pow(1.085, val - 10)); }

  function rankFor(level) {
    for (var i = 0; i < HUNTER_RANKS.length; i++) {
      if (level >= HUNTER_RANKS[i].min) return HUNTER_RANKS[i];
    }
    return HUNTER_RANKS[HUNTER_RANKS.length - 1];
  }

  /* Increment step for a quest target: +1 under 20, +5 under 100, +10 above. */
  function stepFor(target) { return target < 20 ? 1 : (target < 100 ? 5 : 10); }

  function titleById(id) {
    for (var i = 0; i < TITLES.length; i++) if (TITLES[i].id === id) return TITLES[i];
    return TITLES[0];
  }

  function highestStat(stats) {
    var m = 0;
    for (var i = 0; i < STATS.length; i++) m = Math.max(m, stats[STATS[i]] || 0);
    return m;
  }

  function gatesCleared(state) {
    var n = 0;
    for (var i = 0; i < state.gates.length; i++) if (state.gates[i].cleared) n++;
    return n;
  }

  /* ---------- dates (always local time, never UTC ISO) ---------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function localDateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseDateKey(key) {
    var p = String(key).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function daysBetween(a, b) {
    return Math.round((parseDateKey(b) - parseDateKey(a)) / 86400000);
  }

  function msToMidnight(now) {
    now = now || new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return next - now;
  }

  /* ---------- utilities ---------- */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function pushLog(state, kind, text) {
    state.log.unshift({ id: uid(), t: Date.now(), kind: kind, text: text });
    if (state.log.length > LOG_CAP) state.log.length = LOG_CAP;
  }

  /* ---------- state ---------- */

  function makeQuest(d) {
    var target = Math.max(1, Math.floor(+d.target || 1));
    return {
      id: d.id || uid(),
      name: String(d.name || 'Unnamed quest').slice(0, 60),
      type: d.type === 'side' ? 'side' : 'daily',
      stat: STAT_INFO[d.stat] ? d.stat : 'str',
      difficulty: DIFFICULTY[d.difficulty] ? d.difficulty : 'NORMAL',
      target: target,
      unit: String(d.unit || '').slice(0, 16),
      progress: clamp(Math.floor(+d.progress || 0), 0, target),
      done: !!d.done,
      completions: Math.max(0, Math.floor(+d.completions || 0))
    };
  }

  function makeGate(d) {
    var total = Math.max(1, Math.floor(+d.total || 1));
    return {
      id: d.id || uid(),
      name: String(d.name || 'Unnamed gate').slice(0, 60),
      rank: GATE_RANK[d.rank] ? d.rank : 'E',
      total: total,
      progress: clamp(Math.floor(+d.progress || 0), 0, total),
      unit: String(d.unit || '').slice(0, 16),
      cleared: !!d.cleared
    };
  }

  function makeReward(d) {
    var rest = d.effect === 'restpass';
    return {
      id: d.id || uid(),
      name: rest ? 'Rest Pass' : String(d.name || 'Reward').slice(0, 40),
      cost: rest ? REST_PASS_COST : Math.max(1, Math.floor(+d.cost || 1)),
      effect: rest ? 'restpass' : 'none',
      taken: Math.max(0, Math.floor(+d.taken || 0))
    };
  }

  function newState(name) {
    var stats = {}, statXp = {};
    for (var i = 0; i < STATS.length; i++) { stats[STATS[i]] = 10; statXp[STATS[i]] = 0; }
    var s = {
      v: 1,
      hunter: {
        name: String(name || 'HUNTER').slice(0, 24),
        level: 1, xp: 0, gold: 0, points: 0,
        streak: 0, bestStreak: 0, questsDone: 0,
        title: 'awakened', titles: ['awakened'],
        restPasses: 0, bonusDate: null,
        joined: new Date().toISOString()
      },
      stats: stats,
      statXp: statXp,
      quests: [
        makeQuest({ name: 'Push-ups', type: 'daily', stat: 'str', difficulty: 'NORMAL', target: 50, unit: 'reps' }),
        makeQuest({ name: 'Drink water', type: 'daily', stat: 'vit', difficulty: 'EASY', target: 8, unit: 'glasses' }),
        makeQuest({ name: 'Deep work block', type: 'daily', stat: 'int', difficulty: 'HARD', target: 1, unit: 'block' }),
        makeQuest({ name: 'Read', type: 'daily', stat: 'per', difficulty: 'EASY', target: 20, unit: 'pages' }),
        makeQuest({ name: 'Quiet time', type: 'daily', stat: 'wil', difficulty: 'EASY', target: 10, unit: 'min' }),
        makeQuest({ name: 'Run 5 km', type: 'side', stat: 'agi', difficulty: 'HARD', target: 1, unit: 'run' })
      ],
      gates: [
        makeGate({ name: 'Read 12 books', rank: 'C', total: 12, unit: 'books' }),
        makeGate({ name: 'Train for a 10K', rank: 'D', total: 20, unit: 'sessions' })
      ],
      shop: [
        makeReward({ effect: 'restpass' }),
        makeReward({ name: 'An episode of something good', cost: 60 }),
        makeReward({ name: 'Takeaway night', cost: 250 }),
        makeReward({ name: 'Something new for the hobby', cost: 900 })
      ],
      log: [],
      lastDate: localDateKey(),
      sound: true
    };
    pushLog(s, 'system', 'The System has chosen ' + s.hunter.name + '. Welcome, Hunter.');
    return s;
  }

  /* ---------- levelling ---------- */

  function gainXp(state, amount, ev) {
    var h = state.hunter, before = rankFor(h.level).id;
    h.xp += amount;
    while (h.xp >= xpNeed(h.level)) {
      h.xp -= xpNeed(h.level);
      h.level += 1;
      h.points += POINTS_PER_LEVEL;
      var r = rankFor(h.level).id;
      ev.push({ type: 'levelUp', level: h.level, points: POINTS_PER_LEVEL, rank: r !== before ? r : null });
      pushLog(state, 'system', 'Level up — reached level ' + h.level + '. +' + POINTS_PER_LEVEL + ' attribute points.');
      before = r;
    }
  }

  /* XP never falls below the start of the current level: levels are kept. */
  function loseXp(state, amount) {
    var h = state.hunter, lost = Math.min(h.xp, amount);
    h.xp -= lost;
    return lost;
  }

  function gainStatXp(state, stat, amount, ev) {
    state.statXp[stat] += amount;
    while (state.statXp[stat] >= statNeed(state.stats[stat])) {
      state.statXp[stat] -= statNeed(state.stats[stat]);
      state.stats[stat] += 1;
      ev.push({ type: 'statUp', stat: stat, value: state.stats[stat] });
      pushLog(state, 'system', STAT_INFO[stat].name + ' increased to ' + state.stats[stat] + '.');
    }
  }

  function checkTitles(state, ev) {
    var h = state.hunter;
    for (var i = 0; i < TITLES.length; i++) {
      var t = TITLES[i];
      if (h.titles.indexOf(t.id) === -1 && t.test(state)) {
        h.titles.push(t.id);
        ev.push({ type: 'title', id: t.id, name: t.name });
        pushLog(state, 'title', 'Title acquired — “' + t.name + '”.');
      }
    }
    return ev;
  }

  /* ---------- quests ---------- */

  function dailies(state) {
    var out = [];
    for (var i = 0; i < state.quests.length; i++) if (state.quests[i].type === 'daily') out.push(state.quests[i]);
    return out;
  }

  function dailySummary(state) {
    var d = dailies(state), done = 0;
    for (var i = 0; i < d.length; i++) if (d[i].done) done++;
    return { total: d.length, done: done, remaining: d.length - done };
  }

  function checkDailyClear(state, ev) {
    var h = state.hunter, sum = dailySummary(state);
    if (!sum.total || sum.remaining || h.bonusDate === state.lastDate) return;
    h.bonusDate = state.lastDate;
    h.gold += DAILY_BONUS.gold;
    h.streak += 1;
    if (h.streak > h.bestStreak) h.bestStreak = h.streak;
    ev.push({ type: 'dailyClear', xp: DAILY_BONUS.xp, gold: DAILY_BONUS.gold, streak: h.streak });
    pushLog(state, 'quest', 'All daily quests cleared — +' + DAILY_BONUS.xp + ' XP, +' + DAILY_BONUS.gold + ' gold. Streak ' + h.streak + '.');
    gainXp(state, DAILY_BONUS.xp, ev);
  }

  function completeQuest(state, id) {
    var ev = [], q = find(state.quests, id);
    if (!q || q.done) return ev;
    var d = DIFFICULTY[q.difficulty], h = state.hunter;
    q.done = true;
    q.progress = q.target;
    q.completions += 1;
    h.questsDone += 1;
    h.gold += d.gold;
    ev.push({ type: 'quest', id: q.id, name: q.name, xp: d.xp, gold: d.gold, stat: q.stat, statXp: d.statXp });
    pushLog(state, 'quest', 'Quest cleared — ' + q.name + ' (+' + d.xp + ' XP, +' + d.gold + ' gold).');
    gainXp(state, d.xp, ev);
    gainStatXp(state, q.stat, d.statXp, ev);
    if (q.type === 'daily') checkDailyClear(state, ev);
    checkTitles(state, ev);
    return ev;
  }

  function incrementQuest(state, id) {
    var q = find(state.quests, id);
    if (!q || q.done) return [];
    q.progress = Math.min(q.target, q.progress + stepFor(q.target));
    if (q.progress >= q.target) return completeQuest(state, id);
    return [{ type: 'progress', id: q.id }];
  }

  /* Undo returns the quest's rewards. A level or attribute point already
     gained is kept — XP and attribute XP floor at the start of the level. */
  function undoQuest(state, id) {
    var q = find(state.quests, id), h = state.hunter;
    if (!q || !q.done) return [];
    var d = DIFFICULTY[q.difficulty];
    if (q.type === 'daily' && h.bonusDate && h.bonusDate === state.lastDate) {
      h.bonusDate = null;
      h.gold = Math.max(0, h.gold - DAILY_BONUS.gold);
      h.streak = Math.max(0, h.streak - 1);
      loseXp(state, DAILY_BONUS.xp);
    }
    q.done = false;
    q.progress = q.target > 1 ? Math.max(0, q.target - stepFor(q.target)) : 0;
    q.completions = Math.max(0, q.completions - 1);
    h.questsDone = Math.max(0, h.questsDone - 1);
    h.gold = Math.max(0, h.gold - d.gold);
    loseXp(state, d.xp);
    state.statXp[q.stat] = Math.max(0, state.statXp[q.stat] - d.statXp);
    pushLog(state, 'system', 'Quest undone — ' + q.name + '. Rewards returned.');
    return [{ type: 'undo', id: q.id }];
  }

  function addQuest(state, data) {
    var q = makeQuest(data);
    state.quests.push(q);
    pushLog(state, 'system', 'Quest registered — ' + q.name + ' (' + q.type + ').');
    return q;
  }

  function updateQuest(state, id, data) {
    var q = find(state.quests, id);
    if (!q) return null;
    var next = makeQuest({
      id: q.id, name: data.name, type: data.type, stat: data.stat, difficulty: data.difficulty,
      target: data.target, unit: data.unit, progress: q.progress, done: q.done, completions: q.completions
    });
    if (next.done) next.progress = next.target;
    state.quests[state.quests.indexOf(q)] = next;
    return next;
  }

  function deleteQuest(state, id) {
    var q = find(state.quests, id);
    if (!q) return [];
    state.quests.splice(state.quests.indexOf(q), 1);
    pushLog(state, 'system', 'Quest removed — ' + q.name + '.');
    var ev = [];
    if (q.type === 'daily') checkDailyClear(state, ev);
    checkTitles(state, ev);
    return ev;
  }

  /* ---------- gates ---------- */

  function strikeGate(state, id, delta) {
    var ev = [], g = find(state.gates, id);
    if (!g || g.cleared) return ev;
    var before = g.progress;
    g.progress = clamp(g.progress + delta, 0, g.total);
    if (g.progress === before) return ev;
    if (g.progress >= g.total) {
      var r = GATE_RANK[g.rank];
      g.cleared = true;
      state.hunter.gold += r.gold;
      ev.push({ type: 'gate', id: g.id, name: g.name, rank: g.rank, xp: r.xp, gold: r.gold });
      pushLog(state, 'gate', 'Gate cleared — ' + g.name + ' (' + g.rank + '-rank). +' + r.xp + ' XP, +' + r.gold + ' gold.');
      gainXp(state, r.xp, ev);
      checkTitles(state, ev);
    } else {
      pushLog(state, 'gate', (delta > 0 ? 'Strike' : 'Correction') + ' — ' + g.name + ' ' + g.progress + '/' + g.total + '.');
      ev.push({ type: delta > 0 ? 'strike' : 'unstrike', id: g.id });
    }
    return ev;
  }

  function addGate(state, data) {
    var g = makeGate(data);
    state.gates.push(g);
    pushLog(state, 'gate', 'Gate opened — ' + g.name + ' (' + g.rank + '-rank).');
    return g;
  }

  function updateGate(state, id, data) {
    var g = find(state.gates, id);
    if (!g) return null;
    var next = makeGate({ id: g.id, name: data.name, rank: data.rank, total: data.total, unit: data.unit, progress: g.progress, cleared: g.cleared });
    state.gates[state.gates.indexOf(g)] = next;
    return next;
  }

  function deleteGate(state, id) {
    var g = find(state.gates, id);
    if (!g) return;
    state.gates.splice(state.gates.indexOf(g), 1);
    pushLog(state, 'system', 'Gate removed — ' + g.name + '.');
  }

  /* ---------- shop ---------- */

  function buy(state, id) {
    var item = find(state.shop, id), h = state.hunter;
    if (!item || h.gold < item.cost) return [];
    h.gold -= item.cost;
    item.taken += 1;
    if (item.effect === 'restpass') {
      h.restPasses += 1;
      pushLog(state, 'shop', 'Rest pass acquired for ' + item.cost + ' gold. Holding ' + h.restPasses + '.');
      return [{ type: 'restPassBought', count: h.restPasses, cost: item.cost }];
    }
    pushLog(state, 'shop', 'Reward claimed — ' + item.name + ' (' + item.cost + ' gold).');
    return [{ type: 'reward', name: item.name, cost: item.cost }];
  }

  function addReward(state, data) {
    var r = makeReward({ name: data.name, cost: data.cost });
    state.shop.push(r);
    return r;
  }

  function updateReward(state, id, data) {
    var r = find(state.shop, id);
    if (!r || r.effect === 'restpass') return null;
    r.name = String(data.name || r.name).slice(0, 40);
    r.cost = Math.max(1, Math.floor(+data.cost || r.cost));
    return r;
  }

  function deleteReward(state, id) {
    var r = find(state.shop, id);
    if (!r || r.effect === 'restpass') return;
    state.shop.splice(state.shop.indexOf(r), 1);
  }

  /* ---------- attributes & titles ---------- */

  function spendPoint(state, stat) {
    var h = state.hunter;
    if (h.points <= 0 || !STAT_INFO[stat]) return [];
    h.points -= 1;
    state.stats[stat] += 1;
    pushLog(state, 'system', 'Point assigned — ' + STAT_INFO[stat].name + ' ' + state.stats[stat] + '.');
    return checkTitles(state, [{ type: 'statSpent', stat: stat, value: state.stats[stat] }]);
  }

  function equipTitle(state, id) {
    if (state.hunter.titles.indexOf(id) === -1) return false;
    state.hunter.title = id;
    return true;
  }

  /* ---------- the daily cycle ---------- */

  /* Runs once per date change, however many days were missed. */
  function rollover(state, today) {
    var ev = [], h = state.hunter;
    today = today || localDateKey();
    if (!state.lastDate) { state.lastDate = today; return ev; }
    if (today <= state.lastDate) return ev;   // same day, or the clock went backwards

    var d = dailies(state), missed = 0, i;
    for (i = 0; i < d.length; i++) if (!d[i].done) missed++;
    var away = daysBetween(state.lastDate, today);

    if (missed) {
      if (h.restPasses > 0) {
        h.restPasses -= 1;
        ev.push({ type: 'restPassUsed', missed: missed, streak: h.streak, left: h.restPasses });
        pushLog(state, 'shop', 'Rest pass consumed — ' + missed + ' unfinished daily quest' + (missed > 1 ? 's' : '') + ' forgiven. Streak held at ' + h.streak + '.');
      } else {
        var cost = MISS_PENALTY * missed, prev = h.streak;
        var lost = loseXp(state, cost);
        h.streak = 0;
        ev.push({ type: 'penalty', missed: missed, xp: cost, lost: lost, prevStreak: prev });
        pushLog(state, 'penalty', 'Penalty — ' + missed + ' daily quest' + (missed > 1 ? 's' : '') + ' unfinished. −' + cost + ' XP. Streak reset from ' + prev + ' to 0.');
      }
    }

    for (i = 0; i < d.length; i++) { d[i].done = false; d[i].progress = 0; }
    state.lastDate = today;
    pushLog(state, 'system', away > 1 ? 'New day after ' + away + ' days away — daily quests reset.' : 'New day — daily quests reset.');
    return ev;
  }

  /* ---------- validation & save files ---------- */

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function isArr(x) { return Object.prototype.toString.call(x) === '[object Array]'; }
  function num(x, dflt, min) { return isNum(x) ? Math.max(min || 0, x) : dflt; }

  function normalize(data) {
    var h = data.hunter;
    var out = {
      v: 1,
      hunter: {
        name: String(h.name || 'HUNTER').slice(0, 24),
        level: Math.max(1, Math.floor(num(h.level, 1, 1))),
        xp: num(h.xp, 0), gold: Math.floor(num(h.gold, 0)), points: Math.floor(num(h.points, 0)),
        streak: Math.floor(num(h.streak, 0)), bestStreak: Math.floor(num(h.bestStreak, 0)),
        questsDone: Math.floor(num(h.questsDone, 0)),
        title: typeof h.title === 'string' ? h.title : 'awakened',
        titles: isArr(h.titles) ? h.titles.filter(function (t) { return typeof t === 'string'; }) : ['awakened'],
        restPasses: Math.floor(num(h.restPasses, 0)),
        bonusDate: typeof h.bonusDate === 'string' ? h.bonusDate : null,
        joined: typeof h.joined === 'string' ? h.joined : new Date().toISOString()
      },
      stats: {}, statXp: {},
      quests: (data.quests || []).map(makeQuest),
      gates: (data.gates || []).map(makeGate),
      shop: (data.shop || []).map(makeReward),
      log: isArr(data.log) ? data.log.filter(function (l) { return l && typeof l.text === 'string'; }).slice(0, LOG_CAP).map(function (l) {
        return { id: String(l.id || uid()), t: num(l.t, Date.now()), kind: String(l.kind || 'system'), text: l.text };
      }) : [],
      lastDate: /^\d{4}-\d{2}-\d{2}$/.test(data.lastDate) ? data.lastDate : localDateKey(),
      sound: data.sound !== false
    };
    for (var i = 0; i < STATS.length; i++) {
      var k = STATS[i];
      out.stats[k] = Math.max(1, Math.floor(num(data.stats[k], 10, 1)));
      out.statXp[k] = num(data.statXp && data.statXp[k], 0);
    }
    if (out.hunter.titles.indexOf('awakened') === -1) out.hunter.titles.unshift('awakened');
    if (out.hunter.titles.indexOf(out.hunter.title) === -1) out.hunter.title = 'awakened';
    var hasPass = false;
    for (i = 0; i < out.shop.length; i++) if (out.shop[i].effect === 'restpass') hasPass = true;
    if (!hasPass) out.shop.unshift(makeReward({ effect: 'restpass' }));
    return out;
  }

  /* Accepts a save file ({ app, savedAt, summary, data }) or a bare state.
     Returns { ok, state, savedAt } or { ok:false, error }. Never throws. */
  function validate(obj) {
    function fail(msg) { return { ok: false, error: msg }; }
    try {
      if (!obj || typeof obj !== 'object') return fail('This is not a save file.');
      var data = obj.data && typeof obj.data === 'object' ? obj.data : obj;
      if (data.v !== 1) return fail('This file is not a THE SYSTEM save, or it comes from an unknown version.');
      var h = data.hunter;
      if (!h || typeof h !== 'object' || typeof h.name !== 'string' || !isNum(h.level) || !isNum(h.xp) || !isNum(h.gold)) {
        return fail('The hunter record in this file is missing or damaged.');
      }
      if (!data.stats || typeof data.stats !== 'object') return fail('The attributes in this file are missing.');
      for (var i = 0; i < STATS.length; i++) {
        if (!isNum(data.stats[STATS[i]])) return fail('The attribute ' + STAT_INFO[STATS[i]].label + ' is missing or damaged.');
      }
      if (!isArr(data.quests) || !isArr(data.gates) || !isArr(data.shop)) {
        return fail('The quest, gate or shop lists in this file are missing.');
      }
      return { ok: true, state: normalize(data), savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : null };
    } catch (e) {
      return fail('This save file could not be read.');
    }
  }

  function summary(state) {
    var h = state.hunter, s = state.stats;
    var parts = [];
    for (var i = 0; i < STATS.length; i++) parts.push(STAT_INFO[STATS[i]].label + ' ' + s[STATS[i]]);
    return [
      h.name.toUpperCase() + ' — Level ' + h.level + ' (' + rankFor(h.level).id + '-RANK) — ' + titleById(h.title).name,
      'Streak ' + h.streak + ' day' + (h.streak === 1 ? '' : 's') + ' (best ' + h.bestStreak + ') · ' +
        h.questsDone + ' quest' + (h.questsDone === 1 ? '' : 's') + ' cleared · ' + h.gold + ' gold',
      parts.join(' · ')
    ];
  }

  function toSaveFile(state, savedAt) {
    return {
      app: 'THE SYSTEM',
      savedAt: savedAt || new Date().toISOString(),
      summary: summary(state),
      data: state
    };
  }

  function isNewer(a, b) {
    if (!a) return false;
    if (!b) return true;
    return Date.parse(a) > Date.parse(b);
  }

  /* ---------- IndexedDB (holds the linked file handle) ---------- */

  function idb(mode, fn, cb) {
    cb = cb || function () {};
    try {
      if (!root.indexedDB) return cb(new Error('no indexedDB'));
      var req = root.indexedDB.open('the-system', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onerror = function () { cb(req.error || new Error('idb open failed')); };
      req.onsuccess = function () {
        try {
          var db = req.result, tx = db.transaction('kv', mode), r = fn(tx.objectStore('kv'));
          tx.oncomplete = function () { db.close(); cb(null, r ? r.result : undefined); };
          tx.onerror = function () { db.close(); cb(tx.error || new Error('idb tx failed')); };
        } catch (e) { cb(e); }
      };
    } catch (e) { cb(e); }
  }
  function idbGet(key, cb) { idb('readonly', function (s) { return s.get(key); }, cb); }
  function idbSet(key, val, cb) { idb('readwrite', function (s) { s.put(val, key); }, cb); }
  function idbDel(key, cb) { idb('readwrite', function (s) { s['delete'](key); }, cb); }

  /* ---------- Store: localStorage live save + optional linked file ---------- */

  var Store = {
    memoryOnly: false,
    lastSavedAt: null,
    handle: null,
    handleState: 'none',        // none | granted | prompt
    fileError: null,
    onFileError: null,
    timer: null,

    supportsFileLink: function () { return typeof root.showSaveFilePicker === 'function'; },

    readLocal: function () {
      try {
        var raw = root.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        var res = validate(JSON.parse(raw));
        if (!res.ok) return null;
        Store.lastSavedAt = res.savedAt;
        return res;
      } catch (e) {
        Store.memoryOnly = true;
        return null;
      }
    },

    writeLocal: function (state, savedAt) {
      try {
        root.localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: savedAt, data: state }));
        return true;
      } catch (e) {
        Store.memoryOnly = true;
        return false;
      }
    },

    schedule: function (state) {
      if (Store.timer) clearTimeout(Store.timer);
      Store.timer = setTimeout(function () { Store.timer = null; Store.flush(state); }, 300);
    },

    flush: function (state) {
      var savedAt = new Date().toISOString();
      Store.lastSavedAt = savedAt;
      Store.writeLocal(state, savedAt);
      if (Store.handle && Store.handleState === 'granted') {
        Store.writeFile(Store.handle, toSaveFile(state, savedAt));
      }
    },

    clearLocal: function () {
      try { root.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* nothing to clear */ }
    },

    serialize: function (state) {
      return JSON.stringify(toSaveFile(state), null, 2);
    },

    writeFile: function (handle, saveObj) {
      try {
        return handle.createWritable().then(function (w) {
          return w.write(JSON.stringify(saveObj, null, 2)).then(function () { return w.close(); });
        }).then(function () {
          Store.fileError = null;
        }, function (err) {
          Store.fileError = err;
          if (Store.onFileError) Store.onFileError(err);
        });
      } catch (e) {
        Store.fileError = e;
        return null;
      }
    },

    readHandle: function (handle) {
      return handle.getFile().then(function (f) { return f.text(); }).then(function (text) {
        return validate(JSON.parse(text));
      });
    },

    /* Chromium only: pick a file, remember it, and write the current save. */
    linkFile: function (state, cb) {
      try {
        root.showSaveFilePicker({
          suggestedName: SAVE_NAME,
          types: [{ description: 'THE SYSTEM save file', accept: { 'application/json': ['.json'] } }]
        }).then(function (handle) {
          Store.handle = handle;
          Store.handleState = 'granted';
          idbSet('saveHandle', handle);
          return Store.writeFile(handle, toSaveFile(state, Store.lastSavedAt || new Date().toISOString()));
        }).then(function () { cb(null); }, function (err) { cb(err || new Error('link failed')); });
      } catch (e) { cb(e); }
    },

    /* On load: find a remembered handle; read it only if permission is
       already granted. Falls back silently otherwise. */
    restoreHandle: function (cb) {
      if (!Store.supportsFileLink()) return cb(null, null);
      idbGet('saveHandle', function (err, handle) {
        if (err || !handle || typeof handle.queryPermission !== 'function') return cb(null, null);
        Store.handle = handle;
        try {
          handle.queryPermission({ mode: 'readwrite' }).then(function (p) {
            if (p !== 'granted') { Store.handleState = 'prompt'; return cb(null, null); }
            Store.handleState = 'granted';
            return Store.readHandle(handle).then(function (res) { cb(null, res && res.ok ? res : null); });
          }).then(null, function () { cb(null, null); });
        } catch (e) { cb(null, null); }
      });
    },

    /* Needs a user gesture. */
    reconnect: function (cb) {
      var handle = Store.handle;
      if (!handle) return cb(new Error('no linked file'));
      try {
        handle.requestPermission({ mode: 'readwrite' }).then(function (p) {
          if (p !== 'granted') { Store.handleState = 'prompt'; return cb(new Error('permission denied')); }
          Store.handleState = 'granted';
          return Store.readHandle(handle).then(function (res) { cb(null, res && res.ok ? res : null); }, function () { cb(null, null); });
        }).then(null, function (err) { cb(err); });
      } catch (e) { cb(e); }
    },

    unlink: function (cb) {
      Store.handle = null;
      Store.handleState = 'none';
      idbDel('saveHandle', cb);
    }
  };

  root.SYS = {
    STORAGE_KEY: STORAGE_KEY,
    SAVE_NAME: SAVE_NAME,
    STATS: STATS,
    STAT_INFO: STAT_INFO,
    DIFFICULTY: DIFFICULTY,
    DIFFICULTIES: DIFFICULTIES,
    GATE_RANK: GATE_RANK,
    GATE_RANKS: GATE_RANKS,
    HUNTER_RANKS: HUNTER_RANKS,
    TITLES: TITLES,
    DAILY_BONUS: DAILY_BONUS,
    MISS_PENALTY: MISS_PENALTY,
    REST_PASS_COST: REST_PASS_COST,
    POINTS_PER_LEVEL: POINTS_PER_LEVEL,

    xpNeed: xpNeed,
    statNeed: statNeed,
    rankFor: rankFor,
    stepFor: stepFor,
    titleById: titleById,
    highestStat: highestStat,
    gatesCleared: gatesCleared,
    localDateKey: localDateKey,
    daysBetween: daysBetween,
    msToMidnight: msToMidnight,
    clone: clone,
    find: find,

    newState: newState,
    dailySummary: dailySummary,
    completeQuest: completeQuest,
    incrementQuest: incrementQuest,
    undoQuest: undoQuest,
    addQuest: addQuest,
    updateQuest: updateQuest,
    deleteQuest: deleteQuest,
    strikeGate: strikeGate,
    addGate: addGate,
    updateGate: updateGate,
    deleteGate: deleteGate,
    buy: buy,
    addReward: addReward,
    updateReward: updateReward,
    deleteReward: deleteReward,
    spendPoint: spendPoint,
    equipTitle: equipTitle,
    checkTitles: checkTitles,
    rollover: rollover,
    pushLog: pushLog,

    validate: validate,
    summary: summary,
    toSaveFile: toSaveFile,
    isNewer: isNewer,
    Store: Store
  };
})(typeof window !== 'undefined' ? window : this);
