"use client";

import dynamic from "next/dynamic";

// The form starts from the visitor's own zone and date, which only the browser knows, so it skips
// the server render; the skeleton holds its place so the page does not jump.
export const MeetingPlanner = dynamic(() => import("./meeting-planner-form"), {
  ssr: false,
  loading: () => <div className="h-[560px] animate-pulse rounded-3xl border border-dt-line bg-dt-surface" />,
});
