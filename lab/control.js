/**
 * control.js - Concept Ⅲ: Mission Control.
 * The bake as a horizontal ribbon of time. Drag the paper to move the
 * start; drag the bake block to plan backward from a ready time; pull the
 * cold-rest edge to stretch it; warm the kitchen and watch bulk shrink.
 */
import * as model from '../js/model.js';
import { buildSteps, schedule, bulkMinutes } from '../js/ferment.js';
import { displayGrams, formatPct, formatDuration, round1 } from '../js/format.js';
import {
    loadFromHash, createStore, renderSwitcher, createPopover, el,
} from './lab-common.js';
import { makeTimeScale, shadingBands, dayBoundaries } from './lab-geometry.js';

const $ = id => document.getElementById(id);
const popover = createPopover();
renderSwitcher($('lab-nav'), 'control');

const svg = $('ribbon');
const PAD = 48;               // horizontal padding inside the svg
const BAND = { top: 78, height: 56 };
const SCALE_OPTS = { pxPerMin: 1.1, capMin: 150, capPx: 110 };

const PHASE_COLORS = {
    feed: 'var(--starter)', autolyse: 'var(--flour-ap)', mix: 'var(--flour-ww)',
    fold: 'var(--flour-ww)', bulkEnd: 'var(--flour-bread)', preshape: 'var(--flour-ap)',
    shape: 'var(--flour-ap)', retard: 'var(--water)', preheat: 'var(--salt)',
    bake: 'var(--accent)', cool: 'var(--salt)', enjoy: 'var(--good)',
};

function colorFor(id) {
    const key = id.replace(/\d+$/, '');
    return PHASE_COLORS[key] || 'var(--flour-bread)';
}

const boot = loadFromHash();
const store = createStore({ state: boot.state, env: boot.env, onRender: render });

const timeFmt = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat([], { weekday: 'short', month: 'short', day: 'numeric' });
const dayLong = new Intl.DateTimeFormat([], { weekday: 'long', month: 'long', day: 'numeric' });

function scheduled(state, env) {
    return schedule(buildSteps(model.derive(state), env), { mode: env.mode, anchorTime: env.anchorTime });
}

/* ---------- render ---------- */

let currentScale = null;

