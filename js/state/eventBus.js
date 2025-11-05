const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(handler);
}

export function off(event, handler) {
  const arr = listeners.get(event);
  if (!arr) return;
  const idx = arr.indexOf(handler);
  if (idx !== -1) arr.splice(idx, 1);
}

export function emit(event, ...args) {
    const arr = listeners.get(event);
    if (!arr) {
        return;
    }
    
    const handlers = [...arr];


    for (const fn of handlers) {
        try {
            const result = fn(...args);
            if (result !== undefined) {
                return result;
            }
        } catch (e) {
            console.error(`Error in event handler for '${event}':`, e);
        }
    }
}
