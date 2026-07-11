/**
 * canvas.js - Concept II: Dough Canvas v3, "The Living Broadsheet".
 *
 * The jar IS the interface. It self-annotates (in-band typeset labels,
 * an etched gram scale on the glass, margin labels for thin bands that
 * double as fat drag proxies), edits by direct touch (full-width edge
 * strips with a diff chip at the finger, magnetic snapping onto classic
 * values), magnifies honestly (tap a layer -> a broken-scale focus stage
 * with fine drag and -/+ endcaps), and keeps a soul: a twistable salt
 * cellar with falling grains, fermentation bubbles in the starter, a
 * pour-in when presets load, and a boule shelf where your loaves sit.
 *
 * Architecture: pure state -> full SVG redraw. All pointer handling is
 * delegated on the <svg> root (pointer capture on the root survives
 * redraws), routed by data-act attributes. One transient rAF tween at a
 * time (focus enter/exit, preset pour); ambient motion (bubbles) is CSS
 * on decorative nodes only - never on band geometry.
 */
import * as model from '../js/model.js';
import { displayGrams, formatPct, round1 } from '../js/format.js';
import { loadFromHash, createStore, renderSwitcher, el } from './lab-common.js';
import {
    makeJarScale, makeFocusScale, hydrationZone, magneticSnap,
    caption, numberWord,
} from './lab-geometry.js';
import { PRESETS, getPreset } from '../js/presets.js';

const $ = id => document.getElementById(id);
renderSwitcher($('lab-nav'), 'canvas');

/* ---------- geometry constants ---------- */

const JAR = { left: 28, right: 294, top: 92, bottom: 556 };   // interior 266px; axis x=161
const ETCH = { tickX: 29, minorLen: 7, majorLen: 12, labelX: 45 };   // scale etched inside the glass
const TAB = { clipX: 286, rightX: 386, h: 48, pitch: 56, yMax: 530 }; // clip-on tab cards
const SHELF = { y: 590, h: 60 };     // boule shelf
const CELLAR = { cx: 342, cy: 58 };  // salt cellar, in the margin above the rail
const STAGE_PX = 180;

const FLOUR_COLORS = {
    bread: 'var(--flour-bread)', allPurpose: 'var(--flour-ap)',
    wholeWheat: 'var(--flour-ww)', rye: 'var(--flour-rye)',
    spelt: 'var(--flour-spelt)', semolina: 'var(--flour-semolina)',
};
const CREAM_TEXT = new Set(['water', 'wholeWheat', 'rye']);

/* ---------- state ---------- */

const boot = loadFromHash();
const store = createStore({ state: boot.state, env: boot.env, onRender: render });
const svg = $('jar');

const view = {
    focused: null,          // layer id in focus-stage mode
    undo: [],               // snapshots of state, one per committed gesture
    undoUntil: 0,           // timestamp: show undo pill until then
    lerp: null,             // { from: Map(id->{y0,y1}), start, ms } focus tween
    pour: null,             // { start, ms, ghosts } preset pour-in
    zoneFlash: null,        // { name, until }
    cellarSpin: 0,          // accumulated visual rotation of the salt cellar
    grains: [],             // transient falling salt grains
};

let prevCapacity = null;
let gesturing = false;
let lastBands = null;

/* ---------- layers ---------- */

function buildLayers(recipe) {
    const layers = [
        { id: 'water', label: 'Water', grams: recipe.waterToAdd, color: 'var(--water)', kind: 'water', textKey: 'water' },
        { id: 'starter', label: 'Starter', grams: recipe.starterMass, color: 'var(--starter)', kind: 'starter', textKey: 'starter' },
        { id: 'salt', label: 'Salt', grams: recipe.salt, color: 'var(--salt)', kind: 'salt', textKey: 'salt' },
    ];
    recipe.flourBreakdown.forEach((f, i) => {
        layers.push({
            id: `flour-${i}`, label: model.FLOUR_TYPES[f.key]?.label || f.key,
            grams: f.added, color: FLOUR_COLORS[f.key] || 'var(--flour-bread)',
            kind: 'flour', flourIndex: i, flourKey: f.key, textKey: f.key,
        });
    });
    return layers;
}

function valueLine(layer, recipe) {
    switch (layer.kind) {
        case 'water': return `${displayGrams(recipe.waterToAdd)} g · ${formatPct(recipe.hydration)}%`;
        case 'starter': return `${displayGrams(recipe.starterMass)} g · ${formatPct(recipe.starterPct)}%`;
        case 'salt': return `${displayGrams(recipe.salt)} g · ${formatPct(recipe.saltPct)}%`;
        case 'flour': return `${displayGrams(layer.grams)} g · ${formatPct(recipe.flourBreakdown[layer.flourIndex].pct)}%`;
        default: return '';
    }
}

/* ---------- editing vocabulary (one place, every gesture routes here) ----------
   Each kind: full-value range for the focus stage, snapping step, magnetic
   canonicals, and the setter. Boundary drags, proxy drags, stage drags and
   endcaps all call the same edit(). */

const KINDS = {
    water: {
        range: [45, 110], step: 0.5, canonicals: [65, 70, 75, 80, 85],
        perPx: 0.12,     // value units per px on a proxy drag (fine lane)
        value: r => r.hydration,
        edit: (s, v) => model.setHydration(s, v),
        unit: '% hydration',
        fromGrams: (r, grams) => ((grams + r.starterWater + r.liquidAddInWater) / r.flourTotal) * 100,
    },
    starter: {
        range: [1, 50], step: 0.5, canonicals: [5, 10, 15, 20, 25],
        perPx: 0.12,
        value: r => r.starterPct,
        edit: (s, v) => model.setStarterPercent(s, v),
        unit: '% of flour',
        fromGrams: (r, grams) => (grams / r.flourTotal) * 100,
    },
    salt: {
        range: [0, 3.5], step: 0.1, canonicals: [1.8, 2, 2.2],
        perPx: 0.012,    // 100 px of thumb = ~1% salt: precision by construction
        value: r => r.saltPct,
        edit: (s, v) => model.setSalt(s, v),
        unit: '% of flour',
        fromGrams: (r, grams) => (grams / r.flourTotal) * 100,
    },
};

