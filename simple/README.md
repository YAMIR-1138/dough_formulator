# DOUGH_FORMULATOR · SIMPLE

The phone-first calculator. Lives at
[`/simple/`](https://yamir-1138.github.io/dough_formulator/simple/); the
full app (timeline, presets, share links, THE LAB) is at the site root.

On your phone: open the link → browser menu → **Add to Home Screen**. It
then runs like an app, offline.

## Features

- Sliders, hold-to-repeat **+ / −** buttons, or **tap any number to type it**
- Type a **total dough weight** or **loaf weight** and the whole recipe scales to match
- **Keep loaf weight** mode: change the loaf count and the recipe scales with it
- Starter shown as grams, % of flour and % of dough; starter hydration adjustable
- Optional two-flour blend with a percentage split
- Two-stage bake temperature and time, °F / °C
- Live summary bar — ingredient amounts always add up to the total
- Save, update, export and import recipes; your working recipe is autosaved
- Dark / light theme (shared with the full app), installable PWA, no server, no tracking

## How the math works

`Flour` is what you weigh out. The starter contributes its own flour and
water (at its own hydration). Hydration and salt % are taken on the *true*
total flour (added flour + starter flour), so the hydration you set is the
real hydration of the dough — the same convention as the full app.

```
starter flour = starter ÷ (1 + starter hydration)
starter water = starter − starter flour
total flour   = flour + starter flour
water to add  = total flour × hydration − starter water
salt          = total flour × salt %
total dough   = flour + water + starter + salt
```

Example — 700 g flour, 75 % hydration, 150 g starter @ 100 %, 2.5 % salt →
506 g water, 19.4 g salt, 1375 g dough (2 × 688 g).

## Storage

Recipes are saved in `localStorage` under `dough_formulator_simple_recipes`
(separate from the full app's store, which uses a different format). The
theme preference is shared with the full app.

## Development

```bash
python3 -m http.server 8080     # then open http://localhost:8080/simple/
node --test 'simple/test/*.test.js'   # unit tests (Node 18+)
```
