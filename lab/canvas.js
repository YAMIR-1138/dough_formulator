/**
 * canvas.js - Concept II: Dough Canvas, v2.
 *
 * The jar is the picture; the chip cards are the interface. Every
 * ingredient has a permanent, same-sized card (color swatch, name, grams,
 * percent) that expands into its editor when selected. The jar keeps the
 * gestures it is good at: dragging the big boundaries and the surface.
 * Small quantities (salt, thin flour shares) are never drag targets, so
 * they are never useless.
 */
import * as model from '../js/model.js';
import { displayGrams, formatPct, round1 } from '../js/format.js';
import { loadFromHash, createStore, renderSwitcher, el } from './lab-common.js';
import { makeJarScale, caption, numberWord } from './lab-geometry.js';
import { PRESETS, getPreset } from '../js/presets.js';

const $ = id => document.getElementById(id);
renderSwitcher($('lab-nav'), 'canvas');

const JAR = { left: 70, right: 250, top: 50, bottom: 550 };
const svg = $('jar');

const boot = loadFromHash();
const store = createStore({ state: boot.state, env: boot.env, onRender: render });

let prevCapacity = null;
let selected = 'water';
let dragging = false;

const FLOUR_COLORS = {
    bread: 'var(--flour-bread)', allPurpose: 'var(--flour-ap)',
    wholeWheat: 'var(--flour-ww)', rye: 'var(--flour-rye)',
    spelt: 'var(--flour-spelt)', semolina: 'var(--flour-semolina)',
};

/* ---------- layer model ---------- */

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
    recipe.addIns.forEach((a, i) => {
        if (!a.liquid && a.grams > 0) {
            layers.push({ id: `addin-${i}`, label: a.name || 'Add-in', grams: a.grams, color: 'var(--good)', kind: 'addin' });
        }
    });
    return layers;
}

/* ---------- jar SVG (persistent structure) ---------- */

let structureSig = '';
let nodes = null;

function rebuildStructure(layers) {
    svg.innerHTML = '';
    nodes = { bands: new Map(), boundaries: new Map(), tabs: new Map() };

    const w = JAR.right - JAR.left;
    svg.appendChild(el('path', {
        class: 'jar-glass',
        d: `M ${JAR.left - 8} ${JAR.top - 22} h ${w + 16} v 10 l -8 10 V ${JAR.bottom + 6}
            q 0 8 -8 8 H ${JAR.left + 8} q -8 0 -8 -8 V ${JAR.top - 2} l -8 -10 z`,
    }));

    const bandGroup = el('g');
    const boundaryGroup = el('g');
    svg.append(bandGroup, boundaryGroup);

    for (const layer of layers) {
        const rect = el('rect', {
            class: 'band', 'data-id': layer.id,
            x: JAR.left, width: w, rx: 2, fill: layer.color,
        });
        rect.addEventListener('click', () => selectLayer(layer.id));
        bandGroup.appendChild(rect);
        nodes.bands.set(layer.id, rect);

        if (['water', 'starter', 'flour'].includes(layer.kind)) {
            const isTopFlour = layer.kind === 'flour' && layer.flourIndex === layers.filter(l => l.kind === 'flour').length - 1;
            if (!isTopFlour) {
                const tab = el('g', { class: 'handle-tab', 'data-tab': layer.id },
                    el('rect', { class: 'tab-body', x: JAR.left - 44, y: -16, width: 34, height: 32, rx: 7 }),
                    el('line', { class: 'tab-grip', x1: JAR.left - 36, x2: JAR.left - 18, y1: -5, y2: -5 }),
                    el('line', { class: 'tab-grip', x1: JAR.left - 36, x2: JAR.left - 18, y1: 0, y2: 0 }),
                    el('line', { class: 'tab-grip', x1: JAR.left - 36, x2: JAR.left - 18, y1: 5, y2: 5 }),
                    el('rect', { x: JAR.left - 52, y: -26, width: 52, height: 52, fill: 'transparent' }));
                const g = el('g', { 'data-boundary': layer.id },
                    el('line', { class: 'boundary-line', x1: JAR.left, x2: JAR.right }),
                    el('rect', { class: 'grab', x: JAR.left, width: w, height: 36 }));
                attachDrag(g.querySelector('.grab'), layer.id);
                attachDrag(tab, layer.id);
                boundaryGroup.append(g, tab);
                nodes.boundaries.set(layer.id, g);
                nodes.tabs.set(layer.id, tab);
            }
        }
    }

    nodes.ruler = el('g', { class: 'ruler' });
    svg.appendChild(nodes.ruler);

    nodes.surface = el('g', { class: 'surface-handle handle-tab' },
        el('line', { x1: JAR.left - 6, x2: JAR.right + 6, y1: 0, y2: 0 }),
        el('circle', { cx: JAR.right + 20, cy: 0, r: 13 }),
        el('line', { class: 'tab-grip', x1: JAR.right + 14, x2: JAR.right + 26, y1: -4, y2: -4 }),
        el('line', { class: 'tab-grip', x1: JAR.right + 14, x2: JAR.right + 26, y1: 4, y2: 4 }),
        el('rect', { x: JAR.right, y: -26, width: 52, height: 52, fill: 'transparent' }));
    attachDrag(nodes.surface, '__surface__');
    svg.appendChild(nodes.surface);
}

