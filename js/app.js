/**
 * app.js - bootstrap and event wiring. Owns the canonical state and calls
 * the pure modules; ui.js does the drawing.
 */
import * as model from './model.js';
import * as ferment from './ferment.js';
import * as share from './share.js';
import * as storage from './storage.js';
import * as ui from './ui.js';
import { PRESETS, getPreset } from './presets.js';
import { displayGrams, formatPct, reconcileSum, fToC, round1 } from './format.js';

const $ = id => document.getElementById(id);

/* ---------- application state ---------- */

let state = model.defaultState();

const env = {
    mode: 'start',            // 'start' | 'ready'
    anchorTime: nextQuarterHour(new Date()),
    roomTemp: 22,             // always °C internally
    retardHours: 12,
    starterFed: true,
};

const uiState = {
    starterUnit: 'pct',       // 'pct' | 'g'
    tempUnit: 'c',            // 'c' | 'f'
    checklist: false,
    doneIds: new Set(),
};

function nextQuarterHour(date) {
    const d = new Date(date);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
    return d;
}

/* ---------- rendering ---------- */

function renderAll() {
    const recipe = model.derive(state);
    ui.renderFormula(recipe, state, uiState);
    ui.renderBlendRows(state, { onChange: changeBlendRow, onRemove: removeBlendRow });
    ui.renderAddInRows(state, recipe, { onChange: changeAddIn, onRemove: removeAddIn });
    renderTimeline(recipe);
    renderDdt();
    syncHash();
}

function renderTimeline(recipe = model.derive(state)) {
    ui.renderTimelineControls(env, uiState);
    const steps = ferment.buildSteps(recipe, env);
    const scheduled = ferment.schedule(steps, { mode: env.mode, anchorTime: env.anchorTime });
    ui.renderSchedule(scheduled, {
        checklist: uiState.checklist,
        doneIds: uiState.doneIds,
        now: new Date(),
        onToggle: (id, done) => {
            done ? uiState.doneIds.add(id) : uiState.doneIds.delete(id);
            renderTimeline();
        },
    });
}

function renderSaved() {
    ui.renderSavedList(storage.listFormulas(), {
        onLoad: id => {
            const entry = storage.loadFormula(id);
            if (!entry) return;
            state = entry.state;
            renderAll();
            ui.toast(`Loaded "${entry.name}"`);
        },
        onDelete: id => {
            storage.deleteFormula(id);
            renderSaved();
            ui.toast('Deleted');
        },
    });
}

function renderDdt() {
    const waterTemp = ferment.waterTempForDDT({
        ddt: Number($('ddt').value) || 25,
        flourTemp: Number($('flour-temp').value) || 21,
        roomTemp: env.roomTemp,
        starterTemp: Number($('starter-temp').value) || 23,
    });
    $('ddt-result').textContent = `→ Use water at ${round1(waterTemp)}°C (room temp is taken from the timeline above)`;
}

function syncHash() {
    const hash = share.encodeState(state, {
        roomTemp: env.roomTemp,
        retardHours: env.retardHours,
        mode: env.mode,
    });
    history.replaceState(null, '', location.pathname + location.search + hash);
    // Keep the LAB link carrying the current formula
    const labLink = $('lab-link');
    if (labLink) labLink.href = 'lab/' + hash;
}

/* ---------- formula edits ---------- */

function applyEdit(fn) {
    state = fn(state);
    renderAll();
}

/** Read a number input; returns null while it's empty/mid-edit. */
function numValue(el) {
    if (el.value.trim() === '') return null;
    const v = Number(el.value);
    return Number.isFinite(v) ? v : null;
}

function bindNumber(id, apply) {
    $(id).addEventListener('input', e => {
        const v = numValue(e.target);
        if (v !== null) apply(v);
    });
    // Snap the field to the clamped/derived value once editing ends
    $(id).addEventListener('blur', () => renderAll());
}

function changeBlendRow(index, flour) {
    const flours = state.flours.map((f, i) => (i === index ? flour : { ...f }));
    applyEdit(s => model.setFlourBlend(s, flours));
}

function removeBlendRow(index) {
    applyEdit(s => model.setFlourBlend(s, s.flours.filter((_, i) => i !== index)));
}

function changeAddIn(index, addIn) {
    applyEdit(s => model.setAddIns(s, s.addIns.map((a, i) => (i === index ? addIn : a))));
}

function removeAddIn(index) {
    applyEdit(s => model.setAddIns(s, s.addIns.filter((_, i) => i !== index)));
}

/* ---------- clipboard / share / print ---------- */

