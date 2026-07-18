/**
 * ui.js - DOM rendering. Pure "state in, pixels out": app.js owns the state
 * and event wiring; this module only knows how to draw it.
 */
import { FLOUR_TYPES } from './model.js';
import { displayGrams, formatPct, reconcileSum, formatDuration, cToF, round1 } from './format.js';

const $ = id => document.getElementById(id);

/* ---------- change-pulse helper ---------- */

/**
 * Set an element's text; if it changed, pulse-highlight it so the user can
 * see what their edit affected.
 */
export function setText(el, text) {
    if (el.textContent === String(text)) return;
    el.textContent = text;
    el.classList.remove('just-changed');
    // Force a reflow so re-adding the class restarts the animation
    void el.offsetWidth;
    el.classList.add('just-changed');
}

/** Update an input's value unless the user is currently typing in it. */
export function setInput(el, value) {
    if (document.activeElement === el) return;
    const str = String(value);
    if (el.value !== str) el.value = str;
}

/* ---------- formula card ---------- */

/**
 * Render the whole formula card.
 * recipe = derive(state); uiState = { starterUnit: 'pct'|'g' }.
 */
export function renderFormula(recipe, state, uiState) {
    setInput($('dough-weight'), displayGrams(recipe.doughWeight));
    setInput($('flour-total'), displayGrams(recipe.flourTotal));
    setInput($('hydration'), round1(recipe.hydration));
    setInput($('hydration-slider'), Math.round(recipe.hydration));
    setInput($('salt-pct'), round1(recipe.saltPct));
    setInput($('salt-slider'), round1(recipe.saltPct));
    setInput($('starter-hydration'), Math.round(recipe.starterHydration));
    setInput($('starter-slider'), Math.round(recipe.starterPct));
    setInput($('num-loaves'), recipe.numLoaves);
    setInput($('loaf-weight'), displayGrams(recipe.weightPerLoaf));
    setInput($('bake-loss'), round1(recipe.bakeLossPct));
    setText($('out-baked'), `≈ ${displayGrams(recipe.bakedWeightPerLoaf)}g baked`);
    setInput($('pff'), round1(recipe.prefermentedFlourPct));
    setText($('out-pff-note'), `= ${displayGrams(recipe.starterFlour)}g fermented flour`);
    setInput($('reserved-water'), round1(recipe.reservedWaterPct));
    setText($('out-reserved'), recipe.reservedWater > 0 ? `${displayGrams(recipe.reservedWater)}g held back` : '-');

    $('pin-flour').checked = state.pinFlour;
    $('dough-caption').textContent = state.pinFlour
        ? 'Flour is pinned - editing dough weight changes hydration instead.'
        : 'Editing dough weight rescales the whole recipe - all percentages stay put.';

    // Starter input + its alternate reading
    const starterOfDough = (recipe.starterMass / recipe.doughWeight) * 100;
    if (uiState.starterUnit === 'g') {
        setInput($('starter-value'), displayGrams(recipe.starterMass));
        setText($('out-starter-alt'), `= ${formatPct(recipe.starterPct)}% of flour · ${formatPct(starterOfDough)}% of dough`);
    } else {
        setInput($('starter-value'), round1(recipe.starterPct));
        setText($('out-starter-alt'), `= ${displayGrams(recipe.starterMass)}g · ${formatPct(starterOfDough)}% of dough`);
    }
    $('starter-unit-pct').classList.toggle('active', uiState.starterUnit !== 'g');
    $('starter-unit-g').classList.toggle('active', uiState.starterUnit === 'g');

    setText($('out-water-total'), `${displayGrams(recipe.totalWater)}g`);
    setText($('out-starter-split'), `${displayGrams(recipe.starterFlour)}g flour + ${displayGrams(recipe.starterWater)}g water`);
    setText($('out-salt'), `${displayGrams(recipe.salt)}g`);

    renderMixPanel(recipe);
    renderStats(recipe);
    setText($('blend-note'), `Whole grain: ${formatPct(recipe.wholeGrainPct)}% - feeds the fermentation model below.`);
}

