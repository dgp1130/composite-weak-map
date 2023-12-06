# `CompositeWeakMap`

`WeakMap` is an excellent tool for tracking information without leaking memory.
However `WeakMap` by itself only supports lookups using a single object
reference as a key. Sometimes it is useful to key a `WeakMap` with multiple
object references, all of which are required to read the value while still
retaining its weak memory guarantees.

`CompositeWeakMap` is a weak map which takes multiple partial key objects,
combines them into a single composite key and maps that key to a value.
Everything is weakly referenced, so when any partial key is garbage collected,
any associated values are also eligible to be reclaimed.

## TODO:

* `CompositeWeakSet`
* Allow `WeakMap` to accept an array, `Set`, or `Bag` and use that to determine
  if order matters. Should this be a different `UnorderedCompositeWeakMap`?
