// @ts-check
/**
 * Toggle buttons of the class dialog: "Subject / Activity", the days, and "Apply to". One look for
 * all of them, so the dialog code only says what each toggle does.
 */
import { h } from "@/lib/dom.js";
import { DAY_NAMES } from "@/lib/schedule.js";

const ON = "border-brand bg-brand text-white";
const OFF = "bg-surface text-foreground hover:bg-surface-muted";

/**
 * One toggle button.
 * @param {{ label: string, isOn: boolean, onClick: () => void, disabled?: boolean, className?: string }} props
 *   className: the layout of this toggle, like "min-w-16 border"
 */
export function toggleButton({ label, isOn, onClick, disabled = false, className = "border" }) {
  return h("button", { type: "button", "aria-pressed": String(isOn), disabled, class: `btn ${className} ${isOn ? ON : OFF}`, onclick: onClick }, label);
}

/**
 * The day toggles (Mon, Tue...) under a "Days" legend. Clicking a day adds or removes it.
 * @param {{ days: number[], chosen: number[], onChange: (days: number[]) => void, isUsable?: (day: number) => boolean, disabled?: boolean }} props
 * @param {import("@/lib/dom.js").Child} [extra]  notes under the buttons
 */
export function dayToggles({ days, chosen, onChange, isUsable = () => true, disabled = false }, extra = null) {
  return h(
    "fieldset",
    { class: "space-y-2" },
    h("legend", { class: "field-label" }, "Days"),
    h(
      "div",
      { class: "flex flex-wrap gap-2" },
      days.map((day) => {
        const isOn = chosen.includes(day);
        return toggleButton({
          label: DAY_NAMES[day].slice(0, 3),
          isOn,
          disabled: disabled || !isUsable(day),
          className: "min-w-16 border",
          onClick: () => onChange(isOn ? chosen.filter((item) => item !== day) : [...chosen, day].sort()),
        });
      }),
    ),
    extra,
  );
}
