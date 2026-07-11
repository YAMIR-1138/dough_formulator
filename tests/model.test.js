import { test, eq, close, deepEq, ok } from './assert.js';
import {
    defaultState, derive, setHydration, setSalt, setStarterPercent,
    setStarterGrams, setStarterHydration, setFlourTotal, scaleToDoughWeight,
    setPinFlour, setFlourBlend, normalizeFlours, sanitizeState,
} from '../js/model.js';
import { reconcileSum, displayGrams } from '../js/format.js';

test('Tartine derive: all core numbers', () => {
    const r = derive(defaultState());
    close(r.starterMass, 200, 1e-9, 'starter mass');
    close(r.starterFlour, 100, 1e-9, 'starter flour');
    close(r.starterWater, 100, 1e-9, 'starter water');
    close(r.totalWater, 750, 1e-9, 'total water');
    close(r.salt, 20, 1e-9, 'salt');
    close(r.flourToAdd, 900, 1e-9, 'flour to add');
    close(r.waterToAdd, 650, 1e-9, 'water to add');
    close(r.doughWeight, 1770, 1e-9, 'dough weight');
    close(r.prefermentedFlourPct, 10, 1e-9, 'PFF%');
    close(r.wholeGrainPct, 10, 1e-9, 'whole grain %');
});

test('Stiff starter @60% hydration splits correctly', () => {
    const s = setStarterHydration(defaultState(), 60);
    const r = derive(s);
    close(r.starterMass, 200, 1e-9, 'starter mass');
    close(r.starterFlour, 125, 1e-9, 'starter flour');
    close(r.starterWater, 75, 1e-9, 'starter water');
    close(r.flourToAdd, 875, 1e-9, 'flour to add');
    close(r.waterToAdd, 675, 1e-9, 'water to add');
    close(r.hydration, 75, 1e-9, 'overall hydration unchanged');
    close(r.doughWeight, 1770, 1e-9, 'dough weight unchanged by starter hydration');
});

test('Starter grams ↔ percent round-trip', () => {
    const s = setStarterGrams(defaultState(), 200);
    close(s.starter.pct, 20, 1e-9, 'grams → pct');
    const r = derive(s);
    close(r.starterMass, 200, 1e-9, 'pct → grams');
    const s2 = setStarterGrams(s, 350);
    close(derive(s2).starterMass, 350, 1e-9, 'grams round-trip at new value');
});

test('scaleToDoughWeight (default): rescales, preserves percentages', () => {
    const s = scaleToDoughWeight(defaultState(), 1000);
    close(s.flourTotal, 1000 / 1.77, 0.01, 'flour back-solved');
    const r = derive(s);
    close(r.doughWeight, 1000, 1e-9, 'hits target');
    close(r.hydration, 75, 1e-9, 'hydration preserved');
    close(r.saltPct, 2, 1e-9, 'salt preserved');
    close(r.starterPct, 20, 1e-9, 'starter % preserved');
});

test('scaleToDoughWeight with pinFlour: back-solves hydration', () => {
    const s = scaleToDoughWeight(setPinFlour(defaultState(), true), 2000);
    close(s.flourTotal, 1000, 1e-9, 'flour pinned');
    close(s.hydration, 98, 1e-9, 'hydration = (2000/1000 - 1 - 0.02) * 100');
    close(derive(s).doughWeight, 2000, 1e-9, 'hits target');
});

test('Salt is % of TOTAL flour including starter flour', () => {
    // 500g flour total, 50% starter (250g mass @100% = 125g starter flour).
    // Added flour is only 375g; salt must still be 2% of 500 = 10g, not 7.5g.
    let s = setFlourTotal(defaultState(), 500);
    s = setStarterPercent(s, 50);
    const r = derive(s);
    close(r.flourToAdd, 375, 1e-9, 'added flour');
    close(r.salt, 10, 1e-9, 'salt over total flour');
});

