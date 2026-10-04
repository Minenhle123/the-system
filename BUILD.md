# THE SYSTEM — Build Specification

**This file is the complete brief. Read it fully, then build the project from
scratch. No prior files are required.**

---

## 0. What you are building

A gamified self-improvement website. Visitors arrive, understand the idea in
seconds, and start using it in the same tab without installing anything or
creating an account. Progress is stored in the browser, with a save file for
backup and transfer.

Visual direction: the "system window" interface from Korean progression
fantasy — holographic cyan panels, clipped corners, monospace readouts on
near-black. Confident and sparse, never cluttered.

### The governing principle

**This is a website that happens to be installable, not an app that happens to
have a landing page.**

Everything follows from that:

- The app runs fully in a browser tab, on phone *and* desktop. Desktop is not
  a stretched phone layout — see §5.6.
- Nothing is gated behind installing. No "Add to Home Screen" interstitial, no
  install wall, no nagging banner on arrival.
- The install prompt appears **once**, subtly, and only after the visitor has
  completed their first quest — at which point it is a genuine offer rather
  than a demand from a stranger.
- The site has real pages with real content, not one page and a download link.

If a decision is ambiguous, choose the option that works better for someone
who will visit once in a browser and never install.

---

## 1. Hard constraints

| Constraint | Why |
|---|---|
| **Static files only** — no build step, no bundler, no npm | GitHub Pages serves the repo as-is |
| **Zero runtime dependencies** — no React, no Tailwind, no frameworks | Nothing to install, nothing to break, loads instantly |
| **All paths relative** (`./assets/…`, never `/assets/…`) | The site lives at `username.github.io/the-system/`, not at a domain root. Absolute paths will 404. |
| **No server, no database, no accounts, no analytics, no third-party requests** | Privacy is the product. The only external request permitted is Google Fonts. |
| **Vanilla ES5-compatible JS** (`var`, `function`, no optional chaining) | Maximum device compatibility, no transpiling |

Google Fonts is the single allowed external resource. Everything else is
self-hosted or inline.

---

## 2. File manifest

Build exactly this tree:

```
the-system/
├── index.html                  Landing page
├── app/
│   └── index.html              The application
├── how-it-works.html           Mechanics explained
├── privacy.html                Privacy statement
├── 404.html
├── manifest.webmanifest        PWA manifest
├── sw.js                       Service worker (root scope)
├── .nojekyll                   Empty file — REQUIRED, see §7
├── README.md
├── assets/
│   ├── css/
│   │   ├── tokens.css          Design system — shared by every page
│   │   ├── site.css            Landing / content page styles
│   │   └── app.css             Application styles
│   ├── js/
│   │   ├── system.js           Game logic: data model, formulas, storage
│   │   ├── app.js              Application UI and event handling
│   │   └── demo.js             Landing page live demo
│   └── img/
│       ├── icon-192.png
│       ├── icon-512.png
│       └── og.png              1200×630 social card
└── BUILD.md                    This file
```

Generate the three images. See §6.5 for specifications.

---

## 3. Design system — `assets/css/tokens.css`

Every page imports this first. Do not define colours anywhere else.

```css
:root{
  /* surface */
  --void:#04060d;
  --deep:#070c18;
  --panel:rgba(10,22,44,.72);
  --panel-solid:#0a1020;

  /* system cyan */
  --sys:#4fc3ff;
  --sys-dim:#1d5c86;
  --line:rgba(79,195,255,.28);
  --line-hot:rgba(79,195,255,.75);

  /* semantic */
  --mana:#8b6cff;
  --gold:#f5b942;
  --danger:#ff3556;
  --good:#3ddc97;
  --warn:#ff8f4d;

  /* text */
  --txt:#dbeeff;
  --muted:#6d8bab;
}
```

**Attribute colours** (used for stat bars, radar vertices, quest tags):

| Attribute | Hex |
|---|---|
| STR | `#ff4d6d` |
| VIT | `#3ddc97` |
| AGI | `#f5b942` |
| INT | `#4fc3ff` |
| PER | `#8b6cff` |
| WIL | `#ff8f4d` |

**Typography**

```
Display / UI:  Rajdhani — weights 400, 500, 600, 700
Data / labels: Share Tech Mono
```

