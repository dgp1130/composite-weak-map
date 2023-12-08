import assert from 'node:assert';
import { describe, it } from 'node:test';
import { CompositeWeakMap } from './composite-weak-map.js';

describe('index', () => {
    describe('CompositeWeakMap', () => {
        interface TestKey { name: string; }
        const first: TestKey = { name: 'first' };
        const second: TestKey = { name: 'second' };
        const third: TestKey = { name: 'third' };

        it('basic lookup returns value', () => {
            const map = new CompositeWeakMap<TestKey[], string>();
            map.set([ first, second, third ], 'test');

            assert.strictEqual(map.get([ first, second, third ]), 'test');
        });

        it('empty lookup returns `undefined`', () => {
            const map = new CompositeWeakMap<TestKey[], string>();

            assert.strictEqual(map.get([ first, second, third ]), undefined);
        });

        it('reused partial keys return `undefined`', () => {
            const map = new CompositeWeakMap<TestKey[], string>();

            map.set([ first, second ], 'test1');
            assert.strictEqual(map.get([ first, third ]), undefined);

            map.set([ first, third ], 'test2');
            assert.strictEqual(map.get([ first, third ]), 'test2');
        });

        it('out of order lookup returns `undefined`', () => {
            const map = new CompositeWeakMap<TestKey[], string>();
            map.set([ first, second, third ], 'test');

            assert.strictEqual(map.get([ third, second, first ]), undefined);
        });

        it('smaller size lookup returns `undefined`', () => {
            const map = new CompositeWeakMap<TestKey[], string>();
            map.set([ first, second, third ], 'test');

            assert.strictEqual(map.get([ first, second ]), undefined);
        });

        it('larger size lookup returns `undefined`', () => {
            const map = new CompositeWeakMap<TestKey[], string>();
            map.set([ first, second ], 'test');

            assert.strictEqual(map.get([ first, second, third ]), undefined);
        });

        it('throws on empty keys array', () => {
            const map = new CompositeWeakMap<TestKey[], string>();

            assert.throws(() => map.get([]), /At least one key is required\./);
            assert.throws(
                () => map.set([], 'test'), /At least one key is required\./);
            assert.throws(() => map.has([]), /At least one key is required\./);
            assert.throws(
                () => map.delete([]), /At least one key is required\./);
        });

        it('`has` works', () => {
            const map = new CompositeWeakMap<TestKey[], string>();
            map.set([ first, second, third ], 'test');

            assert.strictEqual(map.has([ first, second, third ]), true);
            assert.strictEqual(map.has([ first, second ]), false);
        });

        it('`delete` works', () => {
            const map = new CompositeWeakMap<TestKey[], string>();

            map.set([ first, second, third ], 'test');

            assert.strictEqual(map.delete([ first, second, third ]), true);

            assert.strictEqual(map.get([ first, second, third ]), undefined);

            assert.strictEqual(map.delete([ first, second, third ]), false);
        });

        it('not assignable to `WeakMap`', () => {
            const map = new CompositeWeakMap<TestKey[], string>();

            // @ts-expect-error `toStringTag` prevents this assignment.
            const weakMap: WeakMap<TestKey[], string> = map;
        });
    });
});
