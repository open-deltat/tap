"use client";

import { useEffect, useState } from "react";

/** The browser's IANA timezone as a hidden form field; the server cannot know it. */
export function TimezoneField() {
  const [tz, setTz] = useState("UTC");
  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);
  return <input type="hidden" name="timezone" value={tz} />;
}