Both from Google Fonts, `display=swap`. Rajdhani carries headings, quest
names, body text. Share Tech Mono carries every number, label, eyebrow and
chip — anything the System is reporting rather than saying. Keep that division
strict; it is what makes the interface read as a readout.

Eyebrow labels: Share Tech Mono, 10px, `letter-spacing:.28em`, uppercase,
cyan.

**The panel motif** — the signature element, used on every raised surface:

```css
.win{
  background:var(--panel);
  border:1px solid var(--line);
  clip-path:polygon(14px 0, 100% 0, 100% calc(100% - 14px),
                    calc(100% - 14px) 100%, 0 100%, 0 14px);
  backdrop-filter:blur(6px);
  box-shadow:0 0 0 1px rgba(4,10,22,.9) inset, 0 0 24px rgba(20,80,150,.18);
}
```

Two corners cut diagonally — top-left and bottom-right. Buttons use the same
shape at 7px, small chips at 6px. This single motif does the identity work;
do not add other decorative devices.

**Atmosphere**

- Page background: radial gradient `rgba(31,90,160,.30)` from top centre,
  `rgba(80,50,160,.18)` from bottom, over `--void`
- Fixed scanline overlay: `repeating-linear-gradient` 1px cyan at 7% opacity
  every 3px, `opacity:.30`, `pointer-events:none`
- Glowing text uses `text-shadow:0 0 Npx <colour>`, never a web-safe fallback

**Restraint:** the glow and the clipped corners are the whole personality.
Resist adding gradient buttons, floating particles, or additional accent
colours. Honour `prefers-reduced-motion: reduce` by disabling all animation
and transition.

---

## 4. Game mechanics — `assets/js/system.js`

Pure logic. No DOM access in this file. These values are tuned; implement them
exactly.

### 4.1 Progression formulas

```js
xpNeed(level)  = floor(70 * level^1.32)     // XP for the next character level
statNeed(val)  = floor(45 * 1.085^(val-10)) // XP for the next point of an attribute
```

Level 1→2 costs 70 XP; level 10→11 costs about 1,480. Attributes start at 10
and get progressively more expensive — the curve is the point, do not flatten
it.

### 4.2 Quest difficulty

| Difficulty | Character XP | Gold | Attribute XP |
|---|---|---|---|
| EASY | 15 | 5 | 10 |
| NORMAL | 35 | 12 | 22 |
| HARD | 70 | 28 | 45 |
| BRUTAL | 140 | 60 | 90 |

### 4.3 Gates (long-term goals, tracked as boss health)

| Rank | XP | Gold |
|---|---|---|
| E | 150 | 80 |
| D | 350 | 180 |
| C | 700 | 350 |
| B | 1,400 | 700 |
| A | 2,600 | 1,300 |
| S | 5,000 | 2,500 |

### 4.4 Hunter rank — derived from level, never stored

```
level >= 80  NATIONAL  #ff3556
level >= 60  S         #f5b942
level >= 45  A         #ff8f4d
level >= 30  B         #8b6cff
level >= 20  C         #4fc3ff
level >= 10  D         #3ddc97
otherwise    E         #7fa3c4
```

### 4.5 Daily cycle — the mechanic that matters

This is what separates the product from every forgiving habit tracker. Build
it carefully.

- Daily quests reset at **local midnight**
- Clearing every daily quest in a day: **+60 XP, +25 gold** bonus, streak +1
- Any daily quest unfinished at rollover: **−25 XP per missed quest**, and the
  **streak resets to zero**
- Holding a rest pass waives the penalty entirely and preserves the streak,
  consuming one pass
- Rest passes are bought with gold in the shop — the only way out, and it must
  be earned first

Detect rollover by comparing a stored `lastDate` (as `YYYY-MM-DD` in local
time) against today on load, on a 20-second interval, and on
`visibilitychange`. Rollover must fire correctly after the app has been closed
for several days — missing three days penalises for one rollover, not three.

### 4.6 Levelling

On gaining XP, loop while `xp >= xpNeed(level)`: subtract, increment level,
award **3 attribute points**. Multiple levels can be gained from one quest;
handle that in a loop, not a single comparison. Attribute XP levels the same
way against `statNeed`.

### 4.7 Titles

Ten, checked after every state change. Equipping is cosmetic.

