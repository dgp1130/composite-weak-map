/**
 * Partial keys can be any reference, they just need to be usable in `WeakMap`.
 */
type PartialKey = object;

/**
 * A single reference which is the composite of multiple other references used
 * as keys.
 */
interface CompositeKey {
    /** Just here for better typing. */
    readonly __brand?: 'composite-key';
}

/**
 * The position of a partial key in a key array expressed as a string. The first
 * number if the 1-based index of the position of the partial key in the array.
 * The second number is the length of the key array.
 */
type PartialKeyPos = `${number}/${number}`;

/**
 * # `CompositeWeakMap`
 *
 * A weak map which takes multiple partial key objects, combines them into a
 * single composite key and maps that key to a value. Everything is weakly
 * referenced, so when any partial key is garbage collected, any associated
 * values are also eligible to be dropped.
 *
 * ## Data Structure
 *
 * The underlying data structure looks like this:
 *
 * ```
 * CompositeWeakMap<PartialKey[], Value> {
 *   // Maps each partial key to a set of potential composite keys for its
 *   // position and size in the key array.
 *   compositeKeyMap = WeakMap PartialKey -> Map {
 *     PartialKeyPosition { index, size } -> Set {
 *       CompositeKey
 *     }
 *   }
 *
 *   // Maps each composite key to the result value.
 *   resultMap = WeakMap CompositeKey -> Value
 * }
 * ```
 *
 * ## Example
 *
 * With real data, this looks like:
 *
 * ```
 * map.set([ first, second, third ], 1);
 * map.set([ second, third ], 2)
 *
 * CompositeWeakMap<Array<{ name: string }>, Value> {
 *   compositeKeyMap = WeakMap {
 *     { name: 'first' } -> Map {
 *       '1/3' -> Set { CompositeKey (1) }
 *     }
 *     { name: 'second' } -> Map {
 *       '2/3' -> Set { CompositeKey (1) }
 *       '1/2' -> Set { CompositeKey (2) }
 *     }
 *     { name: 'third' } -> Map {
 *       '3/3' -> Set { CompositeKey (1) }
 *       '2/2' -> Set { CompositeKey (2) }
 *     }
 *   }
 *
 *   resultMap = WeakMap {
 *     CompositeKey (1) -> Result (1)
 *     CompositeKey (2) -> Result (2)
 *   }
 * }
 * ```
 *
 * Each partial key is weak map to a `partialKeyPosMap`. Each `partialKeyPosMap`
 * maps the partial key at a specific position of the full key array to the set
 * of composite keys which use that partial key in the appropriate position for
 * a key array of the right size. A `partialKeyPos` itself contains the position
 * of a partial key as well as the total number of partial keys.
 *
 * For the call `map.set([ first, second ], 'test')`, we would have two
 * `partialKeyPos` values:
 * *   `first`  -> '1/2' (key one of two)
 * *   `second` -> '2/2' (key two of two)
 *
 * With a partial key and the `partialKeyPos` for that key, we can use
 * `compositeWeakMap` to find a set of candidate composite keys.
 *
 * This is a set of *candidates* because a single partial key could be used in
 * multiple composite keys at the same location and which happen to be the
 * same size.
 *
 * A composite key is an empty object, one which exists only to provide a unique
 * reference independent of all the partial keys. A new composite key is created
 * on first insertion of a key array.
 *
 * `resultMap` takes a composite key and maps it to the actual result of the
 * `CompositeWeakMap` lookup.
 *
 * ## Algorithm
 *
 * First we take each partial key and look them up in `compositeKeyMap`. Each
 * partial key will have a `partialKeyPosMap`. We then compute the
 * `partialKeyPos` of each key (because we know it is key `1/2` for example) and
 * look that up in the `partialKeyPosMap`. This gives a set of candidate
 * composite keys, but we have no way of knowing which one is the right one.
 *
 * Each partial key has a set of candidate composite keys, however each
 * composite key is only used for a single result, therefore the same composite
 * key will be referenced in all candidates for each partial key. We then
 * compare each composite candidate to each other to find the single reference
 * shared amongst all partial keys. This is the actual composite key.
 *
 * Lastly we look up the composite key in the `resultMap` to find the final
 * result.
 *
 * ## Runtime
 *
 * The runtime of this is:
 * * Assumes Map, WeakMap, and Set lookups are O(1).
 * * Assumes the number of items in `CompositeWeakMap` is n.
 * * Assumes the number of partial keys in the lookup is m.
 *
 * ```
 * O(looking up candidate key sets) =
 *     O(n) partial keys
 *     * O(1) `compositeKeyMap` lookup
 *     * O(1) `partialKeyPosMap` lookup
 *     = O(n)
 * O(finding the single candidate key) =
 *     O(n) composite candidates in first partial key set
 *     * O(m) other composite candidates in all other partial key sets
 *     * O(1) set lookup
 *     = O(nm)
 * O(looking up result) = O(1)
 *
 * O(total) =
 *     O(looking up candidate key sets)
 *     + O(finding the single candidate key)
 *     + O(looking up result)
 * O(total) = O(n) + O(nm) + O(1)
 * O(total) = O(nm)
 * ```
 *
 * While scaling linearly in the worst case, this only happens if a single
 * partial key is used in most of the lookups in a consistent index and in a key
 * array of consistent size. If the used key arrays provide reasonable
 * uniqueness, then this mostly scales with `O(m)`, which will typically be
 * quite small in practice (significantly smaller than n).
 *
 * ### Optimization
 *
 * The `partialKeyPosMap` is not strictly necessary and this could be
 * implemented without it. However using this map improves the runtime by using
 * a `O(1)` look up instead of getting all possible `partialKeyPos` objects and
 * performing a `O(n)` filtering operation.
 *
 * ## Doesn't the `Map` leak?
 *
 * `partialKeyPosMap` is a `Map`, not a `WeakMap`. This is because it accepts
 * string keys ('1/2'), not object references. This would imply that the map's
 * entries leak, since they are never removed from the map. If two partial keys
 * are used, they will contain references to the same composite key. These
 * references are behind `compositeKeyMap` (a `WeakMap`), so when a partial key
 * gets garbage collected, its `partialKeyPosMap` is also cleaned up.
 *
 * However, the *other* partial key still contains a reference to a
 * now-inaccessible composite key. Consider:
 *
 * ```typescript
 * const first = { name: 'first' };
 * {
 *   const second = { name: 'second' };
 *   map.set([ first, second ], 1);
 * }
 *
 * // `first` is still in scope, but `second` is eligible for garbage
 * // collection. It is impossible to read `1` at this point because there is no
 * // way to get a reference to `second`!
 * ```
 *
 * In this case, once `second` is reclaimed, it's `partialKeyPosMap` will be
 * cleaned up. However, `first` still contains a reference to the composite key
 * used. It will still contain:
 *
 * ```
 * CompositeWeakMap<Array<{ name: string }>, Value> {
 *   compositeKeyMap = WeakMap {
 *     { name: 'first' } -> Map {
 *       '1/2' -> Set { CompositeKey (1) }
 *     }
 *   }
 * }
 * ```
 *
 * This composite key is inaccessible because the `second` partial key cannot be
 * presented to `CompositeWeakMap` and is effectively garbage.
 *
 * However, there is a `FinalizationRegistry` which prevents this leak. When a
 * new composite key is inserted, `CompositeWeakMap` will configure each partial
 * key to set up a `FinalizationRegistry` on all *other* partial keys used. If
 * any one is garbage collected, then the composite key is removed from the
 * `partialKeyPosMap`. This way we end up back in the original state:
 *
 * ```
 * CompositeWeakMap<Array<{ name: string }>, Value> {
 *   compositeKeyMap = WeakMap {
 *     // Empty
 *   }
 * }
 * ```
 *
 * ## Relationship to `WeakMap`
 *
 * While this implements the `WeakMap` contract, it deliberately does *not*
 * actually implementing `WeakMap`. This is because `WeakMap` has different
 * semantics around its inputs. An array is an object, so
 * `weakMap.set([], 'test')` is valid and can make sense in some situations.
 * However `compositeWeakMap.set([], 'test')` is an error. The same semantic
 * difference applies for objects inside an array, where:
 *
 * ```typescript
 * map.get([ first, second ]) === map.get([ first, second ]);
 * ```
 *
 * will be `true` if `map` is a `CompositeWeakMap` (because the array is not
 * important to the lookup). However a `WeakMap` will return `false` because
 * these are two different array objects, even though they contain the same
 * contents.
 */
