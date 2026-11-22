// @ts-check
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/schedule.js", () => ({
  assignSlot: vi.fn(async () => ({})),
  changeTeacher: vi.fn(async () => {}),
  clearSlot: vi.fn(async () => ({})),
  conflictDetailsOf: () => null,
  getFreePeriods: vi.fn(async () => [
    { slot_id: 11, minutes: 40, free_days: [5], busy: [] },
    { slot_id: 12, minutes: 40, free_days: [5], busy: [] },
  ]),
  getPlotter: vi.fn(async () => ({ loading: [{ id: 51, subject_id: 6, teacher_id: 9, subject: "Physical Education", is_priority: true, required_minutes: 0, scheduled_minutes: 0, teacher: "Teacher Sample 2" }] })),
  getTeacherChoices: vi.fn(async () => []),
  placeActivity: vi.fn(async () => ({})),
  quickAddTeacher: vi.fn(async () => ({ id: 99, name: "New Teacher" })),
  resolvePeriod: vi.fn(async () => ({ 5: 11 })),
}));

vi.mock("@/api/teacher-loading.js", () => ({
  getSectionLoading: vi.fn(async () => ({
    section: { id: 2, label: "Grade 7 – Sample B" },
    rows: [],
    addable: [{ id: 6, name: "Physical Education", code: null }],
    teachers: [
      { id: 9, name: "Teacher Sample 2", shift: "WHOLE_DAY", assigned: 1, limit: 5 },
      { id: 10, name: "Teacher Full", shift: "WHOLE_DAY", assigned: 5, limit: 5 },
    ],
  })),
  assignTeacher: vi.fn(async () => ({})),
  teacherHint: () => "",
}));

const api = await import("@/api/schedule.js");
const loadingApi = await import("@/api/teacher-loading.js");
const { openClassDialog } = await import("./class-dialog.js");

HTMLDialogElement.prototype.showModal = function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close = function close() {
  this.open = false;
  this.dispatchEvent(new Event("close"));
};