| id | Name | Requirement |
|---|---|---|
| `awakened` | The Awakened | Granted at start |
| `first` | First Blood | 1 quest cleared |
| `week` | Relentless | 7-day best streak |
| `rising` | Rising Hunter | Level 10 |
| `gate` | Gate Breaker | 3 gates cleared |
| `grinder` | The Grinder | 100 quests cleared |
| `spec` | Specialist | Any attribute at 30 |
| `unbroken` | Unbroken | 30-day best streak |
| `shadow` | Shadow Aspirant | Level 25 |
| `monarch` | Monarch's Vessel | Level 50 |

Locked titles show as `??????` with the requirement visible — the requirement
is the motivation, so never hide it.

### 4.8 Data model

```js
{
  v: 1,
  hunter: {
    name, level, xp, gold, points,
    streak, bestStreak, questsDone,
    title, titles[], restPasses, bonusDate, joined
  },
  stats:  { str, vit, agi, int, per, wil },   // all start at 10
  statXp: { str, vit, agi, int, per, wil },   // all start at 0
  quests: [{ id, name, type, stat, difficulty, target, unit,
             progress, done, completions }],  // type: "daily" | "side"
  gates:  [{ id, name, rank, total, progress, unit, cleared }],
  shop:   [{ id, name, cost, effect, taken }], // effect: "none" | "restpass"
  log:    [{ id, t, kind, text }],             // newest first, capped at 250
  lastDate, sound
}
```

### 4.9 Storage

- **Live save:** `localStorage`, key `arise:hunter:v1`. Write debounced ~300ms.
- **Save file:** `the-system-save.json` — the state object wrapped with
  `savedAt` and a human-readable `summary` array, so opening the file in a text
  editor tells you where you stand:

```json
{
  "app": "THE SYSTEM",
  "savedAt": "2026-10-04T15:00:00.000Z",
  "summary": [
    "MINENHLE — Level 7 (D-RANK) — Relentless",
    "Streak 12 days (best 12) · 84 quests cleared · 320 gold",
    "STR 14 · VIT 16 · AGI 11 · INT 13 · PER 15 · WIL 12"
  ],
  "data": { }
}
```

- **Auto-write (Chromium only):** where `window.showSaveFilePicker` exists,
  offer to link a file once, persist the handle in IndexedDB, and write to it
  after every change. Call `queryPermission` on load and fall back silently if
  not granted.
- **Universal fallback:** Save to file (blob download) and Load file
  (`<input type="file">`) buttons in Settings. Safari and iOS have no File
  System Access API; those buttons are their entire path, so never hide them
  behind a feature check.
- **On load:** read both localStorage and the linked file, compare `savedAt`,
  keep the newer.
- Wrap every storage call in try/catch. Private browsing throws.
- Import must validate shape before accepting, and reject with a clear message
  rather than corrupting a good save.

---

## 5. The application — `app/index.html`

Five screens behind a persistent navigation. A sticky header on every screen
shows: level hexagon, hunter name, rank chip, equipped title, gold, streak,
and an XP bar with `current / needed`.

### 5.1 STATUS

- **Hexagonal radar chart**, inline SVG, six axes, one per attribute.
  Four concentric guide rings. Fill `rgba(79,195,255,.20)`, stroke cyan 1.6px
  with a drop-shadow glow, a coloured vertex dot per attribute. Axis scale is
  `max(30, ceil((highest + 4) / 10) * 10)` so the shape grows meaningfully
  instead of pinning to the edge.
- Four stat cells: STREAK, BEST, QUESTS, GATES
- Attribute list: name, one-line description of what trains it, progress bar
  to the next point, current value. When unspent points exist, a `+` button
  appears on each row and the header shows the count.
- Titles panel, collapsed by default

### 5.2 QUESTS

- **Daily panel:** `n/total` cleared, a live `HH:MM:SS` countdown to midnight,
  progress bar, and one line of status that changes with state — all cleared
  reads differently from three remaining.
- **Daily quests** — repeat, penalised on miss
- **Side quests** — one-off, no penalty
- Each quest row: name, attribute chip, difficulty chip, XP and gold chips,
  progress bar if `target > 1`, an increment button stepped to the target
  (`+1` under 20, `+5` under 100, `+10` above), and COMPLETE. Completed rows
  dim to 42% and offer UNDO.