function render(state, env) {
    const sched = scheduled(state, env).filter(s => s.minutes > 0);
    const scale = makeTimeScale(sched, SCALE_OPTS);
    currentScale = scale;
    const W = scale.width + PAD * 2;
    svg.setAttribute('width', W);
    svg.setAttribute('viewBox', `0 0 ${W} 200`);
    svg.innerHTML = '';

    const start = sched[0].start;
    const end = sched[sched.length - 1].end;
    const X = d => PAD + scale.x(d);

    // Day/night shading
    const shadeGroup = el('g');
    for (const band of shadingBands(scale, start, end)) {
        if (band.night) {
            shadeGroup.appendChild(el('rect', {
                class: 'shade-night', x: PAD + band.x0, y: 18,
                width: Math.max(0, band.x1 - band.x0), height: 164,
            }));
        }
    }
    svg.appendChild(shadeGroup);

    // Background pan target
    const bg = el('rect', { class: 'bg', x: 0, y: 0, width: W, height: 200, 'data-drag': 'pan' });
    svg.insertBefore(bg, shadeGroup);

    // First-day label at the ribbon's left edge, then labels at midnights
    svg.appendChild(el('text', { class: 'day-label', x: PAD, y: 30 }, dayFmt.format(start)));
    for (const boundary of dayBoundaries(scale, start, end)) {
        svg.appendChild(el('line', {
            x1: PAD + boundary.x, x2: PAD + boundary.x, y1: 18, y2: 182,
            stroke: 'var(--rule)', 'stroke-width': 1,
        }));
        svg.appendChild(el('text', {
            class: 'day-label', x: PAD + boundary.x + 6, y: 30,
        }, dayFmt.format(boundary.date)));
    }

    // Step blocks - labels alternate rows and skip when a row is crowded
    let flip = false;
    const rowEnd = { above: -Infinity, below: -Infinity };
    for (const step of sched) {
        const x0 = X(step.start);
        const x1 = X(step.end);
        const w = Math.max(2, x1 - x0);
        const isBake = step.id === 'bake';
        const g = el('g', {
            class: 'block' + (isBake ? ' draggable-target' : ''),
            'data-drag': isBake ? 'bake' : 'pan', 'data-id': step.id,
        });
        g.appendChild(el('rect', {
            x: x0, y: BAND.top, width: w, height: BAND.height, rx: 3,
            fill: colorFor(step.id),
            stroke: isBake ? 'var(--ink)' : 'none', 'stroke-width': isBake ? 1 : 0,
        }));
        if (isBake) {
            // Grip dots + an inflated invisible hit area for fat fingers
            const gx = x0 + w / 2, gy = BAND.top + BAND.height / 2;
            for (const dy of [-8, 0, 8]) {
                g.appendChild(el('circle', { class: 'grip-dot', cx: gx, cy: gy + dy, r: 2 }));
            }
            g.appendChild(el('rect', {
                x: x0 - Math.max(0, (44 - w) / 2), y: BAND.top - 10,
                width: Math.max(44, w), height: BAND.height + 20, fill: 'transparent',
            }));
        }

        const seg = scale.segments.find(s => s.id === step.id);
        if (seg?.compressed) {
            for (const zx of [x0, x1]) {
                g.appendChild(el('polyline', {
                    class: 'zigzag',
                    points: `${zx},${BAND.top - 4} ${zx - 3},${BAND.top + 8} ${zx + 3},${BAND.top + 20} ${zx - 3},${BAND.top + 32} ${zx + 3},${BAND.top + 44} ${zx},${BAND.top + BAND.height + 4}`,
                }));
            }
            g.appendChild(el('text', {
                class: 'block-badge', x: (x0 + x1) / 2, y: BAND.top + BAND.height / 2 + 4,
                'text-anchor': 'middle',
            }, formatDuration(step.minutes)));
        }

        // Alternating labels above/below; a label needs ~7px per character
        // of clear track in its row, otherwise it's dropped (blocks remain)
        if (w >= 26 || seg?.compressed || isBake) {
            const need = Math.max(step.label.length, 8) * 7;
            const preferred = flip ? 'below' : 'above';
            const other = flip ? 'above' : 'below';
            let row = null;
            if (x0 >= rowEnd[preferred] + 8) row = preferred;
            else if (x0 >= rowEnd[other] + 8) row = other;
            if (row || isBake) {
                row = row || preferred;
                flip = !flip;
                rowEnd[row] = x0 + need;
                const ly = row === 'above' ? BAND.top - 20 : BAND.top + BAND.height + 24;
                g.appendChild(el('text', { class: 'block-label', x: x0 + 2, y: ly }, step.label));
                g.appendChild(el('text', { class: 'block-time', x: x0 + 2, y: ly + 13 }, timeFmt.format(step.start)));
            }
        }
        svg.appendChild(g);

        // Retard stretch grip - visible handle ring, wide hit area
        if (step.id === 'retard') {
            const gy = BAND.top + BAND.height / 2;
            const grip = el('g', { class: 'retard-grip', 'data-drag': 'retard' },
                el('line', { x1, x2: x1, y1: BAND.top + 4, y2: BAND.top + BAND.height - 4 }),
                el('circle', { cx: x1, cy: gy, r: 9 }),
                el('line', { x1: x1 - 3, x2: x1 - 3, y1: gy - 3, y2: gy + 3 }),
                el('line', { x1: x1 + 3, x2: x1 + 3, y1: gy - 3, y2: gy + 3 }),
                el('rect', { x: x1 - 22, y: BAND.top - 10, width: 44, height: BAND.height + 20, fill: 'transparent' }));
            svg.appendChild(grip);
        }
    }

    // NOW cursor
    const now = new Date();
    if (now >= start && now <= end) {
        const nx = X(now);
        svg.appendChild(el('line', { class: 'now-line', x1: nx, x2: nx, y1: 14, y2: 186 }));
        svg.appendChild(el('text', { class: 'now-flag', x: nx + 5, y: 195 }, 'now'));
    }

    renderHeader(state, env, sched);
    renderDrawer(state, env);
    renderStepList(sched);
}