function formulaAsText() {
    const r = model.derive(state);
    const { parts, total } = reconcileSum([
        { key: 'flour', value: r.flourToAdd },
        { key: 'water', value: r.waterToAdd },
        { key: 'starter', value: r.starterMass },
        { key: 'salt', value: r.salt },
        ...r.addIns.map((a, i) => ({ key: `addin${i}`, value: a.grams })),
    ]);
    const get = key => parts.find(p => p.key === key).value;
    const addInLines = r.addIns.map((a, i) =>
        `${a.name || 'Add-in'}${a.liquid ? ' (liquid)' : ''}: ${get(`addin${i}`)}g`);
    const blend = r.flourBreakdown
        .map(f => `  - ${model.FLOUR_TYPES[f.key]?.label || f.key}: ${displayGrams(f.added)}g (${formatPct(f.pct)}% of total flour)`)
        .join('\n');
    return [
        '=== DOUGH_FORMULATOR ===',
        '',
        `Hydration ${formatPct(r.hydration)}% · Salt ${formatPct(r.saltPct)}% · Starter ${formatPct(r.starterPct)}% @ ${formatPct(r.starterHydration)}% hyd · PFF ${formatPct(r.prefermentedFlourPct)}%`,
        '',
        `Flour: ${get('flour')}g`,
        blend,
        `Water: ${get('water')}g`,
        `Starter: ${get('starter')}g`,
        `Salt: ${get('salt')}g`,
        ...addInLines,
        `Total dough: ${total}g${r.numLoaves > 1 ? ` (${r.numLoaves} × ${displayGrams(r.weightPerLoaf)}g)` : ''}`,
    ].join('\n');
}

async function copyText(text, successMsg) {
    try {
        await navigator.clipboard.writeText(text);
        ui.toast(successMsg);
    } catch {
        ui.toast('Clipboard unavailable - copy from the address bar instead');
    }
}

/* ---------- theme ---------- */

const THEME_KEY = 'dough_formulator_theme';

function applyTheme(dark) {
    document.body.classList.toggle('dark-theme', dark);
    ui.setThemeIcon(dark);
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
}

/* ---------- init ---------- */

function initFromHash() {
    const decoded = share.decodeHash(location.hash);
    if (!decoded) return;
    state = decoded.state;
    if (decoded.env.roomTemp !== undefined) env.roomTemp = decoded.env.roomTemp;
    if (decoded.env.retardHours !== undefined) env.retardHours = decoded.env.retardHours;
    if (decoded.env.mode !== undefined) env.mode = decoded.env.mode;
}

function initPresets() {
    const select = $('preset-select');
    for (const preset of PRESETS) {
        const opt = document.createElement('option');
        opt.value = preset.id;
        opt.textContent = preset.name;
        opt.title = preset.note;
        select.appendChild(opt);
    }
    select.addEventListener('change', () => {
        const preset = getPreset(select.value);
        if (!preset) return;
        state = model.sanitizeState(preset.state);
        renderAll();
        ui.toast(`${preset.name} - ${preset.note}`);
    });
}

function initFormulaEvents() {
    bindNumber('dough-weight', v => applyEdit(s => model.scaleToDoughWeight(s, v)));
    bindNumber('flour-total', v => applyEdit(s => model.setFlourTotal(s, v)));
    bindNumber('hydration', v => applyEdit(s => model.setHydration(s, v)));
    bindNumber('salt-pct', v => applyEdit(s => model.setSalt(s, v)));
    bindNumber('starter-hydration', v => applyEdit(s => model.setStarterHydration(s, v)));
    bindNumber('starter-value', v => applyEdit(s =>
        uiState.starterUnit === 'g' ? model.setStarterGrams(s, v) : model.setStarterPercent(s, v)));
    bindNumber('pff', v => applyEdit(s => model.setPrefermentedFlour(s, v)));
    // Loaf count splits the existing total; editing per-loaf weight rescales it
    bindNumber('num-loaves', v => applyEdit(s => model.setNumLoaves(s, v, { keepPerLoaf: false })));
    bindNumber('loaf-weight', v => applyEdit(s => model.setLoafWeight(s, v)));
    bindNumber('bake-loss', v => applyEdit(s => model.setBakeLoss(s, v)));
    bindNumber('reserved-water', v => applyEdit(s => model.setReservedWater(s, v)));

    $('hydration-slider').addEventListener('input', e => applyEdit(s => model.setHydration(s, Number(e.target.value))));
    $('salt-slider').addEventListener('input', e => applyEdit(s => model.setSalt(s, Number(e.target.value))));
    $('starter-slider').addEventListener('input', e => applyEdit(s => model.setStarterPercent(s, Number(e.target.value))));

    $('pin-flour').addEventListener('change', e => applyEdit(s => model.setPinFlour(s, e.target.checked)));

    $('starter-unit-pct').addEventListener('click', () => { uiState.starterUnit = 'pct'; renderAll(); });
    $('starter-unit-g').addEventListener('click', () => { uiState.starterUnit = 'g'; renderAll(); });

    $('add-addin-btn').addEventListener('click', () => {
        applyEdit(s => model.setAddIns(s, [...s.addIns, { name: '', pct: 5, liquid: false }]));
    });

    $('add-flour-btn').addEventListener('click', () => {
        const used = new Set(state.flours.map(f => f.key));
        const nextKey = Object.keys(model.FLOUR_TYPES).find(k => !used.has(k)) || 'bread';
        // Give the new flour 10% and renormalize the rest around it
        const scaled = state.flours.map(f => ({ key: f.key, pct: f.pct * 0.9 }));
        applyEdit(s => model.setFlourBlend(s, [...scaled, { key: nextKey, pct: 10 }]));
    });
}

