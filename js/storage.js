/**
 * storage.js — LocalStorage persistence for saved formulas.
 * Migrates data from the previous app versions: both the old key names
 * (sourdough_* → dough_formulator_*) and the old recipe shape
 * ({doughWeight, flourWeight, starter:{amount,unit}, flourBlend:[{type,percentage}]})
 * into the new canonical model State.
 */
import { sanitizeState } from './model.js';

const KEY = 'dough_formulator_recipes_v2';
const LEGACY_KEYS = ['dough_formulator_recipes', 'sourdough_recipes'];

/** Convert an old-format saved recipe's settings into a model State. */
function migrateLegacySettings(old) {
    if (!old || typeof old !== 'object') return null;
    const flourTotal = Number(old.flourWeight) || 1000;
    const starterHyd = Number(old.starter?.hydration) || 100;
    let starterPct = 20;
    if (old.starter) {
        starterPct = old.starter.unit === 'grams'
            ? (Number(old.starter.amount) / flourTotal) * 100
            : Number(old.starter.amount);
    }
    return sanitizeState({
        flourTotal,
        hydration: Number(old.hydration),
        saltPct: Number(old.salt),
        starter: { pct: starterPct, hydration: starterHyd },
        flours: Array.isArray(old.flourBlend)
            ? old.flourBlend.map(f => ({ key: f.type, pct: Number(f.percentage) }))
            : [],
    });
}

function readStore() {
    try {
        const json = localStorage.getItem(KEY);
        return json ? JSON.parse(json) : null;
    } catch {
        return null;
    }
}

function writeStore(store) {
    localStorage.setItem(KEY, JSON.stringify(store));
}

/** One-time migration of legacy saves into the v2 store. */
function migrate() {
    const store = {};
    for (const legacyKey of LEGACY_KEYS) {
        try {
            const json = localStorage.getItem(legacyKey);
            if (!json) continue;
            const legacy = JSON.parse(json);
            for (const [id, entry] of Object.entries(legacy)) {
                if (store[id]) continue;
                // Old app saved { name, notes, date, recipe: { settings, recipe, timeline } }
                const state = migrateLegacySettings(entry.recipe?.settings || entry.settings || entry.recipe);
                if (!state) continue;
                store[id] = {
                    id,
                    name: entry.name || 'Migrated formula',
                    notes: entry.notes || '',
                    date: entry.date || new Date().toISOString(),
                    state,
                };
            }
        } catch {
            // Ignore unparseable legacy data
        }
    }
    writeStore(store);
    return store;
}

function getStore() {
    return readStore() ?? migrate();
}

/** List all saved formulas, newest first. */
export function listFormulas() {
    return Object.values(getStore())
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/** Save a formula (canonical State). Returns its id. */
export function saveFormula(state, name, notes = '') {
    const store = getStore();
    const id = 'f_' + Date.now().toString(36) + '_' + Object.keys(store).length;
    store[id] = { id, name, notes, date: new Date().toISOString(), state };
    writeStore(store);
    return id;
}

export function loadFormula(id) {
    const entry = getStore()[id];
    if (!entry) return null;
    const state = sanitizeState(entry.state);
    return state ? { ...entry, state } : null;
}

export function deleteFormula(id) {
    const store = getStore();
    if (!store[id]) return false;
    delete store[id];
    writeStore(store);
    return true;
}

/** Export all formulas as a pretty JSON string. */
export function exportFormulas() {
    return JSON.stringify(getStore(), null, 2);
}

/**
 * Import formulas from JSON. merge=false replaces everything.
 * Returns the number imported; throws on unparseable input.
 */
export function importFormulas(jsonData, merge = true) {
    const imported = JSON.parse(jsonData);
    if (!imported || typeof imported !== 'object') {
        throw new Error('Invalid formula file');
    }
    const store = merge ? getStore() : {};
    let count = 0;
    for (const [id, entry] of Object.entries(imported)) {
        const state = sanitizeState(entry?.state) || migrateLegacySettings(entry?.recipe?.settings || entry?.recipe);
        if (!state || !entry.name) continue;
        store[id] = {
            id,
            name: entry.name,
            notes: entry.notes || '',
            date: entry.date || new Date().toISOString(),
            state,
        };
        count++;
    }
    writeStore(store);
    return count;
}
