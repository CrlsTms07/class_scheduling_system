// @ts-check
import { describe, expect, it } from "vitest";
import { classEnd, classMinutes, dayTotals, defaultDays, entryAt, fittingPeriods, hasSubject, isComplete, minutesText, nextSubject, planMove, progressPercent, progressText, subjectColor } from "./schedule.js";

/** @typedef {import("./schedule.js").Loading} Loading */

/** A period (or a break) of a bell schedule. */
const slot = (/** @type {number} */ id, /** @type {string} */ start, /** @type {string} */ end, /** @type {number} */ minutes, isBreak = false) => ({ id, period_no: null, label: isBreak ? "Recess" : null, start_time: start, end_time: end, minutes, is_break: isBreak });
const P1 = slot(1, "07:00", "07:45", 45);
const P2 = slot(2, "07:45", "09:05", 80);
const BREAK = slot(3, "09:05", "09:25", 20, true);
const P4 = slot(4, "09:25", "10:10", 45);
const PATTERN = { id: 10, name: "Monday – Thursday", days: [1, 2, 3, 4], slots: [P1, P2, BREAK, P4] };

/** A subject of the section; required: its minutes limit, null for none. @returns {Loading} */
const loading = (/** @type {number} */ scheduled, /** @type {number | null} */ required = 220) => ({ id: 50, subject_id: 5, teacher_id: 7, subject: "Math", is_priority: false, required_minutes: required, scheduled_minutes: scheduled, teacher: "Ana" });
const free = (/** @type {number} */ slotId, /** @type {number[]} */ days, /** @type {{ day: number, reason: string }[]} */ busy = []) => ({ slot_id: slotId, minutes: 0, free_days: days, busy });
const entry = (/** @type {number} */ day, /** @type {string} */ start, /** @type {number | null} */ sectionSubjectId = 50, /** @type {number | null} */ activityId = null) => ({ id: day * 100, day, start_time: start, end_time: "x", status: /** @type {const} */ ("draft"), section_subject_id: sectionSubjectId, activity_id: activityId, subject: "Math", teacher: "Ana", room_id: 1, room: "101" });

describe("which periods a class may go to (UI requirement 6)", () => {
  it("offers only free periods, never breaks", () => {
    const result = fittingPeriods({ patterns: [PATTERN], loading: loading(0), free: [free(1, [1, 2]), free(2, []), free(4, [3])] });

    expect(result.map(({ slot: { id } }) => id)).toEqual([1, 4]);
    expect(result[0].freeDays).toEqual([1, 2]);
  });

  it("leaves out periods longer than the minutes still to place", () => {
    // 220 needed, 160 placed: 60 left, so the 80-minute period does not fit.
    const result = fittingPeriods({ patterns: [PATTERN], loading: loading(160), free: [free(1, [1]), free(2, [1]), free(4, [1])] });

    expect(result.map(({ slot: { id } }) => id)).toEqual([1, 4]);
  });

  it("offers nothing for a subject that is complete", () => {
    expect(fittingPeriods({ patterns: [PATTERN], loading: loading(220), free: [free(1, [1, 2, 3, 4])] })).toEqual([]);
  });

  it("counts the class being changed as not placed, and its own place as free", () => {
    const result = fittingPeriods({
      patterns: [PATTERN],
      loading: loading(220),
      free: [free(2, [], [{ day: 1, reason: "This section already has a class then." }])],
      editing: { slotId: 2, days: [1], sameSubject: true },
    });

    expect(result.map(({ slot: { id } }) => id)).toEqual([2]);
    expect(result[0].freeDays).toEqual([1]);
    expect(result[0].busy).toEqual([]);
  });

  it("keeps the reasons of busy days", () => {
    const [period] = fittingPeriods({ patterns: [PATTERN], loading: loading(0), free: [free(1, [2], [{ day: 1, reason: "Ana Reyes is teaching Grade 7 – Hope." }])] });

    expect(period.busy).toEqual([{ day: 1, reason: "Ana Reyes is teaching Grade 7 – Hope." }]);
  });
});

