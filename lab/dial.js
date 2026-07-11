/**
 * dial.js — Concept Ⅳ: Pocket Dial.
 * One decision per screen, each with a big rotary dial. CSS scroll-snap
 * does the swiping; dials use relative angle deltas so grabbing anywhere
 * never teleports the value. Ends on a keep-on-screen bake card.
 */
import * as model from '../js/model.js';
import { buildSteps, schedule, totalMinutes } from '../js/ferment.js';
import { displayGrams, formatPct, reconcileSum, round1 } from '../js/format.js';
import { loadFromHash, createStore, renderSwitcher, el } from './lab-common.js';
import {
    DIAL, angleOf, valueOf, pointerAngle, angleDelta, arcPath,
    caption, batchCaption, numberWord,
} from './lab-geometry.js';

const $ = id => document.getElementById(id);
renderSwitcher($('lab-nav'), 'dial');

const boot = loadFromHash();
const store = createStore({ state: boot.state, env: boot.env, onRender: renderAll });

const timeFmt = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat([], { weekday: 'short' });

function scheduled(state, env) {
    return schedule(buildSteps(model.derive(state), env), { mode: env.mode, anchorTime: env.anchorTime });
}

/* ---------- rotary dial component ---------- */

function makeDial({ min, max, step, format, unit, onChange }) {
    const C = 150, R = 118;
    const svg = el('svg', { class: 'dial-svg', viewBox: '0 0 300 300' });

    svg.appendChild(el('path', { class: 'track', d: arcPath(C, C, R, DIAL.start, DIAL.start + DIAL.sweep) }));
    const fill = el('path', { class: 'fill' });
    svg.appendChild(fill);

    // Ticks (every 1/28 of the sweep; majors every 7th)
    for (let i = 0; i <= 28; i++) {
        const deg = DIAL.start + (i / 28) * DIAL.sweep;
        const rad = (deg - 90) * Math.PI / 180;
        const major = i % 7 === 0;
        const r1 = R - 16, r2 = major ? R - 30 : R - 24;
        svg.appendChild(el('line', {
            class: 'tick' + (major ? ' major' : ''),
            x1: C + r1 * Math.cos(rad), y1: C + r1 * Math.sin(rad),
            x2: C + r2 * Math.cos(rad), y2: C + r2 * Math.sin(rad),
        }));
        if (major) {
            const v = min + (i / 28) * (max - min);
            const lr = R - 42;
            svg.appendChild(el('text', {
                class: 'tick-label', 'text-anchor': 'middle',
                x: C + lr * Math.cos(rad), y: C + lr * Math.sin(rad) + 4,
            }, String(Math.round(v))));
        }
    }

    const knob = el('circle', { class: 'knob', r: 10 });
    svg.appendChild(knob);
    const valueText = el('text', { class: 'value', x: C, y: C + 14, 'text-anchor': 'middle' });
    const unitText = el('text', { class: 'unit', x: C, y: C + 44, 'text-anchor': 'middle' }, unit || '');
    svg.append(valueText, unitText);

    let value = min;

    function set(v) {
        value = Math.min(max, Math.max(min, v));
        const deg = angleOf(min, max, value);
        fill.setAttribute('d', arcPath(C, C, R, DIAL.start, deg));
        const rad = (deg - 90) * Math.PI / 180;
        knob.setAttribute('cx', C + R * Math.cos(rad));
        knob.setAttribute('cy', C + R * Math.sin(rad));
        valueText.textContent = format ? format(value) : String(value);
    }

    // Relative-delta rotation: grabbing anywhere adjusts from the current value
    let dragging = false;
    let lastDeg = 0;

    const center = () => {
        const r = svg.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    svg.addEventListener('pointerdown', e => {
        e.preventDefault();
        svg.setPointerCapture(e.pointerId);
        dragging = true;
        const c = center();
        lastDeg = pointerAngle(c.x, c.y, e.clientX, e.clientY);
    });
    svg.addEventListener('pointermove', e => {
        if (!dragging) return;
        const c = center();
        const deg = pointerAngle(c.x, c.y, e.clientX, e.clientY);
        const delta = Math.max(-90, Math.min(90, angleDelta(lastDeg, deg)));
        lastDeg = deg;
        const raw = value + (delta / DIAL.sweep) * (max - min);
        const snapped = valueOf(min, max, step, angleOf(min, max, raw));
        if (snapped !== value) {
            set(snapped);
            onChange(snapped);
        }
    });
    const end = e => {
        if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
        dragging = false;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    return { el: svg, set, get dragging() { return dragging; } };
}

/* ---------- screens ---------- */

const screensEl = $('screens');
const updaters = [];   // called on every render
const dials = [];

function addScreen({ id, ask, build }) {
    const section = el('section', { class: 'screen', 'data-screen': id });
    section.appendChild(el('div', { class: 'ask' }, ask));
    screensEl.appendChild(section);
    build(section);
}

function mkStepper(getText, onMinus, onPlus) {
    const label = el('span', {}, '');
    const minus = el('button', { class: 'popover-step', type: 'button' }, '−');
    const plus = el('button', { class: 'popover-step', type: 'button' }, '+');
    minus.addEventListener('click', onMinus);
    plus.addEventListener('click', onPlus);
    return { row: el('div', { class: 'secondary' }, minus, label, plus), label, update: () => { label.textContent = getText(); } };
}

/* 1 — Batch */
addScreen({
    id: 'batch', ask: 'How much bread?',
    build(section) {
        const dial = makeDial({
            min: 500, max: 4000, step: 50, unit: 'grams of dough',
            format: v => String(Math.round(v)),
            onChange: v => store.apply(s => model.scaleToDoughWeight(s, v)),
        });
        dials.push(dial);
        const stepper = mkStepper(
            () => {
                const { state } = store.get();
                return `${numberWord(state.numLoaves)} ${state.numLoaves === 1 ? 'loaf' : 'loaves'}`;
            },
            () => store.apply(s => model.setNumLoaves(s, s.numLoaves - 1, { keepPerLoaf: false })),
            () => store.apply(s => model.setNumLoaves(s, s.numLoaves + 1, { keepPerLoaf: false })));
        const wisdom = el('p', { class: 'wisdom' });
        section.append(dial.el, stepper.row, wisdom);
        updaters.push((state, env, recipe) => {
            if (!dial.dragging) dial.set(Math.round(recipe.doughWeight));
            stepper.update();
            wisdom.textContent = `${batchCaption(state.numLoaves, recipe.weightPerLoaf)} — ${displayGrams(recipe.weightPerLoaf)} g each, ≈ ${displayGrams(recipe.bakedWeightPerLoaf)} g baked.`;
        });
    },
});

/* 2 — Hydration */
addScreen({
    id: 'hydration', ask: 'How wet?',
    build(section) {
        const dial = makeDial({
            min: 55, max: 100, step: 0.5, unit: '% hydration',
            format: v => formatPct(v),
            onChange: v => store.apply(s => model.setHydration(s, v)),
        });
        dials.push(dial);
        const wisdom = el('p', { class: 'wisdom' });
        section.append(dial.el, wisdom);
        updaters.push((state, env, recipe) => {
            if (!dial.dragging) dial.set(recipe.hydration);
            wisdom.textContent = caption('hydration', recipe.hydration);
        });
    },
});

/* 3 — Starter */
addScreen({
    id: 'starter', ask: 'How much starter?',
    build(section) {
        const dial = makeDial({
            min: 5, max: 40, step: 1, unit: '% of flour',
            format: v => String(Math.round(v)),
            onChange: v => store.apply(s => model.setStarterPercent(s, v)),
        });
        dials.push(dial);
        const chips = el('div', { class: 'secondary' });
        for (const [val, label] of [[100, 'liquid (100%)'], [60, 'stiff (60%)']]) {
            const chip = el('button', { class: 'chip', type: 'button', 'data-hyd': val }, label);
            chip.addEventListener('click', () => store.apply(s => model.setStarterHydration(s, val)));
            chips.appendChild(chip);
        }
        const wisdom = el('p', { class: 'wisdom' });
        section.append(dial.el, chips, wisdom);
        updaters.push((state, env, recipe) => {
            if (!dial.dragging) dial.set(recipe.starterPct);
            for (const chip of chips.children) {
                chip.classList.toggle('active',
                    (state.starter.hydration >= 90) === (chip.dataset.hyd === '100'));
            }
            wisdom.textContent = `${caption('starter', recipe.starterPct)} — ${displayGrams(recipe.starterMass)} g of starter.`;
        });
    },
});

/* 4 — Grain */
const GRAIN_KEYS = ['wholeWheat', 'rye', 'spelt'];
let grainKey = 'wholeWheat';

function applyGrain(pct) {
    store.apply(s => model.setFlourBlend(s,
        pct <= 0 ? [{ key: 'bread', pct: 100 }] : [{ key: 'bread', pct: 100 - pct }, { key: grainKey, pct }]));
}

addScreen({
    id: 'grain', ask: 'How much whole grain?',
    build(section) {
        const dial = makeDial({
            min: 0, max: 60, step: 5, unit: '% whole grain',
            format: v => String(Math.round(v)),
            onChange: applyGrain,
        });
        dials.push(dial);
        const chips = el('div', { class: 'secondary' });
        for (const key of GRAIN_KEYS) {
            const chip = el('button', { class: 'chip', type: 'button', 'data-key': key }, model.FLOUR_TYPES[key].label.toLowerCase());
            chip.addEventListener('click', () => {
                grainKey = key;
                applyGrain(Math.round(model.derive(store.get().state).wholeGrainPct / 5) * 5);
            });
            chips.appendChild(chip);
        }
        const wisdom = el('p', { class: 'wisdom' });
        section.append(dial.el, chips, wisdom);
        updaters.push((state, env, recipe) => {
            const wg = state.flours.find(f => model.FLOUR_TYPES[f.key]?.wholeGrain);
            if (wg && GRAIN_KEYS.includes(wg.key)) grainKey = wg.key;
            if (!dial.dragging) dial.set(Math.round(recipe.wholeGrainPct / 5) * 5);
            for (const chip of chips.children) chip.classList.toggle('active', chip.dataset.key === grainKey);
            wisdom.textContent = caption('grain', recipe.wholeGrainPct);
        });
    },
});

/* 5 — Schedule */
addScreen({
    id: 'schedule', ask: 'Ready when?',
    build(section) {
        const dial = makeDial({
            min: 5, max: 22, step: 0.5, unit: 'o’clock, ready',
            format: v => {
                const h = Math.floor(v);
                return `${((h + 11) % 12) + 1}:${v % 1 ? '30' : '00'}`;
            },
            onChange: v => {
                const { state, env } = store.get();
                const total = totalMinutes(buildSteps(model.derive(state), env));
                const candidate = new Date();
                candidate.setHours(Math.floor(v), (v % 1) * 60, 0, 0);
                const earliest = new Date(Date.now() + total * 60000);
                while (candidate < earliest) candidate.setDate(candidate.getDate() + 1);
                store.setEnv({ mode: 'ready', anchorTime: candidate });
            },
        });
        dials.push(dial);
        const temp = mkStepper(
            () => `kitchen at ${round1(store.get().env.roomTemp)} °C`,
            () => store.setEnv({ roomTemp: Math.max(15, store.get().env.roomTemp - 1) }),
            () => store.setEnv({ roomTemp: Math.min(32, store.get().env.roomTemp + 1) }));
        const wisdom = el('p', { class: 'wisdom' });
        section.append(dial.el, temp.row, wisdom);
        updaters.push((state, env) => {
            const sched = scheduled(state, env);
            const ready = sched[sched.length - 1].end;
            if (!dial.dragging) dial.set(ready.getHours() + (ready.getMinutes() >= 30 ? 0.5 : 0));
            temp.update();
            const retard = sched.find(s => s.id === 'retard');
            const bake = sched.find(s => s.id === 'bake');
            wisdom.textContent =
                `Start ${dayFmt.format(sched[0].start)} ${timeFmt.format(sched[0].start)}`
                + (retard ? ` · fridge ${dayFmt.format(retard.start)} ${timeFmt.format(retard.start)}` : '')
                + (bake ? ` · bake ${dayFmt.format(bake.start)} ${timeFmt.format(bake.start)}` : '')
                + ` · bread ${dayFmt.format(ready)} ${timeFmt.format(ready)}.`;
        });
    },
});

/* 6 — Bake card */
addScreen({
    id: 'card', ask: 'Your bake card',
    build(section) {
        const card = el('div', { class: 'bake-card' });
        section.appendChild(card);
        const wake = el('input', { type: 'checkbox', id: 'wake' });
        const wakeRow = el('label', { class: 'wake-row caption' }, wake, ' keep my screen awake on bake day');
        section.appendChild(wakeRow);

        let wakeLock = null;
        wake.addEventListener('change', async () => {
            try {
                if (wake.checked && navigator.wakeLock) {
                    wakeLock = await navigator.wakeLock.request('screen');
                } else {
                    await wakeLock?.release();
                    wakeLock = null;
                }
            } catch { wake.checked = false; }
        });
        document.addEventListener('visibilitychange', async () => {
            if (wake.checked && document.visibilityState === 'visible' && navigator.wakeLock) {
                try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* noop */ }
            }
        });

        updaters.push((state, env, recipe) => {
            const { parts, total } = reconcileSum([
                { key: 'flour', value: recipe.flourToAdd },
                { key: 'water', value: recipe.waterToAdd },
                { key: 'starter', value: recipe.starterMass },
                { key: 'salt', value: recipe.salt },
            ]);
            const get = k => parts.find(p => p.key === k).value;
            const sched = scheduled(state, env);
            const now = new Date();
            const nextIdx = Math.max(0, sched.findIndex(s => s.end > now));
            const next = sched[nextIdx];
            const after = sched.slice(nextIdx + 1, nextIdx + 3);

            card.innerHTML = '';
            card.appendChild(el('h3', {}, 'On the scale'));
            for (const [label, grams] of [
                ['Flour', get('flour')], ['Water', get('water')],
                ['Starter', get('starter')], ['Salt', get('salt')], ['Dough', total],
            ]) {
                card.appendChild(el('div', { class: 'ing-row' },
                    el('span', {}, label), el('span', { class: 'numeral' }, `${grams} g`)));
            }
            const nextBlock = el('div', { class: 'next' });
            nextBlock.appendChild(el('span', { class: 'smallcaps' }, now < sched[0].start ? 'first up' : 'now / next'));
            nextBlock.appendChild(el('p', { class: 'sched-line' },
                el('span', { class: 'sched-time' }, `${dayFmt.format(next.start)} ${timeFmt.format(next.start)}`),
                el('strong', {}, next.label), ' — ', next.description));
            for (const step of after) {
                nextBlock.appendChild(el('p', { class: 'sched-line after' },
                    el('span', { class: 'sched-time' }, timeFmt.format(step.start)), step.label));
            }
            card.appendChild(nextBlock);
            card.appendChild(el('div', { class: 'caption foot' },
                `${formatPct(recipe.hydration)}% hydration · ${formatPct(recipe.starterPct)}% starter · ${formatPct(recipe.saltPct)}% salt · ready ${dayFmt.format(sched[sched.length - 1].end)} ${timeFmt.format(sched[sched.length - 1].end)}`));
        });
    },
});

/* ---------- navigation: dots, arrows, keys ---------- */

const dotsEl = $('dots');
const screens = [...screensEl.children];
screens.forEach(() => dotsEl.appendChild(el('span')));

const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            const idx = screens.indexOf(entry.target);
            [...dotsEl.children].forEach((dot, i) => dot.classList.toggle('active', i === idx));
        }
    }
}, { root: screensEl, threshold: 0.6 });
screens.forEach(s => observer.observe(s));

function currentIndex() {
    return Math.round(screensEl.scrollLeft / screensEl.clientWidth);
}

function go(delta) {
    const idx = Math.min(screens.length - 1, Math.max(0, currentIndex() + delta));
    screensEl.scrollTo({ left: idx * screensEl.clientWidth, behavior: 'smooth' });
}

$('prev').addEventListener('click', () => go(-1));
$('next').addEventListener('click', () => go(1));
addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
});

/* ---------- render ---------- */

function renderAll(state, env) {
    const recipe = model.derive(state);
    for (const update of updaters) update(state, env, recipe);
}

setInterval(() => store.rerender(), 30000); // keeps the bake card's NEXT fresh

addEventListener('hashchange', () => {
    const fresh = loadFromHash();
    store.apply(() => fresh.state);
    store.setEnv(fresh.env);
});

store.rerender();