export class CompositeWeakMap<
    PartialKeys extends readonly PartialKey[],
    Value,
> {
    /** Maps partial keys to any associated composite keys. */
    private readonly compositeKeyMap =
        new WeakMap<PartialKey, Map<PartialKeyPos, Set<CompositeKey>>>();

    /** Maps composite keys to the result of the `CompositeWeakMap`. */
    private readonly resultMap = new WeakMap<CompositeKey, Value>();

    /**
     * Set of {@link FinalizationRegistry} objects being used for cleanup. We
     * don't actually care about this set and never read it, however there is a
     * unique caveat where registries will never invoke their callback if the
     * registry itself is not accessible from JavaScript. Therefore we can't
     * just create one and then drop all references to it. Instead, we store
     * them in this set and remove them once they execute.
     *
     * From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry#notes_on_cleanup_callbacks:
     * > *   There are also situations where even implementations that normally
     * >     call cleanup callbacks are unlikely to call them:
     * >     *   When the FinalizationRegistry instance itself is no longer
     * >         reachable by JavaScript code.
     */
    private readonly registries =
        new Set<FinalizationRegistry<FinalizationData>>();

    /**
     * Looks up the given keys in the map and returns the result if found, or
     * `undefined` if not.
     */
    public get(partialKeys: PartialKeys): Value | undefined {
        assertKeysValid(partialKeys);

        const compositeKey = this.getCompositeKey(partialKeys);
        if (!compositeKey) return undefined;
        return this.resultMap.get(compositeKey);
    }

    /** Sets the given keys to the provided value. Returns `this`. */
    public set(partialKeys: PartialKeys, value: Value): this {
        assertKeysValid(partialKeys);

        const compositeKey = this.getOrCreateCompositeKey(partialKeys);
        this.setCompositeKey(partialKeys, compositeKey);
        this.resultMap.set(compositeKey, value);

        return this;
    }

    /** Returns whether or not the map has an entry for the provided keys. */
    public has(partialKeys: PartialKeys): boolean {
        assertKeysValid(partialKeys);

        const compositeKey = this.getCompositeKey(partialKeys);
        if (!compositeKey) return false;
        return this.resultMap.has(compositeKey);
    }

    /**
     * Deletes the entry at the given keys for this map and returns whether
     * or not a key was found which needed to be deleted.
     */
    public delete(partialKeys: PartialKeys): boolean {
        assertKeysValid(partialKeys);

        const compositeKey = this.getCompositeKey(partialKeys);
        if (!compositeKey) return false;
        return this.resultMap.delete(compositeKey);
    }

    /**
     * Looks in the `compositeKeyMap` to find if an existing `CompositeKey`
     * already exists for the provided partial keys. Otherwise creates a new
     * composite key reference.
     */
    private getOrCreateCompositeKey(partialKeys: PartialKeys): CompositeKey {
        const existingCompositeKey = this.getCompositeKey(partialKeys);
        if (existingCompositeKey) return existingCompositeKey;

        return {} as CompositeKey;
    }

    /**
     * Looks in the `compositeKeyMap` to find if an existing `CompositeKey`
     * already exists.
     */
    private getCompositeKey(partialKeys: PartialKeys):
            CompositeKey | undefined {
        const compositeKeyHandles = partialKeys.map((key) => {
            return this.compositeKeyMap.get(key)
                    ?? new Map<PartialKeyPos, Set<CompositeKey>>();
        });

        // Filter to handles where each key is used in the correct order and has
        // the right number of total keys.
        const partialKeysCandidates = compositeKeyHandles.map((partialKeyPosMap, keyIndex) => {
            const partialKeyPos = createPartialKeyPosition({
                index: keyIndex,
                size: partialKeys.length,
            });

            return partialKeyPosMap.get(partialKeyPos)
                    ?? new Set<CompositeKey>();
        });

        // To find the composite key we need to compare all composite key
        // candidates to find the one shared reference between all partial keys.
        // To do this, we pick a partial key, and use its candidates knowing
        // that one of them must be the correct composite key. We then check
        // each one against all the other candidates from each partial key. Once
        // we find a composite key which is present in the candidates from each
        // partial key, we know we have found the correct composite key.
        //
        // The initial partial key chosen is arbitrary and doesn't matter.
        // However, as an optimization we look for the partial key with the
        // fewest composite key candidates. This is most optimal because it
        // requires the fewest outer loop iterations.
        const fewestPartialKeyCandidates = minimum(
            partialKeysCandidates,
            (partialKeyCandidates) => partialKeyCandidates.size,
        );
        const remainingPartialKeysCandidates =
            remove(partialKeysCandidates, fewestPartialKeyCandidates);
        return Array.from(fewestPartialKeyCandidates.values())
            .find((candidateCompositeKey) => {
                return remainingPartialKeysCandidates
                    .every((otherPartialKeyCandidates) => {
                        return otherPartialKeyCandidates
                            .has(candidateCompositeKey);
                    });
                });
    }

    /**
     * Sets the `compositeKeyMap` to assign the given partial keys to the
     * provided `CompositeKey`.
     */
    private setCompositeKey(
        partialKeys: PartialKeys,
        compositeKey: CompositeKey,
    ): void {
        // We need a unique `FinalizationRegistry` instance for each composite
        // key because when any partial key is GC'd we want to stop listening
        // for any other partial key which might be GC'd in the future. However
        // that partial key might be used in other composite keys and
        // `FinalizationRegistry.prototype.unregister` will unregister *all*
        // registrations for that reference. Therefore each composite key needs
        // its own registry so one unregistration doesn't break another.
        const finalizationRegistry = new FinalizationRegistry<FinalizationData>(
            ({ partialKeyRef, partialKeyPos, unregisterToken }) => {
                const partialKey = partialKeyRef.deref();
                if (!partialKey) return; // Key was already cleaned up.

                const partialKeyPosMap = this.compositeKeyMap.get(partialKey);
                if (!partialKeyPosMap) return; // Key was already cleaned up.

                const compositeKeys = partialKeyPosMap.get(partialKeyPos);
                if (!compositeKeys) return; // Key was already cleaned up.

                // Delete the composite key reference from this partial key
                // position.
                compositeKeys.delete(compositeKey);

                finalizationRegistry.unregister(unregisterToken);
                this.registries.delete(finalizationRegistry);
            },
        );
        this.registries.add(finalizationRegistry);

        const size = partialKeys.length;
        for (const [ index, partialKey ] of partialKeys.entries()) {
            const partialKeyPosMap = this.compositeKeyMap.get(partialKey)
                    ?? new Map<PartialKeyPos, Set<CompositeKey>>();
            this.compositeKeyMap.set(partialKey, partialKeyPosMap);

            const partialKeyPos = createPartialKeyPosition({ index, size });
            const compositeKeys = partialKeyPosMap.get(partialKeyPos)
                    ?? new Set<CompositeKey>();
            partialKeyPosMap.set(partialKeyPos, compositeKeys);
            compositeKeys.add(compositeKey);

            const partialKeyRef = new WeakRef<PartialKey>(partialKey);
            const otherPartialKeys = partialKeys
                .filter((otherPartialKey) => partialKey !== otherPartialKey);

            // Register finalization callbacks for every other partial key. If
            // any *one* of them fall out of scope, then the composite key we
            // just added can never be read and is effectively garbage. We need
            // to drop the composite key in that case.
            //
            // Since any partial key being reclaimed invalidates the composite
            // key we need to listen to all of them, but only care about the
            // first one reclaimed. Therefore we tie them all together with a
            // single `unregisterToken`. When the first partial key is reclaimed
            // and the composite key is freed, all other finalization callbacks
            // which would clean up the same partial key -> composite key edge
            // are unregistered via this token.
            const unregisterToken = {};
            for (const otherPartialKey of otherPartialKeys) {
                finalizationRegistry.register(
                    otherPartialKey,
                    { partialKeyRef, partialKeyPos, unregisterToken },
                    unregisterToken,
                );
            }
        }
    }

    // Could implement `Symbol.toStringTag`, but it's kind of nice not to so
    // it prevents `CompositeWeakMap` from being assignable to `WeakMap`.
    // get [Symbol.toStringTag](): string {
    //     return `CompositeWeakMap`;
    // }
}