function renderHeader(state, env, sched) {
    $('temp-range').value = String(env.roomTemp);
    $('temp-readout').textContent = `${round1(env.roomTemp)} °C`;
    const recipe = model.derive(state);
    const bulk = bulkMinutes({ roomTemp: env.roomTemp, starterPct: recipe.starterPct, wholeGrainPct: recipe.wholeGrainPct });
    $('temp-caption').textContent = `At ${round1(env.roomTemp)} °C, bulk runs ≈ ${formatDuration(bulk)}.`;
    const last = sched[sched.length - 1];
    $('mode-note').textContent = env.mode === 'ready'
        ? `Planning backward - bread ready ${dayLong.format(last.end)}, ${timeFmt.format(last.end)}.`
        : `Planning forward - starting ${dayLong.format(sched[0].start)}, ${timeFmt.format(sched[0].start)}.`;
}

/* ---------- drawer ---------- */

function renderDrawer(state, env) {
    const recipe = model.derive(state);
    const container = $('formula-rows');
    container.innerHTML = '';

    const rows = [
        {
            label: 'dough', text: `${displayGrams(recipe.doughWeight)} g`,
            spec: () => ({
                kind: 'number', label: 'Dough weight', value: Math.round(recipe.doughWeight),
                min: 500, max: 5000, step: 50, unit: ' g',
                onInput: v => store.apply(s => model.scaleToDoughWeight(s, v)),
            }),
        },
        {
            label: 'hydration', text: `${formatPct(recipe.hydration)}%`,
            spec: () => ({
                kind: 'number', label: 'Hydration', value: state.hydration, min: 55, max: 100, step: 0.5, unit: '%',
                onInput: v => store.apply(s => model.setHydration(s, v)),
            }),
        },
        {
            label: 'starter - sets the tempo', text: `${formatPct(recipe.starterPct)}%`,
            spec: () => ({
                kind: 'number', label: 'Starter, % of flour', value: state.starter.pct, min: 5, max: 40, step: 1, unit: '%',
                onInput: v => store.apply(s => model.setStarterPercent(s, v)),
            }),
        },
        {
            label: 'salt', text: `${formatPct(recipe.saltPct)}%`,
            spec: () => ({
                kind: 'number', label: 'Salt', value: state.saltPct, min: 0, max: 3.5, step: 0.1, unit: '%',
                onInput: v => store.apply(s => model.setSalt(s, v)),
            }),
        },
        {
            label: 'cold rest', text: `${round1(env.retardHours)} h`,
            spec: () => ({
                kind: 'number', label: 'Cold rest', value: env.retardHours, min: 0, max: 48, step: 1, unit: ' h',
                onInput: v => store.setEnv({ retardHours: v }),
            }),
        },
    ];

    for (const row of rows) {
        const btn = el('button', { class: 'token numeral', type: 'button', 'aria-expanded': 'false' }, row.text);
        btn.addEventListener('click', () => popover.open(btn, row.spec()));
        container.appendChild(el('div', { class: 'formula-row' },
            el('span', { class: 'caption' }, row.label), btn));
    }

    const fed = $('fed-box');
    fed.checked = env.starterFed;
}

$('fed-box').addEventListener('change', e => store.setEnv({ starterFed: e.target.checked }));

function renderStepList(sched) {
    const container = $('step-list');
    container.innerHTML = '';
    let lastDay = '';
    for (const step of sched) {
        const day = dayLong.format(step.start);
        if (day !== lastDay) {
            lastDay = day;
            container.appendChild(el('span', { class: 'smallcaps day-head' }, day));
        }
        container.appendChild(el('p', { class: 'sched-line' },
            el('span', { class: 'sched-time' }, timeFmt.format(step.start)),
            el('strong', {}, step.label), ' - ', step.description));
    }
}

/* ---------- temperature ---------- */

$('temp-range').addEventListener('input', e => store.setEnv({ roomTemp: Number(e.target.value) }));

