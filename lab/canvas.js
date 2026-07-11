/**
 * canvas.js — Concept Ⅱ: Dough Canvas.
 * The formula as a jar of layered ingredients (bottom→top: water, starter,
 * salt seam, flour blend bands). Every boundary drag resizes the band
 * directly below it, so the pointer tracks honestly:
 *   top of water    → hydration          top of starter → starter grams
 *   flour∕flour     → blend pair         surface ring   → dough weight
 */
import * as model from '../js/model.js';
import { displayGrams, formatPct, round1 } from '../js/format.js';
import { loadFromHash, createStore, renderSwitcher, el } from './lab-common.js';
import { makeJarScale, caption, numberWord } from './lab-geometry.js';

const $ = id => document.getElementById(id);
renderSwitcher($('lab-nav'), 'canvas');

const JAR = { left: 60, right: 250, top: 60, bottom: 560 };
const ANNOT_X = 262;
const svg = $('jar');

const boot = loadFromHash();
const store = createStore({ state: boot.state, env: boot.env, onRender: render });

let prevCapacity = null;
let selected = 'water';        // which layer the detail panel shows
let dragging = false;

const FLOUR_COLORS = {
    bread: 'var(--flour-bread)', allPurpose: 'var(--flour-ap)',
    wholeWheat: 'var(--flour-ww)', rye: 'var(--flour-rye)',
    spelt: 'var(--flour-spelt)', semolina: 'var(--flour-semolina)',
};

/* ---------- layer model ---------- */

/**
 * Layers bottom→top with grams from derive(). Each: { id, label, grams,
 * color, kind } — kind drives detail panel + drag mapping.
 */
function buildLayers(recipe) {
    const layers = [
        { id: 'water', label: 'Water', grams: recipe.waterToAdd, color: 'var(--water)', kind: 'water' },
        { id: 'starter', label: 'Starter', grams: recipe.starterMass, color: 'var(--starter)', kind: 'starter' },
        { id: 'salt', label: 'Salt', grams: recipe.salt, color: 'var(--salt)', kind: 'salt' },
    ];
    recipe.flourBreakdown.forEach((f, i) => {
        layers.push({
            id: `flour-${i}`, label: model.FLOUR_TYPES[f.key]?.label || f.key,
            grams: f.added, color: FLOUR_COLORS[f.key] || 'var(--flour-bread)',
            kind: 'flour', flourIndex: i, flourKey: f.key,
        });
    });
    // Solid add-ins ride on top, non-draggable
    recipe.addIns.forEach((a, i) => {
        if (!a.liquid && a.grams > 0) {
            layers.push({ id: `addin-${i}`, label: a.name || 'Add-in', grams: a.grams, color: 'var(--good)', kind: 'addin' });
        }
    });
    return layers;
}

/* ---------- persistent SVG structure ---------- */

let structureSig = '';
let nodes = null; // { bands: Map, boundaries: Map, surface, annots, ghost }