function kindFor(layer) {
    if (layer.kind === 'flour') {
        const i = layer.flourIndex;
        return {
            range: [2, 100], step: 1, canonicals: [10, 20, 25, 50],
            perPx: 0.2,
            value: r => r.flourBreakdown[i]?.pct ?? 0,
            edit: (s, v) => model.setFlourBlend(s,
                s.flours.map((f, fi) => ({ key: f.key, pct: fi === i ? v : f.pct }))),
            unit: '% of flour blend',
            fromGrams: (r, grams) => (grams / r.flourTotal) * 100,
        };
    }
    return KINDS[layer.kind];
}

function applyEdit(layer, rawValue, live = false) {
    const k = kindFor(layer);
    const clamped = Math.min(k.range[1], Math.max(k.range[0], rawValue));
    // Live drags glide at fine resolution (1/10 step, no magnets) so the
    // band tracks the finger 1:1; the magnetic snap fires once, on release
    const v = live
        ? Number(clamped.toFixed(Math.max(0, 1 - Math.floor(Math.log10(k.step)))))
        : magneticSnap(clamped, k.step, k.canonicals, k.step * 2.5);
    const before = k.value(model.derive(store.get().state));
    store.apply(s => k.edit(s, v));
    if (layer.kind === 'water') {
        const after = model.derive(store.get().state).hydration;
        const za = hydrationZone(before), zb = hydrationZone(after);
        if (za !== zb) view.zoneFlash = { name: zb, until: performance.now() + 1100 };
    }
    return v;
}

/* ---------- scales (honest jar vs focus stage) ---------- */

function computeBands(layers, recipe) {
    if (view.focused && layers.some(l => l.id === view.focused)) {
        const fs = makeFocusScale(
            layers.map(l => ({ id: l.id, grams: l.grams })), view.focused,
            { jarTopY: JAR.top, jarBottomY: JAR.bottom, stagePx: STAGE_PX, headroomPx: 60 });
        return { bands: new Map(fs.bands.map(b => [b.id, b])), magnification: fs.magnification, focus: true };
    }
    const scale = makeJarScale(recipe.doughWeight, {
        jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity, freeze: gesturing,
    });
    const rezoomed = prevCapacity !== null && scale.capacity !== prevCapacity && !gesturing;
    prevCapacity = scale.capacity;
    const bands = new Map();
    let cum = 0;
    for (const layer of layers) {
        const y0 = scale.yOf(cum);
        cum += layer.grams;
        bands.set(layer.id, { id: layer.id, y0, y1: scale.yOf(cum) });
    }
    return { bands, scale, focus: false, rezoomed };
}

/** Bands with the focus tween applied (lerp between two layouts). */
function tweenedBands(target) {
    if (!view.lerp) return target;
    const t = Math.min(1, (performance.now() - view.lerp.start) / view.lerp.ms);
    const e = 1 - Math.pow(1 - t, 3);   // easeOutCubic
    const out = new Map();
    for (const [id, b] of target) {
        const from = view.lerp.from.get(id) || b;
        out.set(id, { id, y0: from.y0 + (b.y0 - from.y0) * e, y1: from.y1 + (b.y1 - from.y1) * e });
    }
    if (t >= 1) view.lerp = null; else requestAnimationFrame(() => store.rerender());
    return out;
}

/* ---------- render ---------- */

const fmtInt = n => String(Math.round(n));