/* ---------- ribbon drags (handlers on the persistent <svg>) ---------- */

let drag = null;

svg.addEventListener('pointerdown', e => {
    const target = e.target.closest?.('[data-drag]');
    if (!target) return;
    const { env, state } = store.get();
    const sched = scheduled(state, env);
    drag = {
        kind: target.getAttribute('data-drag'),
        target,
        startX: e.clientX,
        anchor0: new Date(env.anchorTime),
        mode0: env.mode,
        retard0: env.retardHours,
        start0: sched[0].start,
        lastEnd0: sched[sched.length - 1].end,
        scale0: currentScale,
        moved: false,
    };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
});

let dragRaf = null;

svg.addEventListener('pointermove', e => {
    if (!drag || dragRaf) return;
    dragRaf = requestAnimationFrame(() => {
        dragRaf = null;
        if (!drag) return;
        const dx = e.clientX - drag.startX;
        if (Math.abs(dx) < 6 && !drag.moved) return;
        drag.moved = true;
        const { pxPerMin } = SCALE_OPTS;

        if (drag.kind === 'pan') {
            const dMin = Math.round(-dx / pxPerMin / 15) * 15;
            store.setEnv({ anchorTime: new Date(drag.anchor0.getTime() + dMin * 60000) });
            const s0 = scheduled(store.get().state, store.get().env)[0].start;
            hud(`Start ${dayLong.format(s0)}, ${timeFmt.format(s0)}`);
        } else if (drag.kind === 'bake') {
            const dMin = Math.round(dx / pxPerMin / 15) * 15;
            const ready = new Date(drag.lastEnd0.getTime() + dMin * 60000);
            store.setEnv({ mode: 'ready', anchorTime: ready });
            hud(`Bread ready ${dayLong.format(ready)}, ${timeFmt.format(ready)}`);
        } else if (drag.kind === 'retard') {
            const seg = drag.scale0.segments.find(s => s.id === 'retard');
            const pxPerHour = seg?.compressed && drag.retard0 > 0
                ? (seg.x1 - seg.x0) / drag.retard0
                : pxPerMin * 60;
            const dH = Math.round(dx / pxPerHour);
            const hours = Math.min(48, Math.max(0, drag.retard0 + dH));
            store.setEnv({ retardHours: hours });
            hud(`Cold rest: ${hours} h`);
        }
    });
});

const endDrag = e => {
    if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    const finished = drag;
    drag = null;
    hud('');
    // Tap (no movement) = open an editor instead - the mobile-friendly path
    if (finished && !finished.moved && e.type === 'pointerup') {
        if (finished.kind === 'bake') {
            popover.open(finished.target, {
                kind: 'time', label: 'Bread ready at', value: finished.lastEnd0,
                onInput: d => store.setEnv({ mode: 'ready', anchorTime: d }),
            });
        } else if (finished.kind === 'retard') {
            popover.open(finished.target, {
                kind: 'number', label: 'Cold rest', value: finished.retard0, min: 0, max: 48, step: 1, unit: ' h',
                onInput: v => store.setEnv({ retardHours: v }),
            });
        } else {
            popover.open(finished.target, {
                kind: 'time', label: 'I start at', value: finished.start0,
                onInput: d => store.setEnv({ mode: 'start', anchorTime: d }),
            });
        }
    }
};
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

const hudEl = $('hud');

function hud(text) {
    hudEl.textContent = text;
    hudEl.classList.toggle('on', !!text);
}

/* ---------- boot ---------- */

addEventListener('hashchange', () => {
    const fresh = loadFromHash();
    store.apply(() => fresh.state);
    store.setEnv(fresh.env);
});

setInterval(() => store.rerender(), 30000); // keep the NOW cursor honest

store.rerender();

// Scroll the strip so the beginning (or NOW) sits at 25% of the viewport
const wrap = $('ribbon-wrap');
const { env, state } = store.get();
const sched0 = scheduled(state, env);
const now = new Date();
if (now >= sched0[0].start && currentScale) {
    wrap.scrollLeft = Math.max(0, PAD + currentScale.x(now) - wrap.clientWidth * 0.25);
}