function rebuildStructure(layers) {
    svg.innerHTML = '';
    nodes = { bands: new Map(), boundaries: new Map(), annots: new Map(), tabs: new Map() };

    // Jar outline (drawn behind the bands)
    const w = JAR.right - JAR.left;
    svg.appendChild(el('path', {
        class: 'jar-glass',
        d: `M ${JAR.left - 8} ${JAR.top - 22} h ${w + 16} v 10 l -8 10 V ${JAR.bottom + 6}
            q 0 8 -8 8 H ${JAR.left + 8} q -8 0 -8 -8 V ${JAR.top - 2} l -8 -10 z`,
    }));

    const bandGroup = el('g');
    const boundaryGroup = el('g');
    const annotGroup = el('g');
    svg.append(bandGroup, boundaryGroup, annotGroup);

    for (const layer of layers) {
        const rect = el('rect', {
            class: 'band', 'data-id': layer.id,
            x: JAR.left, width: JAR.right - JAR.left, rx: 2, fill: layer.color,
        });
        rect.addEventListener('click', () => { selected = layer.id; store.rerender(); });
        bandGroup.appendChild(rect);
        nodes.bands.set(layer.id, rect);

        const annot = el('g', { class: 'annot' },
            el('path', { class: 'leader' }),
            el('text', {}, el('tspan', { class: 'annot-main' }), el('tspan', { class: 'annot-sub', dy: 13 })));
        annotGroup.appendChild(annot);
        nodes.annots.set(layer.id, annot);

        // A draggable boundary at the TOP of every resizable band, with a
        // visible pull-tab on the jar's left edge (fat touch target)
        if (['water', 'starter', 'flour'].includes(layer.kind)) {
            const isTopFlour = layer.kind === 'flour' && layer.flourIndex === layers.filter(l => l.kind === 'flour').length - 1;
            if (!isTopFlour) {
                const tab = el('g', { class: 'handle-tab', 'data-tab': layer.id },
                    el('rect', { class: 'tab-body', x: JAR.left - 42, y: -16, width: 34, height: 32, rx: 7 }),
                    el('line', { class: 'tab-grip', x1: JAR.left - 34, x2: JAR.left - 16, y1: -5, y2: -5 }),
                    el('line', { class: 'tab-grip', x1: JAR.left - 34, x2: JAR.left - 16, y1: 0, y2: 0 }),
                    el('line', { class: 'tab-grip', x1: JAR.left - 34, x2: JAR.left - 16, y1: 5, y2: 5 }),
                    // invisible halo for a ≥44px touch target
                    el('rect', { x: JAR.left - 50, y: -24, width: 50, height: 48, fill: 'transparent' }));
                const g = el('g', { 'data-boundary': layer.id },
                    el('line', { class: 'boundary-line', x1: JAR.left, x2: JAR.right }),
                    el('rect', { class: 'grab', x: JAR.left, width: JAR.right - JAR.left, height: 36 }));
                attachDrag(g.querySelector('.grab'), layer.id);
                attachDrag(tab, layer.id);
                boundaryGroup.appendChild(g);
                boundaryGroup.appendChild(tab);
                nodes.boundaries.set(layer.id, g);
                nodes.tabs.set(layer.id, tab);
            }
        }
    }

    // Ruler (drawn only while dragging)
    nodes.ruler = el('g', { class: 'ruler' });
    svg.appendChild(nodes.ruler);

    // Surface handle (total dough weight) — ring with grip on the right.
    // All children use y=0; render() positions the group via transform.
    nodes.surface = el('g', { class: 'surface-handle handle-tab' },
        el('line', { x1: JAR.left - 6, x2: JAR.right + 6, y1: 0, y2: 0 }),
        el('circle', { cx: JAR.right + 18, cy: 0, r: 13 }),
        el('line', { class: 'tab-grip', x1: JAR.right + 12, x2: JAR.right + 24, y1: -4, y2: -4 }),
        el('line', { class: 'tab-grip', x1: JAR.right + 12, x2: JAR.right + 24, y1: 4, y2: 4 }),
        el('rect', { x: JAR.right - 2, y: -24, width: 60, height: 48, fill: 'transparent' }));
    attachDrag(nodes.surface, '__surface__');
    svg.appendChild(nodes.surface);
}

/* ---------- drag handling ---------- */

function svgY(clientY) {
    const r = svg.getBoundingClientRect();
    return (clientY - r.top) * (600 / r.height);
}

let activeRuler = null; // ticks built once per drag: [{ y, label, value }]

function attachDrag(target, boundaryId) {
    let raf = null;
    let startY = 0;
    let moved = false;
    target.addEventListener('pointerdown', e => {
        e.preventDefault();
        target.setPointerCapture(e.pointerId);
        dragging = true;
        startY = e.clientY;
        moved = false;
    });
    target.addEventListener('pointermove', e => {
        if (!dragging || !target.hasPointerCapture(e.pointerId)) return;
        if (Math.abs(e.clientY - startY) > 4) moved = true;
        if (!moved || raf) return;
        raf = requestAnimationFrame(() => {
            raf = null;
            if (!activeRuler) startRuler(boundaryId, target);
            handleDrag(boundaryId, svgY(e.clientY));
        });
    });
    const end = e => {
        if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId);
        dragging = false;
        activeRuler = null;
        nodes.ruler.innerHTML = '';
        target.classList?.remove('active');
        hud('');
        // A grab zone can cover a thin band entirely — treat a tap
        // (no movement) as selecting the band under the pointer.
        if (!moved && e.type === 'pointerup') selectBandAt(svgY(e.clientY));
        store.rerender();
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
}