function render(state) {
    const recipe = model.derive(state);
    const layers = buildLayers(recipe);
    const layout = computeBands(layers, recipe);
    if (layout.rezoomed && lastBands && !view.lerp && !view.pour) {
        view.lerp = { from: lastBands, start: performance.now(), ms: 260 };
    }
    let bands = tweenedBands(layout.bands);
    lastBands = new Map(bands);

    // Preset pour-in: reveal the stack bottom-up
    let pourClip = null;
    if (view.pour) {
        const t = Math.min(1, (performance.now() - view.pour.start) / view.pour.ms);
        const e = 1 - Math.pow(1 - t, 2);
        const topY = bands.get(layers[layers.length - 1].id).y1;
        pourClip = JAR.bottom - (JAR.bottom - topY + 8) * e;
        if (t >= 1) view.pour.done = true; else requestAnimationFrame(() => store.rerender());
    }

    svg.innerHTML = '';
    const now = performance.now();

    drawGutterScale(layout, layers, bands);
    drawGlass();

    // Bands (clipped by pour reveal when animating)
    const bandGroup = el('g', pourClip !== null ? { 'clip-path': 'url(#pourclip)' } : {});
    if (pourClip !== null) {
        svg.appendChild(el('defs', {},
            el('clipPath', { id: 'pourclip' },
                el('rect', { x: JAR.left - 4, y: pourClip, width: JAR.right - JAR.left + 8, height: JAR.bottom - pourClip + 6 }))));
    }
    svg.appendChild(bandGroup);

    const thin = [];
    for (const layer of layers) {
        const b = bands.get(layer.id);
        let { y0, y1 } = b;
        const floored = layer.kind === 'salt' && (y0 - y1) < 3 && !layout.focus;
        if (floored) y1 = y0 - 3;
        const h = y0 - y1;
        const isStage = layout.focus && view.focused === layer.id;
        const dimmed = layout.focus && !isStage;

        bandGroup.appendChild(el('rect', {
            class: 'band' + (dimmed ? ' dimmed' : ''), 'data-act': `band:${layer.id}`,
            x: JAR.left, y: y1, width: JAR.right - JAR.left, height: Math.max(0, h),
            fill: layer.color, rx: 1.5,
        }));

        // Meniscus curve on liquid tops
        if ((layer.kind === 'water' || layer.kind === 'starter') && h > 8 && !isStage) {
            bandGroup.appendChild(el('path', {
                class: 'meniscus',
                d: `M ${JAR.left} ${y1} Q ${(JAR.left + JAR.right) / 2} ${y1 + 3.5} ${JAR.right} ${y1}`,
            }));
        }

        // Dotted top edge = drawn at paint floor, not to scale
        if (floored) {
            bandGroup.appendChild(el('line', {
                class: 'floor-edge', x1: JAR.left, x2: JAR.right, y1: y1, y2: y1,
            }));
        }

        // Fermentation bubbles: the starter is alive
        if (layer.kind === 'starter' && h > 16 && !dimmed) {
            const count = Math.max(2, Math.min(9, Math.round(recipe.starterPct / 4)));
            for (let i = 0; i < count; i++) {
                const bx = JAR.left + 24 + ((i * 83) % (JAR.right - JAR.left - 38));
                const by = y0 - 4 - ((i * 37) % Math.max(6, h - 10));
                bandGroup.appendChild(el('circle', {
                    class: 'bubble', cx: bx, cy: by, r: 1.4 + (i % 3) * 0.7,
                    style: `animation-delay:${(i * 0.6) % 3}s; animation-duration:${2.8 + (i % 4) * 0.7}s`,
                }));
            }
        }

        // In-band label when the band can carry type; margin label otherwise
        if (!layout.focus && h >= 24) {
            const cream = CREAM_TEXT.has(layer.textKey);
            const midY = (y0 + y1) / 2 + 4;
            bandGroup.appendChild(el('text', {
                class: 'inband-name' + (cream ? ' cream' : ''), x: JAR.left + 48, y: midY,
            }, layer.label));
            bandGroup.appendChild(el('text', {
                class: 'inband-value' + (cream ? ' cream' : ''), x: JAR.right - 12, y: midY,
                'text-anchor': 'end',
            }, valueLine(layer, recipe)));
        } else if (!layout.focus) {
            thin.push({ layer, mid: (y0 + y1) / 2 });
        }

        if (isStage) drawStage(layer, b, recipe, state, layout.magnification);
    }

    if (!layout.focus) {
        drawBoundaries(layers, bands, recipe);
        drawSurface(layers, bands, recipe, state);
        drawMarginProxies(thin, recipe, bands.get(layers[layers.length - 1].id).y1);
        drawCellar(recipe);
    } else {
        // Focus mode: tap anywhere outside the stage to close
        svg.insertBefore(el('rect', {
            'data-act': 'close-stage', x: 0, y: 0, width: 390, height: 660, fill: 'transparent',
        }), svg.firstChild);
    }

    drawHeadspace(layers, bands, recipe, state, now);
    drawGhosts(now);
    drawShelf(recipe, state);
    drawGrains(now);
    drawDiffChip();
}

/* ---------- pieces ---------- */

function drawGlass() {
    const w = JAR.right - JAR.left;
    svg.appendChild(el('path', {
        class: 'jar-glass',
        d: `M ${JAR.left - 9} ${JAR.top - 26} h ${w + 18} v 10 l -9 12 V ${JAR.bottom + 7}
            q 0 9 -9 9 H ${JAR.left + 9} q -9 0 -9 -9 V ${JAR.top - 4} l -9 -12 z`,
    }));
}

function drawGutterScale(layout, layers, bands) {
    const g = el('g', { class: 'gutter' });
    if (!layout.focus && layout.scale) {
        // Graduations etched on the inside of the glass, like real labware.
        // Numbers stop at the dough surface (those grams don't exist yet),
        // so they can never collide with the headline - ticks keep going.
        const topY = bands.get(layers[layers.length - 1].id).y1;
        const cap = layout.scale.capacity;
        const { labelStep, minorStep } = layout.scale;
        for (let grams = 0; grams <= cap; grams += minorStep) {
            const y = layout.scale.yOf(grams);
            if (y < JAR.top - 2) break;
            const major = grams % labelStep === 0;
            g.appendChild(el('line', {
                class: 'gutter-tick' + (major ? ' major' : ''),
                x1: ETCH.tickX, x2: ETCH.tickX + (major ? ETCH.majorLen : ETCH.minorLen), y1: y, y2: y,
            }));
            if (major && grams > 0 && y >= topY) {
                g.appendChild(el('text', {
                    class: 'gutter-label etched', x: ETCH.labelX, y: y + 3.5,
                }, fmtInt(grams)));
            }
        }
    } else if (layout.focus) {
        // The glass admits the lie: dashed etch outside the wall, spanning the stage
        const b = bands.get(view.focused);
        if (b) {
            g.appendChild(el('line', {
                class: 'gutter-broken', x1: 21, x2: 21, y1: b.y1, y2: b.y0,
            }));
        }
    }
    svg.appendChild(g);
}

