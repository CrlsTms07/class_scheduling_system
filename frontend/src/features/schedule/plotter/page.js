// @ts-check
/**
 * A section's schedule: where classes are placed, moved and submitted.
 *
 * - The schedule comes first on phones (design audit, Must fix #3); the subjects are one tap away.
 * - One view switch, Day cards or Weekly grid, remembered (Must fix #4).
 * - Placing: tap a period, or pick a subject and tap the periods that light up (they fit and are
 *   free, UI requirement 6), or drag a subject or a class. Everything else goes through the one
 *   "Add / Edit class" dialog (Must fix #10).
 *
 * The panels around the schedule are drawn by panels.js; this file holds what the taps do.
 */
import { h, replace } from "@/lib/dom.js";
import { icon } from "@/components/icons.js";
import { confirmAction, setBusy } from "@/components/dialog.js";
import { skeletonPage } from "@/components/loading.js";
import { toast } from "@/components/toast.js";
import { api, downloadFile } from "@/api/client.js";
import { assignSlot, clearSchedule, conflictDetailsOf, getFreePeriods, getPlotter, moveEntry, plotterKey, reviseSchedule } from "@/api/schedule.js";
import { watch } from "@/state/cache.js";
import { isColorCoding, session } from "@/state/session.js";
import { termState } from "@/state/term.js";
import { DAY_NAMES, STATUS_COLORS, STATUS_LABELS, entryAt, fittingPeriods, hasSubject, isComplete, nextSubject, patternOfSlot, planMove } from "@/lib/schedule.js";
import { openClassDialog } from "./class-dialog.js";
import { openSubmitDialog } from "./submit-dialog.js";
import { dayCardsView, gridView, phoneDayView, readView, saveView } from "./schedule-views.js";
import { enableDrag } from "./drag.js";
import { flagsPanel, setupNotice, statusNotices, subjectList, weekStrip } from "./panels.js";

/** @typedef {import("@/lib/schedule.js").Plotter} Plotter */
/** @typedef {import("@/lib/schedule.js").TimeSlot} TimeSlot */

const CRUMB = "inline-flex min-h-11 min-w-11 items-center justify-center px-1 hover:text-brand";

