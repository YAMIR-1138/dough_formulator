/**
 * recipe.js - Concept Ⅰ: The Living Recipe.
 * The formula is a prose document; every underlined token is a button that
 * opens the shared popover. Renders are keyed and in-place (textContent
 * only), so the document rewrites live under an open popover.
 */
import * as model from '../js/model.js';
import { buildSteps, schedule } from '../js/ferment.js';
import { displayGrams, formatPct, reconcileSum, round1 } from '../js/format.js';
import {
    loadFromHash, createStore, renderSwitcher, createPopover, el,
} from './lab-common.js';
import { numberWord } from './lab-geometry.js';

const $ = id => document.getElementById(id);
const popover = createPopover();
renderSwitcher($('lab-nav'), 'recipe');

/* ---------- boot ---------- */

const boot = loadFromHash();
const store = createStore({ state: boot.state, env: boot.env, onRender: render });

/* ---------- derived helpers ---------- */

function scheduled(state, env) {
    const steps = buildSteps(model.derive(state), env);
    return schedule(steps, { mode: env.mode, anchorTime: env.anchorTime });
}

const dayName = new Intl.DateTimeFormat([], { weekday: 'long' });
const timeName = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });
const dayFull = new Intl.DateTimeFormat([], { weekday: 'long', month: 'long', day: 'numeric' });