function drawBoundaries(layers, bands, recipe) {
    // Full-width drag strips at: water top, starter top, flour splits
    const g = el('g');
    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const draggable =
            layer.kind === 'water' || layer.kind === 'starter' ||
            (layer.kind === 'flour' && layer.flourIndex < recipe.flourBreakdown.length - 1);
        if (!draggable) continue;
        const y = bands.get(layer.id).y1;
        g.appendChild(el('line', { class: 'edge-hairline', x1: JAR.left, x2: JAR.right, y1: y, y2: y }));
        // A small etched grip mark so the edge reads as draggable
        const cx = (JAR.left + JAR.right) / 2;
        g.appendChild(el('path', {
            class: 'edge-grip',
            d: `M ${cx - 11} ${y - 2.5} h 22 M ${cx - 11} ${y + 2.5} h 22`,
        }));
        g.appendChild(el('rect', {
            class: 'edge-strip', 'data-act': `edge:${layer.id}`,
            x: JAR.left, y: y - 17, width: JAR.right - JAR.left, height: 34,
        }));
    }
    svg.appendChild(g);
}

function drawSurface(layers, bands, recipe, state) {
    const topBand = bands.get(layers[layers.length - 1].id);
    const y = topBand.y1;
    const g = el('g', { class: 'surface' });
    g.appendChild(el('line', { class: 'surface-line', x1: JAR.left - 8, x2: JAR.right + 8, y1: y, y2: y }));
    // One occupant per slot: the zone flash borrows the headline's place
    const now = performance.now();
    if (y - JAR.top >= 26) {
        if (view.zoneFlash && now < view.zoneFlash.until) {
            g.appendChild(el('text', {
                class: 'zone-flash', x: (JAR.left + JAR.right) / 2, y: y - 12, 'text-anchor': 'middle',
            }, view.zoneFlash.name));
            requestAnimationFrame(() => store.rerender());
        } else {
            g.appendChild(el('text', {
                class: 'surface-headline', 'data-act': 'surface',
                x: (JAR.left + JAR.right) / 2, y: y - 12, 'text-anchor': 'middle',
            }, `${displayGrams(recipe.doughWeight)} g · ${numberWord(state.numLoaves)} ${state.numLoaves === 1 ? 'loaf' : 'loaves'}`));
        }
    }
    g.appendChild(el('rect', {
        'data-act': 'surface', x: JAR.left, y: y - 34, width: JAR.right - JAR.left, height: 44, fill: 'transparent',
    }));
    svg.appendChild(g);
}

function drawMarginProxies(thin, recipe, topY) {
    // Clip-on tab cards: bright cards clipped onto the jar wall at their
    // band's height, spine in the band's color, the page's only shadow.
    // Each is a fat drag proxy (drag = edit; tap = focus).
    if (!thin.length) return;
    // Two-pass stacking solver: ideal at band mid, clamped, then spread
    const yMin = Math.max(130, topY + 26);
    const sorted = [...thin].sort((a, b) => a.mid - b.mid);
    const ys = sorted.map(t => Math.min(TAB.yMax, Math.max(yMin, t.mid)));
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + TAB.pitch);
    if (ys[ys.length - 1] > TAB.yMax) {
        ys[ys.length - 1] = TAB.yMax;
        for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - TAB.pitch);
        if (ys[0] < yMin) ys[0] = yMin;
    }

    sorted.forEach(({ layer, mid }, i) => {
        const y = ys[i];
        const g = el('g', { class: 'proxy', 'data-act': `proxy:${layer.id}` });
        // Stem in the band's color, only when the card is displaced
        if (Math.abs(y - mid) > 3) {
            g.appendChild(el('line', {
                class: 'proxy-stem', x1: JAR.right + 2.5, x2: JAR.right + 2.5,
                y1: mid, y2: y, stroke: layer.color,
            }));
        }
        g.appendChild(el('path', {
            class: 'proxy-card',
            d: `M ${TAB.clipX} ${y - 24} H ${TAB.rightX - 11} Q ${TAB.rightX} ${y - 24} ${TAB.rightX} ${y - 13}
                V ${y + 13} Q ${TAB.rightX} ${y + 24} ${TAB.rightX - 11} ${y + 24} H ${TAB.clipX} Z`,
        }));
        g.appendChild(el('rect', {
            class: 'proxy-spine', x: TAB.clipX, y: y - 24, width: 7, height: TAB.h, fill: layer.color,
        }));
        for (const dy of [-8, 0, 8]) {
            g.appendChild(el('circle', { class: 'proxy-dot', cx: TAB.clipX + 3.5, cy: y + dy, r: 1.3 }));
        }
        const name = el('text', { class: 'proxy-name', x: TAB.clipX + 13, y: y - 8 }, layer.label);
        if (layer.label.length > 10) {
            name.setAttribute('textLength', '74');
            name.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        }
        g.appendChild(name);
        const grams = `${displayGrams(layer.grams)} g`;
        const pct = valueLine(layer, recipe).split('·')[1] || '';
        g.appendChild(el('text', { class: 'proxy-value', x: TAB.clipX + 13, y: y + 11 },
            el('tspan', {}, grams), el('tspan', { class: 'pct' }, ` ·${pct}`)));
        g.appendChild(el('rect', {
            x: TAB.clipX - 4, y: y - 28, width: 390 - TAB.clipX, height: 56, fill: 'transparent',
        }));
        svg.appendChild(g);
    });
}

function drawCellar(recipe) {
    // The salt cellar lives in the margin - twist to season.
    const cx = CELLAR.cx, cy = CELLAR.cy;
    const g = el('g', { class: 'cellar', 'data-act': 'cellar' });
    g.appendChild(el('circle', { class: 'cellar-hit', cx, cy, r: 30 }));
    const body = el('g', { transform: `rotate(${view.cellarSpin} ${cx} ${cy})` });
    body.appendChild(el('path', {
        class: 'cellar-body',
        d: `M ${cx - 11} ${cy + 14} L ${cx - 8} ${cy - 8} Q ${cx} ${cy - 15} ${cx + 8} ${cy - 8} L ${cx + 11} ${cy + 14} Z`,
    }));
    body.appendChild(el('path', { class: 'cellar-cap', d: `M ${cx - 8.5} ${cy - 7} Q ${cx} ${cy - 16} ${cx + 8.5} ${cy - 7}` }));
    for (const [dx, dy] of [[-3.5, -10], [0, -12], [3.5, -10]]) {
        body.appendChild(el('circle', { class: 'cellar-hole', cx: cx + dx, cy: cy + dy, r: 1 }));
    }
    g.appendChild(body);
    g.appendChild(el('text', { class: 'cellar-label', x: cx, y: cy + 32, 'text-anchor': 'middle' },
        `salt ${formatPct(recipe.saltPct)}%`));
    g.appendChild(el('text', { class: 'cellar-label', x: cx, y: cy + 44, 'text-anchor': 'middle' }, 'twist me'));
    svg.appendChild(g);
}