/** @type {import("@/router.js").RenderPage} */
export async function render(container, { params }) {
  const sectionId = Number(params.sectionId);
  const term = termState.term;
  if (!term) {
    container.append(h("p", { class: "p-6 text-sm" }, "There is no school year yet. The Admin starts one on the School Years page."));
    return;
  }
  const termId = term.id;

  replace(container, skeletonPage());

  /** @type {Plotter} */
  let plotter;
  try {
    plotter = await getPlotter(termId, sectionId);
  } catch (error) {
    replace(
      container,
      h("div", { class: "space-y-3 p-4 sm:p-6" }, h("a", { href: "/schedule", class: "btn btn-quiet px-0" }, icon("arrow-left"), "All sections"), h("p", { role: "alert", class: "text-danger" }, "This section is not available in the term selected at the top.")),
    );
    return;
  }

  /** @type {{ view: "days" | "grid", day: number, patternId: number | null, placingId: number | null, fitting: Set<string>, removed: string[] }} */
  const ui = { view: readView(), day: 1, patternId: null, placingId: null, fitting: new Set(), removed: [] };

  const openDialogAt = (/** @type {import("./class-dialog.js").ClassTarget} */ target) => openClassDialog({ plotter, termId, target });

  /* ---------- The page ---------- */

  const draw = () => {
    const { section, status, loading } = plotter;
    const isColored = isColorCoding();
    // One clear way to plot (Nov 21, 2026): the first subject not complete is marked Next.
    const next = plotter.can_edit ? nextSubject(loading) : null;
    const subjects = subjectList(plotter, { placingId: ui.placingId, next, isColored, onChoose: choosePlacing });

    replace(
      container,
      h(
        "div",
        { class: "space-y-4 p-4 sm:p-6" },
        h("nav", { "aria-label": "Breadcrumb", class: "flex flex-wrap items-center gap-1 text-sm text-muted-foreground" }, h("a", { href: "/dashboard", class: CRUMB }, "Home"), " · ", h("a", { href: "/schedule", class: CRUMB }, "Schedule"), " · ", h("span", { class: "text-brand", "aria-current": "page" }, section.label)),
        header(),
        statusNotices(plotter, { removed: ui.removed, reviseButton }),
        flagsPanel(plotter, { onFix: choosePlacing }),
        setupNotice(plotter, { onAddByTime: () => openDialogAt({ day: 1 }) }),
        h(
          "div",
          { class: "gap-4 space-y-4 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:space-y-0" },
          h("div", { class: "lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto" }, subjects),
          h("div", { class: `min-w-0 ${subjects ? "" : "lg:col-span-2"}` }, schedule(next, isColored)),
        ),
        plotter.can_plot && (status === "draft" || status === "rejected") && plotter.entries.length > 0 ? h("div", { class: "border-t pt-4" }, clearButton()) : null,
      ),
    );
  };

  /** The section's name and status, Submit, and the Class Program downloads. */
  const header = () => {
    const { section, status } = plotter;
    return h(
      "div",
      { class: "card overflow-hidden" },
      h(
        "div",
        { class: "flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between" },
        h(
          "div",
          { class: "flex min-w-0 items-start gap-3" },
          h("div", { class: "flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white" }, icon("table", "size-5")),
          h(
            "div",
            { class: "min-w-0" },
            h("div", { class: "flex flex-wrap items-center gap-2" }, h("h1", { class: "text-xl font-semibold text-brand" }, section.label), h("span", { class: `badge ${STATUS_COLORS[status]}` }, STATUS_LABELS[status])),
            h("p", { class: "text-sm text-muted-foreground" }, `Adviser: ${section.adviser ?? "None yet"} · ${section.level === "SHS" ? "Senior High" : "Junior High"} · ${term.name}, SY ${term.school_year.name}`),
          ),
        ),
        plotter.can_edit && status === "draft" ? h("button", { type: "button", class: "btn btn-primary", onclick: () => openSubmitDialog({ plotter, termId }) }, icon("send"), "Submit for approval") : null,
      ),
      h(
        "div",
        { class: "flex flex-wrap items-center gap-1 border-t bg-surface-muted px-4 py-1" },
        h("span", { class: "mr-2 text-small font-medium uppercase tracking-wide text-muted-foreground" }, "Class Program"),
        ["pdf", "csv"].map(downloadButton),
      ),
    );
  };

  /**
   * The schedule itself: Placing bar, Place next, minutes per day, the view switch and the views.
   * @param {import("@/lib/schedule.js").Loading | null} next
   * @param {boolean} isColored
   */
  const schedule = (next, isColored) => {
    const { patterns } = plotter;
    if (patterns.length === 0) return null;
    const placing = plotter.loading.find(({ id }) => id === ui.placingId);
    const viewProps = { plotter, isColored, canEdit: plotter.can_edit, fitting: ui.fitting, onTap };
    const pattern = patterns.find(({ id }) => id === ui.patternId) ?? patterns[0];
    const tab = (/** @type {boolean} */ isOn, /** @type {string} */ label, /** @type {() => void} */ onClick, extra = "") =>
      h("button", { type: "button", role: "tab", "aria-selected": String(isOn), class: `btn ${extra} ${isOn ? "bg-brand text-white" : "bg-surface"}`, onclick: onClick }, label);
    const views = /** @type {const} */ ([["days", "Day cards"], ["grid", "Weekly grid"]]);

    return h(
      "div",
      { class: "space-y-3", "data-schedule": "" },
      placing
        ? h(
            "div",
            { role: "status", class: "sticky top-[5rem] z-20 flex items-center justify-between gap-2 rounded-lg border-2 border-brand bg-surface p-2 text-sm shadow" },
            h("p", { class: "min-w-0" }, h("strong", null, `Placing ${placing.subject}. `), ui.fitting.size ? "Tap a lit period." : "No free period fits it right now."),
            h("button", { type: "button", class: "btn btn-outline shrink-0", onclick: () => choosePlacing(null) }, icon("check"), "Done"),
          )
        : next
          ? h("button", { type: "button", class: "btn btn-primary w-full sm:w-auto", onclick: () => choosePlacing(next.id) }, icon("plus"), `Place next: ${next.subject}`)
          : null,
      weekStrip(plotter, { day: ui.day, onDay: (day) => { ui.day = day; draw(); } }),
      h(
        "div",
        { class: "flex flex-wrap items-center justify-between gap-2" },
        h("div", { role: "tablist", "aria-label": "View", class: "grid w-full grid-cols-2 overflow-hidden rounded-lg border sm:w-80 max-md:portrait:hidden" }, views.map(([value, label]) => tab(ui.view === value, label, () => { ui.view = value; saveView(value); draw(); }, "rounded-none"))),
        h("button", { type: "button", class: "btn btn-quiet", "aria-pressed": String(isColored), onclick: toggleColors }, icon("table"), isColored ? "Colors: on" : "Colors: off"),
      ),
      h(
        "div",
        { class: "max-md:portrait:hidden" },
        ui.view === "days"
          ? dayCardsView(viewProps)
          : h(
              "div",
              { class: "space-y-3" },
              patterns.length > 1 ? h("div", { role: "tablist", "aria-label": "Bell schedule", class: "flex flex-wrap gap-2" }, patterns.map((item) => tab(item.id === pattern.id, item.name, () => { ui.patternId = item.id; draw(); }, `border ${item.id === pattern.id ? "border-brand" : ""}`))) : null,
              gridView(viewProps, pattern),
            ),
      ),
      h("div", { class: "hidden max-md:portrait:block" }, phoneDayView(viewProps, ui.day, (day) => { ui.day = day; draw(); })),
    );
  };

  /* ---------- Buttons ---------- */

  /**
   * A button that runs a task, showing it is busy meanwhile.
   * @param {{ label: string, iconName: Parameters<typeof icon>[0], className: string, busyText: string, run: () => Promise<void>, keepBusy?: boolean }} props
   *   keepBusy: stay busy after success (the page redraws anyway)
   */
  const taskButton = ({ label, iconName, className, busyText, run, keepBusy = false }) => {
    const button = /** @type {HTMLButtonElement} */ (h("button", { type: "button", class: `btn ${className}`, onclick: async () => {
      setBusy(button, true, busyText);
      try {
        await run();
        if (!keepBusy) setBusy(button, false);
      } catch (error) {
        toast.error(error);
        setBusy(button, false);
      }
    } }, icon(iconName), label));
    return button;
  };

  const downloadButton = (/** @type {string} */ extension) =>
    taskButton({ label: extension.toUpperCase(), iconName: "download", className: "btn-quiet px-3", busyText: "Preparing...", run: async () => {
      const name = await downloadFile(`/terms/${termId}/sections/${sectionId}/class-program.${extension}`);
      toast.success(`${name} was downloaded.`);
    } });

  const reviseButton = () =>
    taskButton({ label: "Revise this schedule", iconName: "pencil", className: "btn-primary", busyText: "Opening...", keepBusy: true, run: async () => {
      ui.removed = await reviseSchedule(termId, sectionId);
      toast.success("The schedule is open for changes again.");
    } });

  const clearButton = () =>
    h("button", { type: "button", class: "btn btn-outline text-danger", onclick: async () => {
      const isSure = await confirmAction({
        title: "Clear this schedule?",
        message: `This removes all ${plotter.entries.length} classes of ${plotter.section.label} so you can start over. The teacher loading stays.`,
        confirmLabel: "Yes, clear it",
      });
      if (!isSure) return;
      try {
        await clearSchedule(termId, sectionId);
        toast.success(`The schedule of ${plotter.section.label} was cleared.`);
      } catch (error) {
        toast.error(error);
      }
    } }, icon("eraser"), "Clear this schedule");

  async function toggleColors() {
    const isOn = !isColorCoding();
    try {
      const { data } = /** @type {{ data: any }} */ (await api("/me/preferences", { method: "PUT", body: { color_coding: isOn } }));
      session.user = data;
      draw();
      toast.success(isOn ? "Subject colors are on." : "Subject colors are off.");
    } catch (error) {
      toast.error(error);
    }
  }

  /* ---------- Placing ---------- */

  /**
   * Picks a subject to place by tapping, and lights the periods it fits (UI requirement 6).
   * @param {number | null} loadingId
   */
  async function choosePlacing(loadingId) {
    ui.placingId = loadingId;
    ui.fitting = new Set();
    draw();
    const item = plotter.loading.find(({ id }) => id === loadingId);
    if (!item) return;
    try {
      const free = await getFreePeriods(termId, sectionId, { teacherId: item.teacher_id, roomId: plotter.section.home_room_id });
      if (ui.placingId !== loadingId) return;
      ui.fitting = new Set(fittingPeriods({ patterns: plotter.patterns, loading: item, free }).flatMap(({ slot, freeDays }) => freeDays.map((day) => `${slot.id}:${day}`)));
      draw();
      document.querySelector("[data-schedule]")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      toast.error(error);
    }
  }

  /**
   * A tap on a period. With a subject picked and a lit period, it is placed at once;
   * anything else opens the "Add / Edit class" dialog.
   * @param {TimeSlot} slot
   * @param {number} day
   */
  function onTap(slot, day) {
    const isTaken = hasSubject(entryAt(plotter.entries, day, slot));
    if (ui.placingId && !isTaken && ui.fitting.has(`${slot.id}:${day}`)) {
      placeOn(slot, day, ui.placingId, (other) => ui.fitting.has(`${slot.id}:${other}`));
      return;
    }
    if (!plotter.can_edit && !isTaken) return;
    openDialogAt({ slot, day, loadingId: isTaken ? undefined : ui.placingId ?? undefined });
  }

  /**
   * Places a subject on a free period at once: Junior High on every day of that period's bell
   * schedule that is free, Senior High on the one day. With no home room, or on a conflict, the
   * dialog opens instead to ask or explain (with free rooms and teachers).
   * @param {TimeSlot} slot
   * @param {number} day
   * @param {number} loadingId
   * @param {(day: number) => boolean} [isFree]  which days may take it (default: any day still empty)
   */
  async function placeOn(slot, day, loadingId, isFree = () => true) {
    const pattern = patternOfSlot(plotter.patterns, slot.id);
    const item = plotter.loading.find(({ id }) => id === loadingId);
    const roomId = entryAt(plotter.entries, day, slot)?.room_id ?? plotter.section.home_room_id;
    if (!pattern || !item || !roomId) {
      openDialogAt({ slot, day, loadingId });
      return;
    }
    const days = (plotter.section.level === "JHS" ? pattern.days : [day]).filter((other) => isFree(other) && !hasSubject(entryAt(plotter.entries, other, slot)));
    try {
      await assignSlot(termId, sectionId, { slotId: slot.id, section_subject_id: loadingId, room_id: roomId, days });
      toast.success(`${item.subject} was placed on ${days.map((other) => DAY_NAMES[other]).join(", ")}.`);
      if (ui.placingId) choosePlacing(ui.placingId);
    } catch (error) {
      openDialogAt({ slot, day, loadingId, error });
    }
  }

  /**
   * A drop from the subject list ("new:<subject>") or a placed class ("<subject>:<period>:<day>").
   * @param {string} dragged
   * @param {string} target  "<period>:<day>"
   */
  async function onDrop(dragged, target) {
    const [slotId, day] = target.split(":").map(Number);
    const findSlot = (/** @type {number} */ id) => plotter.patterns.flatMap(({ slots }) => slots).find((slot) => slot.id === id);
    const slot = findSlot(slotId);
    if (!slot || slot.is_break) return;

    if (dragged.startsWith("new:")) {
      if (hasSubject(entryAt(plotter.entries, day, slot))) openDialogAt({ slot, day });
      else placeOn(slot, day, Number(dragged.slice(4)));
      return;
    }

    const [loadingId, fromSlotId, fromDay] = dragged.split(":").map(Number);
    const fromSlot = findSlot(fromSlotId);
    const plan = fromSlot ? planMove({ loadingId, slot, day, from: { slot: fromSlot, day: fromDay } }, plotter.patterns, plotter.entries, plotter.section.level) : null;
    if (!fromSlot || !plan) return;
    try {
      await moveEntry(termId, sectionId, { slotId: slot.id, from_slot_id: fromSlot.id, ...plan });
      toast.success("The class was moved.");
    } catch (error) {
      const details = conflictDetailsOf(error);
      toast.error(details ? `Not moved. ${details.conflicts.map(({ message }) => message).join(" ")}` : error);
    }
  }

  /* ---------- Staying in step ---------- */

  const stopWatching = watch(plotterKey(termId, sectionId), async () => {
    try {
      const before = plotter.loading.find(({ id }) => id === ui.placingId);
      plotter = await getPlotter(termId, sectionId);
      const after = plotter.loading.find(({ id }) => id === ui.placingId);
      if (ui.placingId && !after) ui.placingId = null;
      // The subject being placed just became complete: go on to the next one by itself.
      if (before && after && !isComplete(before) && isComplete(after) && plotter.can_edit) {
        const upNext = nextSubject(plotter.loading);
        toast.success(upNext ? `${after.subject} is complete. Next: ${upNext.subject}.` : `${after.subject} is complete. Every subject is placed.`);
        choosePlacing(upNext?.id ?? null);
        return;
      }
      draw();
    } catch (error) {
      toast.error(error);
    }
  });
  const stopDrag = enableDrag(container, onDrop);

  draw();

  return () => {
    stopWatching();
    stopDrag();
  };
}
