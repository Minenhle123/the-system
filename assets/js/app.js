/* ==========================================================================
   THE SYSTEM — application UI and event handling.
   Exposes the shared renderers on window.SYSUI (the landing demo uses them)
   and boots the full application only when #app-root exists.
   ========================================================================== */
(function (root, doc) {
  'use strict';

  var SYS = root.SYS;
  if (!SYS) return;
  var STATS = SYS.STATS, INFO = SYS.STAT_INFO;
  var INSTALL_FLAG = 'arise:install:dismissed';

  var REDUCED = false;
  try { REDUCED = root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* default: motion on */ }

  /* ======================================================================
     helpers
     ====================================================================== */

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function fmt(n) { return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function pct(a, b) { return b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function qs(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function closest(el, attr) {
    while (el && el !== doc) {
      if (el.nodeType === 1 && el.hasAttribute(attr)) return el;
      el = el.parentNode;
    }
    return null;
  }

  function rankLabel(id) { return id === 'NATIONAL' ? 'NATIONAL' : id + '-RANK'; }

  function hexPoints(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = (-90 + i * 60) * Math.PI / 180;
      pts.push((cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1));
    }
    return pts.join(' ');
  }

  function levelHex(level) {
    return '<span class="lvl-hex" role="img" aria-label="Level ' + level + '">' +
      '<svg viewBox="0 0 60 60" aria-hidden="true">' +
        '<polygon class="lvl-hex-o" points="' + hexPoints(30, 30, 28) + '"/>' +
        '<polygon class="lvl-hex-i" points="' + hexPoints(30, 30, 23) + '"/>' +
      '</svg>' +
      '<i class="mono">LV</i><b class="mono">' + level + '</b>' +
    '</span>';
  }

  /* Bars animate between renders: each keyed bar remembers its last width,
     renders there, then settle() moves it to the new width. */
  var lastWidth = {};
  function bar(key, value, cls, label) {
    var from = Object.prototype.hasOwnProperty.call(lastWidth, key) ? lastWidth[key] : value;
    lastWidth[key] = value;
    return '<div class="bar' + (cls ? ' ' + cls : '') + '"' + (label ? ' role="img" aria-label="' + esc(label) + '"' : '') + '>' +
      '<i style="width:' + from.toFixed(2) + '%" data-w="' + value.toFixed(2) + '"></i></div>';
  }
  function settle(ctx) {
    var bars = qsa('[data-w]', ctx || doc);
    if (!bars.length) return;
    void (ctx || doc.body).offsetWidth;
    bars.forEach(function (b) { b.style.width = b.getAttribute('data-w') + '%'; b.removeAttribute('data-w'); });
  }

  var ICON = {
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,3 19.8,7.5 19.8,16.5 12,21 4.2,16.5 4.2,7.5"/><circle cx="12" cy="12" r="3.2"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  /* ======================================================================
     sound — short Web Audio tones, no files. Never allowed to break the app.
     ====================================================================== */

  var Sound = {
    ctx: null,
    enabled: true,
    unlocked: false,

    unlock: function () { Sound.unlocked = true; },

    tone: function (freq, type, dur, gain, delay) {
      if (!Sound.enabled || !Sound.unlocked) return;
      try {
        if (!Sound.ctx) {
          var AC = root.AudioContext || root.webkitAudioContext;
          if (!AC) { Sound.enabled = false; return; }
          Sound.ctx = new AC();
        }
        var ctx = Sound.ctx;
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        var t = ctx.currentTime + (delay || 0);
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t);
        o.stop(t + dur + 0.05);
      } catch (e) { /* audio is optional */ }
    },

    play: function (name) {
      switch (name) {
        case 'quest':   Sound.tone(700, 'triangle', 0.22, 0.14); break;
        case 'level':   Sound.tone(880, 'triangle', 0.45, 0.14); Sound.tone(1320, 'triangle', 0.5, 0.08, 0.12); break;
        case 'gate':    Sound.tone(990, 'triangle', 0.6, 0.14); Sound.tone(1485, 'triangle', 0.6, 0.06, 0.15); break;
        case 'penalty': Sound.tone(160, 'sawtooth', 0.7, 0.09); break;
        case 'stat':    Sound.tone(760, 'triangle', 0.3, 0.11); break;
        case 'title':   Sound.tone(880, 'triangle', 0.3, 0.1); Sound.tone(1175, 'triangle', 0.4, 0.08, 0.1); break;
        case 'clear':   Sound.tone(700, 'triangle', 0.2, 0.12); Sound.tone(880, 'triangle', 0.2, 0.1, 0.1); Sound.tone(1050, 'triangle', 0.35, 0.1, 0.2); break;
        case 'buy':     Sound.tone(620, 'triangle', 0.25, 0.12); break;
        case 'tap':     Sound.tone(440 + Math.floor(Math.random() * 80), 'square', 0.05, 0.025); break;
      }
    }
  };
  doc.addEventListener('pointerdown', Sound.unlock, true);
  doc.addEventListener('keydown', Sound.unlock, true);

  /* ======================================================================
     shared renderers — used by the app and by the landing demo
     ====================================================================== */

  function renderHeader(el, state, opts) {
    opts = opts || {};
    var h = state.hunter, rank = SYS.rankFor(h.level), need = SYS.xpNeed(h.level);
    if (!el._hdr) {
      el.innerHTML =
        '<div class="hdr-row">' +
          '<div data-h="hex"></div>' +
          '<div class="hdr-id">' +
            '<div class="hdr-name"><span data-h="name"></span><span class="chip" data-h="rank"></span></div>' +
            '<div class="hdr-title mono" data-h="title"></div>' +
          '</div>' +
          '<div class="hdr-meta">' +
            '<div class="hdr-stat c-gold"><b class="mono" data-h="gold"></b><small class="mono">GOLD</small></div>' +
            '<div class="hdr-stat c-warn"><b class="mono" data-h="streak"></b><small class="mono">STREAK</small></div>' +
          '</div>' +
          (opts.settings ? '<button type="button" class="icon-btn hdr-gear" data-act="settings" aria-label="Settings">' + ICON.gear + '</button>' : '') +
        '</div>' +
        '<div class="hdr-xp">' +
          '<span class="eyebrow">XP</span>' +
          '<div class="bar" data-h="xpbar" role="progressbar" aria-label="Experience to next level" aria-valuemin="0"><i></i></div>' +
          '<span class="mono hdr-xpt" data-h="xptext"></span>' +
        '</div>';
      el._hdr = {};
      qsa('[data-h]', el).forEach(function (n) { el._hdr[n.getAttribute('data-h')] = n; });
    }
    var H = el._hdr, fill = H.xpbar.firstChild, w = pct(h.xp, need) + '%';
    if (el._lvl !== h.level) H.hex.innerHTML = levelHex(h.level);
    H.name.textContent = h.name;
    H.rank.textContent = rankLabel(rank.id);
    H.rank.className = 'chip r-' + rank.id;
    H.title.textContent = SYS.titleById(h.title).name;
    H.gold.textContent = fmt(h.gold);
    H.streak.textContent = h.streak + 'd';
    H.xpbar.setAttribute('aria-valuemax', need);
    H.xpbar.setAttribute('aria-valuenow', Math.floor(h.xp));
    H.xptext.textContent = fmt(h.xp) + ' / ' + fmt(need);

    /* on level-up, fill to the end first, then restart from zero */
    el._w = w;
    if (el._lvl != null && h.level > el._lvl && !REDUCED) {
      fill.style.width = '100%';
      clearTimeout(el._t);
      el._t = setTimeout(function () {
        fill.style.transition = 'none';
        fill.style.width = '0%';
        void fill.offsetWidth;
        fill.style.transition = '';
        fill.style.width = el._w;
      }, 650);
    } else if (!el._t || el._lvl === h.level) {
      fill.style.width = w;
    }
    el._lvl = h.level;
  }

  /* hexagonal radar — six axes, four rings, tweened between renders */
  var RAD = { w: 340, h: 320, cx: 170, cy: 160, r: 100 };
  var radarCount = 0;

  function radarScale(stats) { return Math.max(30, Math.ceil((SYS.highestStat(stats) + 4) / 10) * 10); }

  function axisXY(i, frac) {
    var a = (-90 + i * 60) * Math.PI / 180;
    return [RAD.cx + Math.cos(a) * RAD.r * frac, RAD.cy + Math.sin(a) * RAD.r * frac];
  }

  function renderRadar(el, stats) {
    var i, p;
    if (!el._rad) {
      var fid = 'radar-glow-' + (++radarCount);
      var s = '<svg class="radar-svg" viewBox="0 0 ' + RAD.w + ' ' + RAD.h + '" role="img" aria-label="Attribute radar">' +
        '<defs><filter id="' + fid + '" x="-25%" y="-25%" width="150%" height="150%">' +
          '<feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>' +
        '</filter></defs>';
      for (i = 1; i <= 4; i++) s += '<polygon class="radar-ring" points="' + hexPoints(RAD.cx, RAD.cy, RAD.r * i / 4) + '"/>';
      for (i = 0; i < 6; i++) { p = axisXY(i, 1); s += '<line class="radar-axis" x1="' + RAD.cx + '" y1="' + RAD.cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"/>'; }
      s += '<polygon class="radar-shape" points="" filter="url(#' + fid + ')"/>';
      for (i = 0; i < 6; i++) s += '<circle class="radar-dot c-' + STATS[i] + '" r="4.2" cx="' + RAD.cx + '" cy="' + RAD.cy + '"/>';
      for (i = 0; i < 6; i++) {
        p = axisXY(i, 1.2);
        var anchor = i === 0 || i === 3 ? 'middle' : (i < 3 ? 'start' : 'end');
        var dy = i === 0 ? -2 : (i === 3 ? 12 : 4);
        s += '<text class="radar-lbl" x="' + p[0].toFixed(1) + '" y="' + (p[1] + dy).toFixed(1) + '" text-anchor="' + anchor + '">' +
          INFO[STATS[i]].label + ' <tspan class="radar-val c-' + STATS[i] + '"></tspan></text>';
      }
      p = axisXY(0, 1);
      s += '<text class="radar-scale" x="' + (RAD.cx + 6) + '" y="' + (p[1] + 12).toFixed(1) + '"></text>';
      s += '</svg>';
      el.innerHTML = s;
      el._rad = {
        shape: qs('.radar-shape', el),
        dots: qsa('.radar-dot', el),
        vals: qsa('.radar-val', el),
        scale: qs('.radar-scale', el),
        cur: null,
        raf: 0
      };
    }
    var R = el._rad, target = { v: [], max: radarScale(stats) };
    for (i = 0; i < 6; i++) {
      target.v.push(stats[STATS[i]]);
      R.vals[i].textContent = stats[STATS[i]];
    }
    R.scale.textContent = target.max;
    el.querySelector('svg').setAttribute('aria-label', 'Attribute radar: ' + STATS.map(function (k) { return INFO[k].label + ' ' + stats[k]; }).join(', '));

    function draw(v, max) {
      var pts = [];
      for (var j = 0; j < 6; j++) {
        var q = axisXY(j, Math.min(1, v[j] / max));
        pts.push(q[0].toFixed(1) + ',' + q[1].toFixed(1));
        R.dots[j].setAttribute('cx', q[0].toFixed(1));
        R.dots[j].setAttribute('cy', q[1].toFixed(1));
      }
      R.shape.setAttribute('points', pts.join(' '));
    }

    var from = R.cur;
    R.cur = target;
    if (!from || REDUCED || !root.requestAnimationFrame) { draw(target.v, target.max); return; }
    if (R.raf) root.cancelAnimationFrame(R.raf);
    var start = null, dur = 700;
    function step(ts) {
      if (start === null) start = ts;
      var k = Math.min(1, (ts - start) / dur), e = 1 - Math.pow(1 - k, 3), v = [];
      for (var j = 0; j < 6; j++) v.push(from.v[j] + (target.v[j] - from.v[j]) * e);
      draw(v, from.max + (target.max - from.max) * e);
      R.raf = k < 1 ? root.requestAnimationFrame(step) : 0;
    }
    R.raf = root.requestAnimationFrame(step);
  }

  function renderAttrs(el, state, opts) {
    opts = opts || {};
    if (!el._attrs) {
      var html = '';
      STATS.forEach(function (k) {
        html += '<li class="attr c-' + k + '" data-stat="' + k + '">' +
          '<div class="attr-top">' +
            '<span class="attr-lbl mono">' + INFO[k].label + '</span>' +
            '<span class="attr-name">' + INFO[k].name + '</span>' +
            '<b class="attr-val mono"></b>' +
            (opts.spend ? '<button type="button" class="btn btn-sm attr-plus" data-act="spend" data-stat="' + k + '" aria-label="Assign a point to ' + INFO[k].name + '" hidden>+</button>' : '') +
          '</div>' +
          (opts.desc === false ? '' : '<p class="attr-desc">' + INFO[k].desc + '</p>') +
          '<div class="attr-prog"><div class="bar"><i></i></div><span class="mono attr-xp"></span></div>' +
        '</li>';
      });
      el.innerHTML = html;
      el._attrs = true;
    }
    STATS.forEach(function (k) {
      var li = qs('[data-stat="' + k + '"].attr', el), v = state.stats[k], need = SYS.statNeed(v);
      var val = qs('.attr-val', li);
      if (li._v != null && v > li._v && !REDUCED) {
        li.classList.remove('is-up');
        void li.offsetWidth;
        li.classList.add('is-up');
      }
      li._v = v;
      val.textContent = v;
      qs('.bar > i', li).style.width = pct(state.statXp[k], need) + '%';
      qs('.attr-xp', li).textContent = Math.floor(state.statXp[k]) + ' / ' + need;
      var plus = qs('.attr-plus', li);
      if (plus) plus.hidden = !(state.hunter.points > 0);
    });
  }

  function questRow(q, opts) {
    opts = opts || {};
    var d = SYS.DIFFICULTY[q.difficulty], step = SYS.stepFor(q.target), id = esc(q.id);
    var name = opts.editable
      ? '<button type="button" class="q-name" data-act="edit-quest" data-id="' + id + '" aria-label="Edit quest: ' + esc(q.name) + '">' + esc(q.name) + '</button>'
      : '<span class="q-name">' + esc(q.name) + '</span>';
    var prog = q.target > 1
      ? '<div class="q-prog">' + bar((opts.keyPrefix || 'q:') + q.id, pct(q.progress, q.target)) +
        '<span class="mono">' + q.progress + ' / ' + q.target + (q.unit ? ' ' + esc(q.unit) : '') + '</span></div>'
      : '';
    var acts = q.done
      ? '<button type="button" class="btn btn-sm btn-ghost" data-act="undo" data-id="' + id + '" aria-label="Undo: ' + esc(q.name) + '">Undo</button>'
      : (q.target > 1 ? '<button type="button" class="btn btn-sm" data-act="inc" data-id="' + id + '" aria-label="Add ' + step + ' to ' + esc(q.name) + '">+' + step + '</button>' : '') +
        '<button type="button" class="btn btn-sm btn-hot" data-act="complete" data-id="' + id + '" aria-label="Complete: ' + esc(q.name) + '">Complete</button>';
    return '<li class="q win c-' + q.stat + (q.done ? ' is-done' : '') + '" data-id="' + id + '">' +
      '<div class="q-main">' + name +
        '<div class="q-chips">' +
          '<span class="chip c-' + q.stat + '">' + INFO[q.stat].label + '</span>' +
          '<span class="chip d-' + q.difficulty + '">' + q.difficulty + '</span>' +
          '<span class="chip c-sys">+' + d.xp + ' XP</span>' +
          '<span class="chip c-gold">+' + d.gold + ' G</span>' +
        '</div>' +
        prog +
      '</div>' +
      '<div class="q-acts">' + acts + '</div>' +
    '</li>';
  }

  function renderQuestList(ul, quests, opts) {
    var html = '';
    for (var i = 0; i < quests.length; i++) html += questRow(quests[i], opts);
    ul.innerHTML = html;
    settle(ul);
  }

  /* ---------- notifications: a queue, one at a time, never stacked ---------- */

  function Notifier(host, opts) {
    var self = this;
    self.host = host;
    self.opts = opts || {};
    self.queue = [];
    self.busy = false;
    self.timer = null;
    self.prev = null;
    host.innerHTML =
      '<div class="ntf-card win" tabindex="-1">' +
        '<div class="ntf-eye mono">⚠ NOTIFICATION</div>' +
        '<div class="ntf-title" id="' + (self.opts.idPrefix || 'ntf') + '-title"></div>' +
        '<div class="ntf-detail"></div>' +
        '<div class="ntf-hint mono">' + (self.opts.inline ? '' : 'Tap to continue') + '</div>' +
      '</div>';
    self.card = host.firstChild;
    self.title = qs('.ntf-title', host);
    self.detail = qs('.ntf-detail', host);
    host.addEventListener('click', function (e) { e.stopPropagation(); self.dismiss(); });
    if (!self.opts.inline) {
      doc.addEventListener('keydown', function (e) {
        if (!self.busy || self.host.hidden) return;
        var k = e.key;
        if (k === 'Escape' || k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); self.dismiss(); }
        else if (k === 'Tab') { e.preventDefault(); self.card.focus(); }
      });
    }
  }

  Notifier.prototype.push = function (notes) {
    if (!notes || !notes.length) return;
    this.queue = this.queue.concat(notes);
    if (!this.busy) {
      if (!this.opts.inline) this.prev = doc.activeElement;
      this.next();
    }
  };

  Notifier.prototype.next = function () {
    var self = this, n = self.queue.shift();
    if (!n) {
      self.busy = false;
      self.host.hidden = true;
      if (!self.opts.inline) {
        if (self.prev && self.prev !== doc.body && doc.body.contains(self.prev)) self.prev.focus();
        else if (self.opts.refocus) self.opts.refocus();
        self.prev = null;
      }
      if (self.opts.onIdle) self.opts.onIdle();
      return;
    }
    self.busy = true;
    self.host.className = 'ntf' + (self.opts.inline ? ' ntf--inline' : '') + ' c-' + (n.tone || 'sys');
    self.title.textContent = n.title;
    self.detail.textContent = n.detail || '';
    self.host.hidden = false;
    void self.host.offsetWidth;
    self.host.classList.add('is-in');
    if (!self.opts.inline) self.card.focus();
    if (self.opts.sound !== false && n.sound) Sound.play(n.sound);
    clearTimeout(self.timer);
    self.timer = setTimeout(function () { self.dismiss(); }, self.opts.duration || 4200);
  };

  Notifier.prototype.dismiss = function () {
    var self = this;
    if (!self.busy || !self.host.classList.contains('is-in')) return;
    clearTimeout(self.timer);
    self.host.classList.remove('is-in');
    setTimeout(function () { self.next(); }, REDUCED ? 0 : 180);
  };

  Notifier.prototype.clear = function () {
    clearTimeout(this.timer);
    this.queue = [];
    this.busy = false;
    this.host.classList.remove('is-in');
    this.host.hidden = true;
  };

  function eventsToNotes(events) {
    var out = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      switch (e.type) {
        case 'levelUp':
          out.push({ tone: 'sys', sound: 'level', title: 'LEVEL UP',
            detail: 'You have reached level ' + e.level + '. +' + e.points + ' attribute points to assign.' +
              (e.rank ? ' Your rank is now ' + rankLabel(e.rank) + '.' : '') });
          break;
        case 'statUp':
          out.push({ tone: e.stat, sound: 'stat', title: INFO[e.stat].label + ' +1',
            detail: INFO[e.stat].name + ' has increased to ' + e.value + '.' });
          break;
        case 'title':
          out.push({ tone: 'gold', sound: 'title', title: 'TITLE ACQUIRED',
            detail: '“' + e.name + '” is yours. Equip it from STATUS.' });
          break;
        case 'dailyClear':
          out.push({ tone: 'good', sound: 'clear', title: 'DAILY QUESTS CLEARED',
            detail: 'Bonus: +' + e.xp + ' XP, +' + e.gold + ' gold. Streak: ' + plural(e.streak, 'day') + '.' });
          break;
        case 'gate':
          out.push({ tone: 'mana', sound: 'gate', title: 'GATE CLEARED',
            detail: '“' + e.name + '” has fallen. +' + fmt(e.xp) + ' XP, +' + fmt(e.gold) + ' gold.' });
          break;
        case 'penalty':
          out.push({ tone: 'danger', sound: 'penalty', title: 'PENALTY',
            detail: plural(e.missed, 'daily quest') + ' left unfinished. −' + e.xp + ' XP.' +
              (e.prevStreak ? ' Your ' + e.prevStreak + '-day streak has been reset to zero.' : ' Your streak is zero.') });
          break;
        case 'restPassUsed':
          out.push({ tone: 'gold', sound: 'gate', title: 'REST PASS SPENT',
            detail: 'The penalty for ' + plural(e.missed, 'unfinished quest') + ' was waived. ' +
              (e.streak ? 'Your ' + e.streak + '-day streak holds.' : 'Your streak is untouched.') });
          break;
        case 'restPassBought':
          out.push({ tone: 'gold', sound: 'buy', title: 'REST PASS ACQUIRED',
            detail: 'You hold ' + e.count + '. One is spent automatically if a daily quest goes unfinished.' });
          break;
        case 'reward':
          out.push({ tone: 'gold', sound: 'buy', title: 'REWARD CLAIMED',
            detail: '“' + e.name + '” — earned, not given. Enjoy it.' });
          break;
      }
    }
    return out;
  }

  root.SYSUI = {
    REDUCED: REDUCED,
    esc: esc,
    fmt: fmt,
    pct: pct,
    bar: bar,
    settle: settle,
    rankLabel: rankLabel,
    levelHex: levelHex,
    renderHeader: renderHeader,
    renderRadar: renderRadar,
    renderAttrs: renderAttrs,
    questRow: questRow,
    renderQuestList: renderQuestList,
    Notifier: Notifier,
    eventsToNotes: eventsToNotes,
    Sound: Sound
  };

  /* ======================================================================
     the application
     ====================================================================== */

  var Store = SYS.Store;
  var SCREENS = ['status', 'quests', 'gates', 'shop', 'log'];
  var A = {
    state: null,
    screen: 'status',
    started: false,
    installEvt: null,
    fold: { titles: false, cleared: false },
    lastFocus: null,
    toastTimer: null,
    warnedFile: false
  };
  var el = {};

  function S() { return A.state; }

  function boot() {
    el.root = qs('#app-root');
    if (!el.root) return;
    el.hdr = qs('#hdr');
    el.main = qs('#main');
    el.sheet = qs('#sheet');
    el.first = qs('#firstrun');
    el.toast = qs('#toast');
    el.file = qs('#file-in');
    el.navHunter = qs('#nav-hunter');

    A.notifier = new Notifier(qs('#ntf'), { refocus: function () { restoreFocus(A.lastFocus, true); } });

    doc.addEventListener('click', onClick);
    doc.addEventListener('keydown', onKey);
    el.file.addEventListener('change', onFilePicked);
    root.addEventListener('hashchange', function () { show(screenFromHash(), true); });

    root.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      A.installEvt = e;
      if (A.state) renderInstall();
    });
    root.addEventListener('appinstalled', function () { setInstallFlag(); if (A.state) renderInstall(); });

    Store.onFileError = function () {
      if (A.warnedFile) return;
      A.warnedFile = true;
      toast('The linked save file could not be written. Check Settings.');
    };

    var local = Store.readLocal();
    if (local) adopt(local.state);
    else showFirstRun();

    if (Store.memoryOnly) {
      A.notifier.push([{ tone: 'warn', title: 'STORAGE BLOCKED',
        detail: 'This browser will not let the System save (private browsing?). Progress lasts until the tab closes — use Settings → Save to file to keep it.' }]);
    }

    Store.restoreHandle(function (err, res) {
      if (res && res.ok && (!A.state || SYS.isNewer(res.savedAt, Store.lastSavedAt))) {
        adopt(res.state);
        Store.lastSavedAt = res.savedAt;
        Store.writeLocal(res.state, res.savedAt);
        toast('Loaded the newer save from your linked file.');
      }
      if (!el.sheet.hidden && A.sheetKind === 'settings') openSettings();
    });

    if ('serviceWorker' in root.navigator && root.isSecureContext) {
      try { root.navigator.serviceWorker.register('../sw.js', { scope: '../' }).then(null, function () {}); } catch (e) { /* offline support is optional */ }
    }
  }

  function adopt(state) {
    A.state = state;
    Sound.enabled = state.sound !== false;
    el.first.hidden = true;
    el.first.innerHTML = '';
    el.root.hidden = false;
    if (!A.started) {
      A.started = true;
      setInterval(tick, 20000);
      setInterval(clock, 1000);
      doc.addEventListener('visibilitychange', function () { if (!doc.hidden) tick(); });
      show(screenFromHash(), true);
    }
    var changed = tick();
    if (!changed) { save(); render(); }
  }

  /* Rollover check. Returns true if it committed a change. */
  function tick() {
    var s = S();
    if (!s) return false;
    var before = s.lastDate, ev = SYS.rollover(s, SYS.localDateKey());
    if (ev.length || s.lastDate !== before) { commit(ev); return true; }
    return false;
  }

  function save() { if (A.state) Store.schedule(A.state); }

  function commit(ev) {
    ev = ev || [];
    var notes = eventsToNotes(ev), quest = null;
    for (var i = 0; i < ev.length; i++) if (ev[i].type === 'quest') quest = ev[i];
    if (quest) {
      if (!notes.length) Sound.play('quest');
      toast('QUEST CLEARED · +' + quest.xp + ' XP · +' + quest.gold + ' G · ' + INFO[quest.stat].label + ' +' + quest.statXp);
    }
    if (notes.length) A.notifier.push(notes);
    save();
    render();
  }

  /* ---------- rendering ---------- */

  function render() {
    var s = S();
    if (!s) return;
    var k = focusKey();
    if (k) A.lastFocus = k;
    renderHeader(el.hdr, s, { settings: true });
    renderNavHunter();
    renderStatus();
    renderQuests();
    renderGates();
    renderShop();
    renderLog();
    settle(el.root);
    restoreFocus(k);
  }

  function renderNavHunter() {
    var h = S().hunter, r = SYS.rankFor(h.level);
    el.navHunter.innerHTML = levelHex(h.level) +
      '<div class="nh-id">' +
        '<div class="nh-name">' + esc(h.name) + '</div>' +
        '<div class="nh-meta"><span class="chip r-' + r.id + '">' + rankLabel(r.id) + '</span></div>' +
        '<div class="nh-title mono">' + esc(SYS.titleById(h.title).name) + '</div>' +
      '</div>';
  }

  function cell(label, value, cls) {
    return '<div class="cell ' + (cls || '') + '"><b class="mono">' + value + '</b><span class="eyebrow">' + label + '</span></div>';
  }

  function renderStatus() {
    var s = S(), h = s.hunter;
    renderRadar(qs('#radar'), s.stats);
    renderAttrs(qs('#attrs'), s, { spend: true });
    var pts = qs('#pts');
    pts.hidden = !h.points;
    pts.textContent = plural(h.points, 'point') + ' to assign';
    qs('#cells').innerHTML =
      cell('Streak', h.streak, 'c-warn') +
      cell('Best', h.bestStreak, 'c-gold') +
      cell('Quests', fmt(h.questsDone), 'c-sys') +
      cell('Gates', SYS.gatesCleared(s), 'c-mana');

    qs('#titles-count').textContent = h.titles.length + ' / ' + SYS.TITLES.length;
    var html = '';
    SYS.TITLES.forEach(function (t) {
      var have = h.titles.indexOf(t.id) > -1, eq = h.title === t.id;
      html += '<li class="title-row' + (have ? '' : ' is-locked') + (eq ? ' is-eq' : '') + '">' +
        '<div class="title-txt"><div class="title-name">' + (have ? esc(t.name) : '??????') + '</div>' +
        '<div class="title-req mono">' + esc(t.req) + '</div></div>' +
        (have
          ? (eq ? '<span class="chip c-gold">Equipped</span>'
                : '<button type="button" class="btn btn-sm" data-act="equip" data-id="' + t.id + '">Equip</button>')
          : '<span class="chip c-muted">Locked</span>') +
      '</li>';
    });
    qs('#titles').innerHTML = html;
    setFold('titles');
  }

  function countdown() {
    var ms = SYS.msToMidnight(), t = Math.floor(ms / 1000);
    return pad2(Math.floor(t / 3600)) + ':' + pad2(Math.floor(t / 60) % 60) + ':' + pad2(t % 60);
  }

  function clock() {
    var c = qs('#countdown');
    if (c) c.textContent = countdown();
  }

  function dailyLine(sum, h) {
    if (!sum.total) return 'No daily quests registered. The System is waiting.';
    if (!sum.remaining) return 'All daily quests cleared. The streak is safe — rest, Hunter.';
    var stake = sum.remaining * SYS.MISS_PENALTY, line;
    if (sum.remaining === 1) {
      line = 'One quest remains. Leave it and lose ' + stake + ' XP' + (h.streak ? ' and your ' + h.streak + '-day streak.' : '.');
    } else {
      line = sum.remaining + ' quests remain — ' + stake + ' XP' + (h.streak ? ' and a ' + h.streak + '-day streak are at stake.' : ' at stake.');
    }
    if (!sum.done) line = 'Nothing cleared yet. ' + line;
    if (h.restPasses) line += ' A rest pass will cover a miss tonight.';
    return line;
  }

  function renderQuests() {
    var s = S(), h = s.hunter, sum = SYS.dailySummary(s);
    var all = sum.total && !sum.remaining;
    qs('#daily').innerHTML =
      '<div class="daily-top">' +
        '<div><span class="eyebrow">Daily quests</span>' +
          '<div class="daily-count mono"><b>' + sum.done + '</b>/' + sum.total + ' <small>cleared</small></div></div>' +
        '<div class="daily-clock"><span class="eyebrow">Resets in</span>' +
          '<div class="mono countdown" id="countdown" role="timer" aria-label="Time until daily reset">' + countdown() + '</div></div>' +
      '</div>' +
      bar('daily', pct(sum.done, sum.total), all ? 'c-good' : '') +
      '<p class="daily-line' + (all ? ' is-clear' : '') + '">' + esc(dailyLine(sum, h)) + '</p>' +
      (h.restPasses ? '<p class="daily-pass mono">Rest passes held: ' + h.restPasses + '</p>' : '');

    var daily = [], side = [];
    s.quests.forEach(function (q) { (q.type === 'daily' ? daily : side).push(q); });
    renderQuestList(qs('#q-daily'), daily, { editable: true });
    renderQuestList(qs('#q-side'), side, { editable: true });
    qs('#q-daily-empty').hidden = daily.length > 0;
    qs('#q-side-empty').hidden = side.length > 0;
    renderInstall();
  }

  function renderGates() {
    var s = S(), active = [], cleared = [];
    s.gates.forEach(function (g) { (g.cleared ? cleared : active).push(g); });
    var html = '';
    active.forEach(function (g) {
      var r = SYS.GATE_RANK[g.rank], left = g.total - g.progress, id = esc(g.id), unit = g.unit ? ' ' + esc(g.unit) : '';
      html += '<li class="gate win r-' + g.rank + '" data-id="' + id + '">' +
        '<div class="gate-top">' +
          '<span class="chip r-' + g.rank + '">' + g.rank + '-rank gate</span>' +
          '<button type="button" class="gate-name" data-act="edit-gate" data-id="' + id + '" aria-label="Edit gate: ' + esc(g.name) + '">' + esc(g.name) + '</button>' +
        '</div>' +
        '<div class="boss">' +
          '<div class="boss-lbl mono"><span>Boss HP</span><span>' + left + ' / ' + g.total + unit + '</span></div>' +
          bar('g:' + g.id, pct(left, g.total), 'boss-bar', 'Boss health ' + left + ' of ' + g.total) +
        '</div>' +
        '<div class="gate-foot">' +
          '<span class="gate-reward mono">Clear reward <span class="c-sys">+' + fmt(r.xp) + ' XP</span> <span class="c-gold">+' + fmt(r.gold) + ' G</span></span>' +
          '<span class="gate-acts">' +
            '<button type="button" class="btn btn-sm btn-ghost" data-act="unstrike" data-id="' + id + '" aria-label="Correct: remove one strike from ' + esc(g.name) + '"' + (g.progress ? '' : ' disabled') + '>−1</button>' +
            '<button type="button" class="btn btn-sm btn-hot" data-act="strike" data-id="' + id + '" aria-label="Strike +1: ' + esc(g.name) + '">Strike +1</button>' +
          '</span>' +
        '</div>' +
      '</li>';
    });
    qs('#gates').innerHTML = html;
    qs('#gates-empty').hidden = active.length > 0;

    html = '';
    cleared.forEach(function (g) {
      html += '<li class="cleared-row">' +
        '<span class="chip r-' + g.rank + '">' + g.rank + '</span>' +
        '<button type="button" class="gate-name" data-act="edit-gate" data-id="' + esc(g.id) + '">' + esc(g.name) + '</button>' +
        '<span class="mono muted">' + g.total + (g.unit ? ' ' + esc(g.unit) : '') + '</span>' +
      '</li>';
    });
    qs('#cleared').innerHTML = html;
    qs('#cleared-count').textContent = cleared.length;
    qs('#cleared-panel').hidden = !cleared.length;
    setFold('cleared');
  }

  function renderShop() {
    var s = S(), h = s.hunter, html = '';
    qs('#gold-big').textContent = fmt(h.gold);
    qs('#passes').textContent = 'Rest passes held: ' + h.restPasses;
    s.shop.forEach(function (it) {
      var rest = it.effect === 'restpass', afford = h.gold >= it.cost, id = esc(it.id);
      html += '<li class="item win' + (rest ? ' item-pass' : '') + '">' +
        '<div class="item-main">' +
          (rest
            ? '<div class="item-name">Rest Pass <span class="chip c-gold">Functional</span></div>' +
              '<p class="item-desc">Waives the midnight penalty once and keeps your streak. Spent automatically when a daily quest goes unfinished.</p>'
            : '<button type="button" class="item-name item-edit" data-act="edit-reward" data-id="' + id + '" aria-label="Edit reward: ' + esc(it.name) + '">' + esc(it.name) + '</button>') +
          '<div class="item-meta mono"><span class="c-gold">' + fmt(it.cost) + ' G</span>' +
            (it.taken ? ' · ' + (rest ? 'bought ' : 'claimed ') + it.taken + '×' : '') + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm' + (afford ? ' btn-gold' : '') + '" data-act="buy" data-id="' + id + '"' + (afford ? '' : ' disabled') + '>' +
          (afford ? (rest ? 'Buy' : 'Claim') : 'Need ' + fmt(it.cost - h.gold) + ' more') +
        '</button>' +
      '</li>';
    });
    qs('#shop').innerHTML = html;
  }

  function stamp(t) {
    var d = new Date(t);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function renderLog() {
    var log = S().log, html = '';
    for (var i = 0; i < log.length; i++) {
      html += '<li class="log-row k-' + esc(log[i].kind) + '"><time class="mono" datetime="' + new Date(log[i].t).toISOString() + '">' +
        stamp(log[i].t) + '</time><span>' + esc(log[i].text) + '</span></li>';
    }
    qs('#log').innerHTML = html || '<li class="log-row k-system"><span>The log is empty.</span></li>';
    qs('#log-count').textContent = log.length + ' / 250 entries';
  }

  /* ---------- install offer: once, quietly, after the first quest ---------- */

  function installFlag() { try { return root.localStorage.getItem(INSTALL_FLAG) === '1'; } catch (e) { return false; } }
  function setInstallFlag() { try { root.localStorage.setItem(INSTALL_FLAG, '1'); } catch (e) { /* in-memory only */ } A.installHidden = true; }
  function isStandalone() {
    try { if (root.matchMedia('(display-mode: standalone)').matches) return true; } catch (e) { /* ignore */ }
    return root.navigator.standalone === true;
  }
  function isIOS() {
    var n = root.navigator;
    return /iPad|iPhone|iPod/.test(n.userAgent) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
  }

  function renderInstall() {
    var box = qs('#install'), s = S();
    var show = s && s.hunter.questsDone >= 1 && !A.installHidden && !installFlag() && !isStandalone() && (A.installEvt || isIOS());
    box.hidden = !show;
    if (!show) { box.innerHTML = ''; return; }
    box.innerHTML = '<span>The System can live on your home screen.</span>' +
      (A.installEvt
        ? '<button type="button" class="btn btn-sm" data-act="install">Install</button>'
        : '<a class="btn btn-sm" href="../how-it-works.html#install">How</a>') +
      '<button type="button" class="icon-btn" data-act="install-dismiss" aria-label="Dismiss install offer">' + ICON.close + '</button>';
  }

  /* ---------- navigation ---------- */

  function screenFromHash() {
    var h = (root.location.hash || '').replace('#', '');
    return SCREENS.indexOf(h) > -1 ? h : A.screen;
  }

  function show(name, fromHash) {
    if (SCREENS.indexOf(name) === -1) return;
    A.screen = name;
    qsa('.screen', el.main).forEach(function (sec) { sec.hidden = sec.getAttribute('data-screen') !== name; });
    qsa('.nav-btn').forEach(function (b) {
      if (b.getAttribute('data-screen') === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (!fromHash && root.history && root.history.replaceState) {
      try { root.history.replaceState(null, '', '#' + name); } catch (e) { /* file:// */ }
    }
    root.scrollTo(0, 0);
  }

  function setFold(key) {
    var btn = qs('[data-act="fold"][data-target="' + key + '"]'), list = qs('#' + key);
    if (!btn || !list) return;
    btn.setAttribute('aria-expanded', A.fold[key] ? 'true' : 'false');
    list.hidden = !A.fold[key];
  }

  /* ---------- focus survives re-renders ---------- */

  function focusKey() {
    var a = doc.activeElement;
    if (!a || a === doc.body || !el.root.contains(a) || !a.getAttribute('data-act')) return null;
    var row = closest(a.parentNode, 'data-id');
    return {
      act: a.getAttribute('data-act'),
      id: a.getAttribute('data-id'),
      stat: a.getAttribute('data-stat'),
      screen: a.getAttribute('data-screen'),
      row: row ? row.getAttribute('data-id') : null
    };
  }

  function restoreFocus(k, force) {
    if (!k) return;
    var a = doc.activeElement;
    if (!force && a && a !== doc.body && doc.body.contains(a)) return;
    var sel = '[data-act="' + k.act + '"]' +
      (k.id ? '[data-id="' + k.id + '"]' : '') +
      (k.stat ? '[data-stat="' + k.stat + '"]' : '') +
      (k.screen ? '[data-screen="' + k.screen + '"]' : '');
    var t = qs(sel, el.root);
    if ((!t || t.disabled || t.hidden) && k.row) t = qs('[data-id="' + k.row + '"] .q-acts button, [data-id="' + k.row + '"] .gate-acts button:not([disabled])', el.root);
    if ((!t || t.disabled || t.hidden) && k.act === 'spend') t = qs('.attr-plus:not([hidden])', el.root);
    if (t && !t.disabled && !t.hidden) t.focus();
  }

  /* ---------- toast ---------- */

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-on');
    clearTimeout(A.toastTimer);
    A.toastTimer = setTimeout(function () { el.toast.classList.remove('is-on'); }, 2600);
  }

  /* ---------- two-tap confirmation for anything costly or destructive ---------- */

  function confirmTap(btn, label) {
    if (btn.getAttribute('data-armed') === '1') return true;
    var old = btn.innerHTML;
    btn.setAttribute('data-armed', '1');
    btn.innerHTML = label;
    setTimeout(function () {
      if (btn.getAttribute('data-armed') === '1') { btn.removeAttribute('data-armed'); btn.innerHTML = old; }
    }, 3000);
    return false;
  }

  /* ======================================================================
     sheets (forms)
     ====================================================================== */

  function field(label, control, hint) {
    return '<label class="field"><span class="eyebrow">' + label + '</span>' + control +
      (hint ? '<span class="field-hint">' + hint + '</span>' : '') + '</label>';
  }

  function options(list, current) {
    var out = '';
    for (var i = 0; i < list.length; i++) {
      out += '<option value="' + esc(list[i][0]) + '"' + (list[i][0] === current ? ' selected' : '') + '>' + esc(list[i][1]) + '</option>';
    }
    return out;
  }

  function openSheet(kind, title, body, onSubmit) {
    var returnTo = el.sheet.hidden ? doc.activeElement : A.sheetReturn;
    A.sheetKind = kind;
    A.sheetReturn = returnTo;
    el.sheet.innerHTML =
      '<div class="sheet-veil" data-act="sheet-close"></div>' +
      '<form class="sheet-card win" role="dialog" aria-modal="true" aria-labelledby="sheet-title" novalidate>' +
        '<div class="sheet-head"><h2 class="sheet-title" id="sheet-title">' + title + '</h2>' +
          '<button type="button" class="icon-btn" data-act="sheet-close" aria-label="Close">' + ICON.close + '</button></div>' +
        '<div class="sheet-body">' + body + '</div>' +
      '</form>';
    el.sheet.hidden = false;
    doc.body.classList.add('has-sheet');
    var form = qs('form', el.sheet);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (onSubmit) onSubmit(form);
    });
    var first = qs('input:not([type=hidden]), select, button:not([data-act=sheet-close])', form);
    if (first) first.focus();
  }

  function closeSheet() {
    if (el.sheet.hidden) return;
    el.sheet.hidden = true;
    el.sheet.innerHTML = '';
    doc.body.classList.remove('has-sheet');
    A.sheetKind = null;
    var r = A.sheetReturn;
    A.sheetReturn = null;
    if (r && doc.body.contains(r)) r.focus();
  }

  function val(form, name) {
    var f = form.elements[name];
    if (!f) return '';
    if (f.length && !f.tagName) {           // radio group
      for (var i = 0; i < f.length; i++) if (f[i].checked) return f[i].value;
      return '';
    }
    return String(f.value).replace(/^\s+|\s+$/g, '');
  }

  function invalid(form, name, msg) {
    var f = form.elements[name];
    var box = qs('.form-err', form);
    box.textContent = msg;
    box.hidden = false;
    if (f && f.focus) f.focus();
  }

  var ERR = '<p class="form-err" role="alert" hidden></p>';

  function questForm(q, type) {
    var editing = !!q;
    q = q || { name: '', type: type || 'daily', stat: 'str', difficulty: 'NORMAL', target: 1, unit: '' };
    var statOpts = STATS.map(function (k) { return [k, INFO[k].label + ' — ' + INFO[k].name]; });
    var diffOpts = SYS.DIFFICULTIES.map(function (d) {
      var r = SYS.DIFFICULTY[d];
      return [d, d + ' · ' + r.xp + ' XP · ' + r.gold + ' G'];
    });
    return field('Quest name', '<input name="name" maxlength="60" autocomplete="off" required value="' + esc(q.name) + '" placeholder="e.g. Push-ups">') +
      '<fieldset class="seg"><legend class="eyebrow">Type</legend>' +
        '<label><input type="radio" name="type" value="daily"' + (q.type === 'daily' ? ' checked' : '') + '><span><b>Daily</b><small>Repeats. Penalised if missed.</small></span></label>' +
        '<label><input type="radio" name="type" value="side"' + (q.type === 'side' ? ' checked' : '') + '><span><b>Side</b><small>One-off. No penalty.</small></span></label>' +
      '</fieldset>' +
      '<div class="row2">' +
        field('Attribute', '<select name="stat">' + options(statOpts, q.stat) + '</select>') +
        field('Difficulty', '<select name="difficulty">' + options(diffOpts, q.difficulty) + '</select>') +
      '</div>' +
      '<div class="row2">' +
        field('Target', '<input name="target" type="number" min="1" max="9999" step="1" inputmode="numeric" value="' + q.target + '">', '1 for a single action') +
        field('Unit', '<input name="unit" maxlength="16" autocomplete="off" value="' + esc(q.unit) + '" placeholder="reps, pages, min">') +
      '</div>' + ERR +
      '<div class="sheet-acts">' +
        (editing ? '<button type="button" class="btn btn-danger" data-act="delete-quest" data-id="' + esc(q.id) + '">Delete</button>' : '') +
        '<button type="submit" class="btn btn-hot">' + (editing ? 'Save quest' : 'Register quest') + '</button>' +
      '</div>';
  }

  function readQuestForm(form) {
    var name = val(form, 'name'), target = Math.floor(+val(form, 'target'));
    if (!name) { invalid(form, 'name', 'Give the quest a name.'); return null; }
    if (!(target >= 1 && target <= 9999)) { invalid(form, 'target', 'Target must be a whole number from 1 to 9999.'); return null; }
    return { name: name, type: val(form, 'type'), stat: val(form, 'stat'), difficulty: val(form, 'difficulty'), target: target, unit: val(form, 'unit') };
  }

  function openQuestForm(id, type) {
    var q = id ? SYS.find(S().quests, id) : null;
    openSheet('quest', q ? 'Edit quest' : 'Register a quest', questForm(q, type), function (form) {
      var data = readQuestForm(form);
      if (!data) return;
      if (q) SYS.updateQuest(S(), q.id, data);
      else SYS.addQuest(S(), data);
      closeSheet();
      commit(SYS.checkTitles(S(), []));
      toast(q ? 'Quest updated.' : 'Quest registered.');
    });
  }

  function gateForm(g) {
    var editing = !!g;
    g = g || { name: '', rank: 'D', total: 10, unit: '' };
    var rankOpts = SYS.GATE_RANKS.map(function (r) {
      var x = SYS.GATE_RANK[r];
      return [r, r + '-rank · ' + fmt(x.xp) + ' XP · ' + fmt(x.gold) + ' G'];
    });
    return field('Gate name', '<input name="name" maxlength="60" autocomplete="off" required value="' + esc(g.name) + '" placeholder="e.g. Read 12 books">') +
      field('Rank', '<select name="rank">' + options(rankOpts, g.rank) + '</select>', 'Higher ranks pay more. Pick the rank that matches the effort.') +
      '<div class="row2">' +
        field('Boss HP', '<input name="total" type="number" min="1" max="9999" step="1" inputmode="numeric" value="' + g.total + '">', 'Sessions to clear') +
        field('Unit', '<input name="unit" maxlength="16" autocomplete="off" value="' + esc(g.unit) + '" placeholder="sessions, books">') +
      '</div>' + ERR +
      '<div class="sheet-acts">' +
        (editing ? '<button type="button" class="btn btn-danger" data-act="delete-gate" data-id="' + esc(g.id) + '">Delete</button>' : '') +
        '<button type="submit" class="btn btn-hot">' + (editing ? 'Save gate' : 'Open gate') + '</button>' +
      '</div>';
  }

  function openGateForm(id) {
    var g = id ? SYS.find(S().gates, id) : null;
    openSheet('gate', g ? 'Edit gate' : 'Open a gate', gateForm(g), function (form) {
      var name = val(form, 'name'), total = Math.floor(+val(form, 'total'));
      if (!name) return invalid(form, 'name', 'Give the gate a name.');
      if (!(total >= 1 && total <= 9999)) return invalid(form, 'total', 'Boss HP must be a whole number from 1 to 9999.');
      var data = { name: name, rank: val(form, 'rank'), total: total, unit: val(form, 'unit') };
      if (g) SYS.updateGate(S(), g.id, data);
      else SYS.addGate(S(), data);
      closeSheet();
      commit([]);
      toast(g ? 'Gate updated.' : 'Gate opened.');
    });
  }

  function openRewardForm(id) {
    var r = id ? SYS.find(S().shop, id) : null;
    var body = field('Reward', '<input name="name" maxlength="40" autocomplete="off" required value="' + esc(r ? r.name : '') + '" placeholder="e.g. A film night">') +
      field('Price in gold', '<input name="cost" type="number" min="1" max="999999" step="1" inputmode="numeric" value="' + (r ? r.cost : 100) + '">',
        'A day of cleared dailies earns roughly 60–120 gold.') + ERR +
      '<div class="sheet-acts">' +
        (r ? '<button type="button" class="btn btn-danger" data-act="delete-reward" data-id="' + esc(r.id) + '">Delete</button>' : '') +
        '<button type="submit" class="btn btn-hot">' + (r ? 'Save reward' : 'Add reward') + '</button>' +
      '</div>';
    openSheet('reward', r ? 'Edit reward' : 'Add a reward', body, function (form) {
      var name = val(form, 'name'), cost = Math.floor(+val(form, 'cost'));
      if (!name) return invalid(form, 'name', 'Name the reward.');
      if (!(cost >= 1 && cost <= 999999)) return invalid(form, 'cost', 'Price must be a whole number of gold, at least 1.');
      if (r) SYS.updateReward(S(), r.id, { name: name, cost: cost });
      else SYS.addReward(S(), { name: name, cost: cost });
      closeSheet();
      commit([]);
      toast(r ? 'Reward updated.' : 'Reward added to the shop.');
    });
  }

  function openSettings() {
    var s = S(), h = s.hunter, fileBlock = '';
    if (Store.supportsFileLink()) {
      var name = Store.handle && Store.handle.name ? esc(Store.handle.name) : SYS.SAVE_NAME;
      if (Store.handleState === 'granted') {
        fileBlock = '<p class="set-note"><span class="c-good mono">● LINKED</span> Auto-saving to <b>' + name + '</b> after every change.</p>' +
          '<div class="set-row"><button type="button" class="btn btn-ghost" data-act="unlink">Unlink file</button></div>';
      } else if (Store.handleState === 'prompt') {
        fileBlock = '<p class="set-note"><span class="c-warn mono">● PAUSED</span> Linked to <b>' + name + '</b>, but the browser needs your permission again.</p>' +
          '<div class="set-row"><button type="button" class="btn" data-act="reconnect">Reconnect</button><button type="button" class="btn btn-ghost" data-act="unlink">Unlink</button></div>';
      } else {
        fileBlock = '<p class="set-note">This browser can keep a save file on your device updated automatically.</p>' +
          '<div class="set-row"><button type="button" class="btn" data-act="link-file">Link a save file</button></div>';
      }
    }
    var body =
      '<div class="set-group">' +
        field('Hunter name', '<input name="name" maxlength="24" autocomplete="nickname" required value="' + esc(h.name) + '">') + ERR +
        '<div class="set-row"><button type="submit" class="btn">Save name</button></div>' +
      '</div>' +
      '<div class="set-group">' +
        '<div class="set-line"><span><span class="eyebrow">Sound</span><span class="set-sub">Short tones on quests, levels and penalties.</span></span>' +
          '<button type="button" class="btn btn-sm' + (s.sound ? ' btn-hot' : ' btn-ghost') + '" data-act="toggle-sound" aria-pressed="' + (s.sound ? 'true' : 'false') + '">' + (s.sound ? 'On' : 'Off') + '</button></div>' +
      '</div>' +
      '<div class="set-group">' +
        '<span class="eyebrow">Save file</span>' +
        (Store.memoryOnly ? '<p class="set-note c-danger">This browser is blocking storage. Progress will be lost when the tab closes unless you save it to a file.</p>' : '') +
        '<p class="set-note">Progress saves automatically in this browser. Keep a file as a backup, or to carry your hunter to another device.</p>' +
        '<div class="set-row"><button type="button" class="btn" data-act="save-file">Save to file</button><button type="button" class="btn" data-act="load-file">Load file</button></div>' +
        fileBlock +
      '</div>' +
      '<div class="set-group">' +
        '<span class="eyebrow">More</span>' +
        '<p class="set-links"><a href="../how-it-works.html">How it works</a> · <a href="../how-it-works.html#install">Install</a> · <a href="../privacy.html">Privacy</a> · <a href="../">Home</a></p>' +
      '</div>' +
      '<div class="set-group set-danger">' +
        '<span class="eyebrow c-danger">Danger</span>' +
        '<p class="set-note">Erase everything stored in this browser. Save a file first if you want to keep it.</p>' +
        '<div class="set-row"><button type="button" class="btn btn-danger" data-act="erase">Erase all data</button></div>' +
      '</div>';
    openSheet('settings', 'Settings', body, function (form) {
      var name = val(form, 'name');
      if (!name) return invalid(form, 'name', 'Your hunter needs a name.');
      if (name !== S().hunter.name) {
        SYS.pushLog(S(), 'system', 'Hunter renamed to ' + name.slice(0, 24) + '.');
        S().hunter.name = name.slice(0, 24);
        commit([]);
      }
      toast('Name saved.');
    });
  }

  /* ---------- first run ---------- */

  function showFirstRun() {
    el.root.hidden = true;
    el.first.hidden = false;
    el.first.innerHTML =
      '<div class="fr-card win" role="dialog" aria-modal="true" aria-labelledby="fr-title">' +
        '<div class="ntf-eye mono">⚠ NOTIFICATION</div>' +
        '<h1 class="fr-title" id="fr-title">YOU HAVE BEEN CHOSEN</h1>' +
        '<p class="fr-copy">From today the System sets your daily quests and holds you to them. Nothing here is awarded for free: every level and every point of every attribute is earned in the real world. Leave a daily quest unfinished and you will pay for it.</p>' +
        '<form class="fr-form" id="fr-form" novalidate>' +
          '<label class="field"><span class="eyebrow">Hunter name</span>' +
            '<input name="name" maxlength="24" autocomplete="nickname" required placeholder="Your name"></label>' +
          '<p class="form-err" role="alert" hidden></p>' +
          '<button type="submit" class="btn btn-hot btn-lg">Accept</button>' +
        '</form>' +
        '<button type="button" class="link-btn mono" data-act="load-file">Load an existing save file</button>' +
        '<p class="fr-fine">No account. Your progress stays in this browser. <a href="../privacy.html">Privacy</a> · <a href="../how-it-works.html">How it works</a></p>' +
      '</div>';
    var form = qs('#fr-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = val(form, 'name');
      if (!name) return invalid(form, 'name', 'The System needs a name to address you by.');
      adopt(SYS.newState(name));
      Store.flush(A.state);
      if (Store.memoryOnly) toast('Storage is blocked — save to a file before closing.');
    });
    var input = qs('input', form);
    if (input) input.focus();
  }

  /* ---------- save files ---------- */

  function downloadSave() {
    try {
      var blob = new Blob([Store.serialize(S())], { type: 'application/json' });
      var url = root.URL.createObjectURL(blob), a = doc.createElement('a');
      a.href = url;
      a.download = SYS.SAVE_NAME;
      a.rel = 'noopener';
      doc.body.appendChild(a);
      a.click();
      setTimeout(function () { root.URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
      toast('Save file written — ' + SYS.SAVE_NAME);
    } catch (e) {
      toast('This browser blocked the download.');
    }
  }

  function onFilePicked() {
    var f = el.file.files && el.file.files[0];
    el.file.value = '';
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var res;
      try { res = SYS.validate(JSON.parse(reader.result)); }
      catch (e) { res = { ok: false, error: 'This file is not valid JSON, so it cannot be a save file.' }; }
      loadResult(res);
    };
    reader.onerror = function () { loadResult({ ok: false, error: 'The file could not be read.' }); };
    try { reader.readAsText(f); } catch (e) { loadResult({ ok: false, error: 'The file could not be read.' }); }
  }

  function loadResult(res) {
    if (!res.ok) {
      A.notifier.push([{ tone: 'danger', sound: 'penalty', title: 'LOAD REJECTED',
        detail: res.error + (A.state ? ' Your current progress is untouched.' : '') }]);
      return;
    }
    closeSheet();
    SYS.pushLog(res.state, 'system', 'Save file loaded.');
    adopt(res.state);
    Store.flush(A.state);
    var line = SYS.summary(res.state)[0];
    A.notifier.push([{ tone: 'sys', sound: 'title', title: 'SAVE LOADED', detail: line }]);
  }

  function erase() {
    clearTimeout(Store.timer);
    Store.timer = null;
    Store.clearLocal();
    Store.unlink();
    try { root.localStorage.removeItem(INSTALL_FLAG); } catch (e) { /* nothing to clear */ }
    closeSheet();
    A.notifier.clear();
    A.state = null;
    lastWidth = {};
    showFirstRun();
  }

  /* ======================================================================
     events
     ====================================================================== */

  var ACTIONS = {
    nav: function (t) { Sound.play('tap'); show(t.getAttribute('data-screen')); },
    complete: function (t) { tick(); commit(SYS.completeQuest(S(), t.getAttribute('data-id'))); },
    inc: function (t) { tick(); Sound.play('tap'); commit(SYS.incrementQuest(S(), t.getAttribute('data-id'))); },
    undo: function (t) { tick(); Sound.play('tap'); commit(SYS.undoQuest(S(), t.getAttribute('data-id'))); },
    'new-quest': function (t) { openQuestForm(null, t.getAttribute('data-type')); },
    'edit-quest': function (t) { openQuestForm(t.getAttribute('data-id')); },
    'delete-quest': function (t) {
      if (!confirmTap(t, 'Tap again to delete')) return;
      var ev = SYS.deleteQuest(S(), t.getAttribute('data-id'));
      closeSheet();
      commit(ev);
      toast('Quest removed.');
    },
    strike: function (t) { Sound.play('tap'); commit(SYS.strikeGate(S(), t.getAttribute('data-id'), 1)); },
    unstrike: function (t) { Sound.play('tap'); commit(SYS.strikeGate(S(), t.getAttribute('data-id'), -1)); },
    'new-gate': function () { openGateForm(null); },
    'edit-gate': function (t) { openGateForm(t.getAttribute('data-id')); },
    'delete-gate': function (t) {
      if (!confirmTap(t, 'Tap again to delete')) return;
      SYS.deleteGate(S(), t.getAttribute('data-id'));
      closeSheet();
      commit([]);
      toast('Gate removed.');
    },
    buy: function (t) {
      var it = SYS.find(S().shop, t.getAttribute('data-id'));
      if (!it || S().hunter.gold < it.cost) return;
      if (!confirmTap(t, 'Confirm −' + fmt(it.cost) + ' G')) return;
      commit(SYS.buy(S(), it.id));
    },
    'new-reward': function () { openRewardForm(null); },
    'edit-reward': function (t) { openRewardForm(t.getAttribute('data-id')); },
    'delete-reward': function (t) {
      if (!confirmTap(t, 'Tap again to delete')) return;
      SYS.deleteReward(S(), t.getAttribute('data-id'));
      closeSheet();
      commit([]);
    },
    spend: function (t) { Sound.play('stat'); commit(SYS.spendPoint(S(), t.getAttribute('data-stat'))); },
    equip: function (t) {
      if (SYS.equipTitle(S(), t.getAttribute('data-id'))) {
        Sound.play('tap');
        commit([]);
        toast('Title equipped — ' + SYS.titleById(t.getAttribute('data-id')).name);
      }
    },
    fold: function (t) {
      var k = t.getAttribute('data-target');
      A.fold[k] = !A.fold[k];
      setFold(k);
    },
    settings: function () { openSettings(); },
    'sheet-close': function () { closeSheet(); },
    'toggle-sound': function () {
      S().sound = !S().sound;
      Sound.enabled = S().sound;
      save();
      openSettings();
      qs('[data-act="toggle-sound"]').focus();
      Sound.play('tap');
    },
    'save-file': function () { downloadSave(); },
    'load-file': function () { el.file.click(); },
    'link-file': function () {
      Store.linkFile(S(), function (err) {
        if (err) {
          if (err.name !== 'AbortError') toast('The file could not be linked.');
          return;
        }
        A.warnedFile = false;
        toast('Linked. The System will write to this file after every change.');
        if (A.sheetKind === 'settings') openSettings();
      });
    },
    reconnect: function () {
      Store.reconnect(function (err, res) {
        if (err) { toast('Permission was not granted.'); return; }
        if (res && res.ok && SYS.isNewer(res.savedAt, Store.lastSavedAt)) {
          adopt(res.state);
          Store.flush(A.state);
          toast('Reconnected — loaded the newer save from the file.');
        } else {
          Store.flush(S());
          toast('Reconnected. Auto-save resumed.');
        }
        if (A.sheetKind === 'settings') openSettings();
      });
    },
    unlink: function () {
      Store.unlink(function () { if (A.sheetKind === 'settings') openSettings(); });
      toast('File unlinked. Saving in this browser only.');
    },
    erase: function (t) { if (confirmTap(t, 'Tap again to erase everything')) erase(); },
    install: function () {
      var p = A.installEvt;
      if (!p) return;
      A.installEvt = null;
      try {
        p.prompt();
        p.userChoice.then(function () { setInstallFlag(); renderInstall(); }, function () { renderInstall(); });
      } catch (e) { renderInstall(); }
    },
    'install-dismiss': function () { setInstallFlag(); renderInstall(); }
  };

  function onClick(e) {
    var t = closest(e.target, 'data-act');
    if (!t || t.disabled) return;
    var fn = ACTIONS[t.getAttribute('data-act')];
    if (!fn) return;
    if (!A.state && ['load-file'].indexOf(t.getAttribute('data-act')) === -1) return;
    e.preventDefault();
    fn(t);
  }

  function onKey(e) {
    if (el.sheet.hidden) return;
    if (e.key === 'Escape' && !A.notifier.busy) { e.preventDefault(); closeSheet(); return; }
    if (e.key === 'Tab') {             // keep focus inside the sheet
      var f = qsa('input, select, button, a[href]', el.sheet).filter(function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