- A sheet to register a new quest: name, type, attribute, difficulty, target,
  unit.

### 5.3 GATES

Long goals rendered as boss health — the bar **drains** as you progress, which
is the opposite of a normal progress bar and is the right metaphor. Red-to-
orange gradient. `STRIKE +1` to log a session, `−1` to correct a mistake.
Show the clear reward. Cleared gates move to a collapsed list.

### 5.4 SHOP

Gold balance, large and gold-coloured. Rewards the user defines themselves,
with their own prices. Buttons disable below the price and read
`NEED 120 MORE` rather than greying out silently. The rest pass is the one
functional item — surface what it does on the card.

### 5.5 LOG

Reverse-chronological system log, colour-coded by kind: quest cyan, penalty
red, title gold, gate purple, shop gold, system muted. Timestamped `DD/MM HH:MM`.

### 5.6 Responsive behaviour — do not skip this

**Phone (< 760px):** single column, max-width 640px, fixed bottom navigation
bar with five items. Respect `env(safe-area-inset-*)`.

**Desktop (≥ 760px):** the bottom bar becomes a **left sidebar** 220px wide,
with the icon and label side by side and the hunter summary pinned at the top.
Content gets a max-width of 820px with generous margin. On STATUS, place the
radar and the attribute list **side by side** rather than stacked — on a wide
screen a stacked column of 600px-wide cards in a 1400px window looks like a
phone screenshot, which undermines the entire "this is a website" premise.

Test at 390px, 768px, 1280px and 1920px. All four must look deliberate.

### 5.7 Notifications

Full-screen modal, centred, with the System's voice: a `⚠ NOTIFICATION`
eyebrow, a large glowing title, one or two lines of detail. Scale-and-unblur
entrance over 340ms. Auto-dismiss after ~4.2s, tap to dismiss early. Queue
them — a quest completion that triggers a level-up and a title unlock shows
three in sequence, never stacked.

Trigger on: level up, attribute increase, title unlock, all dailies cleared,
gate cleared, penalty, rest pass spent, reward claimed.

### 5.8 Sound

Short Web Audio tones, no files. Quest complete 700Hz triangle; level up
880Hz; gate cleared 990Hz; penalty 160Hz sawtooth; UI taps 440–520Hz square at
low gain. Default on, toggleable in Settings, wrapped in try/catch — audio
context creation fails in some contexts and must never break the app.

### 5.9 First run

A single System notification: `YOU HAVE BEEN CHOSEN`, a short paragraph
establishing that nothing here is awarded for free, one name field, ACCEPT.
Also offer `LOAD AN EXISTING SAVE FILE` for returning users on a new device.

Ship with sensible starter quests (push-ups, a run, water, a deep work block,
reading, quiet time) and two example gates, so the first screen is populated
rather than empty. Make clear in the UI that these are editable placeholders.

---

## 6. The website

### 6.1 `index.html` — landing

The page has one job: a stranger understands the idea in about eight seconds
and taps BEGIN.

```
┌────────────────────────────────────────────┐
│  hex mark                                  │
│  LEVEL UP IN REAL LIFE                     │
│  one line of what it is                    │
│  [ BEGIN ]   [ how it works ]              │
│                                            │
│  ▸ LIVE STATUS WINDOW — real, interactive  │  ← the hero
├────────────────────────────────────────────┤
│  QUESTS · ATTRIBUTES · GATES   three panels │
├────────────────────────────────────────────┤
│  THE PENALTY                               │
├────────────────────────────────────────────┤
│  NO ACCOUNT · NO SERVER · NO FEE           │
├────────────────────────────────────────────┤
│  [ BEGIN ]  ·  how it works  ·  privacy    │
└────────────────────────────────────────────┘
```

**The hero is a live demo, not a screenshot** (`assets/js/demo.js`). Render a
real status window with a sample hunter and let it play: a quest completes, XP
flows into the bar, an attribute ticks up, a level-up notification fires, the
radar expands. Loop it. Let the visitor tap the quest row themselves and watch
it respond.

This is the single most important element on the site. A static image says
"download this app to see it"; a live panel says "this already works, you are
using it". Build the demo on the real rendering code from `app.js` with a fake
save object — never a separate mock implementation that can drift.