interface FinalizationData {
    /**
     * The partial key with a reference to a now-inaccessible composite key
     * which should be cleaned up.
     */
    partialKeyRef: WeakRef<PartialKey>,

    /**
     * The position of the partial key in the composite key which needs to be
     * cleaned up.
     */
    partialKeyPos: PartialKeyPos,

    /**
     * A token to unregister all other {@link FinalizationRegistry}
     * registrations which would clear this data.
     */
    unregisterToken: {},
}

function createPartialKeyPosition({ index, size }: {
    index: number,
    size: number,
}): PartialKeyPos {
    // Start counting at 1 to make this match size.
    return `${index + 1}/${size}`;
}

function assertKeysValid(keys: readonly PartialKey[]): void {
    if (keys.length === 0) throw new Error('At least one key is required.');
}

/**
 * Finds and returns the object in the array with the minimum value as returned
 * by the `selector` function. If multiple objects have the same value, the
 * first one will be returned.
 */
function minimum<Value>(array: Value[], selector: (value: Value) => number):
        Value {
    if (array.length === 0) {
        throw new Error('Cannot get the minimum of an empty array.');
    }

    const [ first, ...rest ] = array;
    let minimum = first;
    let minimumCount = selector(first);

    for (const value of rest) {
        const count = selector(value);
        if (count < minimumCount) {
            minimumCount = count;
            minimum = value;
        }
    }

    return minimum;
}

