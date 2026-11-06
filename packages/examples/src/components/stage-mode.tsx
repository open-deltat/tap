"use client";

import { createContext, useContext, type ReactNode } from "react";

// An example rendered inside another page (the landing) must not bring its own page: no scroller of
// its own, no title, and the island at the bottom of the block rather than the viewport. The example
// does not know where it is rendered, so the host says so with this provider and Stage reads it.
const InlineStageContext = createContext(false);

export function InlineStage({ children }: { children: ReactNode }) {
  return <InlineStageContext.Provider value={true}>{children}</InlineStageContext.Provider>;
}

export function useInlineStage(): boolean {
  return useContext(InlineStageContext);
}
