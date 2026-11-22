// @ts-check
/**
 * The shifts a user works with. Junior High runs in a morning and an afternoon shift, so the
 * Chairperson (GLC) never sees "Whole day" (team decision, Nov 21, 2026). Senior High also has a
 * part-time shift, seen by the Admin and the Master Teacher only (Nov 21, 2026).
 */
import { formatTime } from "./time.js";

/** @type {Record<string, string>} */
export const SHIFT_LABELS = { WHOLE_DAY: "Whole day", AM: "Morning (AM)", PM: "Afternoon (PM)", PART_TIME: "Part-time (Senior High)" };

/**
 * The shifts offered to this role, as { value: label }. Part-time is left out for Junior High.
 * @param {string | undefined} role
 * @param {string | null} [level]  "JHS" or "SHS" when known
 * @returns {Record<string, string>}
 */
export function shiftChoices(role, level = null) {
  if (role === "glc") return { AM: SHIFT_LABELS.AM, PM: SHIFT_LABELS.PM };
  const all = { ...SHIFT_LABELS };
  if (level === "JHS") delete all.PART_TIME;
  return all;
}

/**
 * The shift a new record starts with.
 * @param {string | undefined} role
 */
export function defaultShift(role) {
  return role === "glc" ? "AM" : "WHOLE_DAY";
}

/**
 * A saved shift as options for a select: the role's choices, plus the saved one if it is not among
 * them (an older record stays readable).
 * @param {string | undefined} role
 * @param {string | null | undefined} saved
 */
export function shiftOptions(role, saved) {
  const choices = shiftChoices(role);
  const options = Object.entries(choices).map(([value, label]) => ({ value, label }));
  return saved && !choices[saved] ? [...options, { value: saved, label: SHIFT_LABELS[saved] ?? saved }] : options;
}

/**
 * @typedef {{ from: string | null, to: string | null, name: string }} ShiftWindow  the hours a shift may use
 */

/**
 * Why a row from start to end does not fit the shift's hours (Junior High, Nov 22, 2026), in the
 * same words as the server, or null. No window means no limit.
 * @param {ShiftWindow | null | undefined} window
 * @param {string | null} start  "HH:MM"
 * @param {string | null} end
 */
export function shiftHoursProblem(window, start, end) {
  if (!window) return null;
  if (start && window.from && start.slice(0, 5) < window.from) return `The ${window.name} shift starts at ${formatTime(window.from)}, so a row cannot start at ${formatTime(start.slice(0, 5))}.`;
  if (end && window.to && end.slice(0, 5) > window.to) return `The ${window.name} shift ends at ${formatTime(window.to)}, so a row cannot end at ${formatTime(end.slice(0, 5))}.`;
  return null;
}

/**
 * "Morning shift: until 12:30 PM", "Afternoon shift: 12:20 PM – 6:30 PM", or null with no limit.
 * @param {ShiftWindow | null | undefined} window
 */
export function shiftHoursText(window) {
  if (!window || (!window.from && !window.to)) return null;
  const name = window.name.charAt(0).toUpperCase() + window.name.slice(1);
  if (window.from && window.to) return `${name} shift: ${formatTime(window.from)} – ${formatTime(window.to)}`;
  return window.to ? `${name} shift: until ${formatTime(window.to)}` : `${name} shift: from ${formatTime(/** @type {string} */ (window.from))}`;
}