describe("default days of a new class", () => {
  const plotter = (/** @type {"JHS" | "SHS"} */ level, /** @type {any[]} */ entries = []) => /** @type {any} */ ({ section: { level }, entries });

  it("takes every free day of the bell schedule in Junior High", () => {
    expect(defaultDays(plotter("JHS"), PATTERN, P1, 2, [1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it("leaves days that already have a class, and busy days", () => {
    expect(defaultDays(plotter("JHS", [entry(3, "07:00")]), PATTERN, P1, 2, [1, 2, 3])).toEqual([1, 2]);
  });

  it("takes only the tapped day in Senior High", () => {
    expect(defaultDays(plotter("SHS"), PATTERN, P1, 2, [1, 2, 3, 4])).toEqual([2]);
  });
});

describe("moving a class", () => {
  const entries = [entry(1, "07:00"), entry(2, "07:00"), entry(3, "07:00")];

  it("moves the whole subject across the bell schedule in Junior High", () => {
    expect(planMove({ loadingId: 50, slot: P4, day: 1, from: { slot: P1, day: 1 } }, [PATTERN], entries, "JHS")).toEqual({ from_days: [1, 2, 3], days: [1, 2, 3] });
  });

  it("moves one class in Senior High", () => {
    expect(planMove({ loadingId: 50, slot: P4, day: 2, from: { slot: P1, day: 1 } }, [PATTERN], entries, "SHS")).toEqual({ from_days: [1], days: [2] });
  });

  it("does nothing when dropped where it already is", () => {
    expect(planMove({ loadingId: 50, slot: P1, day: 1, from: { slot: P1, day: 1 } }, [PATTERN], entries, "SHS")).toBeNull();
  });
});

describe("words and colors", () => {
  it("says how much of a subject is placed", () => {
    expect(minutesText({ ...loading(160), required_minutes: null })).toBe("160 mins a week on the schedule");
    expect(minutesText(loading(160))).toBe("160 of 220 mins · 60 left");
    expect(minutesText(loading(220))).toBe("220 of 220 mins · Complete");
    expect(minutesText(loading(240))).toBe("240 of 220 mins · Over by 20 mins");
  });

  it("treats an open slot as empty and an activity as taken", () => {
    expect(hasSubject(entry(1, "07:00", null))).toBe(false);
    expect(hasSubject(entry(1, "07:00", null, 3))).toBe(true);
    expect(entryAt([entry(1, "07:00")], 1, P1)?.day).toBe(1);
  });

  it("keeps one color per subject, plain when colors are off", () => {
    expect(subjectColor(50)).toBe(subjectColor(50));
    expect(subjectColor(50, false)).toContain("bg-surface");
  });
});

describe("the MATATAG targets in the plotter (Nov 21, 2026)", () => {
  const withTarget = (/** @type {number} */ days, /** @type {number} */ minutes, sessions = 5) => ({ ...loading(minutes, null), target: { sessions, minutes: sessions === 5 ? 225 : 60 }, days_placed: days });

  it("counts a subject complete on all its days, even with a shorter Friday", () => {
    expect(isComplete(withTarget(4, 180))).toBe(false);
    expect(isComplete(withTarget(5, 220))).toBe(true);
    expect(progressPercent(withTarget(3, 135))).toBe(60);
    expect(progressText(withTarget(3, 135))).toBe("3 of 5 days · 135 of 225 mins · 2 more days");
    expect(progressText(withTarget(5, 220))).toBe("5 of 5 days · 220 of 225 mins · Complete");
  });

  it("says when Homeroom is over its limit, and falls back to minutes with no target", () => {
    expect(progressText({ ...withTarget(1, 80, 1), required_minutes: 60 })).toBe("1 of 1 day · 80 of 60 mins · Over by 20 mins");
    expect(progressText(loading(160, null))).toBe("160 mins a week on the schedule");
    expect(isComplete(loading(0, null))).toBe(false);
    expect(isComplete(loading(45, null))).toBe(true);
  });

  it("marks the first subject not complete as next", () => {
    const done = { ...withTarget(5, 225), id: 1 };
    const open = { ...withTarget(2, 90), id: 2 };
    expect(nextSubject([done, open])?.id).toBe(2);
    expect(nextSubject([done])).toBeNull();
  });

  it("adds up each day's periods and placed classes, breaks left out", () => {
    const patterns = [
      { id: 1, name: "Monday – Thursday", days: [1, 2, 3, 4], slots: [
        { id: 1, period_no: 1, label: null, start_time: "07:00", end_time: "07:45", minutes: 45, is_break: false },
        { id: 2, period_no: null, label: "Recess", start_time: "07:45", end_time: "08:05", minutes: 20, is_break: true },
        { id: 3, period_no: 2, label: null, start_time: "08:05", end_time: "08:50", minutes: 45, is_break: false },
      ] },
      { id: 2, name: "Friday", days: [5], slots: [{ id: 4, period_no: 1, label: null, start_time: "07:00", end_time: "07:40", minutes: 40, is_break: false }] },
    ];
    const entries = [{ id: 1, day: 1, start_time: "07:00", end_time: "07:45", status: /** @type {const} */ ("draft"), section_subject_id: 50, activity_id: null, subject: "Math", teacher: "Ana", room_id: 1, room: "101" }];
    const totals = dayTotals({ patterns, entries });
    expect(totals[0]).toEqual({ day: 1, pattern: "Monday – Thursday", planned: 90, placed: 45 });
    expect(totals[4]).toEqual({ day: 5, pattern: "Friday", planned: 40, placed: 0 });
  });
});

describe("the Senior High blocks in the plotter (Nov 22, 2026)", () => {
  const shs = (/** @type {number} */ days, /** @type {number} */ asyncMinutes) => ({ ...loading(days * 120 + asyncMinutes, null), target: { sessions: 2, minutes: 240, async_minutes: 90 }, days_placed: days, scheduled_async_minutes: asyncMinutes });

  it("counts face-to-face blocks and the asynchronous session apart, and says what is missing", () => {
    expect(progressText(shs(1, 0))).toBe("1 of 2 F2F blocks · 0 of 90 async mins · 1 more F2F block and the async session");
    expect(progressText(shs(2, 0))).toBe("2 of 2 F2F blocks · 0 of 90 async mins · the async session");
    expect(isComplete(shs(2, 0))).toBe(false);
    expect(progressPercent(shs(2, 0))).toBe(67);
  });

  it("is complete with 2 blocks and the 90-minute asynchronous session", () => {
    expect(isComplete(shs(2, 90))).toBe(true);
    expect(progressText(shs(2, 90))).toBe("2 of 2 F2F blocks · 90 of 90 async mins · Complete");
    expect(progressPercent(shs(2, 90))).toBe(100);
  });

  it("shows Homeroom (no asynchronous session) by its one block, and when it is over 60 minutes", () => {
    const homeroom = { ...loading(120, 60), target: { sessions: 1, minutes: 60, async_minutes: 0 }, days_placed: 1, scheduled_async_minutes: 0 };
    expect(progressText(homeroom)).toBe("1 of 1 F2F block · Over by 60 mins");
  });
});

describe("Homeroom in a longer period (Nov 22, 2026)", () => {
  const block = { id: 9, period_no: 1, label: null, start_time: "06:00", end_time: "08:00", minutes: 120, is_break: false };
  const homeroom = (/** @type {number} */ scheduled) => ({ ...loading(scheduled, 60), subject: "Homeroom Guidance" });

  it("takes only its 60 minutes from the start of a 120-minute block", () => {
    expect(classMinutes(homeroom(0), block)).toBe(60);
    expect(classEnd(homeroom(0), block)).toBe("07:00");
    expect(classMinutes(loading(0, null), block)).toBe(120);
    expect(classEnd(loading(0, null), block)).toBe("08:00");
  });

  it("is offered the block while none of it is placed, and not once it is", () => {
    const free = [{ slot_id: 9, minutes: 120, free_days: [1, 2], busy: [] }];
    const patterns = [{ id: 1, name: "Monday – Friday", days: [1, 2, 3, 4, 5], slots: [block] }];
    expect(fittingPeriods({ patterns, loading: homeroom(0), free }).map(({ slot }) => slot.id)).toEqual([9]);
    expect(fittingPeriods({ patterns, loading: homeroom(60), free })).toEqual([]);
  });
});
