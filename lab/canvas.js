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
    nodes = { bands: new Map(), boundaries: new Map(), annots: new Map() };

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

        // A draggable boundary at the TOP of every resizable band
        if (['water', 'starter', 'flour'].includes(layer.kind)) {
            const isTopFlour = layer.kind === 'flour' && layer.flourIndex === layers.filter(l => l.kind === 'flour').length - 1;
            if (!isTopFlour) {
                const g = el('g', { 'data-boundary': layer.id },
                    el('line', { class: 'boundary-line', x1: JAR.left, x2: JAR.right }),
                    el('rect', { class: 'grab', x: JAR.left, width: JAR.right - JAR.left, height: 28 }));
                attachDrag(g.querySelector('.grab'), layer.id);
                boundaryGroup.appendChild(g);
                nodes.boundaries.set(layer.id, g);
            }
        }
    }

    // Surface handle (total dough weight)
    nodes.surface = el('g', { class: 'surface-handle' },
        el('line', { x1: JAR.left - 6, x2: JAR.right + 6 }),
        el('circle', { cx: JAR.right + 14, r: 9 }));
    attachDrag(nodes.surface.querySelector('circle'), '__surface__');
    svg.appendChild(nodes.surface);

    nodes.ghost = el('text', { class: 'ghost', x: (JAR.left + JAR.right) / 2, 'text-anchor': 'middle' });
    svg.appendChild(nodes.ghost);
}

/* ---------- drag handling ---------- */

function svgY(clientY) {
    const r = svg.getBoundingClientRect();
    return (clientY - r.top) * (600 / r.height);
}

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
            handleDrag(boundaryId, svgY(e.clientY));
        });
    });
    const end = e => {
        if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId);
        dragging = false;
        nodes.ghost.textContent = '';
        // A grab zone can cover a thin band entirely — treat a tap
        // (no movement) as selecting the band under the pointer.
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
    const scale = makeJarScale(recipe.doughWeight, { jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity });
    const grams = scale.gramsAt(y);
    let cum = 0;
    for (const layer of layers) {
        cum += layer.grams;
        if (grams <= cum) { selected = layer.id; return; }
    }
}

function handleDrag(boundaryId, y) {
    const { state } = store.get();
    const recipe = model.derive(state);
    const layers = buildLayers(recipe);
    const scale = makeJarScale(recipe.doughWeight, { jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity });
    prevCapacity = scale.capacity;

    const gramsAtY = Math.max(0, scale.gramsAt(Math.min(JAR.bottom, Math.max(JAR.top, y))));

    if (boundaryId === '__surface__') {
        store.apply(s => model.scaleToDoughWeight(s, gramsAtY));
        setGhost(y, `${displayGrams(model.derive(store.get().state).doughWeight)} g total`);
        return;
    }

    // Cumulative grams below this band
    const idx = layers.findIndex(l => l.id === boundaryId);
    const below = layers.slice(0, idx).reduce((sum, l) => sum + l.grams, 0);
    const newGrams = Math.max(0, gramsAtY - below);
    const layer = layers[idx];

    if (layer.kind === 'water') {
        const hyd = ((newGrams + recipe.starterWater + recipe.liquidAddInWater) / recipe.flourTotal) * 100;
        store.apply(s => model.setHydration(s, hyd));
        const r2 = model.derive(store.get().state);
        setGhost(y, `${displayGrams(r2.waterToAdd)} g · ${formatPct(r2.hydration)}%`);
    } else if (layer.kind === 'starter') {
        store.apply(s => model.setStarterGrams(s, newGrams));
        const r2 = model.derive(store.get().state);
        setGhost(y, `${displayGrams(r2.starterMass)} g · ${formatPct(r2.starterPct)}%`);
    } else if (layer.kind === 'flour') {
        // Redistribute between this band and the one above (pair drag)
        const i = layer.flourIndex;
        const flours = state.flours.map(f => ({ ...f }));
        if (i + 1 >= flours.length) return;
        const pairPct = flours[i].pct + flours[i + 1].pct;
        const newPct = Math.min(pairPct - 2, Math.max(2, (newGrams / recipe.flourTotal) * 100));
        flours[i].pct = newPct;
        flours[i + 1].pct = pairPct - newPct;
        store.apply(s => model.setFlourBlend(s, flours));
        setGhost(y, `${formatPct(newPct)}% ${layer.label.toLowerCase()}`);
    }
}