/** Removes the given value from the input array. */
function remove<Value>(array: Value[], value: Value): Value[] {
    const index = array.findIndex((v) => v === value);
    if (index === -1) throw new Error('Value to extract not in array.');

    return array.splice(index, 1);
}

// Test cases

// Test data to use.
interface TestKey { name: string; }
const first: TestKey = { name: 'first' };
const second: TestKey = { name: 'second' };
const third: TestKey = { name: 'third' };

test('Basic lookup returns value', (assert) => {
    const map = new CompositeWeakMap<TestKey[], string>();
    map.set([ first, second, third ], 'test');

    assert(map.get([ first, second, third ]), 'test');
});

test('Empty lookup returns `undefined`', (assert) => {
    const map = new CompositeWeakMap<TestKey[], string>();

    assert(map.get([ first, second, third ]), undefined);
});

test('Reused partial keys return `undefined`', (assert) => {
    const map = new CompositeWeakMap<TestKey[], string>();

    map.set([ first, second ], 'test1');
    assert(map.get([ first, third ]), undefined);

    map.set([ first, third ], 'test2');
    assert(map.get([ first, third ]), 'test2');
});

test('Out of order lookup returns `undefined`', (assert) => {
    const map = new CompositeWeakMap<TestKey[], string>();
    map.set([ first, second, third ], 'test');

    assert(map.get([ third, second, first ]), undefined);
});