/* ---------- drag HUD + guide ruler ---------- */

const hudEl = $('hud');

function hud(text) {
    hudEl.textContent = text;
    hudEl.classList.toggle('on', !!text);
}

/** Build guide ticks for this drag: meaningful values, fixed for the drag. */
function startRuler(boundaryId, target) {
    target.classList?.add('active');
    const { state } = store.get();
    const recipe = model.derive(state);
    const layers = buildLayers(recipe);
    const scale = makeJarScale(recipe.doughWeight, { jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity, freeze: true });
    const ticks = [];

    if (boundaryId === '__surface__') {
        const step = scale.capacity > 3000 ? 500 : 250;
        for (let g = step; g <= scale.capacity; g += step) {
            ticks.push({ y: scale.yOf(g), label: `${g} g`, value: g });
        }
    } else {
        const idx = layers.findIndex(l => l.id === boundaryId);
        const below = layers.slice(0, idx).reduce((sum, l) => sum + l.grams, 0);
        const layer = layers[idx];
        if (layer.kind === 'water') {
            for (let h = 55; h <= 100; h += 5) {
                const grams = recipe.flourTotal * h / 100 - recipe.starterWater - recipe.liquidAddInWater;
                if (grams >= 0) ticks.push({ y: scale.yOf(below + grams), label: `${h}%`, value: h });
            }
        } else if (layer.kind === 'starter') {
            for (let p = 5; p <= 45; p += 5) {
                ticks.push({ y: scale.yOf(below + recipe.flourTotal * p / 100), label: `${p}%`, value: p });
            }
        } else if (layer.kind === 'flour') {
            for (let p = 10; p <= 90; p += 10) {
                ticks.push({ y: scale.yOf(below + recipe.flourTotal * p / 100), label: `${p}%`, value: p });
            }
        }
    }

    activeRuler = ticks.filter(t => t.y >= JAR.top && t.y <= JAR.bottom);
    nodes.ruler.innerHTML = '';
    for (const tick of activeRuler) {
        tick.line = el('line', { x1: JAR.left, x2: JAR.right, y1: tick.y, y2: tick.y });
        tick.text = el('text', { x: JAR.left + 6, y: tick.y - 4 }, tick.label);
        nodes.ruler.append(tick.line, tick.text);
    }
}

/** Highlight the tick nearest the current drag position. */
function updateRulerHot(y) {
    if (!activeRuler) return;
    let best = null;
    for (const tick of activeRuler) {
        if (!best || Math.abs(tick.y - y) < Math.abs(best.y - y)) best = tick;
    }
    for (const tick of activeRuler) {
        const hot = tick === best && Math.abs(tick.y - y) < 14;
        tick.line.classList.toggle('hot', hot);
        tick.text.classList.toggle('hot', hot);
    }
}

function selectBandAt(y) {
    const { state } = store.get();
    const recipe = model.derive(state);
    const layers = buildLayers(recipe);
    const scale = makeJarScale(recipe.doughWeight, { jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity, freeze: true });

    // Band pixel ranges, bottom→top
    let cum = 0;
    const ranges = layers.map(layer => {
        const y0 = scale.yOf(cum);
        cum += layer.grams;
        const y1 = scale.yOf(cum);
        return { layer, top: y1, bottom: y0, height: y0 - y1 };
    });

    // A thin band (salt seam, a 5% flour) is nearly impossible to hit
    // exactly — if the tap lands within 9px of one, it wins.
    let best = null;
    for (const range of ranges) {
        if (range.height < 20) {
            const mid = (range.top + range.bottom) / 2;
            const dist = Math.abs(y - mid);
            if (dist < 9 && (!best || dist < best.dist)) best = { layer: range.layer, dist };
        }
    }
    if (best) { selected = best.layer.id; return; }

    for (const range of ranges) {
        if (y >= range.top && y <= range.bottom) { selected = range.layer.id; return; }
    }
}

