export function memoize(fn, keyer) {
  const cache = new Map();
  return (...args) => {
    const key = keyer ? keyer(...args) : JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const val = fn(...args);
    cache.set(key, val);
    return val;
  };
}

export function measureMutate(measure, mutate) {
  let measureResult;
  try { measureResult = measure ? measure() : undefined; } catch(_) {}
  requestAnimationFrame(() => { try { if (mutate) mutate(measureResult); } catch(_) {} });
}
