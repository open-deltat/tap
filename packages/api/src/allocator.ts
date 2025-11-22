import { type Allocator, createAllocator } from '@tap/core';

// Singleton core instance
export let core: Allocator = createAllocator();

export function resetCore() {
	core = createAllocator();
}