function handleDrag(boundaryId, y) {
    const { state } = store.get();
    const recipe = model.derive(state);
    const layers = buildLayers(recipe);
    const scale = makeJarScale(recipe.doughWeight, { jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity, freeze: true });
    prevCapacity = scale.capacity;

    const gramsAtY = Math.max(0, scale.gramsAt(Math.min(JAR.bottom, Math.max(JAR.top, y))));
    updateRulerHot(y);

    if (boundaryId === '__surface__') {
        const snapped = Math.round(gramsAtY / 25) * 25;   // snap dough weight to 25 g
        store.apply(s => model.scaleToDoughWeight(s, snapped));
        const r2 = model.derive(store.get().state);
        hud(`${displayGrams(r2.doughWeight)} g of dough · ${displayGrams(r2.weightPerLoaf)} g per loaf`);
        return;
    }

    // Cumulative grams below this band
    const idx = layers.findIndex(l => l.id === boundaryId);
    const below = layers.slice(0, idx).reduce((sum, l) => sum + l.grams, 0);
    const newGrams = Math.max(0, gramsAtY - below);
    const layer = layers[idx];

    if (layer.kind === 'water') {
        const hyd = ((newGrams + recipe.starterWater + recipe.liquidAddInWater) / recipe.flourTotal) * 100;
        store.apply(s => model.setHydration(s, Math.round(hyd * 2) / 2));   // snap 0.5%
        const r2 = model.derive(store.get().state);
        hud(`${formatPct(r2.hydration)}% hydration · ${displayGrams(r2.waterToAdd)} g water`);
    } else if (layer.kind === 'starter') {
        const snapped = Math.round(newGrams / 5) * 5;   // snap 5 g
        store.apply(s => model.setStarterGrams(s, snapped));
        const r2 = model.derive(store.get().state);
        hud(`${displayGrams(r2.starterMass)} g starter · ${formatPct(r2.starterPct)}% of flour`);
    } else if (layer.kind === 'flour') {
        // Redistribute between this band and the one above (pair drag)
        const i = layer.flourIndex;
        const flours = state.flours.map(f => ({ ...f }));
        if (i + 1 >= flours.length) return;
        const pairPct = flours[i].pct + flours[i + 1].pct;
        const newPct = Math.min(pairPct - 2, Math.max(2, Math.round((newGrams / recipe.flourTotal) * 100)));
        flours[i].pct = newPct;
        flours[i + 1].pct = pairPct - newPct;
        store.apply(s => model.setFlourBlend(s, flours));
        hud(`${formatPct(newPct)}% ${layer.label.toLowerCase()} · ${formatPct(pairPct - newPct)}% ${layers[idx + 1].label.toLowerCase()}`);
    }
}

/* ---------- render ---------- */

function render(state) {
    const recipe = model.derive(state);
    const layers = buildLayers(recipe);

    const sig = layers.map(l => l.id).join('|');
    if (sig !== structureSig) {
        structureSig = sig;
        rebuildStructure(layers);
    }

    const scale = makeJarScale(recipe.doughWeight, { jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity, freeze: dragging });
    prevCapacity = scale.capacity;

    // Bands + boundaries
    let cum = 0;
    const annotSlots = [];
    for (const layer of layers) {
        const y0 = scale.yOf(cum);
        cum += layer.grams;
        let y1 = scale.yOf(cum);
        // Salt seam stays visible
        if (layer.kind === 'salt' && y0 - y1 < 4) y1 = y0 - 4;
        const rect = nodes.bands.get(layer.id);
        rect.setAttribute('y', y1);
        rect.setAttribute('height', Math.max(0, y0 - y1));
        rect.classList.toggle('selected', selected === layer.id);

        const boundary = nodes.boundaries.get(layer.id);
        if (boundary) {
            const line = boundary.querySelector('.boundary-line');
            line.setAttribute('y1', y1);
            line.setAttribute('y2', y1);
            boundary.querySelector('.grab').setAttribute('y', y1 - 18);
            nodes.tabs.get(layer.id)?.setAttribute('transform', `translate(0, ${y1})`);
        }

        annotSlots.push({ layer, mid: (y0 + y1) / 2 });
    }

    // Surface handle at the top of the stack
    const surfaceY = scale.yOf(cum);
    nodes.surface.setAttribute('transform', `translate(0, ${surfaceY})`);

    // Annotations with top-down collision pass (≥26px separation)
    annotSlots.sort((a, b) => a.mid - b.mid);
    let lastY = -Infinity;
    for (const slot of annotSlots) {
        const yText = Math.max(slot.mid, lastY + 32);
        lastY = yText;
        const g = nodes.annots.get(slot.layer.id);
        const text = g.querySelector('text');
        text.setAttribute('x', ANNOT_X + 12);
        text.setAttribute('y', yText + 4);
        const main = g.querySelector('.annot-main');
        const sub = g.querySelector('.annot-sub');
        main.textContent = `${displayGrams(slot.layer.grams)} g`;
        sub.setAttribute('x', ANNOT_X + 12);
        sub.textContent = pctLine(slot.layer, recipe);
        g.querySelector('.leader').setAttribute('d',
            `M ${JAR.right + (slot.layer.kind ? 4 : 0)} ${slot.mid} H ${ANNOT_X} ${yText !== slot.mid ? `L ${ANNOT_X + 8} ${yText}` : ''}`);
    }

    renderDetail(recipe, state);
}

