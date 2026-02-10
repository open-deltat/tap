import { describe, expect, test } from "bun:test";
import {
  daysOfWeekMask,
  daysFromMask,
  timeToMinutes,
  minutesToTime,
} from "../schedules.js";

describe("daysOfWeekMask", () => {
  test("weekdays", () => {
    expect(daysOfWeekMask("mon", "tue", "wed", "thu", "fri")).toBe(0b0111110);
  });

  test("weekends", () => {
    expect(daysOfWeekMask("sun", "sat")).toBe(0b1000001);
  });

  test("all days", () => {
    expect(daysOfWeekMask("sun", "mon", "tue", "wed", "thu", "fri", "sat")).toBe(0b1111111);
  });

  test("single day", () => {
    expect(daysOfWeekMask("wed")).toBe(0b0001000);
  });
});

describe("daysFromMask", () => {
  test("weekdays", () => {
    expect(daysFromMask(0b0111110)).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });

  test("weekends", () => {
    expect(daysFromMask(0b1000001)).toEqual(["sun", "sat"]);
  });

  test("empty", () => {
    expect(daysFromMask(0)).toEqual([]);
  });

  test("roundtrip", () => {
    const days = ["mon", "wed", "fri"] as const;
    expect(daysFromMask(daysOfWeekMask(...days))).toEqual([...days]);
  });
});

describe("timeToMinutes", () => {
  test("midnight", () => {
    expect(timeToMinutes("00:00")).toBe(0);
  });

  test("9am", () => {
    expect(timeToMinutes("09:00")).toBe(540);
  });

  test("5pm", () => {
    expect(timeToMinutes("17:00")).toBe(1020);
  });

  test("with minutes", () => {
    expect(timeToMinutes("13:45")).toBe(825);
  });

  test("end of day", () => {
    expect(timeToMinutes("23:59")).toBe(1439);
  });
});

describe("minutesToTime", () => {
  test("midnight", () => {
    expect(minutesToTime(0)).toBe("00:00");
  });

  test("540 -> 09:00", () => {
    expect(minutesToTime(540)).toBe("09:00");
  });

  test("1020 -> 17:00", () => {
    expect(minutesToTime(1020)).toBe("17:00");
  });

  test("pads single digits", () => {
    expect(minutesToTime(65)).toBe("01:05");
  });

  test("roundtrip", () => {
    expect(minutesToTime(timeToMinutes("14:30"))).toBe("14:30");
  });
});
