# THE SYSTEM

Level up in real life. A gamified self-improvement website: daily quests with
real consequences, six attributes that only grow when you do, long-term goals
fought as boss gates. No account, no server, no fee. Progress lives in your
browser, with a save file you own.

**Live:** https://minenhle123.github.io/the-system/

## Run it

It is a static site with no build step and no dependencies. Serve the folder
with any static file server, for example:

```
python -m http.server 8080
```

Then open `http://localhost:8080/`. Opening `index.html` straight from disk
works too, but the service worker and file linking need `http(s)`.

## Deploy (GitHub Pages)

1. Create a **public** repository named `the-system`.
2. Push this folder to `main`.
3. Settings → Pages → Source: **Deploy from a branch** → `main` / `(root)` → Save.
4. Live at `https://USERNAME.github.io/the-system/` within about a minute.

Bump `VERSION` at the top of `sw.js` on every deploy that changes a cached
file, or returning visitors will keep the old version.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Landing page with the live demo |
| `app/index.html` | The application |
| `how-it-works.html` | Mechanics, numbers, install steps |
| `privacy.html` | Privacy statement |
| `assets/js/system.js` | Game logic, formulas and storage (no DOM) |
| `assets/js/app.js` | Application UI; also exports the renderers the demo uses |
| `assets/js/demo.js` | Landing-page demo, driven by the real logic and renderers |
| `assets/css/tokens.css` | Design system, the only place colours are defined |
| `sw.js` | Service worker: cache-first with background revalidation |

`BUILD.md` is the full specification.

## Rules this codebase keeps

- Plain HTML, CSS and ES5 JavaScript. No frameworks, no npm, no bundler.
- Every path is relative. The site is served from `/the-system/`, not `/`.
- The only external request is Google Fonts.