const slot = (/** @type {number} */ id, /** @type {string} */ start, /** @type {string} */ end) => ({ id, period_no: id, label: null, start_time: start, end_time: end, minutes: 40, is_break: false });
const P1 = slot(11, "06:30", "07:10");
const LAST = slot(12, "15:50", "16:30");
const PLOTTER = /** @type {any} */ ({
  section: { id: 2, name: "Sample B", label: "Grade 7 – Sample B", level: "JHS", grade: 7, shift: "WHOLE_DAY", adviser: null, home_room_id: 7 },
  status: "not_started",
  can_plot: true,
  can_edit: true,
  last_review: null,
  patterns: [{ id: 3, name: "Friday", days: [5], slots: [P1, LAST] }],
  loading: [{ id: 50, subject_id: 5, teacher_id: 8, subject: "Values Education", is_priority: false, required_minutes: 220, scheduled_minutes: 0, teacher: "Teacher Sample 1" }],
  entries: [],
  activities: [],
  apply_counts: { grade: 2, all: 2 },
  rooms: [{ id: 7, label: "Sample Building – 102" }],
  flags: [],
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
/** Clicks an element; fails clearly when it was not found. */
const click = (/** @type {Element | null | undefined} */ element) => {
  if (!element) throw new Error("Nothing to click: the element was not found");
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};
/** A button of an open dialog with this text, or undefined. */
const button = (/** @type {string} */ text) => [...document.querySelectorAll("dialog button")].find((item) => item.textContent?.trim() === text);

beforeEach(() => vi.clearAllMocks());

describe("the Add / Edit class dialog", () => {
  it("places the subject on the tapped period after choosing it", async () => {
    openClassDialog({ plotter: PLOTTER, termId: 1, target: { day: 5, slot: LAST } });

    const subjectTrigger = /** @type {HTMLElement} */ (document.querySelector("dialog [aria-haspopup=listbox]"));
    click(subjectTrigger);
    click(/** @type {HTMLElement} */ ([...document.querySelectorAll("dialog [role=option]")].find((item) => item.textContent?.includes("Values Education"))));
    await flush();
    await flush();

    expect(document.querySelector("dialog [role=radio][aria-checked=true]")?.textContent).toContain("3:50 PM");

    click(button("Add class"));
    await flush();
    await flush();

    expect(document.querySelector("dialog [role=alert]")?.textContent ?? "").not.toContain("Choose a period");
    expect(api.assignSlot).toHaveBeenCalledWith(1, 2, { slotId: 12, section_subject_id: 50, room_id: 7, days: [5] });
  });

  it("waits for the free periods when Add class is pressed right away", async () => {
    /** @type {(value: any) => void} */
    let answer = () => {};
    vi.mocked(api.getFreePeriods).mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    openClassDialog({ plotter: PLOTTER, termId: 1, target: { day: 5, slot: LAST, loadingId: 50 } });

    click(button("Add class"));
    await flush();
    expect(api.assignSlot).not.toHaveBeenCalled();

    answer([{ slot_id: 12, minutes: 40, free_days: [5], busy: [] }]);
    await flush();
    await flush();
    expect(api.assignSlot).toHaveBeenCalledWith(1, 2, { slotId: 12, section_subject_id: 50, room_id: 7, days: [5] });
  });

  it("shows every period as a block: free ones to choose, full ones disabled with the reason (UI requirement 6)", async () => {
    vi.mocked(api.getFreePeriods).mockResolvedValueOnce([
      { slot_id: 11, minutes: 40, free_days: [], busy: [{ day: 5, reason: "Teacher Sample 1 is teaching Grade 7 – Sample A." }] },
      { slot_id: 12, minutes: 40, free_days: [5], busy: [] },
    ]);
    openClassDialog({ plotter: PLOTTER, termId: 1, target: { day: 5, slot: P1, loadingId: 50 } });
    await flush();
    await flush();

    const blocks = [...document.querySelectorAll("dialog [role=radio]")];
    const offered = blocks.filter((item) => item.getAttribute("aria-disabled") !== "true").map((item) => item.textContent);
    expect(offered).toHaveLength(1);
    expect(offered[0]).toContain("3:50 PM");
    const full = blocks.find((item) => item.getAttribute("aria-disabled") === "true");
    expect(full?.textContent).toContain("Full");
    expect(full?.textContent).toContain("Teacher Sample 1 is teaching Grade 7 – Sample A.");
    expect(document.querySelector("dialog")?.textContent).toContain("6:30 AM – 7:10 AM is not offered. Friday: Teacher Sample 1 is teaching Grade 7 – Sample A.");
  });

  it("says where the subjects come from when the section has no teacher loading, with a link to it", async () => {
    openClassDialog({ plotter: { ...PLOTTER, loading: [] }, termId: 1, target: { day: 1 } });
    await flush();

    const dialog = document.querySelector("dialog");
    expect(dialog?.textContent).toContain(`No subject is ready for ${PLOTTER.section.label} yet.`);
    const link = /** @type {HTMLAnchorElement} */ ([...(dialog?.querySelectorAll("a") ?? [])].find((item) => item.textContent?.startsWith("Open Teacher Loading")));
    expect(link.getAttribute("href")).toBe(`/teacher-loading?section=${PLOTTER.section.id}`);
    expect(button("Activity")).toBeDefined();
  });

  it("adds a subject with its teacher right here, saved in Teacher Loading, and chooses it", async () => {
    openClassDialog({ plotter: { ...PLOTTER, loading: [] }, termId: 1, target: { day: 1 } });
    await flush();
    click(button("Add a subject here"));
    await flush();

    const form = [...document.querySelectorAll("dialog")].at(-1);
    expect(form?.textContent).toContain("Add a subject to Grade 7 – Sample B");
    const pick = async (/** @type {string} */ label, /** @type {string} */ option) => {
      click(/** @type {HTMLElement} */ ([...(form?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.startsWith(label) || item.getAttribute("aria-label")?.startsWith(label) || item.closest("div")?.querySelector("label")?.textContent?.startsWith(label) && item.getAttribute("aria-haspopup"))));
      await flush();
      click(/** @type {HTMLElement} */ ([...document.querySelectorAll('[role="option"]')].find((item) => item.textContent?.includes(option))));
      await flush();
    };
    await pick("Subject", "Physical Education");
    await pick("Teacher", "Teacher Sample 2");
    click(/** @type {HTMLElement} */ ([...(form?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.trim() === "Add subject")));
    await flush();
    await flush();

    expect(loadingApi.assignTeacher).toHaveBeenCalledWith(1, 2, 6, 9);
    expect(api.getPlotter).toHaveBeenCalledWith(1, 2);
    expect(document.querySelector("dialog")?.textContent).toContain("Physical Education");
    expect(document.querySelector("dialog")?.textContent).not.toContain("No subject is ready");
  });

  it("starts by typing the time when the section has no class hours yet (no Time Slots setup first)", async () => {
    openClassDialog({ plotter: { ...PLOTTER, patterns: [] }, termId: 1, target: { day: 1, loadingId: 50 } });
    await flush();
    await flush();

    const text = document.querySelector("dialog")?.textContent ?? "";
    expect(text).toContain("Start time");
    expect(text).toContain("End time");
    expect(text).not.toContain("Time Slots page");
    expect(button("Choose a period instead")).toBeUndefined();
  });

  it("can switch from the periods to typing a time, and back", async () => {
    openClassDialog({ plotter: PLOTTER, termId: 1, target: { day: 5, loadingId: 50 } });
    await flush();
    await flush();

    click(/** @type {HTMLElement} */ ([...document.querySelectorAll("dialog button")].find((item) => item.textContent?.includes("Other time"))));
    expect(document.querySelector("dialog")?.textContent).toContain("Start time");

    click(/** @type {HTMLElement} */ ([...document.querySelectorAll("dialog button")].find((item) => item.textContent?.includes("Choose a period instead"))));
    expect(document.querySelectorAll("dialog [role=radio]").length).toBeGreaterThan(0);
  });
});
