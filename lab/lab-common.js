/**
 * lab-common.js — shared runtime for THE LAB pages: state hand-off through
 * the URL hash, the tiny store, the concept switcher, and the shared
 * popover editor.
 */
import * as share from '../js/share.js';
import { defaultState } from '../js/model.js';
import { round1 } from '../js/format.js';

export const CONCEPTS = [
    { id: 'recipe', num: 'Ⅰ', title: 'The Living Recipe', href: 'recipe.html' },
    { id: 'canvas', num: 'Ⅱ', title: 'Dough Canvas', href: 'canvas.html' },
    { id: 'control', num: 'Ⅲ', title: 'Mission Control', href: 'control.html' },
    { id: 'dial', num: 'Ⅳ', title: 'Pocket Dial', href: 'dial.html' },
];

export function nextQuarterHour(date) {
    const d = new Date(date);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15);
    return d;
}

/** Decode the #r= hash (if any) into { state, env }, else defaults. */
export function loadFromHash() {
    const decoded = share.decodeHash(location.hash);
    const env = {
        mode: 'start',
        anchorTime: nextQuarterHour(new Date()),
        roomTemp: 22,
        retardHours: 12,
        starterFed: true,
    };
    if (!decoded) return { state: defaultState(), env };
    if (decoded.env.roomTemp !== undefined) env.roomTemp = decoded.env.roomTemp;
    if (decoded.env.retardHours !== undefined) env.retardHours = decoded.env.retardHours;
    if (decoded.env.mode !== undefined) env.mode = decoded.env.mode;
    return { state: decoded.state, env };
}

/** Encode state+env into the URL and refresh switcher links. */
export function saveToHash(state, env) {
    const hash = share.encodeState(state, {
        roomTemp: env.roomTemp,
        retardHours: env.retardHours,
        mode: env.mode,
    });
    history.replaceState(null, '', location.pathname + location.search + hash);
    refreshSwitcherLinks();
}

/**
 * Minimal store: apply(fn) transforms state through a pure model edit,
 * setEnv(patch) merges env; both re-render and (debounced) sync the hash.
 */
export function createStore({ state, env, onRender }) {
    let hashTimer = null;
    const sync = () => {
        clearTimeout(hashTimer);
        hashTimer = setTimeout(() => saveToHash(state, env), 150);
    };
    const render = () => onRender(state, env);
    return {
        get: () => ({ state, env }),
        apply(fn) {
            state = fn(state);
            render();
            sync();
        },
        setEnv(patch) {
            Object.assign(env, patch);
            render();
            sync();
        },
        rerender: render,
    };
}

/* ---------- concept switcher ---------- */

let switcherMount = null;

export function renderSwitcher(mount, currentId) {
    switcherMount = mount;
    mount.className = 'lab-nav';
    mount.innerHTML = '';
    const mk = (href, label, current = false) => {
        const a = document.createElement('a');
        a.href = href + location.hash;
        a.dataset.base = href;
        a.textContent = label;
        if (current) a.setAttribute('aria-current', 'page');
        return a;
    };
    mount.appendChild(mk('index.html', 'The Lab', currentId === 'hub'));
    for (const c of CONCEPTS) {
        mount.appendChild(mk(c.href, `${c.num} ${c.title.replace('The ', '')}`, c.id === currentId));
    }
    mount.appendChild(mk('../index.html', 'Classic'));
}

function refreshSwitcherLinks() {
    if (!switcherMount) return;
    for (const a of switcherMount.querySelectorAll('a[data-base]')) {
        a.href = a.dataset.base + location.hash;
    }
}

/* ---------- tiny DOM/SVG builder ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'rect', 'line', 'path', 'circle', 'text',
    'tspan', 'clipPath', 'defs', 'polyline', 'use']);

export function el(tag, attrs = {}, ...children) {
    const node = SVG_TAGS.has(tag)
        ? document.createElementNS(SVG_NS, tag)
        : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.setAttribute('class', v);
        else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2), v);
        } else if (v !== undefined && v !== null) {
            node.setAttribute(k, String(v));
        }
    }
    for (const child of children.flat()) {
        if (child == null) continue;
        node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
}

/* ---------- shared popover editor ---------- */