function phraseDayTime(date) {
    const today = new Date();
    const dayDiff = Math.round(
        (new Date(date).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86400000);
    const t = timeName.format(date);
    if (dayDiff === 0) return `today at ${t}`;
    if (dayDiff === 1) return `tomorrow at ${t}`;
    if (dayDiff === -1) return `yesterday at ${t}`;
    return `${dayName.format(date)} at ${t}`;
}

/* ---------- token registry ---------- */

// Each token: text(recipe, state, env, sched) → string;
// spec(state, env, sched) → popover spec (built fresh at open time).
const TOKENS = {
    loaves: {
        text: (r, s) => `${numberWord(s.numLoaves)} ${s.numLoaves === 1 ? 'loaf' : 'loaves'}`,
        spec: s => ({
            kind: 'number', label: 'Loaves', value: s.numLoaves, min: 1, max: 12, step: 1,
            format: v => `${numberWord(v)}`,
            onInput: v => store.apply(st => model.setNumLoaves(st, v)),
        }),
    },
    loafWeight: {
        text: r => `${displayGrams(r.weightPerLoaf)} g`,
        spec: (s) => ({
            kind: 'number', label: 'Weight per loaf', value: Math.round(model.derive(s).weightPerLoaf),
            min: 400, max: 2000, step: 25, unit: ' g',
            onInput: v => store.apply(st => model.setLoafWeight(st, v)),
        }),
    },
    hydration: {
        text: r => `${formatPct(r.hydration)}%`,
        spec: s => ({
            kind: 'number', label: 'Hydration', value: s.hydration, min: 55, max: 100, step: 0.5, unit: '%',
            onInput: v => store.apply(st => model.setHydration(st, v)),
        }),
    },
    starterPct: {
        text: r => `${formatPct(r.starterPct)}%`,
        spec: s => ({
            kind: 'number', label: 'Starter, % of flour', value: s.starter.pct, min: 5, max: 40, step: 1, unit: '%',
            onInput: v => store.apply(st => model.setStarterPercent(st, v)),
        }),
    },
    starterStyle: {
        text: (r, s) => (s.starter.hydration >= 90 ? 'liquid' : 'stiff'),
        spec: s => ({
            kind: 'choice', label: 'Starter style',
            value: s.starter.hydration >= 90 ? 'liquid' : 'stiff',
            options: [
                { value: 'liquid', label: 'liquid (100%)' },
                { value: 'stiff', label: 'stiff (60%)' },
            ],
            onInput: v => store.apply(st => model.setStarterHydration(st, v === 'liquid' ? 100 : 60)),
        }),
    },
    saltPct: {
        text: r => `${formatPct(r.saltPct)}%`,
        spec: s => ({
            kind: 'number', label: 'Salt, % of flour', value: s.saltPct, min: 0, max: 3.5, step: 0.1, unit: '%',
            onInput: v => store.apply(st => model.setSalt(st, v)),
        }),
    },
    startTime: {
        text: (r, s, env, sched) => phraseDayTime(sched[0].start),
        spec: (s, env, sched) => ({
            kind: 'time', label: 'I start at', value: sched[0].start,
            onInput: d => store.setEnv({ mode: 'start', anchorTime: d }),
        }),
    },
    readyTime: {
        text: (r, s, env, sched) => phraseDayTime(sched[sched.length - 1].end),
        spec: (s, env, sched) => ({
            kind: 'time', label: 'Bread ready at', value: sched[sched.length - 1].end,
            onInput: d => store.setEnv({ mode: 'ready', anchorTime: d }),
        }),
    },
    roomTemp: {
        text: (r, s, env) => `${round1(env.roomTemp)} °C`,
        spec: (s, env) => ({
            kind: 'number', label: 'Kitchen temperature', value: env.roomTemp, min: 15, max: 32, step: 1, unit: ' °C',
            onInput: v => store.setEnv({ roomTemp: v }),
        }),
    },
    retard: {
        text: (r, s, env) => (env.retardHours > 0 ? `${round1(env.retardHours)}-hour` : 'no'),
        spec: (s, env) => ({
            kind: 'number', label: 'Cold rest in the fridge', value: env.retardHours, min: 0, max: 48, step: 1, unit: ' h',
            onInput: v => store.setEnv({ retardHours: v }),
        }),
    },
    starterFed: {
        text: (r, s, env) => (env.starterFed ? 'is fed and peaking' : 'still needs a feed'),
        spec: (s, env) => ({
            kind: 'choice', label: 'Starter status',
            value: env.starterFed ? 'fed' : 'unfed',
            options: [
                { value: 'fed', label: 'fed & peaking' },
                { value: 'unfed', label: 'needs feeding' },
            ],
            onInput: v => store.setEnv({ starterFed: v === 'fed' }),
        }),
    },
};

/* ---------- template compilation ---------- */

/**
 * Compile a segment template into live nodes inside `container`.
 * Segments: string | {token:'name'} | {dyn:(recipe,state,env,sched)=>string}.
 * Returns update(recipe, state, env, sched).
 */
function compile(container, segments) {
    container.innerHTML = '';
    const updaters = [];
    for (const seg of segments) {
        if (typeof seg === 'string') {
            container.appendChild(document.createTextNode(seg));
        } else if (seg.token) {
            const def = TOKENS[seg.token];
            const btn = el('button', { class: 'token', type: 'button', 'aria-expanded': 'false' });
            btn.addEventListener('click', () => {
                const { state, env } = store.get();
                popover.open(btn, def.spec(state, env, scheduled(state, env)));
            });
            container.appendChild(btn);
            updaters.push((r, s, env, sched) => { btn.textContent = def.text(r, s, env, sched); });
        } else if (seg.dyn) {
            const span = document.createElement('span');
            container.appendChild(span);
            updaters.push((r, s, env, sched) => {
                const t = seg.dyn(r, s, env, sched);
                if (span.textContent !== t) span.textContent = t;
            });
        }
    }
    return (r, s, env, sched) => updaters.forEach(u => u(r, s, env, sched));
}

/* ---------- the document ---------- */

const FLOUR_LABELS = Object.fromEntries(
    Object.entries(model.FLOUR_TYPES).map(([k, v]) => [k, v.label.toLowerCase()]));

const updateLoaf = compile($('p-loaf'), [
    'I’m baking ', { token: 'loaves' }, ' of about ', { token: 'loafWeight' },
    { dyn: (r, s) => (s.numLoaves === 1 ? ' - ' : ' each - ') },
    { token: 'hydration' }, ' hydration, ', { token: 'starterPct' },
    ' ', { token: 'starterStyle' }, ' starter, ', { token: 'saltPct' },
    ' salt. I start ', { token: 'startTime' }, ' and the bread is ready ',
    { token: 'readyTime' }, '.',
]);

const updateFlour = compile($('p-flour'), [
    'The flour is ',
    { dyn: r => r.flourBreakdown
        .map(f => `${formatPct(f.pct)}% ${FLOUR_LABELS[f.key] || f.key}`)
        .join(r.flourBreakdown.length > 2 ? ', ' : ' and ') },
    { dyn: r => (r.wholeGrainPct > 0 ? ` - ${formatPct(r.wholeGrainPct)}% whole grain, which ferments a touch faster.` : '.') },
]);

const updateConditions = compile($('p-conditions'), [
    'My kitchen sits at ', { token: 'roomTemp' },
    ', my starter ', { token: 'starterFed' },
    ', and the shaped dough takes a ', { token: 'retard' },
    ' cold rest before baking.',
]);

const updateIngredients = compile($('p-ingredients'), [
    { dyn: r => {
        const { parts, total } = reconcileSum([
            { key: 'flour', value: r.flourToAdd },
            { key: 'water', value: r.waterToAdd },
            { key: 'starter', value: r.starterMass },
            { key: 'salt', value: r.salt },
        ]);
        const get = k => parts.find(p => p.key === k).value;
        const blend = r.flourBreakdown.length > 1
            ? ` (${r.flourBreakdown.map(f => `${displayGrams(f.added)} g ${FLOUR_LABELS[f.key] || f.key}`).join(', ')})`
            : '';
        return `That comes to ${get('flour')} g of flour${blend}, ${get('water')} g of water, `
            + `${get('starter')} g of ripe starter, and ${get('salt')} g of salt - ${total} g of dough. `
            + `The starter carries ${displayGrams(r.starterFlour)} g of that flour and ${displayGrams(r.starterWater)} g of the water, `
            + `so true hydration stays ${formatPct(r.hydration)}% (${formatPct(r.prefermentedFlourPct)}% of the flour is prefermented).`;
    } },
]);

const updatePerLoaf = compile($('p-perloaf'), [
    { dyn: (r, s) => (s.numLoaves > 1
        ? `Divided into ${numberWord(s.numLoaves)}, that’s ${displayGrams(r.weightPerLoaf)} g per loaf - each baking off to roughly ${displayGrams(r.bakedWeightPerLoaf)} g.`
        : `One loaf, baking off to roughly ${displayGrams(r.bakedWeightPerLoaf)} g.`) },
]);

/* ---------- schedule (rebuilds only when day-grouping changes) ---------- */

let scheduleSignature = '';

function renderSchedule(sched) {
    const container = $('schedule');
    const groups = [];
    for (const step of sched) {
        const key = dayFull.format(step.start);
        if (!groups.length || groups[groups.length - 1].key !== key) {
            groups.push({ key, steps: [] });
        }
        groups[groups.length - 1].steps.push(step);
    }

    const signature = groups.map(g => `${g.key}:${g.steps.length}`).join('|');
    if (signature !== scheduleSignature) {
        scheduleSignature = signature;
        container.innerHTML = '';
        for (const group of groups) {
            container.appendChild(el('span', { class: 'smallcaps day-head' }, group.key));
            for (const step of group.steps) {
                container.appendChild(el('p', { class: 'sched-line' },
                    el('span', { class: 'sched-time' }, ''),
                    el('strong', {}, ''), ' - ',
                    el('span', {}, '')));
            }
        }
    }

    // In-place text refresh
    const heads = container.querySelectorAll('.day-head');
    const lines = container.querySelectorAll('.sched-line');
    let li = 0;
    groups.forEach((group, gi) => {
        heads[gi].textContent = group.key;
        for (const step of group.steps) {
            const line = lines[li++];
            line.querySelector('.sched-time').textContent = timeName.format(step.start);
            line.querySelector('strong').textContent = step.label;
            line.querySelector('span:last-child').textContent = step.description;
        }
    });
}

/* ---------- render ---------- */

function render(state, env) {
    const recipe = model.derive(state);
    const sched = scheduled(state, env);
    updateLoaf(recipe, state, env, sched);
    updateFlour(recipe, state, env, sched);
    updateConditions(recipe, state, env, sched);
    updateIngredients(recipe, state, env, sched);
    updatePerLoaf(recipe, state, env, sched);
    renderSchedule(sched);
}

$('print-link').addEventListener('click', e => {
    e.preventDefault();
    window.print();
});

addEventListener('hashchange', () => {
    const fresh = loadFromHash();
    store.apply(() => fresh.state);
    store.setEnv(fresh.env);
});

store.rerender();