function initActionButtons() {
    $('copy-btn').addEventListener('click', () => copyText(formulaAsText(), 'Formula copied'));
    $('share-btn').addEventListener('click', () => {
        syncHash();
        copyText(location.href, 'Share link copied');
    });
    $('print-btn').addEventListener('click', () => window.print());

    const dialog = $('save-dialog');
    $('save-btn').addEventListener('click', () => {
        $('save-name').value = '';
        $('save-notes').value = '';
        dialog.showModal();
        $('save-name').focus();
    });
    $('save-cancel').addEventListener('click', () => dialog.close());
    $('save-confirm').addEventListener('click', () => {
        const name = $('save-name').value.trim();
        if (!name) { $('save-name').focus(); return; }
        storage.saveFormula(state, name, $('save-notes').value.trim());
        dialog.close();
        renderSaved();
        ui.toast(`Saved "${name}"`);
    });

    $('export-btn').addEventListener('click', () => {
        const blob = new Blob([storage.exportFormulas()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'dough_formulator_formulas.json';
        a.click();
        URL.revokeObjectURL(a.href);
    });
    $('import-btn').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const count = storage.importFormulas(await file.text(), true);
            renderSaved();
            ui.toast(`Imported ${count} formula${count === 1 ? '' : 's'}`);
        } catch {
            ui.toast('Could not read that file');
        }
        e.target.value = '';
    });
}

function initTimelineEvents() {
    $('mode-start').addEventListener('click', () => { env.mode = 'start'; renderTimeline(); syncHash(); });
    $('mode-ready').addEventListener('click', () => { env.mode = 'ready'; renderTimeline(); syncHash(); });

    $('anchor-time').addEventListener('change', e => {
        const d = new Date(e.target.value);
        if (!isNaN(d)) { env.anchorTime = d; renderTimeline(); }
    });

    const applyRoomTemp = shown => {
        const c = uiState.tempUnit === 'f' ? fToC(shown) : shown;
        env.roomTemp = Math.round(Math.min(35, Math.max(10, c)) * 10) / 10;
        renderTimeline();
        renderDdt();
        syncHash();
    };
    $('room-temp').addEventListener('input', e => {
        const v = numValue(e.target);
        if (v !== null) applyRoomTemp(v);
    });
    $('room-temp-slider').addEventListener('input', e => applyRoomTemp(Number(e.target.value)));
    $('temp-unit-c').addEventListener('click', () => { uiState.tempUnit = 'c'; renderTimeline(); });
    $('temp-unit-f').addEventListener('click', () => { uiState.tempUnit = 'f'; renderTimeline(); });

    $('retard-hours').addEventListener('input', e => {
        const v = numValue(e.target);
        if (v !== null) { env.retardHours = Math.min(48, Math.max(0, v)); renderTimeline(); syncHash(); }
    });
    $('starter-fed').addEventListener('change', e => { env.starterFed = e.target.checked; renderTimeline(); });

    $('checklist-toggle').addEventListener('change', e => {
        uiState.checklist = e.target.checked;
        renderTimeline();
    });
    // Keep the "current step" marker fresh in checklist mode
    setInterval(() => { if (uiState.checklist) renderTimeline(); }, 60000);

    for (const id of ['ddt', 'flour-temp', 'starter-temp']) {
        $(id).addEventListener('input', renderDdt);
    }
}

function init() {
    const storedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(storedTheme ? storedTheme === 'dark' : prefersDark);
    $('theme-toggle').addEventListener('click', () =>
        applyTheme(!document.body.classList.contains('dark-theme')));

    initFromHash();
    initPresets();
    initFormulaEvents();
    initActionButtons();
    initTimelineEvents();

    renderAll();
    renderSaved();
}

init();