test('Smaller size lookup returns `undefined`', (assert) => {
    const map = new CompositeWeakMap<TestKey[], string>();
    map.set([ first, second, third ], 'test');

    assert(map.get([ first, second ]), undefined);
});

test('Larger size lookup returns `undefined`', (assert) => {
    const map = new CompositeWeakMap<TestKey[], string>();
    map.set([ first, second ], 'test');

    assert(map.get([ first, second, third ]), undefined);
});

test('Throws on empty keys array', (assert) => {
    const map = new CompositeWeakMap<TestKey[], string>();

    {
        const err = extractError(() => map.get([]));
        assert(err.message, 'At least one key is required.');
    }

    {
        const err = extractError(() => map.set([], 'test'));
        assert(err.message, 'At least one key is required.');
    }

    {
        const err = extractError(() => map.has([]));
        assert(err.message, 'At least one key is required.');
    }

    {
        const err = extractError(() => map.delete([]));
        assert(err.message, 'At least one key is required.');
    }
});

test('`has` works', (assert) => {
    const map = new CompositeWeakMap<TestKey[], string>();
    map.set([ first, second, third ], 'test');

    assert(map.has([ first, second, third ]), true);
    assert(map.has([ first, second ]), false);
});

test('`delete` works', (assert) => {
    const map = new CompositeWeakMap<TestKey[], string>();

    map.set([ first, second, third ], 'test');

    assert(map.delete([ first, second, third ]), true);

    assert(map.get([ first, second, third ]), undefined);

    assert(map.delete([ first, second, third ]), false);
});

