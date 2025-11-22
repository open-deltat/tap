import { createInventory } from '@tap/core';

// Create a singleton inventory instance
// In a real app, this might be dependency injected or context-based
export let core = createInventory();

export const resetCore = () => {
	core = createInventory();
};
