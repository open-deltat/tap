"use client";

import { useSyncExternalStore } from "react";

/**
 * A value that many small parts read and one part writes, without re-rendering their parent. Hover and
 * drag move on every pointer event; routing them through React state would redraw every cell of a
 * 24-hour, many-week field for each pixel. Readers subscribe to just the slice they draw.
 */
export interface Store<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  const listeners = new Set<() => void>();
  // The value is the one mutable thing here, by design: it is what the store is for.
  const box = { value: initial };
  return {
    get: () => box.value,
    set: (value) => {
      if (Object.is(box.value, value)) return;
      box.value = value;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Read a slice of a store. `select` must return the same reference for the same underlying value. */
export function useStore<T, S>(store: Store<T>, select: (value: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}