test('Not assignable to `WeakMap`', () => {
    const map = new CompositeWeakMap<TestKey[], string>();

    // @ts-expect-error `toStringTag` prevents this assignment.
    const weakMap: WeakMap<TestKey[], string> = map;
});

declare global {
    var leakingMap: CompositeWeakMap<TestKey[], string> | undefined;
    var leakingOne: TestKey | undefined;
    var leakingMap2: CompositeWeakMap<TestKey[], string> | undefined;
    var leakingTwo: TestKey | undefined;
    var leakingThree: TestKey | undefined;
}

// Leak test.
// When `two` is garbage collected, `CompositeWeakMap` retains a garbage
// reference from `one` to the `[ one, two ]` composite key. This reference
// should be cleaned up by the finalization registry when `two` is garbage
// collected.

{
    const leakingMap = new CompositeWeakMap<TestKey[], string>();
    globalThis.leakingMap = leakingMap;

    const one: TestKey = { name: 'one' };
    globalThis.leakingOne = one;
    const two: TestKey = { name: 'two' };

    leakingMap.set([ one, two ], 'test');

    // Should print "Marking {name: 'one'} as garbage" some non-deterministic
    // time later. Consider opening DevTools and running garbage collection
    // directly in the memory tab.
}

// Leak test 2.
// When `one` falls out of scope, both `two` and `three` become garbage entries.
// When the first of them is collected, the other should be collected at the
// same time, and the finalization registry should not listen for the other to
// be collected.

{
    const leakingMap = new CompositeWeakMap<TestKey[], string>();
    globalThis.leakingMap2 = leakingMap;

    const one: TestKey = { name: 'one' };
    const two: TestKey = { name: 'two' };
    globalThis.leakingTwo = two;
    const three: TestKey = { name: 'three' };
    globalThis.leakingThree = three;

    leakingMap.set([ one, two, three ], 'test');

    // Should print "Marking {name: 'two' | 'three} as garbage" some
    // non-deterministic time later. Consider opening DevTools and running
    // garbage collection directly in the memory tab.
}

// Test framework

type AssertFn = <T>(actual: T, expected: T) => void;

function test(desc: string, callback: (assert: AssertFn) => void): void {
    const failedExpectations: Array<{ actual: unknown, expected: unknown }> =
            [];
    function assert<T>(actual: T, expected: T): void {
        if (actual !== expected) {
            failedExpectations.push({ actual, expected });
        }
    }

    let thrown: Error | undefined;
    try {
        callback(assert);
    } catch (err) {
        thrown = err as Error;
    }

    if (thrown || failedExpectations.length !== 0) {
        const expectations = failedExpectations
            .map(({ actual, expected }) => `Expected \`${actual}\` to equal \`${
                expected}\`.`)
            .join('\n\n');
        console.error(`FAIL: ${desc}${expectations.length !== 0 ? '\n\n' : ''}${
            expectations}${
            thrown ? `\n\nThrew error:\n${thrown.message}` : ''}`
        );
    } else {
        console.log(`PASS: ${desc}`);
    }
}

function extractError(callback: () => void): Error {
    try {
        callback();
    } catch (err) {
        return err as Error;
    }

    throw new Error(`callback did not throw.`);
}
