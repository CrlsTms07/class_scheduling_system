// @ts-check
/**
 * The Activity side of the class dialog: Flag Ceremony, Catch-up Friday... An activity goes on the
 * tapped period of this section, its grade or all the scheduler's sections. Saving shows a review
 * first (which sections get it, which classes it replaces); the second Save places it.
 */
import { api, errorMessage } from "@/api/client.js";
import { placeActivity } from "@/api/schedule.js";
import { toast } from "@/components/toast.js";
import { searchableSelect } from "@/components/searchable-select.js";
import { h, replace } from "@/lib/dom.js";
import { termState } from "@/state/term.js";
import { dayToggles, toggleButton } from "./toggles.js";

/**
 * @typedef {"section" | "grade" | "all"} ActivityScope
 */

/**
 * Draws the activity fields into `area` and returns how to save them.
 * @param {{
 *   plotter: import("@/lib/schedule.js").Plotter,
 *   termId: number,
 *   slot: import("@/lib/schedule.js").TimeSlot,
 *   day: number,
 *   activityId: number | null,
 *   area: HTMLElement,
 *   showError: (message: string) => void,
 * }} props
 * @returns {{ save: () => Promise<boolean> }}  save: true once the activity is placed
 */
export function activityFields({ plotter, termId, slot, day, activityId, area, showError }) {
  const pattern = plotter.patterns.find(({ slots }) => slots.some(({ id }) => id === slot.id));
  /** @type {{ activityId: number | null, scope: ActivityScope, days: number[] }} */
  const choice = { activityId, scope: "section", days: [day] };
  const review = h("div");
  /** The input of the last review: the second Save with the same input places it. */
  let reviewedInput = "";

  /** Any change asks for a new review. */
  const changed = () => {
    review.replaceChildren();
    reviewedInput = "";
    draw();
  };

  const addActivity = async (/** @type {string} */ name) => {
    try {
      const { data } = /** @type {{ data: { id: number } }} */ (await api(`/school-years/${termState.term?.school_year.id}/activities`, { method: "POST", body: { name, code: null } }));
      plotter.activities.push({ id: data.id, name });
      choice.activityId = data.id;
      toast.success(`${name} was added.`);
      changed();
    } catch (error) {
      showError(errorMessage(error));
    }
  };

  /** @type {[ActivityScope, string][]} */
  const scopes = [
    ["section", "This section only"],
    ["grade", `All Grade ${plotter.section.grade} sections (${plotter.apply_counts.grade})`],
    ["all", `All my sections (${plotter.apply_counts.all})`],
  ];

  function draw() {
    replace(
      area,
      searchableSelect({
        label: "Activity",
        placeholder: "Choose or type the activity",
        value: choice.activityId,
        help: "Like Flag Ceremony or Catch-up Friday. Type a new one to add it.",
        options: plotter.activities.map((item) => ({ value: item.id, label: item.name })),
        onChange: (value) => {
          choice.activityId = Number(value);
          review.replaceChildren();
          reviewedInput = "";
        },
        // Activities are added right here, while plotting (team decision, Nov 21, 2026).
        create: { label: (typed) => `Add "${typed}"`, run: addActivity },
      }),
      h(
        "fieldset",
        { class: "space-y-2" },
        h("legend", { class: "field-label" }, "Apply to"),
        h("div", { class: "grid gap-2" }, scopes.map(([value, label]) => toggleButton({ label, isOn: choice.scope === value, className: "justify-start border", onClick: () => { choice.scope = value; changed(); } }))),
      ),
      dayToggles({ days: pattern?.days ?? [day], chosen: choice.days, onChange: (days) => { choice.days = days; changed(); } }),
      review,
    );
  }

  const save = async () => {
    if (!choice.activityId || choice.days.length === 0) {
      showError("Choose an activity and at least one day.");
      return false;
    }
    const input = { slotId: slot.id, activity_id: choice.activityId, scope: choice.scope, days: choice.days };

    // A review comes first: which sections get it, and which classes it replaces.
    if (reviewedInput !== JSON.stringify(input)) {
      const summary = await placeActivity(termId, plotter.section.id, { ...input, preview: true });
      reviewedInput = JSON.stringify(input);
      replace(review, reviewBox(summary));
      return false;
    }

    const summary = await placeActivity(termId, plotter.section.id, { ...input, preview: false });
    toast.success(`${summary.activity} was placed on ${sectionsText(summary.placed_sections)}.`);
    return true;
  };

  draw();
  return { save };
}

/**
 * What placing the activity will do, before it is done.
 * @param {any} summary  the preview from the API
 */
function reviewBox(summary) {
  /** @type {string[]} */
  const unplaced = summary.sections.flatMap((/** @type {any} */ section) => section.unplaced.map((/** @type {string} */ item) => `${section.label}: ${item}`));
  const skipped = summary.sections.filter((/** @type {any} */ section) => section.skipped);
  const list = (/** @type {string[]} */ items) => h("ul", { class: "list-disc pl-5" }, items.map((item) => h("li", null, item)));
  return h(
    "div",
    { class: "space-y-2 rounded-lg border p-3 text-sm" },
    h("p", { class: "font-medium" }, `${summary.activity} goes on ${sectionsText(summary.placed_sections)} at ${summary.time}.`),
    unplaced.length ? h("div", null, h("p", null, "These classes will be taken off and listed as not placed:"), list(unplaced)) : null,
    skipped.length ? h("div", null, h("p", null, "Left out:"), list(skipped.map((/** @type {any} */ section) => `${section.label}: ${section.skipped}`))) : null,
    h("p", { class: "text-muted-foreground" }, "Press Save again to place it."),
  );
}

/** "1 section", "3 sections". */
const sectionsText = (/** @type {number} */ count) => `${count} ${count === 1 ? "section" : "sections"}`;