/**
 * One popover per page. spec kinds:
 *  {kind:'number', label, value, min, max, step, unit?, format?(v), onInput(v)}
 *  {kind:'choice', label, value, options:[{value,label}], onInput(v)}
 *  {kind:'time',   label, value:Date, onInput(Date)}
 */
export function createPopover() {
    const root = el('div', { class: 'popover', role: 'dialog', hidden: '' });
    document.body.appendChild(root);
    let anchor = null;

    function close() {
        if (root.hidden) return;
        root.hidden = true;
        if (anchor?.setAttribute) anchor.setAttribute('aria-expanded', 'false');
        anchor = null;
    }

    document.addEventListener('pointerdown', e => {
        if (!root.hidden && !root.contains(e.target) && e.target !== anchor && !anchor?.contains?.(e.target)) {
            close();
        }
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') close();
    });

    function position(anchorEl) {
        if (window.innerWidth < 480) {
            root.classList.add('sheet');
            root.style.left = root.style.top = root.style.right = root.style.bottom = '';
            return;
        }
        root.classList.remove('sheet');
        const r = anchorEl.getBoundingClientRect();
        const pw = root.offsetWidth;
        const ph = root.offsetHeight;
        let left = r.left + r.width / 2 - pw / 2;
        left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
        let top = r.bottom + 10;
        if (top + ph > window.innerHeight - 8) top = r.top - ph - 10;
        root.style.left = `${left}px`;
        root.style.top = `${Math.max(8, top)}px`;
    }

    function open(anchorEl, spec) {
        close();
        anchor = anchorEl;
        if (anchor?.setAttribute) anchor.setAttribute('aria-expanded', 'true');
        root.innerHTML = '';
        root.appendChild(el('div', { class: 'popover-label smallcaps' }, spec.label));

        if (spec.kind === 'number') {
            const fmt = spec.format || (v => `${round1(v)}${spec.unit || ''}`);
            const readout = el('div', { class: 'popover-value' }, fmt(spec.value));
            const slider = el('input', {
                type: 'range', min: spec.min, max: spec.max, step: spec.step, value: spec.value,
            });
            const set = v => {
                const clamped = Math.min(spec.max, Math.max(spec.min, v));
                slider.value = String(clamped);
                readout.textContent = fmt(clamped);
                spec.onInput(clamped);
            };
            slider.addEventListener('input', () => set(Number(slider.value)));
            const minus = el('button', { class: 'popover-step', type: 'button' }, '−');
            const plus = el('button', { class: 'popover-step', type: 'button' }, '+');
            minus.addEventListener('click', () => set(Number(slider.value) - spec.step));
            plus.addEventListener('click', () => set(Number(slider.value) + spec.step));
            root.appendChild(readout);
            root.appendChild(el('div', { class: 'popover-row' }, minus, slider, plus));
        } else if (spec.kind === 'choice') {
            const row = el('div', { class: 'popover-chips' });
            for (const opt of spec.options) {
                const chip = el('button', {
                    class: 'chip' + (opt.value === spec.value ? ' active' : ''), type: 'button',
                }, opt.label);
                chip.addEventListener('click', () => {
                    for (const c of row.children) c.classList.remove('active');
                    chip.classList.add('active');
                    spec.onInput(opt.value);
                });
                row.appendChild(chip);
            }
            root.appendChild(row);
        } else if (spec.kind === 'time') {
            const input = el('input', { type: 'datetime-local', value: toLocalDatetimeValue(spec.value) });
            input.addEventListener('change', () => {
                const d = new Date(input.value);
                if (!isNaN(d)) spec.onInput(d);
            });
            root.appendChild(el('div', { class: 'popover-row' }, input));
        }

        root.hidden = false;
        position(anchorEl);
    }

    return { open, close, get isOpen() { return !root.hidden; } };
}

export function toLocalDatetimeValue(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Update a node's text and pulse-highlight it if the value changed. */
export function setText(node, text) {
    const str = String(text);
    if (node.textContent === str) return;
    node.textContent = str;
    node.classList.remove('flash');
    void node.offsetWidth;
    node.classList.add('flash');
}
