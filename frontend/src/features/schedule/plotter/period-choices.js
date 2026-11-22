// @ts-check
/**
 * The periods of the class dialog as blocks, so the scheduler sees before saving why one cannot be
 * used: Available (choose it), Selected, or Full / Too long (with the reason).
 */
import { h } from "@/lib/dom.js";
import { DAY_NAMES, classEnd, classMinutes, slotTimeLabel } from "@/lib/schedule.js";

/**
 * @typedef {import("@/lib/schedule.js").TimeSlot} TimeSlot
 * @typedef {import("@/lib/schedule.js").DayPattern} DayPattern
 * @typedef {import("@/lib/schedule.js").Loading} Loading
 * @typedef {{ slot: TimeSlot, pattern: DayPattern, freeDays: number[], busy: { day: number, reason: string }[] }} Fit
 * @typedef {{ slot: TimeSlot, pattern: DayPattern, freeDays: number[], reason: null | { badge: string, text: string } }} PeriodBlock
 */

/**
 * Every period of the bell schedules: those that fit first (in the given order), then the others
 * with the reason they cannot be used.
 * @param {{ patterns: DayPattern[], fits: Fit[], free: import("@/lib/schedule.js").FreePeriod[] | null, left: number, subjectName: string }} input
 *   left: the subject's minutes still to place
 * @returns {PeriodBlock[]}
 */
export function periodBlocks({ patterns, fits, free, left, subjectName }) {
  const fitIds = new Set(fits.map(({ slot }) => slot.id));
  const others = patterns
    .flatMap((pattern) => pattern.slots.filter((slot) => !slot.is_break && !fitIds.has(slot.id)).map((slot) => ({ slot, pattern })))
    .sort((a, b) => a.slot.start_time.localeCompare(b.slot.start_time))
    .map(({ slot, pattern }) => {
      const period = free?.find(({ slot_id: slotId }) => slotId === slot.id);
      const busy = period && period.free_days.length === 0 ? period.busy[0]?.reason : null;
      const reason = busy ? { badge: "Full", text: busy } : { badge: "Too long", text: `It is ${slot.minutes} mins; ${left} mins are left for ${subjectName}.` };
      return { slot, pattern, freeDays: /** @type {number[]} */ ([]), reason };
    });
  return [...fits.map(({ slot, pattern, freeDays }) => ({ slot, pattern, freeDays, reason: null })), ...others];
}

/**
 * One period as a radio block.
 * @param {PeriodBlock} block
 * @param {{ subject: Loading, isChosen: boolean, showPattern: boolean, onClick: () => void }} props
 *   showPattern: name the bell schedule (when there is more than one)
 */
export function periodButton({ slot, pattern, freeDays, reason }, { subject, isChosen, showPattern, onClick }) {
  const badge = reason
    ? h("span", { class: "badge shrink-0 bg-surface text-muted-foreground" }, reason.badge)
    : isChosen
      ? h("span", { class: "badge shrink-0 bg-brand text-white" }, "Selected")
      : h("span", { class: "badge shrink-0 bg-success/10 text-success" }, "Available");
  const look = reason ? "cursor-not-allowed border-dashed bg-surface-muted text-muted-foreground" : isChosen ? "border-brand bg-brand-soft ring-1 ring-brand" : "hover:border-brand hover:bg-surface-muted";

  return h(
    "button",
    { type: "button", role: "radio", "aria-checked": String(isChosen), "aria-disabled": reason ? "true" : null, title: reason?.text, class: `min-h-11 rounded-lg border px-3 py-2 text-left text-sm ${look}`, onclick: onClick },
    h(
      "span",
      { class: "flex items-center justify-between gap-2" },
      h("span", { class: "font-medium" }, slotTimeLabel(slot), slot.is_async ? h("span", { class: "badge ml-1 bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100" }, "Async") : null),
      badge,
    ),
    h("span", { class: "block text-small" }, reason ? reason.text : `${usedTime(subject, slot)} · ${showPattern ? `${pattern.name} · ` : ""}free ${freeDays.map((day) => DAY_NAMES[day].slice(0, 3)).join(", ")}`),
  );
}

/**
 * "45 mins", or the part of a longer period the subject uses: "Uses 6:00 – 7:00 AM (60 mins)".
 * @param {Loading} subject
 * @param {TimeSlot} slot
 */
function usedTime(subject, slot) {
  const minutes = classMinutes(subject, slot);
  return minutes < slot.minutes ? `Uses ${slotTimeLabel({ ...slot, end_time: classEnd(subject, slot) })} (${minutes} mins)` : `${slot.minutes} mins`;
}