/** The "on the scale" panel - displayed lines always sum to the total. */
function renderMixPanel(recipe) {
    const lines = [
        { key: 'flour', value: recipe.flourToAdd },
        { key: 'water', value: recipe.waterToAdd },
        { key: 'starter', value: recipe.starterMass },
        { key: 'salt', value: recipe.salt },
        ...recipe.addIns.map((a, i) => ({ key: `addin${i}`, value: a.grams })),
    ];
    const { parts, total } = reconcileSum(lines);
    const get = key => parts.find(p => p.key === key).value;

    const flourSubRows = recipe.flourBreakdown.length > 1
        ? recipe.flourBreakdown.map(f =>
            `<tr class="mix-sub"><td>↳ ${FLOUR_TYPES[f.key]?.label || f.key}</td><td>${displayGrams(f.added)}g</td></tr>`
        ).join('')
        : '';

    // Bassinage split shown as informational sub-rows under water
    const waterSubRows = recipe.reservedWater > 0
        ? `<tr class="mix-sub"><td>↳ in the mix</td><td>${displayGrams(recipe.mixingWater)}g</td></tr>
           <tr class="mix-sub"><td>↳ bassinage (add during folds)</td><td>${displayGrams(recipe.reservedWater)}g</td></tr>`
        : '';

    const addInRows = recipe.addIns.map((a, i) =>
        `<tr><td>${escapeHtml(a.name) || 'Add-in'}${a.liquid ? ' (liquid - counted as water)' : ''}</td><td data-mix="addin${i}"></td></tr>`
    ).join('');

    $('mix-body').innerHTML = `
        <tr><td>Flour</td><td data-mix="flour"></td></tr>
        ${flourSubRows}
        <tr><td>Water</td><td data-mix="water"></td></tr>
        ${waterSubRows}
        <tr><td>Starter (${formatPct(recipe.starterHydration)}% hydration)</td><td data-mix="starter"></td></tr>
        <tr><td>Salt</td><td data-mix="salt"></td></tr>
        ${addInRows}
        <tr class="total"><td>Total dough${recipe.numLoaves > 1 ? ` (${recipe.numLoaves} loaves)` : ''}</td><td data-mix="total"></td></tr>`;

    for (const part of parts) {
        setText(document.querySelector(`[data-mix="${part.key}"]`), `${get(part.key)}g`);
    }
    setText(document.querySelector('[data-mix="total"]'), `${total}g`);
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderStats(recipe) {
    const stats = [
        { label: 'Hydration', value: `${formatPct(recipe.hydration)}%` },
        { label: 'Prefermented flour', value: `${formatPct(recipe.prefermentedFlourPct)}%` },
        { label: 'Whole grain', value: `${formatPct(recipe.wholeGrainPct)}%` },
        { label: 'Salt', value: `${formatPct(recipe.saltPct)}%` },
    ];
    const panel = $('stats-panel');
    if (panel.children.length !== stats.length) {
        panel.innerHTML = stats.map((s, i) =>
            `<div class="stat"><span class="value" data-stat="${i}"></span><span class="label">${s.label}</span></div>`
        ).join('');
    }
    stats.forEach((s, i) => setText(panel.querySelector(`[data-stat="${i}"]`), s.value));
}

/**
 * (Re)build the flour-blend editor rows. Skipped while the user is typing
 * inside the editor so focus isn't stolen mid-edit.
 */
export function renderBlendRows(state, { onChange, onRemove }) {
    const container = $('blend-rows');
    if (container.contains(document.activeElement)) return;

    container.innerHTML = '';
    state.flours.forEach((flour, index) => {
        const grams = state.flourTotal * flour.pct / 100;
        const row = document.createElement('div');
        row.className = 'blend-row';

        const select = document.createElement('select');
        for (const [key, def] of Object.entries(FLOUR_TYPES)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = def.label;
            opt.selected = key === flour.key;
            select.appendChild(opt);
        }
        select.addEventListener('change', () => onChange(index, { key: select.value, pct: flour.pct }));

        const pct = document.createElement('input');
        pct.type = 'number';
        pct.min = '1';
        pct.max = '100';
        pct.step = '1';
        pct.value = String(round1(flour.pct));
        pct.title = '% of total flour (auto-normalized to 100)';
        pct.addEventListener('change', () => onChange(index, { key: flour.key, pct: Number(pct.value) || 0 }));

        const gramsOut = document.createElement('span');
        gramsOut.className = 'derived-value';
        gramsOut.textContent = `${displayGrams(grams)}g`;
        gramsOut.title = 'Of total flour (including what your starter contributes)';

        const remove = document.createElement('button');
        remove.className = 'icon-btn danger';
        remove.title = 'Remove this flour';
        remove.innerHTML = '<svg><use href="#i-trash"/></svg>';
        remove.disabled = state.flours.length === 1;
        remove.addEventListener('click', () => onRemove(index));

        row.append(select, pct, gramsOut, remove);
        container.appendChild(row);
    });
}

/**
 * (Re)build the add-ins editor. Each row: name, % of flour, grams (either
 * edits the same canonical pct), and a "liquid" toggle that routes it into
 * the water math.
 */
export function renderAddInRows(state, recipe, { onChange, onRemove }) {
    const container = $('addin-rows');
    if (container.contains(document.activeElement)) return;

    container.innerHTML = '';
    state.addIns.forEach((addIn, index) => {
        const row = document.createElement('div');
        row.className = 'blend-row';

        const name = document.createElement('input');
        name.type = 'text';
        name.placeholder = 'e.g. toasted seeds';
        name.value = addIn.name;
        name.addEventListener('change', () => onChange(index, { ...addIn, name: name.value }));

        const pct = document.createElement('input');
        pct.type = 'number';
        pct.min = '0';
        pct.step = '0.5';
        pct.title = '% of total flour';
        pct.value = String(round1(addIn.pct));
        pct.addEventListener('change', () => onChange(index, { ...addIn, pct: Number(pct.value) || 0 }));

        const pctLabel = document.createElement('span');
        pctLabel.className = 'derived-value';
        pctLabel.style.minWidth = '1.2rem';
        pctLabel.textContent = '%';

        const grams = document.createElement('input');
        grams.type = 'number';
        grams.min = '0';
        grams.step = '5';
        grams.title = 'Grams - converts to % of flour';
        grams.value = String(displayGrams(recipe.flourTotal * addIn.pct / 100));
        grams.addEventListener('change', () =>
            onChange(index, { ...addIn, pct: (Number(grams.value) || 0) / recipe.flourTotal * 100 }));

        const gLabel = document.createElement('span');
        gLabel.className = 'derived-value';
        gLabel.style.minWidth = '1.2rem';
        gLabel.textContent = 'g';

        const liquid = document.createElement('label');
        liquid.className = 'pin-flour-label';
        liquid.title = 'Liquid add-ins count toward hydration; added water shrinks to keep it true';
        const liquidBox = document.createElement('input');
        liquidBox.type = 'checkbox';
        liquidBox.checked = addIn.liquid;
        liquidBox.addEventListener('change', () => onChange(index, { ...addIn, liquid: liquidBox.checked }));
        liquid.append(liquidBox, document.createTextNode(' liquid'));

        const remove = document.createElement('button');
        remove.className = 'icon-btn danger';
        remove.title = 'Remove';
        remove.innerHTML = '<svg><use href="#i-trash"/></svg>';
        remove.addEventListener('click', () => onRemove(index));

        row.append(name, pct, pctLabel, grams, gLabel, liquid, remove);
        container.appendChild(row);
    });
}

/* ---------- timeline card ---------- */

const timeFmt = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat([], { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * Render the schedule list.
 * scheduled: steps with start/end. opts: { checklist, doneIds:Set, now:Date, onToggle }.
 */
export function renderSchedule(scheduled, opts) {
    const list = $('schedule-list');
    list.innerHTML = '';
    const now = opts.now || new Date();

    for (const step of scheduled) {
        const li = document.createElement('li');
        const isDone = opts.doneIds.has(step.id);
        const isCurrent = !isDone && step.start <= now && now < step.end;
        if (isDone) li.classList.add('done');
        if (opts.checklist && isCurrent) li.classList.add('current');

        if (opts.checklist) {
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = isDone;
            box.addEventListener('change', () => opts.onToggle(step.id, box.checked));
            li.appendChild(box);
        }

        const when = document.createElement('span');
        when.className = 'when';
        when.innerHTML = `${timeFmt.format(step.start)}<span class="day">${dayFmt.format(step.start)}</span>`;

        const what = document.createElement('span');
        what.className = 'what';
        const label = document.createElement('span');
        label.className = 'step-label';
        label.textContent = step.label;
        const desc = document.createElement('span');
        desc.className = 'step-desc';
        desc.textContent = step.description;
        what.append(label, document.createElement('br'), desc);

        const dur = document.createElement('span');
        dur.className = 'dur';
        dur.textContent = step.minutes ? formatDuration(step.minutes) : '';

        li.append(when, what, dur);
        list.appendChild(li);
    }
}

/** Render timeline controls from env. uiState: { tempUnit: 'c'|'f' }. */
export function renderTimelineControls(env, uiState) {
    $('mode-start').classList.toggle('active', env.mode !== 'ready');
    $('mode-ready').classList.toggle('active', env.mode === 'ready');
    $('anchor-time-label').textContent = env.mode === 'ready' ? 'I want bread at' : 'I start at';
    setInput($('anchor-time'), toLocalDatetimeValue(env.anchorTime));

    const isF = uiState.tempUnit === 'f';
    $('temp-unit-c').classList.toggle('active', !isF);
    $('temp-unit-f').classList.toggle('active', isF);
    $('room-temp-label').textContent = `Room temp (°${isF ? 'F' : 'C'})`;
    const slider = $('room-temp-slider');
    slider.min = isF ? 59 : 15;
    slider.max = isF ? 90 : 32;
    const shown = isF ? Math.round(cToF(env.roomTemp)) : env.roomTemp;
    setInput($('room-temp'), shown);
    setInput(slider, shown);

    setInput($('retard-hours'), env.retardHours);
    $('starter-fed').checked = env.starterFed;
}

export function toLocalDatetimeValue(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ---------- saved formulas ---------- */

export function renderSavedList(entries, { onLoad, onDelete }) {
    const grid = $('saved-grid');
    grid.innerHTML = '';
    if (!entries.length) {
        const note = document.createElement('p');
        note.className = 'empty-note';
        note.textContent = 'Nothing saved yet. Dial in a formula and hit Save.';
        grid.appendChild(note);
        return;
    }
    for (const entry of entries) {
        const card = document.createElement('div');
        card.className = 'saved-card';

        const title = document.createElement('h4');
        title.textContent = entry.name;

        const meta = document.createElement('div');
        meta.className = 'meta';
        const s = entry.state;
        meta.textContent = `${formatPct(s.hydration)}% hyd · ${formatPct(s.starter.pct)}% starter · ${Math.round(s.flourTotal)}g flour`;

        const actions = document.createElement('div');
        actions.className = 'actions';
        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Load';
        loadBtn.className = 'primary';
        loadBtn.addEventListener('click', () => onLoad(entry.id));
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn danger';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '<svg><use href="#i-trash"/></svg>';
        delBtn.addEventListener('click', () => onDelete(entry.id));
        actions.append(loadBtn, delBtn);

        card.append(title, meta);
        if (entry.notes) {
            const notes = document.createElement('p');
            notes.className = 'subtle-note';
            notes.textContent = entry.notes;
            card.appendChild(notes);
        }
        card.appendChild(actions);
        grid.appendChild(card);
    }
}

/* ---------- misc ---------- */

let toastTimer = null;

export function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export function setThemeIcon(isDark) {
    $('theme-toggle').innerHTML = `<svg><use href="#i-${isDark ? 'sun' : 'moon'}"/></svg>`;
}
