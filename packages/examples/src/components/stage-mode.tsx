"use client";

import { createContext, useContext, type ReactNode } from "react";

// How an example is shown. "page": its own page, with title, scroller and an island pinned to the
// viewport. "inline": a block inside another page (the landing): the page scrolls, the host
// supplies the title, the island sits at the block's foot. "bare": its own page without the title
// and caption, for the landing gallery's previews, where the card is the whole picture. The
// example does not know where it is rendered, so the host says so here and Stage reads it.
export type StageMode = "page" | "inline" | "bare";

const StageModeContext = createContext<StageMode>("page");

export function StageModeProvider({ mode, children }: { mode: StageMode; children: ReactNode }) {
  return <StageModeContext.Provider value={mode}>{children}</StageModeContext.Provider>;
}

export function InlineStage({ children }: { children: ReactNode }) {
  return <StageModeProvider mode="inline">{children}</StageModeProvider>;
}

export function useStageMode(): StageMode {
  return useContext(StageModeContext);
}
