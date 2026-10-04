/* ==========================================================================
   THE SYSTEM — landing page live demo.
   A real status window driven by the real logic (system.js) and the real
   renderers (app.js) on a throwaway sample hunter. Nothing is saved.
   ========================================================================== */
(function (root, doc) {
  'use strict';

  var SYS = root.SYS, UI = root.SYSUI;
  var host = doc.getElementById('demo');
  if (!SYS || !UI || !host) return;

  host.innerHTML =
    '<div class="demo-win win">' +
      '<div class="demo-hdr" id="d-hdr"></div>' +
      '<div class="demo-body">' +
        '<div class="demo-radar radar" id="d-radar"></div>' +
        '<div class="demo-side">' +
          '<div class="demo-label"><span class="eyebrow">Daily quests</span><span class="mono demo-count" id="d-count"></span></div>' +
          '<ul class="qlist" id="d-quests"></ul>' +
        '</div>' +
      '</div>' +
      '<div class="ntf ntf--inline" id="d-ntf" role="status" aria-live="polite" hidden></div>' +
    '</div>';

  var els = {
    hdr: doc.getElementById('d-hdr'),
    radar: doc.getElementById('d-radar'),
    quests: doc.getElementById('d-quests'),
    count: doc.getElementById('d-count')
  };

  var state, ids = {};
  var notifier = new UI.Notifier(doc.getElementById('d-ntf'), {
    inline: true, sound: false, duration: 2300, idPrefix: 'd-ntf',
    onIdle: function () { if (waiting) { waiting = false; next(); } }
  });

  function sample() {
    var s = SYS.newState('You');
    var h = s.hunter;
    h.level = 4;
    h.xp = SYS.xpNeed(4) - 30;
    h.gold = 214;
    h.streak = 6;
    h.bestStreak = 6;
    h.questsDone = 23;
    h.titles = ['awakened', 'first'];
    h.title = 'first';
    s.stats = { str: 14, vit: 12, agi: 11, int: 15, per: 12, wil: 13 };
    s.statXp = { str: SYS.statNeed(14) - 12, vit: 20, agi: 8, int: SYS.statNeed(15) - 20, per: 12, wil: 25 };
    s.quests = [];
    var a = SYS.addQuest(s, { name: 'Push-ups', type: 'daily', stat: 'str', difficulty: 'NORMAL', target: 50, unit: 'reps' });
    var b = SYS.addQuest(s, { name: 'Deep work block', type: 'daily', stat: 'int', difficulty: 'HARD', target: 1, unit: 'block' });
    a.progress = 35;
    ids.a = a.id;
    ids.b = b.id;
    return s;
  }

  function render() {
    var sum = SYS.dailySummary(state);
    UI.renderHeader(els.hdr, state);
    UI.renderRadar(els.radar, state.stats);
    UI.renderQuestList(els.quests, state.quests, { keyPrefix: 'demo:' });
    els.count.textContent = sum.done + '/' + sum.total;
  }

  function act(kind, id) {
    var ev = kind === 'inc' ? SYS.incrementQuest(state, id)
      : kind === 'complete' ? SYS.completeQuest(state, id)
      : SYS.undoQuest(state, id);
    render();
    notifier.push(UI.eventsToNotes(ev));
    return ev;
  }

  function spend(stat) {
    SYS.spendPoint(state, stat);
    render();
  }

  /* ---------- the loop ---------- */

  var SCRIPT = [
    [1500, function () { act('inc', ids.a); }],
    [750,  function () { act('inc', ids.a); }],
    [750,  function () { act('inc', ids.a); return 'wait'; }],     // clears: level up, STR +1
    [600,  function () { spend('per'); }],
    [450,  function () { spend('agi'); }],
    [450,  function () { spend('wil'); }],
    [1500, function () { act('complete', ids.b); return 'wait'; }], // INT +1, dailies cleared, a new title
    [3200, function () { reset(); }]
  ];

  var idx = 0, timer = null, waiting = false, running = false, resumeTimer = null, visible = true;

  function next() {
    if (!running) return;
    if (idx >= SCRIPT.length) idx = 0;
    var step = SCRIPT[idx++];
    timer = setTimeout(function () {
      timer = null;
      if (!running) return;
      var r = step[1]();
      if (r === 'wait' && notifier.busy) waiting = true;
      else next();
    }, step[0]);
  }

  function reset() {
    state = sample();
    render();
  }

  function start() {
    if (running || !visible || doc.hidden) return;
    running = true;
    idx = 0;
    reset();
    next();
  }

  function stop() {
    running = false;
    waiting = false;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function scheduleResume(ms) {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () {
      if (notifier.busy) return scheduleResume(1500);
      start();
    }, ms);
  }

  /* the visitor can take over at any time */
  host.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== host && !(t.getAttribute && t.getAttribute('data-act'))) t = t.parentNode;
    if (!t || t === host) return;
    var kind = t.getAttribute('data-act');
    if (kind !== 'inc' && kind !== 'complete' && kind !== 'undo') return;
    e.preventDefault();
    stop();
    act(kind, t.getAttribute('data-id'));
    scheduleResume(9000);
  });

  doc.addEventListener('visibilitychange', function () {
    if (doc.hidden) stop();
    else scheduleResume(600);
  });

  state = sample();
  render();

  if ('IntersectionObserver' in root) {
    new root.IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) scheduleResume(400);
      else { stop(); clearTimeout(resumeTimer); }
    }, { threshold: 0.25 }).observe(host);
  } else {
    scheduleResume(400);
  }
})(window, document);
