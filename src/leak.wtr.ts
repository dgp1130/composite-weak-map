import { expect } from '@esm-bundle/chai';
import { CompositeKey, CompositeWeakMap } from './composite-weak-map.js';
import { trackMemory } from './memory.js';
import type {} from './performance.js'; // Pull in global type.

const tolerance = 1_000_000 /* 1 MB */;

describe('CompositeWeakMap', () => {
    interface TestKey {
        readonly name: string;
    }
    const first: TestKey = { name: 'first' };
    const second: TestKey = { name: 'second' };
    const third: TestKey = { name: 'third' };

    // Require experimental browser APIs.
    before(() => {
        // `measureUserAgentSpecificMemory` is Chromium-only right now and
        // experimental.
        expect(
            performance.measureUserAgentSpecificMemory,
            '`measureUserAgentSpecificMemory` not enabled for this browser.',
        ).not.to.be.undefined;

        // `window.gc` requires `--js-flags=--expose-gc` and also seems to
        // require that no *other* browser window is open when Chrome is
        // executed, or else it will reuse the existing Chrome program and
        // ignore this flag entirely.
        expect(
            window.gc,
            '`window.gc` not enabled for this browser.',
        ).not.to.be.undefined;
    });

    it('`delete` does not leak value object', async () => {
        for (let i = 0; i < 100; ++i) {
            // Each iteration should use its own map. We're only testing a
            // single `set` call here. If we re-used the map, each `set` would
            // clear the previous `set`, and wouldn't make a good test.
            const map = new CompositeWeakMap();

            const memoryUsage = await trackMemory(() => {
                map.set([ first, second, third ], createLargeObj());
                map.delete([ first, second, third ]);
            });

            expect(memoryUsage).to.be.lessThan(tolerance);
        }
    }).timeout(10_000 /* 10 seconds */);

    it('`delete` does not leak composite key', async () => {
        for (let i = 0; i < 100; ++i) {
            // Each iteration should use its own map. We're only testing a
            // single `set` call here. If we re-used the map, each `set` would
            // clear the previous `set`, and wouldn't make a good test.
            const map = new CompositeWeakMapWithLargeCompositeKey();

            const memoryUsage = await trackMemory(() => {
                map.set([ first, second, third ], createLargeObj());
                map.delete([ first, second, third ]);
            });

            expect(memoryUsage).to.be.lessThan(tolerance);
        }
    }).timeout(10_000 /* 10 seconds */);

    it('does not leak value object when a partial key is reclaimed', async () => {
        for (let i = 0; i < 100; ++i) {
            // Each iteration should use its own map. We're only testing a
            // single `set` call here. If we re-used the map, each `set` would
            // clear the previous `set`, and wouldn't make a good test.
            const map = new CompositeWeakMap();

            const memoryUsage = await trackMemory(() => {
                // When `temp` falls out of scope after this function is
                // completed it will be reclaimed by the GC. At that point, the
                // object in the map is no longer accessible and should be
                // reclaimed as well.
                const temp: TestKey = { name: 'temp' };
                map.set([ first, temp ], createLargeObj());
            });

            expect(memoryUsage).to.be.lessThan(tolerance);
        }
    }).timeout(10_000 /* 10 seconds */);

    it('does not leak composite key when a partial key is reclaimed', async () => {
        for (let i = 0; i < 100; ++i) {
            // Each iteration should use its own map. We're only testing a
            // single `set` call here. If we re-used the map, each `set` would
            // clear the previous `set`, and wouldn't make a good test.
            const map = new CompositeWeakMapWithLargeCompositeKey();

            const memoryUsage = await trackMemory(() => {
                // `first`, `second`, `third`, and `temp` all have references to
                // the composite key. Even though only `temp` is reclaimed, all
                // of the composite key references should be cleaned up as well
                // so it can be reclaimed correctly.
                const temp: TestKey = { name: 'temp' };
                map.set([ first, second, third, temp ], 'test');
            });

            expect(memoryUsage).to.be.lessThan(tolerance);
        }
    }).timeout(10_000 /* 10 seconds */);
});

/**
 * Normally, the composite key is very small (just a `{}`), so if it is leaked
 * it would be difficult to see in memory analysis and could be attributed to
 * general noise. To address this, we override the composite key with a large
 * value so it will be more visible in memory analysis.
 */
class CompositeWeakMapWithLargeCompositeKey<
    PartialKeys extends readonly object[],
    Value,
> extends CompositeWeakMap<PartialKeys, Value> {
    protected override createCompositeKey(): CompositeKey {
        return {
            largeObj: createLargeObj(),
        } as CompositeKey;
    }
}

function createLargeObj(): {} {
    return new ArrayBuffer(5_000_000 /* 5 MB */);
}
