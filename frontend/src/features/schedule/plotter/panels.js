// @ts-check
/**
 * The panels around a section's schedule: the status notices, the subject list with Next, the
 * minutes per day and the flags. They only draw; what a tap does is passed in by the page.
 */
import { h } from "@/lib/dom.js";
import { icon } from "@/components/icons.js";
import { DAY_NAMES, FLAG_FIXES, dayTotals, isComplete, progressPercent, progressText, subjectColor } from "@/lib/schedule.js";

/**
 * @typedef {import("@/lib/schedule.js").Plotter} Plotter
 * @typedef {import("@/lib/schedule.js").Loading} Loading
 */

const NOTICE_STYLES = {
  success: "border-success/40 bg-success/5 text-success",
  danger: "border-danger/40 bg-danger/5 text-danger",
  info: "border-border bg-surface-muted text-foreground",
};

/**
 * A short message in a colored box.
 * @param {"success" | "danger" | "info"} kind
 * @param {import("@/lib/dom.js").Child} message
 */
export function notice(kind, message) {
  return h("div", { role: kind === "danger" ? "alert" : "status", class: `rounded-lg border p-3 text-sm ${NOTICE_STYLES[kind]}` }, message);
}

/**
 * Where the schedule stands: submitted, approved, rejected or reopened, and classes that could not
 * come back after a revise.
 * @param {Plotter} plotter
 * @param {{ removed: string[], reviseButton: () => HTMLElement }} props
 */
export function statusNotices(plotter, { removed, reviseButton }) {
  const review = plotter.last_review;
  const by = review ? ` by ${review.reviewed_by}` : "";
  return [
    plotter.status === "pending" ? notice("success", "Submitted. This schedule is locked while it waits for the Admin.") : null,
    plotter.status === "approved" ? notice("success", `Approved${by}. This schedule is locked.`) : null,
    plotter.status === "rejected"
      ? h("div", { class: "space-y-2" }, notice("danger", `Rejected${review ? `${by}: ${review.remarks}` : "."}`), plotter.can_plot ? reviseButton() : null)
      : null,
    plotter.status === "draft" && review && review.action !== "approve"
      ? notice("danger", `${review.action === "reject" ? "Rejected" : "Reopened"}${by}: ${review.remarks}`)
      : null,
    removed.length
      ? h("div", { role: "alert", class: "rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger" }, h("p", { class: "font-medium" }, "These classes could not come back. Please place them again:"), h("ul", { class: "list-disc pl-5" }, removed.map((item) => h("li", null, item))))
      : null,
  ];
}

/**
 * What to do first when the section has no subjects or no class times yet, or null.
 * @param {Plotter} plotter
 * @param {{ onAddByTime: () => void }} actions
 */
export function setupNotice(plotter, { onAddByTime }) {
  if (plotter.loading.length === 0) {
    return notice("info", h("span", null, "This section has no subjects with teachers yet. ", h("a", { href: `/teacher-loading?section=${plotter.section.id}`, class: "inline-flex min-h-11 items-center font-medium text-brand underline" }, "Open Teacher Loading"), " to add them first."));
  }
  if (plotter.patterns.length > 0) return null;
  return h(
    "div",
    { class: "card space-y-2 p-4" },
    h("p", { class: "text-sm" }, "This section has no class times yet. Add its first class by choosing the start and end time; the class hours are made from it."),
    h("div", { class: "flex flex-wrap gap-2" },
      plotter.can_edit ? h("button", { type: "button", class: "btn btn-primary", onclick: onAddByTime }, icon("plus"), "Add a class by time") : null,
      h("a", { href: "/time-slots", class: "btn btn-outline" }, icon("clock"), "Class Hours (optional)"),
    ),
  );
}

/**
 * The subjects to place, with how far along each is. The first one not complete is marked Next
 * (Nov 21, 2026). Tapping one picks it for placing; it can also be dragged onto a period.
 * @param {Plotter} plotter
 * @param {{ placingId: number | null, next: Loading | null, isColored: boolean, onChoose: (loadingId: number | null) => void }} props
 */