function setGhost(y, text) {
    nodes.ghost.setAttribute('y', Math.max(JAR.top + 16, y - 12));
    nodes.ghost.textContent = text;
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

    const scale = makeJarScale(recipe.doughWeight, { jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity: dragging ? prevCapacity : null });
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
            boundary.querySelector('.grab').setAttribute('y', y1 - 14);
        }

        annotSlots.push({ layer, mid: (y0 + y1) / 2 });
    }

    // Surface handle at the top of the stack
    const surfaceY = scale.yOf(cum);
    for (const lineEl of nodes.surface.querySelectorAll('line')) {
        lineEl.setAttribute('y1', surfaceY);
        lineEl.setAttribute('y2', surfaceY);
    }
    nodes.surface.querySelector('circle').setAttribute('cy', surfaceY);

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

function renderDetail(recipe, state) {
    const panel = $('detail');
    panel.innerHTML = '';

    let def;
    const flourMatch = /^flour-(\d+)$/.exec(selected);
    if (flourMatch) {
        const i = Number(flourMatch[1]);
        const f = recipe.flourBreakdown[i];
        if (f) {
            def = {
                title: model.FLOUR_TYPES[f.key]?.label || f.key,
                grams: () => `${displayGrams(f.added)} g to add (${displayGrams(f.total)} g of the total flour)`,
                caption: () => (model.FLOUR_TYPES[f.key]?.wholeGrain
                    ? 'A whole grain — it drinks more water and ferments faster.'
                    : 'A white flour — structure, lift, and an open crumb.'),
                control: (r, s) => ({
                    label: `${model.FLOUR_TYPES[f.key]?.label} share`, value: f.pct, min: 2, max: 100, step: 1, unit: '%',
                    apply: v => {
                        const flours = s.flours.map((fl, fi) => ({ key: fl.key, pct: fi === i ? v : fl.pct }));
                        return model.setFlourBlend(s, flours);
                    },
                }),
            };
        }
    }
    def = def || DETAIL[selected] || DETAIL.water;

    panel.appendChild(el('h3', {}, def.title));
    panel.appendChild(el('div', { class: 'grams-line' }, def.grams(recipe)));
    panel.appendChild(el('span', { class: 'caption' }, def.caption(recipe)));

    const c = def.control(recipe, state);
    const readout = el('span', { class: 'numeral' }, `${round1(c.value)}${c.unit}`);
    const slider = el('input', { type: 'range', min: c.min, max: c.max, step: c.step, value: c.value });
    slider.addEventListener('input', () => {
        readout.textContent = `${round1(Number(slider.value))}${c.unit}`;
        store.apply(s => def.control(recipe, s).apply(Number(slider.value)));
    });
    panel.appendChild(el('div', { class: 'popover-row' }, slider, readout));

    // Batch controls (always present)
    const minus = el('button', { class: 'popover-step', type: 'button' }, '−');
    const plus = el('button', { class: 'popover-step', type: 'button' }, '+');
    minus.addEventListener('click', () => store.apply(s => model.setNumLoaves(s, s.numLoaves - 1)));
    plus.addEventListener('click', () => store.apply(s => model.setNumLoaves(s, s.numLoaves + 1)));
    panel.appendChild(el('div', { class: 'batch' },
        el('span', { class: 'numeral' }, `${displayGrams(recipe.doughWeight)} g`),
        el('span', { class: 'caption' }, 'of dough ·'),
        minus,
        el('span', {}, `${numberWord(state.numLoaves)} ${state.numLoaves === 1 ? 'loaf' : 'loaves'}`),
        plus,
        el('span', { class: 'caption' }, `${displayGrams(recipe.weightPerLoaf)} g each`)));

    panel.appendChild(el('p', { class: 'footnote' },
        `${formatPct(recipe.wholeGrainPct)}% whole grain · ${formatPct(recipe.prefermentedFlourPct)}% prefermented flour · salt ${formatPct(recipe.saltPct)}%`));
}

/* ---------- boot ---------- */

addEventListener('hashchange', () => {
    const fresh = loadFromHash();
    store.apply(() => fresh.state);
    store.setEnv(fresh.env);
});

store.rerender();
