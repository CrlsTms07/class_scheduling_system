// @ts-check
/**
 * A conflict in plain words: what it clashes with, and buttons for the teachers and rooms that are
 * free at that time, so the scheduler can fix it with one tap.
 */
import { h } from "@/lib/dom.js";

/**
 * @param {NonNullable<ReturnType<typeof import("@/api/schedule.js").conflictDetailsOf>>} details
 * @param {{ subjectName: string | null, onTeacher: (teacherId: number) => void, onRoom: (roomId: number) => void }} actions
 *   subjectName: the subject being placed; free teachers are offered only when there is one
 */
export function conflictBox(details, { subjectName, onTeacher, onRoom }) {
  const { teachers, rooms, slots } = details.suggestions;
  return h(
    "div",
    { class: "space-y-2 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm" },
    h("p", { class: "font-medium text-danger" }, "Not saved. This clashes with:"),
    h("ul", { class: "list-disc space-y-1 pl-5 text-danger" }, details.conflicts.map(({ message }) => h("li", null, message))),
    teachers.length && subjectName
      ? suggestions(
          "Teachers free at this time:",
          teachers.map((teacher) =>
            h(
              "button",
              { type: "button", class: "btn btn-outline h-auto flex-col items-start py-1", onclick: () => onTeacher(teacher.id) },
              h("span", null, teacher.name),
              h("span", { class: "text-small font-normal text-muted-foreground" }, `${teacher.teaches_subject ? `Teaches ${subjectName} · ` : ""}${teacher.hours_per_week} hrs a week`),
              teacher.over_day_limit ? h("span", { class: "text-small font-medium text-warning" }, "Over 6 hrs that day") : null,
            ),
          ),
        )
      : null,
    rooms.length ? suggestions("Rooms free at this time:", rooms.map((room) => h("button", { type: "button", class: "btn btn-outline", onclick: () => onRoom(room.id) }, room.label))) : null,
    slots.length ? h("p", { class: "field-help" }, `Free periods for this teacher and room: ${slots.map(({ label }) => label).join(", ")}.`) : null,
  );
}

/**
 * A labelled row of suggestion buttons.
 * @param {string} label
 * @param {HTMLElement[]} buttons
 */
function suggestions(label, buttons) {
  return h("div", { class: "space-y-1" }, h("p", { class: "field-help" }, label), h("div", { class: "flex flex-wrap gap-2" }, buttons));
}
