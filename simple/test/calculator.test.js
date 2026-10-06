const { test } = require('node:test');
const assert = require('node:assert/strict');
const DoughCalculator = require('../js/calculator.js');

// Known-good numbers taken from a reference recipe ("big 2 breads 80 20")
const REFERENCE = {
    flour: 700,
    hydration: 75,
    starter: 150,
    starterHydration: 100,
    saltPct: 2.5,
    numLoaves: 2,
    useTwoFlours: true,
    mainFlourPct: 80
};

function fresh(state = REFERENCE) {
    const c = new DoughCalculator();
    c.load({ state });
    return c;
}

test('reference recipe matches the known-good numbers', () => {
    const r = fresh().getResults();
    assert.equal(r.flour, 700);
    assert.equal(r.totalFlour, 775);     // 700 + 75g of flour in the starter
    assert.equal(r.water, 506);          // 775 × 0.75 − 75g of water in the starter
    assert.equal(r.salt, 19.4);          // 775 × 2.5%
    assert.equal(r.totalDough, 1375);
    assert.equal(r.loafWeight, 688);
    assert.equal(r.starterPctOfFlour, 21.4);
    assert.equal(r.starterPctOfDough, 10.9);
    assert.equal(r.mainFlour, 560);
    assert.equal(r.secondFlour, 140);
    assert.equal(r.starterTooWet, false);
});

test('displayed ingredients always add up to the displayed total', () => {
    const combos = [
        { flour: 500, hydration: 68, starter: 100, starterHydration: 100, saltPct: 2 },
        { flour: 1234, hydration: 82.5, starter: 275, starterHydration: 80, saltPct: 1.9 },
        { flour: 333, hydration: 90, starter: 33, starterHydration: 125, saltPct: 2.2 }
    ];
    for (const combo of combos) {
        const r = fresh(combo).getResults();
        const sum = r.flour + r.water + r.starter + r.salt;
        assert.ok(Math.abs(sum - r.totalDough) < 0.5, `${JSON.stringify(combo)}: ${sum} vs ${r.totalDough}`);
    }
});

test('starter hydration changes the flour/water split of the starter', () => {
    const r = fresh({ flour: 500, starter: 100, starterHydration: 50 }).getResults();
    assert.equal(r.starterFlour, 67);
    assert.equal(r.starterWater, 33);
});

test('two-flour split is only applied to the flour you add', () => {
    const r = fresh({ flour: 1000, useTwoFlours: true, mainFlourPct: 90 }).getResults();
    assert.equal(r.mainFlour, 900);
    assert.equal(r.secondFlour, 100);
    const single = fresh({ flour: 1000, useTwoFlours: false }).getResults();
    assert.equal(single.mainFlour, 1000);
    assert.equal(single.secondFlour, 0);
});

test('setTotalDough scales flour and starter together and lands within 1g', () => {
    const c = fresh();
    const before = c.getResults();
    c.setTotalDough(2000);
    const r = c.getResults();
    assert.ok(Math.abs(r.totalDough - 2000) <= 1, `got ${r.totalDough}`);
    assert.ok(Math.abs(r.starterPctOfFlour - before.starterPctOfFlour) < 0.5, 'starter ratio preserved');
    assert.equal(c.getState().hydration, 75, 'hydration untouched');
});

test('setLoafWeight scales to loaves × weight', () => {
    const c = fresh();
    c.setLoafWeight(900);
    const r = c.getResults();
    assert.ok(Math.abs(r.totalDough - 1800) <= 1, `got ${r.totalDough}`);
    assert.ok(Math.abs(r.loafWeight - 900) <= 1, `got ${r.loafWeight}`);
});

test('without keepLoafWeight, changing loaf count only changes loaf weight', () => {
    const c = fresh();
    c.setNumLoaves(4);
    const r = c.getResults();
    assert.equal(r.totalDough, 1375);
    assert.equal(r.loafWeight, 344);
});

test('with keepLoafWeight, changing loaf count scales the recipe', () => {
    const c = fresh();
    c.set('keepLoafWeight', true);
    c.setNumLoaves(4);
    const r = c.getResults();
    assert.ok(Math.abs(r.loafWeight - 688) <= 1, `loaf ${r.loafWeight}`);
    assert.ok(Math.abs(r.totalDough - 2752) <= 2, `total ${r.totalDough}`);
});

test('warns when the starter brings more water than the hydration allows', () => {
    const r = fresh({ flour: 300, starter: 400, starterHydration: 100, hydration: 30 }).getResults();
    assert.equal(r.starterTooWet, true);
    assert.ok(r.water < 0);
});

test('inputs are clamped and rounded', () => {
    const c = new DoughCalculator();
    c.set('hydration', 999);
    assert.equal(c.getState().hydration, 250);
    c.set('flour', -5);
    assert.equal(c.getState().flour, 10);
    c.set('saltPct', 2.123);
    assert.equal(c.getState().saltPct, 2.1);
    c.set('numLoaves', 2.7);
    assert.equal(c.getState().numLoaves, 3);
    c.set('starter', '120');
    assert.equal(c.getState().starter, 120);
});

test('junk values are ignored and unknown keys are not added', () => {
    const c = new DoughCalculator();
    c.set('flour', 'abc');
    c.set('flour', null);
    c.set('flour', '');
    c.set('bogus', 1);
    assert.equal(c.getState().flour, 700);
    assert.equal('bogus' in c.getState(), false);
});

test('temperature unit toggle converts both temps and snaps to 5°', () => {
    const c = new DoughCalculator();
    assert.equal(c.toggleTempUnit(), 'C');
    assert.equal(c.getState().bakeTemp1, 230); // 450°F = 232°C
    assert.equal(c.getState().bakeTemp2, 220); // 425°F = 218°C
    assert.equal(c.toggleTempUnit(), 'F');
    assert.equal(c.getState().bakeTemp1, 445);
    assert.equal(c.getState().bakeTemp2, 430);
});

test('load falls back to defaults for missing or invalid fields', () => {
    const c = new DoughCalculator();
    c.load({ state: { flour: 'abc', hydration: null, tempUnit: 'K', saltPct: 3, bogus: 1 } });
    const s = c.getState();
    assert.equal(s.flour, 700);
    assert.equal(s.hydration, 75);
    assert.equal(s.tempUnit, 'F');
    assert.equal(s.saltPct, 3);
    assert.equal('bogus' in s, false);
    c.load(null);
    assert.equal(c.getState().flour, 700);
});

test('load accepts a bare state object and honours tempUnit before temps', () => {
    const c = new DoughCalculator();
    c.load({ tempUnit: 'C', bakeTemp1: 240, bakeTemp2: 210 });
    assert.equal(c.getState().tempUnit, 'C');
    assert.equal(c.getState().bakeTemp1, 240);
    assert.equal(c.getState().bakeTemp2, 210);
});

test('exportRecipe round-trips through load', () => {
    const c = fresh();
    c.set('saltPct', 2.2);
    const saved = JSON.parse(JSON.stringify(c.exportRecipe()));
    const d = new DoughCalculator();
    d.load(saved);
    assert.deepEqual(d.getState(), c.getState());
    assert.deepEqual(d.getResults(), c.getResults());
});