**Copy** — use close to this:

> **LEVEL UP IN REAL LIFE**
> Daily quests with real consequences. Six attributes that only grow when you
> do. No subscription, no account, no server — your progress lives on your
> device and nowhere else.

> **THE PENALTY**
> Most habit apps forgive you. This one does not. Leave a daily quest
> unfinished at midnight and you lose XP and your streak resets to zero. There
> is exactly one way out, and you have to earn the gold for it first.

> **NO ACCOUNT. NO SERVER. NO FEE.**
> There is no sign-up because there is nothing to sign up to. The app never
> sends a request to a server. Your save file is yours — export it, back it
> up, carry it to a new phone.

BEGIN links straight to `./app/`. No modal, no email, no install step.

### 6.2 `how-it-works.html`

Real content, because a site with one page is a brochure. Cover: the six
attributes and what trains each; how XP and levelling work, with the actual
numbers; daily versus side quests; the penalty and rest passes; gates; the
gold economy; the rank ladder E→NATIONAL; where data is stored and how to move
it. Same visual language. Plain language — explain mechanics, do not sell.

### 6.3 `privacy.html`

Three or four honest paragraphs. No data collected, no cookies, no analytics,
no third-party requests except Google Fonts. Storage is local to the browser.
How to export and how to delete. Short and true beats long and templated —
this page is a competitive advantage, so make it readable.

### 6.4 `404.html`

In the System's voice: *"This gate does not exist."* and a link back.

### 6.5 Images

- **`icon-512.png` / `icon-192.png`** — the mark on `#04060d`: a cyan hexagon
  outline with a filled triangle inside, soft outer glow. Keep the mark inside
  the central 80% so Android's maskable crop does not clip it.
- **`og.png`** — 1200×630. Mark, wordmark `THE SYSTEM`, and the line
  *Level up in real life*. Without this, every WhatsApp and Slack share is a
  grey rectangle.

Meta tags on every page:

```html
<meta property="og:title" content="THE SYSTEM — Level up in real life">
<meta property="og:description" content="Daily quests with real consequences. No account, no server.">
<meta property="og:image" content="./assets/img/og.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#04060d">
```

### 6.6 The install offer

- **Do not** show an install banner on arrival.
- Capture `beforeinstallprompt` and hold it.
- After the visitor completes their **first quest**, show one quiet line in the
  app: *"The System can live on your home screen. [ Install ]"*
- Dismissed once, never shown again (`localStorage` flag).
- On iOS there is no prompt API — put the Add to Home Screen instructions on
  `how-it-works.html` and link to them. Do not interrupt.

---

## 7. Deployment — GitHub Pages

### Setup

1. Create a **public** repository named `the-system` (GitHub Pages requires a
   public repo on the free plan).
2. Push every file to `main`.
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**
4. Live within about a minute at `https://USERNAME.github.io/the-system/`

### Requirements specific to this host

- **`.nojekyll`** — an empty file at the root. Without it GitHub runs the repo
  through Jekyll, which silently ignores files and folders beginning with an
  underscore. Create it even though nothing currently starts with one; the
  failure mode when you later add such a file is baffling.
- **Every path relative.** The site is served from `/the-system/`, not `/`.
  `<link href="/assets/css/app.css">` resolves to `username.github.io/assets/…`
  and 404s. Use `./assets/…` and `../assets/…`. This is the single most common
  way a GitHub Pages deployment breaks.
- **Service worker at the root** (`/the-system/sw.js`) with scope `./`, so it
  covers the landing page and the app. Register only when
  `window.isSecureContext` is true — it never registers on `file://`, which is
  correct.
- **Manifest:** `"start_url": "./app/"`, `"scope": "./"`,
  `"display": "standalone"`. Launching from the home screen opens the app, not
  the landing page.

### Service worker strategy

Cache-first with background revalidation. The site opens instantly and works
offline; a new deploy appears on the **second** launch after the push. Cache
the shell (`index.html`, `app/index.html`, CSS, JS, icons, manifest) on
install, and Google Fonts at runtime.

Keep a `VERSION` constant at the top and **bump it on every deploy that
changes a cached file**. Stale service worker caches are the main way a static
site appears broken after a correct deploy.