function drawStage(layer, band, recipe, state, magnification) {
    const k = kindFor(layer);
    const g = el('g', { class: 'stage', 'data-act': 'stage' });
    const { y0, y1 } = band;
    const zig = (y, dir) => {
        let d = `M ${JAR.left - 6} ${y}`;
        for (let x = JAR.left - 6; x < JAR.right + 6; x += 12) {
            d += ` l 6 ${3.5 * dir} l 6 ${-3.5 * dir}`;
        }
        return d;
    };
    g.appendChild(el('path', { class: 'stage-zig', d: zig(y1, 1) }));
    g.appendChild(el('path', { class: 'stage-zig', d: zig(y0, -1) }));
    g.appendChild(el('text', {
        class: 'stage-mag', x: JAR.right - 48, y: y1 + 18, 'text-anchor': 'end',
    }, `×${Math.min(99, Math.round(magnification))} scale`));

    // Fine ruler inside the stage: full range of this quantity
    const [lo, hi] = k.range;
    const ticks = 8;
    for (let i = 0; i <= ticks; i++) {
        const v = lo + (i / ticks) * (hi - lo);
        const y = y0 - (i / ticks) * (y0 - y1);
        g.appendChild(el('line', { class: 'stage-tick', x1: JAR.left + 4, x2: JAR.left + 14, y1: y, y2: y }));
        if (i % 2 === 0) {
            g.appendChild(el('text', { class: 'stage-tick-label', x: JAR.left + 18, y: y + 3 }, round1(v)));
        }
    }
    // Current value marker
    const cur = k.value(recipe);
    const cy = y0 - ((cur - lo) / (hi - lo)) * (y0 - y1);
    g.appendChild(el('line', { class: 'stage-marker', x1: JAR.left, x2: JAR.right, y1: cy, y2: cy }));

    // Big readout
    g.appendChild(el('text', {
        class: 'stage-value', x: JAR.right - 52, y: (y0 + y1) / 2 - 2, 'text-anchor': 'end',
    }, `${round1(cur)}%`));
    g.appendChild(el('text', {
        class: 'stage-sub', x: JAR.right - 52, y: (y0 + y1) / 2 + 16, 'text-anchor': 'end',
    }, `${layer.label} · ${displayGrams(layer.grams)} g`));

    // -/+ endcaps (single snap step each)
    const bx = JAR.right - 26;
    for (const [sign, y] of [[1, y1 + 26], [-1, y0 - 26]]) {
        g.appendChild(el('g', { 'data-act': `step:${sign}` },
            el('circle', { class: 'stage-btn', cx: bx, cy: y, r: 15 }),
            el('text', { class: 'stage-btn-label', x: bx, y: y + 5, 'text-anchor': 'middle' }, sign > 0 ? '+' : '−')));
    }
    // Visible close: top-left of the stage
    g.appendChild(el('g', { 'data-act': 'close-stage', class: 'text-btn' },
        el('circle', { class: 'stage-btn', cx: JAR.left + 22, cy: y1 - 22, r: 13 }),
        el('text', { class: 'stage-btn-label', x: JAR.left + 22, y: y1 - 17, 'text-anchor': 'middle', 'font-size': '15' }, '✕')));

    // Kind-specific extras
    if (layer.kind === 'starter') {
        // Internal flour/water divide, honest split
        const frac = recipe.starterFlour / recipe.starterMass;
        const splitY = y0 - (y0 - y1) * frac;
        g.appendChild(el('line', { class: 'stage-split', x1: JAR.left + 60, x2: JAR.right - 110, y1: splitY, y2: splitY }));
        g.appendChild(el('text', { class: 'stage-note', x: JAR.left + 60, y: splitY - 5 },
            `${displayGrams(recipe.starterFlour)} g flour · ${displayGrams(recipe.starterWater)} g water`));
        const liquid = state.starter.hydration >= 90;
        g.appendChild(mkTextButton(JAR.left + 60, y0 - 14, liquid ? '● liquid' : '○ liquid', 'starter-liquid'));
        g.appendChild(mkTextButton(JAR.left + 130, y0 - 14, liquid ? '○ stiff' : '● stiff', 'starter-stiff'));
    }
    if (layer.kind === 'flour') {
        g.appendChild(mkTextButton(JAR.left + 60, y0 - 14, 'change type ▸', `flour-type:${layer.flourIndex}`));
        if (state.flours.length > 1) {
            g.appendChild(mkTextButton(JAR.left + 170, y0 - 14, 'remove', `flour-remove:${layer.flourIndex}`));
        }
    }
    svg.appendChild(g);
}

function mkTextButton(x, y, label, act) {
    return el('g', { 'data-act': act, class: 'text-btn' },
        el('rect', { x: x - 6, y: y - 14, width: label.length * 7 + 12, height: 20, rx: 5, fill: 'transparent' }),
        el('text', { x, y }, label));
}