/* ---------- drag handling ---------- */

function svgY(clientY) {
    const r = svg.getBoundingClientRect();
    return (clientY - r.top) * (600 / r.height);
}

let activeRuler = null;

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
        if (!moved && e.type === 'pointerup') selectBandAt(svgY(e.clientY));
        store.rerender();
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
}

function selectBandAt(y) {
    const { state } = store.get();
    const recipe = model.derive(state);
    const layers = buildLayers(recipe);
    const scale = makeJarScale(recipe.doughWeight, { jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity, freeze: true });

    let cum = 0;
    const ranges = layers.map(layer => {
        const y0 = scale.yOf(cum);
        cum += layer.grams;
        const y1 = scale.yOf(cum);
        return { layer, top: y1, bottom: y0, height: y0 - y1 };
    });

    // Thin bands win when the tap lands close to them
    let best = null;
    for (const range of ranges) {
        if (range.height < 20) {
            const dist = Math.abs(y - (range.top + range.bottom) / 2);
            if (dist < 9 && (!best || dist < best.dist)) best = { layer: range.layer, dist };
        }
    }
    if (best) { selectLayer(best.layer.id); return; }
    for (const range of ranges) {
        if (y >= range.top && y <= range.bottom) { selectLayer(range.layer.id); return; }
    }
}

