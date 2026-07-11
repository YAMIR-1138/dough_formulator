# DOUGH_FORMULATOR

**"Calculate. Ferment. Ascend."**

`DOUGH_FORMULATOR` is a retro-inspired sourdough calculator built for
hydration nerds, ratio tinkerers, and spreadsheet-weary bakers. It's built
around one idea: *correct, transparent baker's math with zero surprises*.
Edit any number — the rest of the formula adapts predictably. No lock
puzzles, no drift, no "wait, why did my hydration change?"

**Live:** [Open DOUGH_FORMULATOR](https://yamir-1138.github.io/dough_formulator)

---

## ⚙️ The formula engine

- **True baker's percentages** — total flour (including the starter's flour)
  is the anchor; everything else is a percentage of it. Grams are always
  derived, never stored, so the math can't go stale.
- **Bidirectional editing** — every field is one closed-form transformation:
  - Edit **dough weight** → whole recipe rescales (percentages preserved).
    Pin the flour instead, and dough-weight edits back-solve hydration.
  - Edit **loaves** → splits the current total. Edit **per-loaf weight** →
    rescales the total. Baked-loaf weight estimated via adjustable bake loss.
  - Edit **starter** in % or grams, its hydration (stiff levain to 200%
    liquid), or the **prefermented flour %** directly — each keeps the
    others consistent.
- **The hydration lock** — hydration counts starter water *and* liquid
  add-ins. Change the starter, its hydration, or add maple syrup, and the
  added water rebalances automatically so true hydration holds.
- **Flour blends** with % and grams side by side, auto-normalized to 100%,
  live whole-grain readout.
- **Add-ins** (seeds, oil, syrup, espresso…) as % of flour or grams; liquid
  add-ins route into the water math.
- **Water split for bassinage** — hold back a slice of the mixing water and
  the scale sheet shows both amounts.
- **Numbers that add up** — displayed ingredient lines always sum exactly to
  the displayed dough weight (rounding residue is reconciled, not ignored).

**Convention:** salt % is of *total* flour, including the flour inside your
starter — standard baker's math, consistent with how hydration is computed.

## ⏱️ The timeline

- **Q10 fermentation model** — bulk time scales exponentially with
  temperature (Q10 = 2.5, calibrated at 4 h / 22 °C / 20% starter), adjusted
  for inoculation percentage and whole-grain content.
- **Forward or reverse scheduling** — "I start at 9am" or "I want bread at
  6pm Sunday"; the whole plan lays itself out either way.
- **Bake-day checklist mode** — tick off steps, see the current one
  highlighted.
- **Water-temperature calculator** for a target desired dough temperature.

## 📋 Formulas

- Six built-in presets (Tartine country, 50% whole wheat, pizza, focaccia,
  baguette, 40% rye).
- Save named formulas with notes (LocalStorage — nothing leaves your
  browser), JSON export/import.
- **Share links** — the whole formula lives in the URL hash. Copy, send,
  done. No accounts, no backend.
- Printable bake sheet (Print → ingredients + schedule, no chrome).
- Responsive, dark/light mode, offline-first — no server, no build step.

## 🔬 THE LAB — four reimagined interfaces

[`/lab/`](https://yamir-1138.github.io/dough_formulator/lab/) hosts four
experimental UIs on the same math engine, in a warm editorial
(typeset-cookbook) style. Your formula travels between all five apps
through the share-hash — set 82% hydration anywhere and follow any link;
it comes with you.

- **Ⅰ The Living Recipe** — the formula as editable prose. Tap any
  underlined value; the whole document (ingredients, day-by-day schedule)
  rewrites itself live. Printing it gives you a recipe card.
- **Ⅱ Dough Canvas** — the dough as a glass jar of layered ingredients.
  Drag a layer boundary to change a ratio, pull the surface ring to scale
  the batch, tap a layer to read about it.
- **Ⅲ Mission Control** — the bake as a ribbon of time with a broken axis
  (the cold retard is compressed with torn edges), day/night shading, and
  a NOW cursor. Drag the paper to move your start, drag the bake block to
  plan backward, stretch the cold rest, warm the kitchen and watch bulk
  shrink (Q10).
- **Ⅳ Pocket Dial** — mobile-first: one decision per screen on a big
  rotary dial with editorial "wisdom" captions, ending on a bake card
  with your next step and an optional screen wake-lock.

## 🧪 Tests

The math engine, fermentation model, and share codec are pure ES modules
with a framework-free test suite:

```
node tests/run.js      # or open tests.html in a browser
```

## 🏗️ Architecture

```
js/model.js     the engine: canonical state + pure closed-form edit functions
js/ferment.js   Q10 model, step builder, forward/reverse scheduler
js/format.js    display rounding + sum reconciliation
js/presets.js   built-in formulas
js/share.js     URL-hash encode/decode
js/storage.js   LocalStorage persistence (+ migration from older versions)
js/ui.js        rendering
js/app.js       state ownership + event wiring
```

The pure modules have no DOM dependencies — they run in Node and the
browser unchanged.

---

## 📄 License

MIT — because the rebellion runs on open-source

*This is an ongoing project made for fun, so parts of it may be unfinished,
buggy, or fully operational by accident.*