function drawHeadspace(layers, bands, recipe, state, now) {
    // Colophon: one quiet caption line under the glass, always present
    let text;
    if (view.focused) {
        const layer = layers.find(l => l.id === view.focused);
        const kindKey = layer?.kind === 'water' ? 'hydration' : layer?.kind === 'flour' ? 'grain' : layer?.kind;
        const val = layer?.kind === 'water' ? recipe.hydration
            : layer?.kind === 'flour' ? recipe.wholeGrainPct
            : layer?.kind === 'starter' ? recipe.starterPct : recipe.saltPct;
        text = layer ? caption(kindKey, val) : '';
    } else {
        text = `${formatPct(recipe.wholeGrainPct)}% whole grain · ${formatPct(recipe.prefermentedFlourPct)}% prefermented`;
    }
    svg.appendChild(el('text', {
        class: 'colophon', x: (JAR.left + JAR.right) / 2, y: JAR.bottom + 28, 'text-anchor': 'middle',
    }, text));

    // Undo: a fixed pill in the top-left corner, away from everything
    if (now < view.undoUntil && view.undo.length) {
        svg.appendChild(el('g', { class: 'undo-pill', 'data-act': 'undo' },
            el('rect', { class: 'pill-body', x: 8, y: 16, width: 72, height: 32, rx: 16 }),
            el('text', { class: 'pill-label', x: 44, y: 37, 'text-anchor': 'middle' }, '↶ undo'),
            el('rect', { x: 0, y: 8, width: 88, height: 48, fill: 'transparent' })));
    }
}

let ghosts = [];   // { y, label, until }

function drawGhosts(now) {
    ghosts = ghosts.filter(g => now < g.until);
    if (!ghosts.length) return;
    const g = el('g', { class: 'ghosts' });
    for (const ghost of ghosts) {
        const alpha = Math.min(1, (ghost.until - now) / 600);
        g.appendChild(el('line', {
            class: 'ghost-line', x1: JAR.left, x2: JAR.right, y1: ghost.y, y2: ghost.y, opacity: alpha * 0.7,
        }));
        if (ghost.label) {
            g.appendChild(el('text', {
                class: 'ghost-label', x: JAR.right - 8, y: ghost.y - 4, 'text-anchor': 'end', opacity: alpha,
            }, ghost.label));
        }
    }
    svg.appendChild(g);
    requestAnimationFrame(() => store.rerender());
}

function drawShelf(recipe, state) {
    const g = el('g', { class: 'shelf' });
    const cy = SHELF.y + 26;
    g.appendChild(el('line', { class: 'shelf-line', x1: 24, x2: 380, y1: SHELF.y + 44, y2: SHELF.y + 44 }));
    // Boules: one per loaf, radius follows per-loaf weight
    const n = state.numLoaves;
    const r = Math.max(10, Math.min(20, 8 + recipe.weightPerLoaf / 90));
    const span = Math.min(200, n * (r * 2 + 10));
    const x0 = 161 - span / 2 + r;
    for (let i = 0; i < n; i++) {
        const bx = x0 + i * (span - r * 2) / Math.max(1, n - 1 || 1);
        const boule = el('g', { class: 'boule' },
            el('ellipse', { cx: bx, cy: SHELF.y + 36, rx: r, ry: r * 0.62 }),
            el('path', { class: 'score', d: `M ${bx - r * 0.5} ${SHELF.y + 33} q ${r * 0.5} -4 ${r} 0` }));
        g.appendChild(boule);
    }
    g.appendChild(mkTextButton(44, cy + 4, '−', 'loaf-minus'));
    g.appendChild(mkTextButton(278, cy + 4, '+', 'loaf-plus'));
    g.appendChild(el('text', { class: 'shelf-label', x: 161, y: SHELF.y + 58, 'text-anchor': 'middle' },
        `${numberWord(n)} ${n === 1 ? 'loaf' : 'loaves'} · ${displayGrams(recipe.weightPerLoaf)} g each · ≈ ${displayGrams(recipe.bakedWeightPerLoaf)} g baked`));
    svg.appendChild(g);
}

function drawGrains(now) {
    view.grains = view.grains.filter(gr => now < gr.until);
    if (!view.grains.length) return;
    const g = el('g');
    for (const grain of view.grains) {
        const t = 1 - (grain.until - now) / grain.ms;
        g.appendChild(el('circle', {
            class: 'grain', cx: grain.x + Math.sin(t * 9 + grain.seed) * 2.5,
            cy: grain.y0 + (grain.y1 - grain.y0) * t, r: 1.1, opacity: 1 - t * 0.4,
        }));
    }
    svg.appendChild(g);
    requestAnimationFrame(() => store.rerender());
}

let diffChip = null;   // { x, y, main, sub }

function drawDiffChip() {
    if (!diffChip) return;
    const g = el('g', { class: 'diff-chip' });
    const w = Math.max(diffChip.main.length, diffChip.sub.length) * 7.4 + 20;
    let x, y;
    if (diffChip.touch) {
        // A finger hides whatever it touches: pin the readout to whichever
        // end of the jar the hand is NOT on
        x = (JAR.left + JAR.right) / 2 - w / 2;
        y = diffChip.y > 320 ? 16 : 596;
    } else {
        x = Math.min(390 - w - 4, Math.max(4, diffChip.x - w / 2));
        y = Math.max(30, diffChip.y - 58);
    }
    g.appendChild(el('rect', { x, y, width: w, height: 42, rx: 8 }));
    g.appendChild(el('text', { class: 'chip-main', x: x + 10, y: y + 18 }, diffChip.main));
    g.appendChild(el('text', { class: 'chip-sub', x: x + 10, y: y + 34 }, diffChip.sub));
    svg.appendChild(g);
}

/* ---------- pointer machine (delegated on the svg root) ---------- */

