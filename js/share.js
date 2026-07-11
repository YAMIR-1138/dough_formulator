/**
 * share.js — encode/decode recipe state in the URL hash for backend-free
 * sharing. Format: #r=<base64url(JSON {v, s: state, e: env})>.
 */
import { sanitizeState } from './model.js';

function base64urlEncode(str) {
    // Handle unicode safely, then make base64 URL-safe
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return decodeURIComponent(escape(atob(padded)));
}

/**
 * Encode state + timeline env into a hash string ("#r=...").
 * env: { roomTemp, retardHours, mode } — only these are shared.
 */
export function encodeState(state, env = {}) {
    const payload = {
        v: 1,
        s: {
            flourTotal: state.flourTotal,
            hydration: state.hydration,
            saltPct: state.saltPct,
            starter: { pct: state.starter.pct, hydration: state.starter.hydration },
            flours: state.flours.map(f => ({ key: f.key, pct: Math.round(f.pct * 10) / 10 })),
            addIns: state.addIns.length ? state.addIns : undefined,
            numLoaves: state.numLoaves !== 1 ? state.numLoaves : undefined,
            bakeLossPct: state.bakeLossPct !== 12 ? state.bakeLossPct : undefined,
            reservedWaterPct: state.reservedWaterPct || undefined,
            pinFlour: state.pinFlour || undefined,
        },
        e: {
            roomTemp: env.roomTemp,
            retardHours: env.retardHours,
            mode: env.mode,
        },
    };
    return '#r=' + base64urlEncode(JSON.stringify(payload));
}

/**
 * Decode a location.hash. Returns { state, env } with a fully-sanitized
 * state, or null for anything malformed — never throws.
 */
export function decodeHash(hash) {
    try {
        if (!hash) return null;
        const match = /(?:^|[#&])r=([A-Za-z0-9_-]+)/.exec(hash);
        if (!match) return null;
        const payload = JSON.parse(base64urlDecode(match[1]));
        if (!payload || payload.v !== 1) return null;
        const state = sanitizeState(payload.s);
        if (!state) return null;
        const e = payload.e || {};
        const env = {
            roomTemp: Number.isFinite(e.roomTemp) ? Math.min(35, Math.max(10, e.roomTemp)) : undefined,
            retardHours: Number.isFinite(e.retardHours) ? Math.min(48, Math.max(0, e.retardHours)) : undefined,
            mode: e.mode === 'ready' ? 'ready' : (e.mode === 'start' ? 'start' : undefined),
        };
        return { state, env };
    } catch {
        return null;
    }
}