function pctLine(layer, recipe) {
    switch (layer.kind) {
        case 'water': return `${layer.label} · ${formatPct(recipe.hydration)}% hydration`;
        case 'starter': return `${layer.label} · ${formatPct(recipe.starterPct)}% of flour`;
        case 'salt': return `${layer.label} · ${formatPct(recipe.saltPct)}%`;
        case 'flour': return `${layer.label} · ${formatPct(recipe.flourBreakdown[layer.flourIndex].pct)}%`;
        default: return layer.label;
    }
}

/* ---------- detail panel ---------- */

const DETAIL = {
    water: {
        title: 'Water',
        grams: r => `${displayGrams(r.waterToAdd)} g to add · ${displayGrams(r.totalWater)} g true total`,
        caption: r => `Hydration is the biggest single lever on crumb. Right now: ${caption('hydration', r.hydration)}.`,
        control: (r, s) => ({ label: 'Hydration', value: s.hydration, min: 40, max: 120, step: 0.5, unit: '%', apply: v => model.setHydration(s, v) }),
    },
    starter: {
        title: 'Starter',
        grams: r => `${displayGrams(r.starterMass)} g · carries ${displayGrams(r.starterFlour)} g flour + ${displayGrams(r.starterWater)} g water`,
        caption: r => `Inoculation sets the tempo. Right now: ${caption('starter', r.starterPct)}.`,
        control: (r, s) => ({ label: 'Starter, % of flour', value: s.starter.pct, min: 5, max: 40, step: 1, unit: '%', apply: v => model.setStarterPercent(s, v) }),
    },
    salt: {
        title: 'Salt',
        grams: r => `${displayGrams(r.salt)} g`,
        caption: r => `${caption('salt', r.saltPct)[0].toUpperCase()}${caption('salt', r.saltPct).slice(1)}. Measured against total flour, starter included.`,
        control: (r, s) => ({ label: 'Salt, % of flour', value: s.saltPct, min: 0, max: 3.5, step: 0.1, unit: '%', apply: v => model.setSalt(s, v) }),
    },
};

function detailDef(recipe) {
    const flourMatch = /^flour-(\d+)$/.exec(selected);
    if (flourMatch) {
        const i = Number(flourMatch[1]);
        if (recipe.flourBreakdown[i]) {
            // Look flour data up per-call so in-place updates never go stale
            const f = r => r.flourBreakdown[i];
            return {
                title: r => model.FLOUR_TYPES[f(r).key]?.label || f(r).key,
                grams: r => `${displayGrams(f(r).added)} g to add (${displayGrams(f(r).total)} g of the total flour)`,
                caption: r => (model.FLOUR_TYPES[f(r).key]?.wholeGrain
                    ? 'A whole grain — it drinks more water and ferments faster. Adjust below, or drag this band’s lower handle.'
                    : 'A white flour — structure, lift, and an open crumb. Adjust below, or drag this band’s lower handle.'),
                control: (r, s) => ({
                    label: 'share', value: f(r).pct, min: 2, max: 100, step: 1, unit: '%',
                    apply: v => {
                        const flours = s.flours.map((fl, fi) => ({ key: fl.key, pct: fi === i ? v : fl.pct }));
                        return model.setFlourBlend(s, flours);
                    },
                }),
            };
        }
    }
    const d = DETAIL[selected] || DETAIL.water;
    return { ...d, title: () => d.title };
}

// The panel is built once per selection and then updated IN PLACE — the
// slider must never be rebuilt mid-drag (that's what made phones stutter).
let detailKey = '';
let detailRefs = null;