function svgPoint(e) {
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (390 / r.width), y: (e.clientY - r.top) * (660 / r.height) };
}

let ptr = null;   // active pointer session

svg.addEventListener('pointerdown', e => {
    const target = e.target.closest?.('[data-act]');
    if (!target) return;
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch { /* stale or synthetic pointer id */ }
    const { state } = store.get();
    const recipe = model.derive(state);
    const p = svgPoint(e);
    ptr = {
        act: target.getAttribute('data-act'),
        touch: e.pointerType !== 'mouse',
        startState: state,
        start: p,
        last: p,
        moved: false,
        recipe0: recipe,
        cellarLastAngle: Math.atan2(p.x - CELLAR.cx, CELLAR.cy - p.y) * 180 / Math.PI,
        cellarAcc: 0,
    };
    gesturing = true;
});

let dragRaf = null;

svg.addEventListener('pointermove', e => {
    if (!ptr) return;
    const p = svgPoint(e);
    if (!ptr.moved && Math.hypot(p.x - ptr.start.x, p.y - ptr.start.y) > 6) ptr.moved = true;
    ptr.last = p;
    if (!ptr.moved || dragRaf) return;
    dragRaf = requestAnimationFrame(() => {
        dragRaf = null;
        if (ptr) routeDrag(ptr.last);
    });
});

function routeDrag(p) {
    const [verb, arg] = ptr.act.split(':');
    const { state } = store.get();
    const recipe = model.derive(state);
    const layers = buildLayers(recipe);

    if (verb === 'edge' || verb === 'proxy') {
        const layer = layers.find(l => l.id === arg);
        if (!layer) return;
        const k = kindFor(layer);
        const r0 = model.derive(ptr.startState);
        const layer0 = buildLayers(r0).find(l => l.id === arg);
        let raw;
        if (verb === 'edge') {
            // Edge drags are honest: dy converts through the jar's gram scale
            const scale = makeJarScale(recipe.doughWeight, { jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity, freeze: true });
            raw = k.fromGrams(r0, layer0.grams + (ptr.start.y - p.y) * scale.gramsPerPx);
        } else {
            // Proxy drags are the fine lane: fixed value-units per pixel,
            // tuned per kind so 20 g of salt is as controllable as water
            raw = k.value(r0) + (ptr.start.y - p.y) * k.perPx;
        }
        const v = applyEdit(layer, raw, true);
        ptr.pending = { layer, raw };
        const r2 = model.derive(store.get().state);
        const l2 = buildLayers(r2).find(l => l.id === arg);
        diffChip = {
            x: p.x, y: p.y, touch: ptr.touch,
            main: `${layer.label} ${round1(v)}%`,
            sub: `${displayGrams(l2.grams)} g (${l2.grams >= layer0.grams ? '+' : ''}${fmtInt(l2.grams - layer0.grams)} g)`,
        };
        store.rerender();
    } else if (verb === 'surface') {
        const scale = makeJarScale(recipe.doughWeight, { jarTopY: JAR.top, jarBottomY: JAR.bottom, prevCapacity, freeze: true });
        const d0 = model.derive(ptr.startState).doughWeight;
        const target = Math.round(d0 + (ptr.start.y - p.y) * scale.gramsPerPx);
        ptr.pendingSurface = target;
        store.apply(s => model.scaleToDoughWeight(s, target));
        const r2 = model.derive(store.get().state);
        diffChip = {
            x: p.x, y: p.y, touch: ptr.touch,
            main: `${displayGrams(r2.doughWeight)} g of dough`,
            sub: `${displayGrams(r2.weightPerLoaf)} g per loaf`,
        };
        store.rerender();
    } else if (verb === 'stage' || (verb === 'band' && view.focused === arg)) {
        // Dragging the magnified band itself edits it - same as the stage
        const layer = layers.find(l => l.id === view.focused);
        if (!layer) return;
        const layout = computeBands(layers, recipe);
        const b = layout.bands.get(layer.id);
        const k = kindFor(layer);
        const frac = Math.min(1, Math.max(0, (b.y0 - p.y) / (b.y0 - b.y1)));
        const raw = k.range[0] + frac * (k.range[1] - k.range[0]);
        const v = applyEdit(layer, raw, true);
        ptr.pending = { layer, raw };
        diffChip = { x: p.x, y: p.y, touch: ptr.touch, main: `${round1(v)}%`, sub: layer.label };
        store.rerender();
    } else if (verb === 'cellar') {
        const cx = CELLAR.cx, cy = CELLAR.cy;
        const ang = Math.atan2(p.x - cx, cy - p.y) * 180 / Math.PI;
        let d = ang - ptr.cellarLastAngle;
        while (d > 180) d -= 360;
        while (d <= -180) d += 360;
        ptr.cellarLastAngle = ang;
        ptr.cellarAcc += d;
        view.cellarSpin += d;
        // Every 15 degrees = one 0.1% detent
        while (Math.abs(ptr.cellarAcc) >= 15) {
            const sign = Math.sign(ptr.cellarAcc);
            ptr.cellarAcc -= sign * 15;
            const cur = model.derive(store.get().state).saltPct;
            store.apply(s => model.setSalt(s, Math.round((cur + sign * 0.1) * 10) / 10));
            navigator.vibrate?.(5);
            if (sign > 0) spawnGrains();
        }
        const r2 = model.derive(store.get().state);
        diffChip = {
            x: p.x, y: p.y, touch: ptr.touch,
            main: `salt ${formatPct(r2.saltPct)}%`,
            sub: `${displayGrams(r2.salt)} g · twist to season`,
        };
        store.rerender();
    }
}

