import { test, eq, close, ok } from './assert.js';
import { encodeState, decodeHash } from '../js/share.js';
import { defaultState, setStarterHydration, setFlourBlend } from '../js/model.js';

test('Share: encode/decode round-trips the state', () => {
    let s = setStarterHydration(defaultState(), 60);
    s = setFlourBlend(s, [{ key: 'bread', pct: 60 }, { key: 'rye', pct: 40 }]);
    const hash = encodeState(s, { roomTemp: 25, retardHours: 14, mode: 'ready' });
    ok(hash.startsWith('#r='), 'hash format');
    const decoded = decodeHash(hash);
    ok(decoded, 'decodes');
    close(decoded.state.flourTotal, 1000, 1e-9, 'flour');
    close(decoded.state.hydration, 75, 1e-9, 'hydration');
    close(decoded.state.starter.hydration, 60, 1e-9, 'starter hydration');
    close(decoded.state.flours[1].pct, 40, 0.1, 'rye pct');
    close(decoded.env.roomTemp, 25, 1e-9, 'roomTemp');
    close(decoded.env.retardHours, 14, 1e-9, 'retardHours');
    eq(decoded.env.mode, 'ready', 'mode');
});

test('Share: hash stays compact (<300 chars)', () => {
    const hash = encodeState(defaultState(), { roomTemp: 22, retardHours: 12, mode: 'start' });
    ok(hash.length < 300, `hash length ${hash.length}`);
});

test('Share: malformed input returns null, never throws', () => {
    eq(decodeHash(''), null, 'empty');
    eq(decodeHash('#foo=bar'), null, 'wrong key');
    eq(decodeHash('#r=!!!not-base64!!!'), null, 'invalid chars');
    eq(decodeHash('#r=aGVsbG8'), null, 'valid base64, not JSON');
    eq(decodeHash('#r=' + btoa(JSON.stringify({ v: 99, s: {} })).replace(/=+$/, '')), null, 'wrong version');
});

test('Share: decoded state is sanitized (hostile values clamped)', () => {
    const hostile = btoa(JSON.stringify({
        v: 1,
        s: { flourTotal: 1e12, hydration: -50, starter: { pct: 20, hydration: 100 } },
        e: { roomTemp: 9000 },
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const decoded = decodeHash('#r=' + hostile);
    ok(decoded, 'decodes');
    close(decoded.state.flourTotal, 20000, 1e-9, 'flour clamped to max');
    close(decoded.state.hydration, 40, 1e-9, 'hydration clamped to min');
    close(decoded.env.roomTemp, 35, 1e-9, 'room temp clamped');
});
