/**
 * assert.js - tiny test helpers, no framework.
 * Tests register with test(name, fn); run() executes them all and
 * returns { passed, failed, results } for the browser or Node runner.
 */

const tests = [];

export function test(name, fn) {
    tests.push({ name, fn });
}

export function eq(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

export function close(actual, expected, eps = 0.01, msg = '') {
    if (!(Math.abs(actual - expected) <= eps)) {
        throw new Error(`${msg} - expected ≈${expected} (±${eps}), got ${actual}`);
    }
}

export function deepEq(actual, expected, msg = '') {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
        throw new Error(`${msg} - expected ${b}, got ${a}`);
    }
}

export function ok(value, msg = '') {
    if (!value) throw new Error(`${msg} - expected truthy, got ${JSON.stringify(value)}`);
}

export function run() {
    const results = [];
    let passed = 0;
    let failed = 0;
    for (const t of tests) {
        try {
            t.fn();
            results.push({ name: t.name, ok: true });
            passed++;
        } catch (err) {
            results.push({ name: t.name, ok: false, error: err.message });
            failed++;
        }
    }
    return { passed, failed, results };
}