function selectLayer(id) {
    selected = id;
    store.rerender();
    chipRefs.get(id)?.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ---------- drag HUD + guide ruler ---------- */

const hudEl = $('hud');

function hud(text) {
    hudEl.textContent = text;
    hudEl.classList.toggle('on', !!text);
}

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
            ticks.push({ y: scale.yOf(g), label: `${g} g` });
        }
    } else {
        const idx = layers.findIndex(l => l.id === boundaryId);
        const below = layers.slice(0, idx).reduce((sum, l) => sum + l.grams, 0);
        const layer = layers[idx];
        if (layer.kind === 'water') {
            for (let h = 55; h <= 100; h += 5) {
                const grams = recipe.flourTotal * h / 100 - recipe.starterWater - recipe.liquidAddInWater;
                if (grams >= 0) ticks.push({ y: scale.yOf(below + grams), label: `${h}%` });
            }
        } else if (layer.kind === 'starter') {
            for (let p = 5; p <= 45; p += 5) {
                ticks.push({ y: scale.yOf(below + recipe.flourTotal * p / 100), label: `${p}%` });
            }
        } else if (layer.kind === 'flour') {
            for (let p = 10; p <= 90; p += 10) {
                ticks.push({ y: scale.yOf(below + recipe.flourTotal * p / 100), label: `${p}%` });
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

function handleDrag(boundaryId, y) {
    const { state } = store.get();
    const recipe = model.derive(state);
    const layers = buildLayers(recipe);
    const scale = makeJarScale(recipe.doughWeight, { jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity, freeze: true });
    prevCapacity = scale.capacity;

    const gramsAtY = Math.max(0, scale.gramsAt(Math.min(JAR.bottom, Math.max(JAR.top, y))));
    updateRulerHot(y);

    if (boundaryId === '__surface__') {
        const snapped = Math.round(gramsAtY / 25) * 25;
        store.apply(s => model.scaleToDoughWeight(s, snapped));
        const r2 = model.derive(store.get().state);
        hud(`${displayGrams(r2.doughWeight)} g of dough · ${displayGrams(r2.weightPerLoaf)} g per loaf`);
        return;
    }

    const idx = layers.findIndex(l => l.id === boundaryId);
    const below = layers.slice(0, idx).reduce((sum, l) => sum + l.grams, 0);
    const newGrams = Math.max(0, gramsAtY - below);
    const layer = layers[idx];

    if (layer.kind === 'water') {
        const hyd = ((newGrams + recipe.starterWater + recipe.liquidAddInWater) / recipe.flourTotal) * 100;
        store.apply(s => model.setHydration(s, Math.round(hyd * 2) / 2));
        const r2 = model.derive(store.get().state);
        hud(`${formatPct(r2.hydration)}% hydration · ${displayGrams(r2.waterToAdd)} g water`);
    } else if (layer.kind === 'starter') {
        const snapped = Math.round(newGrams / 5) * 5;
        store.apply(s => model.setStarterGrams(s, snapped));
        const r2 = model.derive(store.get().state);
        hud(`${displayGrams(r2.starterMass)} g starter · ${formatPct(r2.starterPct)}% of flour`);
    } else if (layer.kind === 'flour') {
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

/* ---------- ingredient chips (the real interface) ---------- */

const chipRefs = new Map();   // layer id -> { card, grams, pct, update }
let chipsSig = '';

/** Slider row with -/+ steppers; safe against re-render while touched. */
function mkSliderRow({ label, min, max, step, unit, get, apply }) {
    const readout = el('span', { class: 'numeral chip-readout' }, '');
    const slider = el('input', { type: 'range', min, max, step, value: get() });
    let busy = false;
    const setVal = v => {
        const clamped = Math.min(max, Math.max(min, v));
        slider.value = String(clamped);
        readout.textContent = `${round1(clamped)}${unit}`;
        store.apply(s => apply(s, clamped));
    };
    slider.addEventListener('input', () => setVal(Number(slider.value)));
    slider.addEventListener('pointerdown', () => { busy = true; });
    for (const evt of ['pointerup', 'pointercancel', 'change', 'blur']) {
        slider.addEventListener(evt, () => { busy = false; store.rerender(); });
    }
    const minus = el('button', { class: 'popover-step', type: 'button' }, '−');
    const plus = el('button', { class: 'popover-step', type: 'button' }, '+');
    minus.addEventListener('click', e => { e.stopPropagation(); setVal(Number(slider.value) - step); });
    plus.addEventListener('click', e => { e.stopPropagation(); setVal(Number(slider.value) + step); });
    const row = el('div', {},
        label ? el('span', { class: 'smallcaps chip-row-label' }, label) : null,
        el('div', { class: 'popover-row' }, minus, slider, plus, readout));
    return {
        row,
        update() {
            if (!busy && document.activeElement !== slider) slider.value = String(get());
            readout.textContent = `${round1(Number(slider.value))}${unit}`;
        },
    };
}

function buildChip(layer, state) {
    const card = el('div', { class: 'chip-card', 'data-chip': layer.id });
    card.style.setProperty('--chip-color', layer.color);

    const grams = el('span', { class: 'numeral chip-grams' }, '');
    const pct = el('span', { class: 'chip-pct caption' }, '');
    const head = el('div', { class: 'chip-head' },
        el('span', { class: 'chip-name' }, layer.label), grams, pct);
    head.addEventListener('click', () => selectLayer(layer.id));
    card.appendChild(head);

    const editor = el('div', { class: 'chip-editor' });
    card.appendChild(editor);
    const note = el('p', { class: 'caption chip-note' }, '');
    const parts = [];   // things to update in place

    if (layer.kind === 'water') {
        const row = mkSliderRow({
            min: 40, max: 120, step: 0.5, unit: '%',
            get: () => store.get().state.hydration,
            apply: (s, v) => model.setHydration(s, v),
        });
        editor.appendChild(row.row);
        parts.push(row);
        parts.push({ update: r => { note.textContent = caption('hydration', r.hydration); } });
    } else if (layer.kind === 'starter') {
        const pctRow = mkSliderRow({
            label: 'amount, % of flour', min: 5, max: 50, step: 1, unit: '%',
            get: () => store.get().state.starter.pct,
            apply: (s, v) => model.setStarterPercent(s, v),
        });
        const hydRow = mkSliderRow({
            label: 'starter hydration', min: 50, max: 150, step: 5, unit: '%',
            get: () => store.get().state.starter.hydration,
            apply: (s, v) => model.setStarterHydration(s, v),
        });
        const styleChips = el('div', { class: 'popover-chips' });
        for (const [val, label] of [[100, 'liquid'], [60, 'stiff']]) {
            const chip = el('button', { class: 'chip', type: 'button', 'data-hyd': val }, label);
            chip.addEventListener('click', e => {
                e.stopPropagation();
                store.apply(s => model.setStarterHydration(s, val));
            });
            styleChips.appendChild(chip);
        }
        editor.append(pctRow.row, styleChips, hydRow.row);
        parts.push(pctRow, hydRow);
        parts.push({ update: r => {
            for (const chip of styleChips.children) {
                chip.classList.toggle('active',
                    (r.starterHydration >= 90) === (chip.dataset.hyd === '100'));
            }
            note.textContent = `${caption('starter', r.starterPct)}. Carries ${displayGrams(r.starterFlour)} g flour + ${displayGrams(r.starterWater)} g water.`;
        } });
    } else if (layer.kind === 'salt') {
        const row = mkSliderRow({
            min: 0, max: 3.5, step: 0.1, unit: '%',
            get: () => store.get().state.saltPct,
            apply: (s, v) => model.setSalt(s, v),
        });
        editor.appendChild(row.row);
        parts.push(row);
        parts.push({ update: r => {
            const c = caption('salt', r.saltPct);
            note.textContent = `${c[0].toUpperCase()}${c.slice(1)}. Percent of total flour, starter included.`;
        } });
    } else if (layer.kind === 'flour') {
        const i = layer.flourIndex;
        const row = mkSliderRow({
            label: 'share of the flour', min: 2, max: 100, step: 1, unit: '%',
            get: () => store.get().state.flours[i]?.pct ?? 0,
            apply: (s, v) => {
                const flours = s.flours.map((f, fi) => ({ key: f.key, pct: fi === i ? v : f.pct }));
                return model.setFlourBlend(s, flours);
            },
        });
        const typeSelect = el('select', { 'aria-label': 'Flour type' });
        for (const [key, def] of Object.entries(model.FLOUR_TYPES)) {
            typeSelect.appendChild(el('option', { value: key }, def.label));
        }
        typeSelect.value = layer.flourKey;
        typeSelect.addEventListener('click', e => e.stopPropagation());
        typeSelect.addEventListener('change', () => {
            store.apply(s => model.setFlourBlend(s,
                s.flours.map((f, fi) => ({ key: fi === i ? typeSelect.value : f.key, pct: f.pct }))));
        });
        const removeBtn = el('button', { class: 'chip danger-chip', type: 'button' }, 'remove');
        removeBtn.addEventListener('click', e => {
            e.stopPropagation();
            selected = 'water';
            store.apply(s => model.setFlourBlend(s, s.flours.filter((_, fi) => fi !== i)));
        });
        editor.append(row.row, el('div', { class: 'chip-tools' }, typeSelect, removeBtn));
        parts.push(row);
        parts.push({ update: (r, s) => {
            removeBtn.disabled = s.flours.length <= 1;
            note.textContent = model.FLOUR_TYPES[s.flours[i]?.key]?.wholeGrain
                ? 'A whole grain: drinks more water, ferments faster.'
                : 'A white flour: structure, lift, open crumb.';
        } });
    }

    editor.appendChild(note);

    return {
        card,
        update(recipe, state2, layer2) {
            grams.textContent = `${displayGrams(layer2.grams)} g`;
            pct.textContent = chipPct(layer2, recipe);
            for (const part of parts) part.update(recipe, state2);
        },
    };
}

function chipPct(layer, recipe) {
    switch (layer.kind) {
        case 'water': return `${formatPct(recipe.hydration)}% hydration`;
        case 'starter': return `${formatPct(recipe.starterPct)}% of flour`;
        case 'salt': return `${formatPct(recipe.saltPct)}%`;
        case 'flour': return `${formatPct(recipe.flourBreakdown[layer.flourIndex]?.pct ?? 0)}% of flour`;
        default: return '';
    }
}

function renderChips(recipe, state) {
    const layers = buildLayers(recipe);
    // Chips read top of jar first: reverse so water sits last, like the pour
    const ordered = [...layers].reverse();
    const sig = ordered.map(l => `${l.id}:${l.kind === 'flour' ? l.flourKey : ''}`).join('|');

    if (sig !== chipsSig) {
        chipsSig = sig;
        chipRefs.clear();
        const container = $('chips');
        container.innerHTML = '';
        for (const layer of ordered) {
            const chip = buildChip(layer, state);
            chipRefs.set(layer.id, chip);
            container.appendChild(chip.card);
        }
        const addBtn = el('button', { class: 'chip add-flour', type: 'button' }, '+ add a flour');
        addBtn.addEventListener('click', () => {
            const used = new Set(store.get().state.flours.map(f => f.key));
            const nextKey = Object.keys(model.FLOUR_TYPES).find(k => !used.has(k)) || 'bread';
            store.apply(s => model.setFlourBlend(s, [
                ...s.flours.map(f => ({ key: f.key, pct: f.pct * 0.9 })),
                { key: nextKey, pct: 10 },
            ]));
        });
        container.appendChild(addBtn);
    }

    for (const layer of ordered) {
        const chip = chipRefs.get(layer.id);
        chip.card.classList.toggle('selected', selected === layer.id);
        chip.update(recipe, state, layer);
    }
}

/* ---------- batch bar ---------- */

let batchRefs = null;

function renderBatch(recipe, state) {
    if (!batchRefs) {
        const bar = $('batch-bar');
        const minus = el('button', { class: 'popover-step', type: 'button' }, '−');
        const plus = el('button', { class: 'popover-step', type: 'button' }, '+');
        minus.addEventListener('click', () => store.apply(s => model.setNumLoaves(s, s.numLoaves - 1)));
        plus.addEventListener('click', () => store.apply(s => model.setNumLoaves(s, s.numLoaves + 1)));
        batchRefs = {
            weight: el('span', { class: 'numeral batch-weight' }, ''),
            loaves: el('span', {}, ''),
            perLoaf: el('span', { class: 'caption' }, ''),
            stats: el('span', { class: 'caption batch-stats' }, ''),
        };
        bar.append(
            batchRefs.weight, el('span', { class: 'caption' }, 'of dough'),
            el('span', { class: 'batch-sep' }, '·'),
            minus, batchRefs.loaves, plus,
            batchRefs.perLoaf,
            batchRefs.stats);
    }
    batchRefs.weight.textContent = `${displayGrams(recipe.doughWeight)} g`;
    batchRefs.loaves.textContent = `${numberWord(state.numLoaves)} ${state.numLoaves === 1 ? 'loaf' : 'loaves'}`;
    batchRefs.perLoaf.textContent = `${displayGrams(recipe.weightPerLoaf)} g each, ≈ ${displayGrams(recipe.bakedWeightPerLoaf)} g baked`;
    batchRefs.stats.textContent = `${formatPct(recipe.wholeGrainPct)}% whole grain · ${formatPct(recipe.prefermentedFlourPct)}% prefermented`;
}

/* ---------- presets ---------- */

const presetSelect = $('preset-select');
for (const preset of PRESETS) {
    presetSelect.appendChild(el('option', { value: preset.id }, preset.name));
}
presetSelect.addEventListener('change', () => {
    const preset = getPreset(presetSelect.value);
    if (!preset) return;
    selected = 'water';
    prevCapacity = null;
    store.apply(() => model.sanitizeState(preset.state));
});

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

    let cum = 0;
    for (const layer of layers) {
        const y0 = scale.yOf(cum);
        cum += layer.grams;
        let y1 = scale.yOf(cum);
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
    }

    nodes.surface.setAttribute('transform', `translate(0, ${scale.yOf(cum)})`);

    renderChips(recipe, state);
    renderBatch(recipe, state);
}

/* ---------- boot ---------- */

addEventListener('hashchange', () => {
    const fresh = loadFromHash();
    store.apply(() => fresh.state);
    store.setEnv(fresh.env);
});

store.rerender();