export function subjectList(plotter, { placingId, next, isColored, onChoose }) {
  const { loading, flags, can_edit: canEdit } = plotter;
  if (loading.length === 0) return null;
  const help = next ? "Start with the subject marked Next: tap it, then tap a lit period. When it is complete, the next one is chosen for you." : "Every subject is complete. Check the flags, then submit for approval.";

  return h(
    "details",
    { class: "card group lg:open", open: window.matchMedia("(min-width: 1024px)").matches },
    h(
      "summary",
      { class: "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 p-3 font-medium" },
      h("span", null, `Subjects · ${loading.filter(isComplete).length} of ${loading.length} placed`),
      icon("chevron-down", "size-4 transition group-open:rotate-180"),
    ),
    h(
      "div",
      { class: "space-y-2 p-3 pt-0" },
      canEdit ? h("p", { class: "field-help" }, help) : null,
      h("ul", { class: "space-y-2" }, loading.map((item) => {
        const isOn = placingId === item.id;
        const isNext = next?.id === item.id;
        const flag = flags.find((each) => each.section_subject_id === item.id);
        return h(
          "li",
          null,
          h(
            "button",
            {
              type: "button",
              "aria-pressed": String(isOn),
              disabled: !canEdit,
              "data-drag": canEdit ? `new:${item.id}` : null,
              class: `w-full rounded-lg border p-2 text-left text-sm ${subjectColor(item.id, isColored)} ${isOn ? "ring-2 ring-brand" : isNext ? "ring-2 ring-brand/40" : ""}`,
              onclick: () => onChoose(isOn ? null : item.id),
            },
            h(
              "span",
              { class: "flex items-start justify-between gap-2" },
              h("span", { class: "flex items-center gap-1 font-medium" }, isComplete(item) ? icon("check", "size-4 shrink-0") : null, item.subject),
              h("span", { class: "flex shrink-0 gap-1" }, isNext ? h("span", { class: "badge bg-brand text-white" }, "Next") : null, item.is_priority ? h("span", { class: "badge bg-surface text-foreground" }, "Priority") : null),
            ),
            h("span", { class: "block text-small opacity-90" }, item.teacher),
            h("span", { class: "block text-small opacity-90" }, progressText(item)),
            h("span", { class: "mt-1 block h-1.5 overflow-hidden rounded-full bg-black/10" }, h("span", { class: "block h-full bg-current opacity-60", style: { width: `${progressPercent(item)}%` } })),
            flag ? h("span", { class: "mt-1 flex items-center gap-1 text-small font-medium text-danger" }, icon("warning"), flag.message) : null,
          ),
        );
      })),
    ),
  );
}

/**
 * The week at a glance (Nov 21, 2026): each day with the minutes placed out of its bell schedule's
 * periods, grouped under its bell schedule (Monday – Thursday, Friday), so a different Friday shows.
 * On phones a day opens that day.
 * @param {Plotter} plotter
 * @param {{ day: number, onDay: (day: number) => void }} props
 */
export function weekStrip(plotter, { day: shownDay, onDay }) {
  const totals = dayTotals(plotter);
  if (totals.every(({ planned }) => planned === 0)) return null;

  /** @type {{ name: string, days: typeof totals }[]} */
  const groups = [];
  for (const total of totals) {
    const name = total.pattern ?? "No class hours";
    const last = groups.at(-1);
    if (last?.name === name) last.days.push(total);
    else groups.push({ name, days: [total] });
  }

  return h(
    "div",
    { class: "card flex flex-wrap gap-x-4 gap-y-2 p-3", "aria-label": "Minutes placed each day" },
    groups.map((group) =>
      h(
        "div",
        { class: "min-w-0" },
        h("p", { class: "text-small font-medium uppercase tracking-wide text-muted-foreground" }, group.name),
        h("div", { class: "flex flex-wrap gap-1" }, group.days.map(({ day, planned, placed }) =>
          h(
            "button",
            {
              type: "button",
              class: `inline-flex min-h-11 flex-col items-start justify-center rounded-lg border px-2 text-left ${planned > 0 && placed >= planned ? "border-success/40 bg-success/5 text-success" : "bg-surface"} ${shownDay === day ? "max-md:portrait:ring-2 max-md:portrait:ring-brand" : ""}`,
              "aria-label": `${DAY_NAMES[day]}: ${placed} of ${planned} minutes placed`,
              onclick: () => onDay(day),
            },
            h("span", { class: "text-small font-semibold" }, DAY_NAMES[day].slice(0, 3)),
            h("span", { class: "text-small" }, planned ? `${placed} of ${planned} mins` : "No periods"),
          ),
        )),
      ),
    ),
  );
}

/**
 * The flags of the schedule, each with how to fix it (design audit, Must fix: plain words and a fix).
 * @param {Plotter} plotter
 * @param {{ onFix: (loadingId: number) => void }} actions  Fix picks the subject for placing
 */
export function flagsPanel(plotter, { onFix }) {
  if (plotter.patterns.length === 0 || plotter.loading.length === 0) return null;
  if (plotter.flags.length === 0) return notice("success", "No flags. This schedule follows the rules so far.");
  const red = plotter.flags.filter(({ severity }) => severity === "red").length;
  return h(
    "details",
    { class: "card" },
    h(
      "summary",
      { class: "flex min-h-11 cursor-pointer items-center gap-2 p-3 text-sm" },
      icon("warning", "size-4 text-warning"),
      h("span", { class: "font-medium" }, `${plotter.flags.length} ${plotter.flags.length === 1 ? "flag" : "flags"} to check`),
      red ? h("span", { class: "badge bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100" }, `${red} urgent`) : null,
    ),
    h("ul", { class: "space-y-2 p-3 pt-0" }, plotter.flags.map((flag) => {
      const fix = FLAG_FIXES[flag.type];
      const loadingId = flag.section_subject_id;
      return h(
        "li",
        { class: `rounded-lg p-2 text-sm ${flag.severity === "red" ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"}` },
        h("p", null, flag.message, flag.acknowledged ? " (acknowledged)" : ""),
        fix ? h("p", { class: "text-small" }, `How to fix: ${fix.text} `, fix.to ? h("a", { href: fix.to, class: "inline-flex min-h-11 items-center font-medium underline" }, `Open ${fix.label}`) : null) : null,
        loadingId && plotter.can_edit ? h("button", { type: "button", class: "btn btn-outline mt-1", onclick: () => onFix(loadingId) }, icon("pencil"), "Fix") : null,
      );
    })),
  );
}