test('setFlourTotal is a pure scale', () => {
    const a = derive(defaultState());
    const b = derive(setFlourTotal(defaultState(), 2000));
    close(b.doughWeight, a.doughWeight * 2, 1e-9, 'dough scales');
    close(b.starterMass, a.starterMass * 2, 1e-9, 'starter scales');
    close(b.waterToAdd, a.waterToAdd * 2, 1e-9, 'water scales');
    close(b.salt, a.salt * 2, 1e-9, 'salt scales');
    close(b.hydration, a.hydration, 1e-9, 'hydration % unchanged');
    close(b.prefermentedFlourPct, a.prefermentedFlourPct, 1e-9, 'PFF % unchanged');
});

test('Hydration edit changes only water-driven values', () => {
    const s = setHydration(defaultState(), 80);
    const r = derive(s);
    close(r.totalWater, 800, 1e-9, 'total water');
    close(r.waterToAdd, 700, 1e-9, 'water to add');
    close(r.doughWeight, 1820, 1e-9, 'dough weight');
    close(r.flourToAdd, 900, 1e-9, 'flour untouched');
    close(r.starterMass, 200, 1e-9, 'starter untouched');
});

test('Flour blend normalization', () => {
    const flours = normalizeFlours([{ key: 'bread', pct: 3 }, { key: 'wholeWheat', pct: 1 }]);
    close(flours[0].pct, 75, 1e-9, 'bread normalized');
    close(flours[1].pct, 25, 1e-9, 'ww normalized');
    const r = derive(setFlourBlend(defaultState(), flours));
    const sum = r.flourBreakdown.reduce((acc, f) => acc + f.total, 0);
    close(sum, r.flourTotal, 1e-9, 'breakdown totals sum to flourTotal');
    close(r.wholeGrainPct, 25, 1e-9, 'whole grain %');
});

test('Blend breakdown: starter flour comes out of first component', () => {
    const r = derive(defaultState());
    const bread = r.flourBreakdown.find(f => f.key === 'bread');
    const ww = r.flourBreakdown.find(f => f.key === 'wholeWheat');
    close(bread.total, 900, 1e-9, 'bread total');
    close(bread.added, 800, 1e-9, 'bread added = 900 - 100 starter flour');
    close(ww.added, 100, 1e-9, 'ww added untouched');
    const addedSum = r.flourBreakdown.reduce((acc, f) => acc + f.added, 0);
    close(addedSum, r.flourToAdd, 1e-9, 'added breakdown sums to flourToAdd');
});

test('Rounding reconciliation: displayed lines sum to displayed total (fuzz)', () => {
    // Deterministic pseudo-random fuzz (no Math.random in this environment)
    let seed = 42;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 200; i++) {
        let s = defaultState();
        s = setFlourTotal(s, 100 + rand() * 4900);
        s = setHydration(s, 50 + rand() * 60);
        s = setSalt(s, rand() * 4);
        s = setStarterPercent(s, 5 + rand() * 45);
        s = setStarterHydration(s, 50 + rand() * 100);
        const r = derive(s);
        const { parts, total } = reconcileSum([
            { key: 'flour', value: r.flourToAdd },
            { key: 'water', value: r.waterToAdd },
            { key: 'starter', value: r.starterMass },
            { key: 'salt', value: r.salt },
        ]);
        const sum = Math.round(parts.reduce((acc, p) => acc + p.value, 0) * 10) / 10;
        close(sum, total, 1e-9, `fuzz #${i}: lines sum to total`);
    }
});

test('sanitizeState: accepts valid, repairs invalid, rejects garbage', () => {
    eq(sanitizeState(null), null, 'null rejected');
    eq(sanitizeState('x'), null, 'string rejected');
    const d = defaultState();
    deepEq(sanitizeState(d), d, 'default round-trips');
    const repaired = sanitizeState({ flourTotal: 'NaN', hydration: 500, flours: [{ key: 'plutonium', pct: 100 }] });
    close(repaired.flourTotal, 1000, 1e-9, 'bad flour falls back');
    close(repaired.hydration, 120, 1e-9, 'hydration clamped to max');
    eq(repaired.flours[0].key, 'bread', 'unknown flour type dropped, default blend used');
});

test('displayGrams precision switches at 50g', () => {
    eq(displayGrams(20.34), 20.3, 'small amounts get 0.1g');
    eq(displayGrams(650.4), 650, 'large amounts get 1g');
});
