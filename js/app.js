/**
 * DOUGH_FORMULATOR - App
 * Wires the UI to the calculator and the recipe store.
 */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    const calculator = new DoughCalculator();
    const scratch = new DoughCalculator(); // used to summarise saved recipes
    const store = new RecipeStore();

    const DRAFT_KEY = 'dough_formulator_draft';
    const THEME_KEY = 'dough_formulator_theme';

    /** Slider/stepper fields: element id -> calculator key + display format */
    const FIELDS = {
        'flour':             { key: 'flour',            unit: 'g' },
        'hydration':         { key: 'hydration',        unit: '%' },
        'starter':           { key: 'starter',          unit: 'g' },
        'starter-hydration': { key: 'starterHydration', unit: '%' },
        'salt-pct':          { key: 'saltPct',          unit: '%', decimals: 1 },
        'main-flour-pct':    { key: 'mainFlourPct',     unit: '%' },
        'num-loaves':        { key: 'numLoaves',        unit: '' },
        'bake-temp-1':       { key: 'bakeTemp1',        temp: true },
        'bake-time-1':       { key: 'bakeTime1',        unit: ' min' },
        'bake-temp-2':       { key: 'bakeTemp2',        temp: true },
        'bake-time-2':       { key: 'bakeTime2',        unit: ' min' }
    };

    /** Slider ranges for the two temperature units */
    const TEMP_RANGES = { F: { min: 350, max: 550 }, C: { min: 175, max: 290 } };

    /** The saved recipe currently open (if any) plus a snapshot to detect edits */
    let openRecipe = { id: null, snapshot: null };

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        initTheme();
        initSliders();
        initSteppers();
        initValueEditing();
        initToggles();
        initRecipeMeta();
        initActions();
        initModal();
        initSavedRecipes();

        restoreDraft();
        render();
        renderSavedRecipes();
        registerServiceWorker();
    }

    /* ---------------- Theme ---------------- */

    function initTheme() {
        $('theme-toggle').addEventListener('click', () => {
            const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
        });
    }

    /* ---------------- Inputs ---------------- */

    function initSliders() {
        for (const id of Object.keys(FIELDS)) {
            const slider = $(id);
            if (slider) slider.addEventListener('input', () => applyField(id, parseFloat(slider.value)));
        }
    }

    /** +/- buttons: tap to step once, hold to repeat. */
    function initSteppers() {
        document.querySelectorAll('.adjust-btn').forEach((btn) => {
            const fieldId = btn.dataset.target;
            const delta = parseFloat(btn.dataset.delta);
            let delay = null;
            let repeat = null;

            const step = () => applyField(fieldId, currentValue(fieldId) + delta);
            const stop = () => {
                clearTimeout(delay);
                clearInterval(repeat);
                delay = repeat = null;
                btn.classList.remove('pressed');
            };

            btn.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                btn.classList.add('pressed');
                step();
                delay = setTimeout(() => { repeat = setInterval(step, 80); }, 400);
            });
            ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, stop));
            // Keyboard activation arrives as a click with detail === 0; pointer clicks are handled above
            btn.addEventListener('click', (e) => { if (e.detail === 0) step(); });
        });
    }

    /** Tap any value pill to type a number. */
    function initValueEditing() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.value-btn');
            if (btn && !btn.classList.contains('editing')) startEdit(btn);
        });
    }

    function startEdit(btn) {
        const fieldId = btn.dataset.field;
        const input = document.createElement('input');
        input.type = 'number';
        input.inputMode = 'decimal';
        input.step = 'any';
        input.className = 'value-input';
        input.value = currentValue(fieldId);
        input.setAttribute('aria-label', btn.getAttribute('aria-label') || 'Value');

        btn.classList.add('editing', 'hidden');
        btn.after(input);
        input.focus();
        input.select();

        let finished = false;
        const finish = (apply) => {
            if (finished) return;
            finished = true;
            const v = parseFloat(input.value);
            input.remove();
            btn.classList.remove('editing', 'hidden');
            if (apply && Number.isFinite(v)) applyField(fieldId, v);
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        input.addEventListener('blur', () => finish(true));
    }

    function currentValue(fieldId) {
        const r = calculator.getResults();
        if (fieldId === 'total-dough') return r.totalDough;
        if (fieldId === 'loaf-weight') return r.loafWeight;
        return calculator.getState()[FIELDS[fieldId].key];
    }

    function applyField(fieldId, value) {
        if (!Number.isFinite(value)) return;
        if (fieldId === 'total-dough') calculator.setTotalDough(value);
        else if (fieldId === 'loaf-weight') calculator.setLoafWeight(value);
        else if (fieldId === 'num-loaves') calculator.setNumLoaves(value);
        else if (FIELDS[fieldId]) calculator.set(FIELDS[fieldId].key, value);
        else return;
        commit();
    }

    function commit() {
        render();
        saveDraft();
    }

    function initToggles() {
        $('two-flour-toggle').addEventListener('change', (e) => {
            calculator.set('useTwoFlours', e.target.checked);
            commit();
        });
        $('keep-loaf-toggle').addEventListener('change', (e) => {
            calculator.set('keepLoafWeight', e.target.checked);
            commit();
        });
        $('temp-unit-btn').addEventListener('click', () => {
            calculator.toggleTempUnit();
            commit();
        });
    }

    function initRecipeMeta() {
        const onEdit = () => { updateStatus(); saveDraft(); };
        $('recipe-name').addEventListener('input', onEdit);
        $('recipe-notes').addEventListener('input', onEdit);
    }

    /* ---------------- Rendering ---------------- */

    function render() {
        const s = calculator.getState();
        const r = calculator.getResults();

        // Temperature sliders need the right range before their values are set
        const range = TEMP_RANGES[s.tempUnit];
        for (const id of ['bake-temp-1', 'bake-temp-2']) {
            $(id).min = range.min;
            $(id).max = range.max;
        }
        setText('temp-unit-btn', `Switch to °${s.tempUnit === 'F' ? 'C' : 'F'}`);

        for (const [id, f] of Object.entries(FIELDS)) {
            const v = s[f.key];
            const slider = $(id);
            if (slider) slider.value = v;
            setText(`${id}-display`, formatField(f, v, s.tempUnit));
        }

        setText('total-flour-detail', `${r.totalFlour}g`);
        setText('water-detail', `${r.water}g`);
        setText('salt-detail', `${r.salt}g`);
        setText('starter-pcts', `${r.starterPctOfFlour}% of flour · ${r.starterPctOfDough}% of dough`);

        $('two-flour-toggle').checked = s.useTwoFlours;
        $('flour-blend-card').classList.toggle('hidden', !s.useTwoFlours);
        setText('main-flour-display', `${r.mainFlour}g`);
        setText('second-flour-display', `${r.secondFlour}g`);

        $('keep-loaf-toggle').checked = s.keepLoafWeight;

        setText('total-dough-display', `${r.totalDough}g`);
        setText('loaf-weight-display', `${r.loafWeight}g`);
        setText('loaf-count-label', `Loaf weight · ${s.numLoaves} ${s.numLoaves === 1 ? 'loaf' : 'loaves'}`);

        $('result-flour').classList.toggle('hidden', s.useTwoFlours);
        $('result-main-flour').classList.toggle('hidden', !s.useTwoFlours);
        $('result-second-flour').classList.toggle('hidden', !s.useTwoFlours);
        setText('result-flour-display', `${r.flour}g`);
        setText('result-main-flour-display', `${r.mainFlour}g`);
        setText('result-second-flour-display', `${r.secondFlour}g`);
        setText('result-water-display', `${r.water}g`);
        setText('result-starter-display', `${r.starter}g`);
        setText('result-salt-display', `${r.salt}g`);

        $('result-water-display').classList.toggle('negative', r.starterTooWet);
        $('water-detail').classList.toggle('negative', r.starterTooWet);
        $('water-warning').classList.toggle('hidden', !r.starterTooWet);

        setText('sum-flour', r.flour);
        setText('sum-water', r.water);
        setText('sum-starter', r.starter);
        setText('sum-salt', r.salt);
        setText('sum-total', r.totalDough);

        updateStatus();
    }

    function setText(id, text) {
        const node = $(id);
        if (node) node.textContent = text;
    }

    function formatField(f, v, tempUnit) {
        const n = f.decimals !== undefined
            ? v.toFixed(f.decimals)
            : (Number.isInteger(v) ? String(v) : v.toFixed(1));
        return f.temp ? `${n}°${tempUnit}` : `${n}${f.unit}`;
    }

    /* ---------------- Saved / Modified status ---------------- */

    function snapshotOf(state, name, notes) {
        return JSON.stringify({ state, name: name.trim(), notes: notes.trim() });
    }

    function currentSnapshot() {
        return snapshotOf(calculator.getState(), $('recipe-name').value, $('recipe-notes').value);
    }

    function snapshotOfSaved(rec) {
        scratch.load(rec.data);
        return snapshotOf(scratch.getState(), rec.name || '', rec.notes || '');
    }

    function isModified() {
        return openRecipe.id !== null && currentSnapshot() !== openRecipe.snapshot;
    }

    function updateStatus() {
        let label = 'Unsaved';
        if (openRecipe.id) label = isModified() ? 'Modified' : 'Saved';
        const badge = $('recipe-status');
        badge.textContent = label;
        badge.dataset.state = label.toLowerCase();
    }

    /* ---------------- Actions ---------------- */

    function initActions() {
        $('save-btn').addEventListener('click', openSaveModal);
        $('copy-btn').addEventListener('click', copyRecipe);
        $('new-btn').addEventListener('click', newRecipe);
        $('export-btn').addEventListener('click', exportRecipes);
        $('import-input').addEventListener('change', importRecipes);
    }

    function newRecipe() {
        if (!confirm('Start a new recipe? Current values will reset to defaults.')) return;
        calculator.reset();
        $('recipe-name').value = 'My Sourdough';
        $('recipe-notes').value = '';
        openRecipe = { id: null, snapshot: null };
        render();
        saveDraft(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ---------------- Save modal ---------------- */

    function openSaveModal() {
        const editing = Boolean(openRecipe.id && store.get(openRecipe.id));
        if (!editing) openRecipe = { id: null, snapshot: null };

        $('save-recipe-name').value = $('recipe-name').value.trim();
        setText('save-confirm', editing ? 'Update' : 'Save');
        $('save-as-new').classList.toggle('hidden', !editing);
        $('save-modal').classList.add('active');
        $('save-recipe-name').focus();
        $('save-recipe-name').select();
    }

    function closeSaveModal() {
        $('save-modal').classList.remove('active');
    }

    function initModal() {
        $('save-confirm').addEventListener('click', () => saveRecipe(Boolean(openRecipe.id)));
        $('save-as-new').addEventListener('click', () => saveRecipe(false));
        $('save-cancel').addEventListener('click', closeSaveModal);
        $('save-modal').addEventListener('click', (e) => {
            if (e.target === $('save-modal')) closeSaveModal();
        });
        $('save-recipe-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); $('save-confirm').click(); }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && $('save-modal').classList.contains('active')) closeSaveModal();
        });
    }

    function saveRecipe(asUpdate) {
        const name = $('save-recipe-name').value.trim() || 'Untitled';
        const notes = $('recipe-notes').value;
        const data = calculator.exportRecipe();

        let id = null;
        if (asUpdate && openRecipe.id && store.update(openRecipe.id, data, name, notes)) id = openRecipe.id;
        if (!id) id = store.save(data, name, notes);
        if (!id) {
            toast('Could not save — browser storage is unavailable');
            return;
        }

        $('recipe-name').value = name;
        openRecipe = { id, snapshot: snapshotOfSaved(store.get(id)) };
        closeSaveModal();
        renderSavedRecipes();
        updateStatus();
        saveDraft(true);
        toast(asUpdate ? 'Recipe updated' : 'Recipe saved');
    }

    /* ---------------- Saved recipes ---------------- */

    function initSavedRecipes() {
        const list = $('saved-recipes-list');
        list.addEventListener('click', (e) => {
            const item = e.target.closest('[data-id]');
            if (!item) return;
            if (e.target.closest('[data-action="delete"]')) deleteRecipe(item.dataset.id);
            else loadRecipe(item.dataset.id);
        });
        list.addEventListener('keydown', (e) => {
            const item = e.target.closest('[data-id]');
            if (item && e.target === item && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                loadRecipe(item.dataset.id);
            }
        });
    }

    function renderSavedRecipes() {
        const list = $('saved-recipes-list');
        const recipes = store.list();
        list.replaceChildren();

        if (recipes.length === 0) {
            list.append(el('p', 'empty-state', 'No saved recipes yet'));
            return;
        }

        for (const rec of recipes) {
            scratch.load(rec.data);
            const s = scratch.getState();
            const r = scratch.getResults();

            const item = el('div', 'saved-recipe-item');
            item.dataset.id = rec.id;
            item.setAttribute('role', 'button');
            item.tabIndex = 0;
            if (rec.id === openRecipe.id) item.classList.add('open');

            const info = el('div', 'saved-recipe-info');
            info.append(el('div', 'saved-recipe-name', rec.name || 'Untitled'));
            const date = rec.date ? new Date(rec.date).toLocaleDateString() : '';
            const loaves = `${s.numLoaves} ${s.numLoaves === 1 ? 'loaf' : 'loaves'}`;
            info.append(el('div', 'saved-recipe-meta', `${r.totalDough}g · ${s.hydration}% · ${loaves}${date ? ' · ' + date : ''}`));

            const del = el('button', 'delete-btn', '×');
            del.type = 'button';
            del.dataset.action = 'delete';
            del.setAttribute('aria-label', `Delete ${rec.name || 'recipe'}`);

            item.append(info, del);
            list.append(item);
        }
    }

    function loadRecipe(id) {
        const rec = store.get(id);
        if (!rec) {
            toast('Recipe not found');
            renderSavedRecipes();
            return;
        }
        calculator.load(rec.data);
        $('recipe-name').value = rec.name || 'Untitled';
        $('recipe-notes').value = rec.notes || '';
        openRecipe = { id, snapshot: snapshotOfSaved(rec) };
        render();
        saveDraft(true);
        renderSavedRecipes();
        toast(`Loaded "${rec.name}"`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function deleteRecipe(id) {
        const rec = store.get(id);
        if (!rec || !confirm(`Delete "${rec.name}"?`)) return;
        store.remove(id);
        if (openRecipe.id === id) openRecipe = { id: null, snapshot: null };
        renderSavedRecipes();
        updateStatus();
        saveDraft(true);
        toast('Recipe deleted');
    }

    /* ---------------- Copy / export / import ---------------- */

    function recipeText() {
        const s = calculator.getState();
        const r = calculator.getResults();
        const name = $('recipe-name').value.trim() || 'Sourdough';
        const notes = $('recipe-notes').value.trim();

        const lines = [name, '='.repeat(name.length), ''];
        lines.push(`Total dough: ${r.totalDough}g  (${s.numLoaves} × ${r.loafWeight}g)`);
        lines.push(`Hydration: ${s.hydration}%   Salt: ${s.saltPct}%`, '');
        lines.push('INGREDIENTS');
        if (s.useTwoFlours) {
            lines.push(`- Main flour: ${r.mainFlour}g (${s.mainFlourPct}%)`);
            lines.push(`- Second flour: ${r.secondFlour}g (${100 - s.mainFlourPct}%)`);
        } else {
            lines.push(`- Flour: ${r.flour}g`);
        }
        lines.push(`- Water: ${r.water}g`);
        lines.push(`- Starter: ${r.starter}g (${s.starterHydration}% hydration)`);
        lines.push(`- Salt: ${r.salt}g`, '');
        lines.push('BAKE');
        lines.push(`- ${s.bakeTemp1}°${s.tempUnit} for ${s.bakeTime1} min`);
        lines.push(`- ${s.bakeTemp2}°${s.tempUnit} for ${s.bakeTime2} min`);
        if (notes) lines.push('', 'NOTES', notes);
        return lines.join('\n');
    }

    async function copyRecipe() {
        const text = recipeText();
        try {
            if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
            else legacyCopy(text);
            toast('Copied to clipboard');
        } catch (e) {
            toast('Could not copy');
        }
    }

    function legacyCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (!ok) throw new Error('copy failed');
    }

    function exportRecipes() {
        if (store.list().length === 0) {
            toast('No saved recipes to export');
            return;
        }
        const blob = new Blob([store.exportJSON()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dough_formulator_recipes.json';
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function importRecipes(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const n = store.importJSON(reader.result);
                renderSavedRecipes();
                toast(n ? `Imported ${n} recipe${n === 1 ? '' : 's'}` : 'No recipes found in that file');
            } catch (err) {
                toast('Could not read that file');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    /* ---------------- Draft autosave ---------------- */

    let draftTimer = null;

    /** Persist the working recipe. Debounced while sliding; pass `true` to write immediately. */
    function saveDraft(immediately = false) {
        clearTimeout(draftTimer);
        draftTimer = null;
        if (immediately) {
            writeDraft();
        } else {
            draftTimer = setTimeout(writeDraft, 150);
        }
    }

    function writeDraft() {
        clearTimeout(draftTimer);
        draftTimer = null;
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({
                data: calculator.exportRecipe(),
                name: $('recipe-name').value,
                notes: $('recipe-notes').value,
                openId: openRecipe.id
            }));
        } catch (e) { /* ignore */ }
    }

    // Flush a pending draft when the page is hidden or closed (app switch, tab close, reload)
    window.addEventListener('pagehide', () => { if (draftTimer) writeDraft(); });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && draftTimer) writeDraft();
    });

    function restoreDraft() {
        let draft = null;
        try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch (e) { /* ignore */ }
        if (!draft || typeof draft !== 'object') return;

        if (draft.data) calculator.load(draft.data);
        if (typeof draft.name === 'string') $('recipe-name').value = draft.name;
        if (typeof draft.notes === 'string') $('recipe-notes').value = draft.notes;

        const rec = draft.openId ? store.get(draft.openId) : null;
        openRecipe = rec ? { id: rec.id, snapshot: snapshotOfSaved(rec) } : { id: null, snapshot: null };
    }

    /* ---------------- Helpers ---------------- */

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function toast(message) {
        document.querySelectorAll('.toast').forEach((t) => t.remove());
        const t = el('div', 'toast', message);
        t.setAttribute('role', 'status');
        document.body.append(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 300);
        }, 2000);
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (location.protocol !== 'https:' && !local) return;
        navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
    }
})();
