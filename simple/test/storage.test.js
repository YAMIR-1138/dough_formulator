const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Minimal localStorage stand-in for Node
class MemoryStorage {
    constructor() { this.map = new Map(); }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(k, String(v)); }
    removeItem(k) { this.map.delete(k); }
    clear() { this.map.clear(); }
}
global.localStorage = new MemoryStorage();

const RecipeStore = require('../js/storage.js');

beforeEach(() => localStorage.clear());

test('save, get, update, list, remove', () => {
    const store = new RecipeStore();
    const id = store.save({ state: { flour: 500 } }, 'Loaf A', 'note');
    assert.ok(id);
    assert.equal(store.get(id).name, 'Loaf A');
    assert.equal(store.update(id, { state: { flour: 600 } }, 'Loaf A2', ''), true);
    assert.equal(store.get(id).data.state.flour, 600);
    assert.equal(store.list().length, 1);
    assert.equal(store.remove(id), true);
    assert.equal(store.get(id), null);
    assert.equal(store.update('nope', {}, 'x'), false);
});

test('list is newest first', () => {
    const store = new RecipeStore();
    const a = store.save({ state: {} }, 'A');
    const all = JSON.parse(localStorage.getItem('dough_formulator_simple_recipes'));
    all[a].date = '2020-01-01T00:00:00.000Z';
    localStorage.setItem('dough_formulator_simple_recipes', JSON.stringify(all));
    store.save({ state: {} }, 'B');
    assert.deepEqual(store.list().map((r) => r.name), ['B', 'A']);
});

test('export / import round-trip and import validation', () => {
    const store = new RecipeStore();
    store.save({ state: { flour: 500 } }, 'A');
    const json = store.exportJSON();
    localStorage.clear();

    const fresh = new RecipeStore();
    assert.equal(fresh.importJSON(json), 1);
    assert.equal(fresh.list()[0].name, 'A');

    assert.equal(fresh.importJSON('{"x": {"name": "no data"}, "y": 5}'), 0);
    assert.throws(() => fresh.importJSON('"just a string"'));
    assert.throws(() => fresh.importJSON('not json'));
});

test('recipes saved by the original app are migrated (starter flour removed from flour)', () => {
    localStorage.setItem('dough_formulator_recipes', JSON.stringify({
        recipe_1: {
            id: 'recipe_1',
            name: 'Old Tartine',
            notes: 'legacy',
            date: '2024-05-01T00:00:00.000Z',
            recipe: {
                settings: {
                    flourWeight: 1000,
                    hydration: 75,
                    starter: { amount: 200, unit: 'grams', hydration: 100 },
                    salt: 2,
                    flourBlend: [{ type: 'bread', percentage: 90 }, { type: 'wholeWheat', percentage: 10 }]
                }
            }
        }
    }));

    const store = new RecipeStore();
    const list = store.list();
    assert.equal(list.length, 1);
    const s = list[0].data.state;
    assert.equal(list[0].name, 'Old Tartine');
    assert.equal(s.flour, 900);          // 1000 total − 100g of flour in the 200g starter
    assert.equal(s.starter, 200);
    assert.equal(s.hydration, 75);
    assert.equal(s.saltPct, 2);
    assert.equal(s.useTwoFlours, true);
    assert.equal(s.mainFlourPct, 90);
});

test('legacy percentage starters are converted to grams', () => {
    localStorage.setItem('dough_formulator_recipes', JSON.stringify({
        r: { name: 'Pct', recipe: { settings: { flourWeight: 500, hydration: 70, starter: { amount: 20, unit: 'percentage', hydration: 100 }, salt: 2 } } }
    }));
    const s = new RecipeStore().list()[0].data.state;
    assert.equal(s.starter, 100);  // 20% of 500
    assert.equal(s.flour, 450);    // 500 − 50g starter flour
});