### Limits worth knowing

100 GB bandwidth per month (soft), 1 GB site size, 10 builds per hour. This
site is roughly 200 KB. None of these will ever be reached.

---

## 8. Build order

Each step ends with something that works. Commit at each.

1. **Scaffold** — tree, `.nojekyll`, `tokens.css`, fonts, README
2. **`system.js`** — the data model and every formula in §4, with no DOM
   access. Verify the maths against the tables before building UI on top.
3. **`app.js` + `app.css`** — all five screens, phone layout first
4. **Desktop layout** — §5.6. Do not defer this; it is the "website" claim.
5. **Storage** — localStorage, save file, import/export, the File System
   Access path
6. **Daily cycle** — rollover, penalties, streaks, notifications
7. **Deploy** — push, enable Pages, confirm the live URL loads. Deploy before
   the landing page exists, to catch path problems while the surface is small.
8. **Landing page** — including the live demo
9. **Content pages** — how-it-works, privacy, 404
10. **Images and meta** — icons, OG card, manifest, service worker
11. **Polish** — install offer, Lighthouse, device testing

---

## 9. Acceptance criteria

Work through this on the live GitHub Pages URL, not localhost.

**Functional**
- [ ] A visitor can reach the landing page, tap BEGIN, name their hunter, and
      complete a quest without installing anything
- [ ] XP, gold and attribute XP award correctly; a level-up grants 3 points
- [ ] Multiple levels from one large reward are all granted
- [ ] Unspent points can be assigned, and the radar visibly changes
- [ ] Creating, completing, undoing and deleting quests all work
- [ ] Gate strikes drain the bar; clearing one pays out and fires a notification
- [ ] Gold purchases debit correctly; the rest pass increments the count
- [ ] Titles unlock at their thresholds and can be equipped

**Daily cycle**
- [ ] Setting the device clock forward one day with quests unfinished applies
      the penalty and resets the streak
- [ ] Clearing every daily grants the bonus and increments the streak
- [ ] A held rest pass waives the penalty and preserves the streak
- [ ] Rollover after several days closed fires once, not once per day

**Persistence**
- [ ] A hard reload preserves everything
- [ ] Save to file produces valid JSON with a readable summary
- [ ] Load file restores a save, and rejects an invalid file with a clear message
- [ ] On Chromium, a linked file auto-writes and is re-read on next launch

**Website**
- [ ] The landing demo animates and responds to taps
- [ ] Every internal link resolves under the `/the-system/` sub-path
- [ ] Sharing the URL produces a rich preview card
- [ ] 404 page renders for a bad path

**Responsive and offline**
- [ ] Deliberate at 390px, 768px, 1280px and 1920px
- [ ] Desktop uses the sidebar and side-by-side status layout
- [ ] Second load works in airplane mode
- [ ] Installed from the home screen it opens fullscreen with the right icon

**Quality**
- [ ] No console errors on any page
- [ ] Lighthouse ≥ 95 on all four categories
- [ ] Keyboard navigable with visible focus rings
- [ ] `prefers-reduced-motion` disables animation
- [ ] No network requests except Google Fonts — verify in the Network tab

---

## 10. Things that will go wrong

Listed because each one costs an hour to diagnose and a second to avoid.

**Absolute paths.** `/assets/app.css` 404s on a project site. Use `./`.

**Stale service worker.** You deploy a fix, hard-refresh, and still see the old
version. Bump `VERSION`. While developing, tick "Update on reload" in
DevTools → Application → Service Workers.

**Missing `.nojekyll`.** Jekyll silently drops underscore-prefixed paths.

**`localStorage` is per-origin.** It does not transfer between
`username.github.io` and any future custom domain. If the site ever moves,
every existing user must export before and import after. Say so on the privacy
page now.

**Date rollover across months and years.** Build `YYYY-MM-DD` from local
`getFullYear/getMonth/getDate`, never from a UTC ISO string — in UTC+02:00 an
ISO date is wrong for two hours each day, which is enough to steal a streak.

**Audio autoplay policy.** `AudioContext` cannot start before a user gesture.
Create it lazily on first interaction and swallow failures.

**Private browsing.** `localStorage` throws rather than returning null. Catch
it, warn once, and let the session run in memory.