function renderDetail(recipe, state) {
    const key = `${selected}|${state.flours.length}`;
    const def = detailDef(recipe);

    if (key !== detailKey || !detailRefs) {
        detailKey = key;
        buildDetail(def, recipe, state);
    }
    updateDetail(def, recipe, state);
}

function buildDetail(def, recipe, state) {
    const panel = $('detail');
    panel.innerHTML = '';
    const r = (detailRefs = { sliderBusy: false });

    r.title = el('h3', {}, '');
    r.grams = el('div', { class: 'grams-line' }, '');
    r.caption = el('span', { class: 'caption' }, '');
    panel.append(r.title, r.grams, r.caption);

    const c = def.control(recipe, state);
    r.readout = el('span', { class: 'numeral' }, '');
    r.slider = el('input', { type: 'range', min: c.min, max: c.max, step: c.step, value: c.value });
    const setVal = v => {
        const clamped = Math.min(c.max, Math.max(c.min, v));
        r.slider.value = String(clamped);
        r.readout.textContent = `${round1(clamped)}${c.unit}`;
        store.apply(s => detailDef(model.derive(s)).control(model.derive(s), s).apply(clamped));
    };
    r.slider.addEventListener('input', () => setVal(Number(r.slider.value)));
    // While a finger is on the slider, render must not write to it
    r.slider.addEventListener('pointerdown', () => { r.sliderBusy = true; });
    for (const evt of ['pointerup', 'pointercancel', 'change', 'blur']) {
        r.slider.addEventListener(evt, () => { r.sliderBusy = false; store.rerender(); });
    }
    const minusBtn = el('button', { class: 'popover-step', type: 'button' }, '−');
    const plusBtn = el('button', { class: 'popover-step', type: 'button' }, '+');
    minusBtn.addEventListener('click', () => setVal(Number(r.slider.value) - c.step));
    plusBtn.addEventListener('click', () => setVal(Number(r.slider.value) + c.step));
    panel.appendChild(el('div', { class: 'popover-row' }, minusBtn, r.slider, plusBtn, r.readout));

    // Batch controls (always present)
    const minus = el('button', { class: 'popover-step', type: 'button' }, '−');
    const plus = el('button', { class: 'popover-step', type: 'button' }, '+');
    minus.addEventListener('click', () => store.apply(s => model.setNumLoaves(s, s.numLoaves - 1)));
    plus.addEventListener('click', () => store.apply(s => model.setNumLoaves(s, s.numLoaves + 1)));
    r.batchWeight = el('span', { class: 'numeral' }, '');
    r.loaves = el('span', {}, '');
    r.perLoaf = el('span', { class: 'caption' }, '');
    panel.appendChild(el('div', { class: 'batch' },
        r.batchWeight, el('span', { class: 'caption' }, 'of dough ·'),
        minus, r.loaves, plus, r.perLoaf));

    r.footnote = el('p', { class: 'footnote' }, '');
    panel.appendChild(r.footnote);
}

function updateDetail(def, recipe, state) {
    const r = detailRefs;
    r.title.textContent = def.title(recipe);
    r.grams.textContent = def.grams(recipe);
    r.caption.textContent = def.caption(recipe);

    const c = def.control(recipe, state);
    if (!r.sliderBusy && document.activeElement !== r.slider) {
        r.slider.value = String(c.value);
    }
    r.readout.textContent = `${round1(Number(r.slider.value))}${c.unit}`;

    r.batchWeight.textContent = `${displayGrams(recipe.doughWeight)} g`;
    r.loaves.textContent = `${numberWord(state.numLoaves)} ${state.numLoaves === 1 ? 'loaf' : 'loaves'}`;
    r.perLoaf.textContent = `${displayGrams(recipe.weightPerLoaf)} g each`;
    r.footnote.textContent = `${formatPct(recipe.wholeGrainPct)}% whole grain · ${formatPct(recipe.prefermentedFlourPct)}% prefermented flour · salt ${formatPct(recipe.saltPct)}%`;
}

/* ---------- boot ---------- */

addEventListener('hashchange', () => {
    const fresh = loadFromHash();
    store.apply(() => fresh.state);
    store.setEnv(fresh.env);
});

store.rerender();
