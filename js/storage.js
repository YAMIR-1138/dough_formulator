/**
 * DOUGH_FORMULATOR - Recipe store (localStorage)
 *
 * Saved shape: { id, name, notes, date, data: { state, results? } }
 * Recipes saved by the original version of the app are migrated automatically.
 */
(function (root) {
    'use strict';

    const KEY = 'dough_formulator_recipes_v2';
    const LEGACY_KEYS = ['dough_formulator_recipes', 'sourdough_recipes'];

    function readJSON(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function isObject(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function newId() {
        return 'recipe_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    }

    /**
     * Convert a recipe saved by the original app. That version counted starter
     * flour inside "flour weight", so we subtract it to get flour-to-add.
     */
    function convertLegacy(entry) {
        const st = entry && entry.recipe && (entry.recipe.settings || entry.recipe);
        if (!isObject(st) || typeof st.flourWeight !== 'number') return null;

        const starterCfg = isObject(st.starter) ? st.starter : {};
        const starterHydration = typeof starterCfg.hydration === 'number' ? starterCfg.hydration : 100;
        const amount = typeof starterCfg.amount === 'number' ? starterCfg.amount : 0;
        const starter = starterCfg.unit === 'percentage' ? st.flourWeight * amount / 100 : amount;
        const starterFlour = starter / (1 + starterHydration / 100);

        const state = {
            flour: Math.round(st.flourWeight - starterFlour),
            hydration: typeof st.hydration === 'number' ? st.hydration : 75,
            starter: Math.round(starter),
            starterHydration,
            saltPct: typeof st.salt === 'number' ? st.salt : 2
        };
        if (Array.isArray(st.flourBlend) && st.flourBlend.length >= 2) {
            state.useTwoFlours = true;
            state.mainFlourPct = Math.round(Number(st.flourBlend[0].percentage) || 80);
        }

        return {
            id: entry.id || newId(),
            name: String(entry.name || 'Imported recipe'),
            notes: String(entry.notes || ''),
            date: entry.date || new Date().toISOString(),
            data: { state }
        };
    }

    /** Validate/normalise an entry from an import file (current or legacy format). */
    function normalize(id, entry) {
        if (!isObject(entry)) return null;
        if (isObject(entry.data) && isObject(entry.data.state)) {
            return {
                id: String(entry.id || id),
                name: String(entry.name || 'Untitled'),
                notes: String(entry.notes || ''),
                date: entry.date || new Date().toISOString(),
                data: { state: entry.data.state }
            };
        }
        return convertLegacy({ ...entry, id: entry.id || id });
    }

    class RecipeStore {
        constructor() {
            this._migrateLegacy();
        }

        _all() {
            const all = readJSON(KEY);
            return isObject(all) ? all : {};
        }

        _write(all) {
            try {
                localStorage.setItem(KEY, JSON.stringify(all));
                return true;
            } catch (e) {
                return false;
            }
        }

        _migrateLegacy() {
            if (readJSON(KEY)) return;
            for (const key of LEGACY_KEYS) {
                const old = readJSON(key);
                if (!isObject(old)) continue;
                const converted = {};
                for (const [id, entry] of Object.entries(old)) {
                    const rec = convertLegacy({ ...entry, id });
                    if (rec) converted[rec.id] = rec;
                }
                if (Object.keys(converted).length) {
                    this._write(converted);
                    return;
                }
            }
        }

        /** @returns {string|null} new id, or null if storage is unavailable */
        save(data, name, notes = '') {
            const all = this._all();
            const id = newId();
            all[id] = { id, name, notes, date: new Date().toISOString(), data };
            return this._write(all) ? id : null;
        }

        update(id, data, name, notes = '') {
            const all = this._all();
            if (!all[id]) return false;
            all[id] = { ...all[id], name, notes, data, date: new Date().toISOString() };
            return this._write(all);
        }

        get(id) {
            return this._all()[id] || null;
        }

        remove(id) {
            const all = this._all();
            if (!all[id]) return false;
            delete all[id];
            return this._write(all);
        }

        /** Newest first. */
        list() {
            return Object.values(this._all()).sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        exportJSON() {
            return JSON.stringify(this._all(), null, 2);
        }

        /** Merge recipes from an export file. @returns number imported */
        importJSON(json) {
            const parsed = JSON.parse(json);
            let entries;
            if (Array.isArray(parsed)) entries = parsed.map((e, i) => [(e && e.id) || 'recipe_import_' + i, e]);
            else if (isObject(parsed)) entries = Object.entries(parsed);
            else throw new Error('Unrecognised file');

            const all = this._all();
            let count = 0;
            for (const [id, entry] of entries) {
                const rec = normalize(id, entry);
                if (rec) {
                    all[rec.id] = rec;
                    count++;
                }
            }
            if (count && !this._write(all)) throw new Error('Storage unavailable');
            return count;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = RecipeStore;
    } else {
        root.RecipeStore = RecipeStore;
    }
})(typeof window !== 'undefined' ? window : globalThis);
