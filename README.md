# DOUGH_FORMULATOR

**"Calculate. Ferment. Ascend."**

A fast, phone-first sourdough calculator. Set flour, hydration, starter and salt; get exact amounts to weigh out, per-loaf weights and bake settings. Works offline and installs to your home screen.

## 🌐 Use it

**[yamir-1138.github.io/dough_formulator](https://yamir-1138.github.io/dough_formulator)**

On your phone: open the link → browser menu → **Add to Home Screen**. It then runs like an app, offline.

## ⚙️ Features

- Sliders, hold-to-repeat **+ / −** buttons, or **tap any number to type it**
- Type a **total dough weight** or **loaf weight** and the whole recipe scales to match
- **Keep loaf weight** mode: change the loaf count and the recipe scales with it
- Starter shown as grams, % of flour and % of dough; starter hydration adjustable
- Optional two-flour blend with a percentage split
- Two-stage bake temperature and time, °F / °C
- Live summary bar — ingredient amounts always add up to the total
- Save, update, export and import recipes; your working recipe is autosaved
- Dark / light theme, installable PWA, no server, no tracking

## 🧮 How the math works

`Flour` is what you weigh out. The starter contributes its own flour and water (at its own hydration). Hydration and salt % are taken on the *true* total flour (added flour + starter flour), so the hydration you set is the real hydration of the dough.

```
starter flour = starter ÷ (1 + starter hydration)
starter water = starter − starter flour
total flour   = flour + starter flour
water to add  = total flour × hydration − starter water
salt          = total flour × salt %
total dough   = flour + water + starter + salt
```

Example — 700 g flour, 75 % hydration, 150 g starter @ 100 %, 2.5 % salt → 506 g water, 19.4 g salt, 1375 g dough (2 × 688 g).

## 🛠 Development

Static files, no build step.

```bash
python3 -m http.server 8080   # then open http://localhost:8080
node --test                   # run the calculator & storage tests (Node 18+)
```

## 📄 License

MIT — because the rebellion runs on open-source