function spawnGrains() {
    const now = performance.now();
    const { state } = store.get();
    const recipe = model.derive(state);
    const layers = buildLayers(recipe);
    const layout = computeBands(layers, recipe);
    const saltY = layout.bands.get('salt')?.y1 ?? JAR.bottom - 100;
    for (let i = 0; i < 5; i++) {
        view.grains.push({
            x: JAR.right - 46 + Math.random() * 34, y0: JAR.top + 4,
            y1: saltY - 1, ms: 500 + Math.random() * 250,
            until: now + 500 + Math.random() * 250, seed: Math.random() * 9,
        });
    }
}

svg.addEventListener('pointerup', e => {
    if (!ptr) return;
    try { if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const session = ptr;
    ptr = null;
    gesturing = false;
    diffChip = null;

    if (session.moved || Math.abs(session.cellarAcc) > 0.01) {
        // Settle: the magnetic snap fires once, on the final value
        if (session.pending) applyEdit(session.pending.layer, session.pending.raw, false);
        if (session.pendingSurface !== undefined) {
            store.apply(s => model.scaleToDoughWeight(s, Math.round(session.pendingSurface / 25) * 25));
        }
        commitGesture(session.startState);
        store.rerender();
        return;
    }
    handleTap(session.act);
});

svg.addEventListener('pointercancel', () => {
    ptr = null;
    gesturing = false;
    diffChip = null;
    store.rerender();
});

function commitGesture(startState) {
    view.undo.push(startState);
    if (view.undo.length > 20) view.undo.shift();
    view.undoUntil = performance.now() + 5000;
    setTimeout(() => store.rerender(), 5100);
}

function handleTap(act) {
    const [verb, arg] = act.split(':');
    const { state } = store.get();

    if (verb === 'band' || verb === 'proxy') {
        if (view.focused === arg) exitFocus();
        else enterFocus(arg);
    } else if (verb === 'cellar') {
        enterFocus('salt');
    } else if (verb === 'close-stage') {
        exitFocus();
    } else if (verb === 'step') {
        const recipe = model.derive(state);
        const layer = buildLayers(recipe).find(l => l.id === view.focused);
        if (!layer) return;
        const k = kindFor(layer);
        view.undo.push(state);
        const cur = k.value(recipe);
        store.apply(s => k.edit(s, Math.min(k.range[1], Math.max(k.range[0],
            Math.round((cur + Number(arg) * k.step) * 100) / 100))));
    } else if (verb === 'undo') {
        const prev = view.undo.pop();
        if (prev) {
            view.undoUntil = 0;
            store.apply(() => prev);
        }
    } else if (verb === 'loaf-minus' || verb === 'loaf-plus') {
        store.apply(s => model.setNumLoaves(s, s.numLoaves + (verb === 'loaf-plus' ? 1 : -1)));
    } else if (verb === 'starter-liquid' || verb === 'starter-stiff') {
        view.undo.push(state);
        store.apply(s => model.setStarterHydration(s, verb === 'starter-liquid' ? 100 : 60));
    } else if (verb === 'flour-type') {
        const i = Number(arg);
        const keys = Object.keys(model.FLOUR_TYPES);
        view.undo.push(state);
        store.apply(s => {
            const curKey = s.flours[i].key;
            const used = new Set(s.flours.map(f => f.key));
            let next = curKey;
            for (let step = 1; step <= keys.length; step++) {
                const cand = keys[(keys.indexOf(curKey) + step) % keys.length];
                if (!used.has(cand) || cand === curKey) { next = cand; break; }
            }
            return model.setFlourBlend(s, s.flours.map((f, fi) => ({ key: fi === i ? next : f.key, pct: f.pct })));
        });
    } else if (verb === 'flour-remove') {
        const i = Number(arg);
        view.undo.push(state);
        exitFocus();
        store.apply(s => model.setFlourBlend(s, s.flours.filter((_, fi) => fi !== i)));
    }
}

/* ---------- focus transitions ---------- */

function snapshotBands() {
    const { state } = store.get();
    const recipe = model.derive(state);
    const layers = buildLayers(recipe);
    return computeBands(layers, recipe).bands;
}

function enterFocus(id) {
    if (view.focused === id) return;
    const from = snapshotBands();
    view.focused = id;
    view.lerp = { from, start: performance.now(), ms: 200 };
    store.rerender();
}

function exitFocus() {
    if (!view.focused) return;
    const from = snapshotBands();
    view.focused = null;
    view.lerp = { from, start: performance.now(), ms: 200 };
    store.rerender();
}

/* ---------- presets: ghost diff + pour-in ---------- */

const presetSelect = $('preset-select');
for (const preset of PRESETS) {
    presetSelect.appendChild(el('option', { value: preset.id }, preset.name));
}
presetSelect.addEventListener('change', () => {
    const preset = getPreset(presetSelect.value);
    if (!preset) return;
    const { state } = store.get();
    view.undo.push(state);
    // Ghost hairlines: where the old edges were, labeled with the deltas
    const oldBands = snapshotBands();
    const oldRecipe = model.derive(state);
    view.focused = null;
    prevCapacity = null;
    store.apply(() => model.sanitizeState(preset.state));
    const newRecipe = model.derive(store.get().state);
    const now = performance.now();
    ghosts = [];
    for (const [id, b] of oldBands) {
        if (id === 'water') {
            const d = newRecipe.hydration - oldRecipe.hydration;
            ghosts.push({ y: b.y1, until: now + 1800, label: `${d >= 0 ? '+' : ''}${round1(d)}% hydration` });
        }
    }
    view.pour = { start: now, ms: 800 };
    store.rerender();
});

/* ---------- boot ---------- */

addEventListener('hashchange', () => {
    const fresh = loadFromHash();
    store.apply(() => fresh.state);
    store.setEnv(fresh.env);
});

store.rerender();
