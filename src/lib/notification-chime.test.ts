import assert from "node:assert/strict";
import test from "node:test";
import {
  isNotificationMuted,
  playNotificationChime,
  setNotificationMuted,
} from "./notification-chime.ts";

/** Minimal localStorage, and one that can be made to throw like private mode. */
function installStorage(options: { throws?: boolean } = {}) {
  const map = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      if (options.throws) throw new Error("storage disabled");
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (options.throws) throw new Error("storage disabled");
      map.set(key, value);
    },
  };
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  return () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  };
}

test("the mute preference round-trips and defaults to audible", (context) => {
  const restore = installStorage();
  context.after(restore);

  assert.equal(isNotificationMuted(), false);
  setNotificationMuted(true);
  assert.equal(isNotificationMuted(), true);
  setNotificationMuted(false);
  assert.equal(isNotificationMuted(), false);
});

test("blocked storage reads as audible instead of throwing", (context) => {
  const restore = installStorage({ throws: true });
  context.after(restore);

  // Private mode must not take the notification poll down with it.
  assert.equal(isNotificationMuted(), false);
  assert.doesNotThrow(() => setNotificationMuted(true));
});

test("playing without any Web Audio support is a silent no-op", (context) => {
  const restore = installStorage();
  context.after(restore);

  // No `window` in this runtime, so there is no AudioContext to construct.
  assert.doesNotThrow(() => playNotificationChime());
});

test("a muted install schedules no audio at all", (context) => {
  const restore = installStorage();
  let constructed = 0;
  (globalThis as { window?: unknown }).window = {
    AudioContext: class {
      constructor() {
        constructed += 1;
      }
    },
  };
  context.after(() => {
    restore();
    delete (globalThis as { window?: unknown }).window;
  });

  setNotificationMuted(true);
  playNotificationChime();
  assert.equal(constructed, 0);
});
