// @ts-check
/**
 * The one "Add / Edit class" dialog (design audit, Must fix #10): every way of placing a class
 * uses it, from the day cards, the weekly grid and the phone list. It is centered and shows all
 * fields at once (UI requirement 2), its dropdowns can be searched (UI requirement 3), it offers
 * only the periods that fit the subject and are free (UI requirement 6), and typed times are
 * 12-hour (UI requirement 5).
 *
 * The time is chosen here, while making the schedule (beneficiary review, Nov 21, 2026): pick a
 * period, or type the start and end. A typed time becomes a period of the section's bell schedule
 * (a day with none gets one), so no time slots have to be set up first.
 *
 * Its parts live next to it: add-subject.js, activity-fields.js, period-choices.js,
 * conflict-box.js and toggles.js.
 */
import { teacherHint } from "@/api/teacher-loading.js";
import { h, replace } from "@/lib/dom.js";
import { openDialog, confirmAction, setBusy } from "@/components/dialog.js";
import { searchableSelect } from "@/components/searchable-select.js";
import { timePicker } from "@/components/time-picker.js";
import { toast } from "@/components/toast.js";
import { icon } from "@/components/icons.js";
import { errorMessage } from "@/api/client.js";
import { assignSlot, changeTeacher, clearSlot, conflictDetailsOf, getFreePeriods, getPlotter, getTeacherChoices, quickAddTeacher, resolvePeriod } from "@/api/schedule.js";
import { DAY_NAMES, classMinutes, defaultDays, entryAt, fittingPeriods, hasSubject, isActivity, isLocked, minutesLeft, nextSubject, progressText, slotTimeLabel } from "@/lib/schedule.js";
import { shiftHoursProblem } from "@/lib/shifts.js";
import { minutesBetween } from "@/lib/time.js";
import { activityFields } from "./activity-fields.js";
import { openAddSubject } from "./add-subject.js";
import { conflictBox } from "./conflict-box.js";
import { periodBlocks, periodButton } from "./period-choices.js";
import { dayToggles, toggleButton } from "./toggles.js";

/**
 * @typedef {import("@/lib/schedule.js").Plotter} Plotter
 * @typedef {import("@/lib/schedule.js").TimeSlot} TimeSlot
 * @typedef {import("@/lib/schedule.js").Loading} Loading
 * @typedef {import("./period-choices.js").Fit} Fit
 *
 * @typedef {object} ClassTarget
 * @property {number} day  the day that was tapped
 * @property {TimeSlot} [slot]  the period that was tapped, when there is one
 * @property {number} [loadingId]  a subject already chosen (tap-to-assign, or a drop that needs more)
 * @property {unknown} [error]  a conflict from a quick placement, to explain at once
 */

const NOTE = "rounded-lg bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100";

/**
 * Opens the dialog for a period (or a day, to type a time).
 * @param {{ plotter: Plotter, termId: number, target: ClassTarget }} props
 */
export function openClassDialog({ plotter, termId, target }) {
  const sectionId = plotter.section.id;
  const tappedSlot = target.slot;
  const current = tappedSlot ? entryAt(plotter.entries, target.day, tappedSlot) : undefined;
  const isEditing = hasSubject(current);
  const isCurrentLocked = current ? isLocked(current) : false;

  /** @type {{ kind: "subject" | "activity", loadingId: number | null, teacherId: number | null, roomId: number | null, slotId: number | null, days: number[], typing: boolean, free: import("@/lib/schedule.js").FreePeriod[] | null }} */
  const state = {
    kind: isActivity(current) ? "activity" : "subject",
    // An empty period starts with the subject marked Next (Nov 21, 2026), one choice less.
    loadingId: target.loadingId ?? current?.section_subject_id ?? (current ? null : (nextSubject(plotter.loading)?.id ?? null)),
    teacherId: null,
    roomId: current?.room_id ?? plotter.section.home_room_id,
    slotId: tappedSlot?.id ?? null,
    days: isEditing ? [target.day] : [],
    // No period tapped and no bell schedule yet: start by typing the time.
    typing: !tappedSlot && plotter.patterns.length === 0,
    free: null,
  };

  const loading = () => plotter.loading.find(({ id }) => id === state.loadingId);
  const chosenTeacherId = () => state.teacherId ?? loading()?.teacher_id ?? null;
  /** A chosen period of an asynchronous session (Senior High) takes no room (Nov 21, 2026). */
  const isAsyncChosen = () => !state.typing && state.slotId !== null && plotter.patterns.some(({ slots }) => slots.some((slot) => slot.id === state.slotId && slot.is_async));

  const errorBox = h("div", { role: "alert", "aria-live": "assertive" });
  const kindArea = h("div");
  const fieldsArea = h("div", { class: "space-y-4" });
  const periodsArea = h("div", { class: "space-y-2" });
  const daysArea = h("div");
  const saveButton = /** @type {HTMLButtonElement} */ (h("button", { type: "button", class: "btn btn-primary", onclick: () => save() }, isEditing ? "Save changes" : "Add class"));
  const removeButton = /** @type {HTMLButtonElement} */ (h("button", { type: "button", class: "btn btn-outline text-danger", onclick: () => remove() }, icon("trash"), "Remove from selected days"));

  /** @type {ReturnType<typeof setInterval> | undefined} */
  let recheck;
  const { close } = openDialog({
    title: `${isEditing ? "Edit" : "Add"} class · ${DAY_NAMES[target.day]}`,
    description: tappedSlot ? `${plotter.section.label} · ${slotTimeLabel(tappedSlot)} · ${tappedSlot.minutes} mins` : `${plotter.section.label}. Choose a period, or type the start and end time.`,
    onClose: () => {
      clearInterval(recheck);
      window.removeEventListener("focus", onFocus);
    },
    body: h("div", { class: "space-y-4" }, errorBox, kindArea, fieldsArea),
    footer: [
      h("button", { type: "button", class: "btn btn-outline", onclick: () => close() }, "Cancel"),
      isEditing && !isCurrentLocked ? removeButton : null,
      !isCurrentLocked ? saveButton : null,
    ],
  });

  /* ---------- Messages ---------- */

  const showError = (/** @type {string} */ message) => {
    replace(errorBox, h("p", { class: "rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger" }, message));
  };

  /** Explains a conflict in plain words, with buttons for the free rooms and teachers. */
  const showConflict = (/** @type {unknown} */ error) => {
    const details = conflictDetailsOf(error);
    if (!details) {
      showError(errorMessage(error));
      return;
    }
    const pick = (/** @type {() => void} */ change) => {
      change();
      errorBox.replaceChildren();
      drawFields();
    };
    replace(errorBox, conflictBox(details, {
      subjectName: loading()?.subject ?? null,
      onTeacher: (teacherId) => pick(() => { state.teacherId = teacherId; }),
      onRoom: (roomId) => pick(() => { state.roomId = roomId; }),
    }));
  };

  /* ---------- What goes here: a subject or an activity ---------- */

  const drawKind = () => {
    if (isCurrentLocked) {
      replace(kindArea, h("p", { class: "rounded-lg bg-surface-muted p-3 text-sm" }, `This class is ${current?.status} and cannot be changed.`));
      return;
    }
    const kinds = /** @type {const} */ ([["subject", "Subject"], ["activity", "Activity"]]);
    replace(
      kindArea,
      h(
        "div",
        { role: "group", "aria-label": "What goes here", class: "grid grid-cols-2 overflow-hidden rounded-lg border" },
        kinds.map(([kind, label]) => toggleButton({ label, isOn: state.kind === kind, className: "rounded-none", onClick: () => { state.kind = kind; errorBox.replaceChildren(); drawKind(); drawFields(); } })),
      ),
    );
  };

  /* ---------- A subject: its teacher, room, period and days ---------- */

  const addSubject = () =>
    openAddSubject({
      termId,
      section: plotter.section,
      onNoneLeft: showError,
      // The new subject is chosen at once, with its teacher.
      onAdded: async (subjectId) => {
        try {
          plotter.loading = (await getPlotter(termId, sectionId)).loading;
        } catch (error) {
          toast.error(error);
          return;
        }
        state.loadingId = plotter.loading.find((item) => item.subject_id === subjectId)?.id ?? null;
        state.teacherId = null;
        drawFields();
      },
    });

  /** @type {ReturnType<typeof activityFields> | null} */
  let activity = null;

  const drawFields = () => {
    if (state.kind === "activity") {
      activity = tappedSlot
        ? activityFields({ plotter, termId, slot: tappedSlot, day: target.day, activityId: current?.activity_id ?? null, area: fieldsArea, showError })
        : null;
      if (!tappedSlot) replace(fieldsArea, h("p", { class: "rounded-lg bg-surface-muted p-3 text-sm" }, "Activities go on a period of the bell schedule. Tap a period to add one."));
      return;
    }
    if (plotter.loading.length === 0) {
      drawNoSubjects();
      return;
    }

    const subject = loading();
    replace(
      fieldsArea,
      searchableSelect({
        label: "Subject",
        placeholder: "Choose the subject",
        value: state.loadingId,
        disabled: isCurrentLocked,
        options: plotter.loading.map((item) => ({ value: item.id, label: item.subject, hint: `${item.teacher} · ${progressText(item)}` })),
        onChange: (value) => {
          state.loadingId = Number(value);
          state.teacherId = null;
          drawFields();
        },
      }),
      isCurrentLocked ? null : h("button", { type: "button", class: "btn btn-quiet -mt-2 justify-start px-0 text-brand", onclick: addSubject }, icon("plus"), "Add a subject to this section"),
      teacherSelect(subject),
      searchableSelect({
        label: "Room",
        placeholder: "Choose the room",
        value: state.roomId,
        disabled: isCurrentLocked,
        options: plotter.rooms.map((room) => ({ value: room.id, label: room.label })),
        help: plotter.section.home_room_id && state.roomId === plotter.section.home_room_id ? "The section's home room." : undefined,
        onChange: (value) => {
          state.roomId = Number(value);
          refreshFree();
        },
      }),
      periodsArea,
      daysArea,
    );
    refreshFree();
  };

  /**
   * The subjects here come from Teacher Loading (a subject with its teacher, for this section and
   * term), not from the Subjects page: say so plainly, with a way there, instead of an empty list.
   */
  const drawNoSubjects = () => {
    replace(
      fieldsArea,
      h(
        "div",
        { role: "status", class: "space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50" },
        h("p", { class: "font-semibold" }, `No subject is ready for ${plotter.section.label} yet.`),
        h("p", null, "A subject shows here once it is given to this section with its teacher (Teacher Loading). Subjects made on the Subjects page are only the list of names to choose from."),
        h("div", { class: "flex flex-wrap gap-2" },
          isCurrentLocked ? null : h("button", { type: "button", class: "btn btn-primary", onclick: addSubject }, icon("plus"), "Add a subject here"),
          h("a", { href: `/teacher-loading?section=${sectionId}`, class: "btn btn-outline" }, icon("clipboard"), "Open Teacher Loading"),
        ),
        h("p", { class: "text-small" }, "Or choose Activity above for a class with no subject, like Flag Ceremony."),
      ),
    );
    periodsArea.replaceChildren();
    daysArea.replaceChildren();
  };

  /**
   * The teacher: the subject's teacher from the loading, another teacher, or a new one typed here.
   * @param {Loading | undefined} subject
   */
  const teacherSelect = (subject) => {
    /** @type {{ value: number, label: string, hint?: string }[]} */
    let options = subject ? [{ value: subject.teacher_id, label: subject.teacher }] : [];
    const select = searchableSelect({
      label: "Teacher",
      placeholder: subject ? subject.teacher : "Choose the subject first",
      value: chosenTeacherId(),
      disabled: !subject || isCurrentLocked,
      options,
      help: subject ? "From the teacher loading. A new teacher here teaches all of this subject's classes in the section." : undefined,
      onChange: (value) => {
        state.teacherId = Number(value);
        refreshFree();
      },
      create: {
        label: (typed) => `Add new teacher "${typed}"`,
        run: async (typed) => {
          const parts = typed.trim().split(/\s+/);
          if (parts.length < 2) {
            toast.error("Type the first and last name of the new teacher.");
            return;
          }
          try {
            const teacher = await quickAddTeacher({ first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] });
            toast.success(`${teacher.name} was added. Complete their record later on the Teachers page.`);
            state.teacherId = teacher.id;
            select.setOptions([...options, { value: teacher.id, label: teacher.name }]);
            select.setValue(teacher.id);
            refreshFree();
          } catch (error) {
            toast.error(error);
          }
        },
      },
    });

    // Every teacher who may take it, loaded after the dialog opens.
    if (subject) {
      getTeacherChoices(termId, sectionId)
        .then((teachers) => {
          options = teachers.map((/** @type {any} */ teacher) => ({ value: teacher.id, label: teacher.name, hint: teacherHint(teacher) }));
          if (!options.some(({ value }) => value === subject.teacher_id)) options.unshift({ value: subject.teacher_id, label: subject.teacher });
          select.setOptions(options);
        })
        .catch(() => {});
    }
    return select;
  };

  /* ---------- Where: the periods that fit (UI requirement 6), or a typed time ---------- */

  let freeRequest = 0;
  /** Settles when the free periods for the chosen subject, teacher and room are known. */
  let freeReady = Promise.resolve();
  /** @param {{ quiet?: boolean }} [options]  quiet: a background check, with no loading shimmer */
  const refreshFree = (options) => {
    freeReady = loadFree(options);
    return freeReady;
  };
  const loadFree = async ({ quiet = false } = {}) => {
    if (!loading()) {
      replace(periodsArea, h("p", { class: "field-help" }, "Choose the subject to see the periods it fits."));
      daysArea.replaceChildren();
      return;
    }
    const thisRequest = ++freeRequest;
    if (!quiet) {
      replace(periodsArea, h("div", { class: "skeleton h-11 w-full" }));
      state.free = null;
    }
    try {
      const free = await getFreePeriods(termId, sectionId, { teacherId: chosenTeacherId(), roomId: state.roomId });
      if (thisRequest !== freeRequest) return;
      state.free = free;
      drawPeriods();
    } catch (error) {
      replace(periodsArea, h("p", { class: "field-error" }, errorMessage(error)));
    }
  };

  /** The periods this subject may go to; when editing, its own place counts as free. */
  const fits = () => {
    const subject = loading();
    if (!subject || !state.free) return [];
    const editing = isEditing && tappedSlot && current
      ? { slotId: tappedSlot.id, days: plotter.entries.filter((entry) => entry.start_time === tappedSlot.start_time && entry.section_subject_id === current.section_subject_id).map(({ day }) => day), sameSubject: current.section_subject_id === state.loadingId }
      : undefined;
    return fittingPeriods({ patterns: plotter.patterns, loading: subject, free: state.free, editing });
  };

  /** The typed time: checked while it is chosen (the end after the start, inside the shift's hours). */
  const typedError = h("p", { class: "field-error", role: "alert", hidden: true });
  const checkTyped = () => {
    const start = startPicker.getValue();
    const end = endPicker.getValue();
    const message = start && end && minutesBetween(start, end) <= 0 ? "The end time must be after the start time." : (shiftHoursProblem(plotter.section.shift_window, start, end) ?? "");
    typedError.textContent = message;
    typedError.hidden = !message;
    return !message;
  };
  const startPicker = timePicker({ label: "Start time", onChange: () => checkTyped() });
  const endPicker = timePicker({ label: "End time", onChange: () => checkTyped() });
  const typeTime = (/** @type {boolean} */ typing) => {
    state.typing = typing;
    drawPeriods();
  };

  const drawTyping = () => {
    replace(
      periodsArea,
      h("p", { class: "field-label" }, "Time"),
      h("div", { class: "flex flex-wrap gap-4" }, startPicker, endPicker),
      typedError,
      h("p", { class: "field-help" }, "A new time becomes a period of the bell schedule, so the conflict rules and the Class Program still work. It must not overlap a period or a break."),
      plotter.patterns.length > 0 ? h("button", { type: "button", class: "btn btn-quiet px-0 text-brand", onclick: () => typeTime(false) }, icon("arrow-left"), "Choose a period instead") : null,
    );
    drawDays(null);
  };

  const drawPeriods = () => {
    if (state.typing) {
      drawTyping();
      return;
    }
    const subject = /** @type {Loading} */ (loading());
    const left = minutesLeft(subject);
    const isOnTappedDay = (/** @type {Fit} */ fit) => fit.freeDays.includes(target.day);
    // The tapped day's periods first, the others after.
    const options = fits().sort((a, b) => Number(isOnTappedDay(b)) - Number(isOnTappedDay(a)) || a.slot.start_time.localeCompare(b.slot.start_time));
    if (state.slotId !== null && !options.some(({ slot }) => slot.id === state.slotId)) {
      state.slotId = options.find(isOnTappedDay)?.slot.id ?? null;
    }
    const chosen = options.find(({ slot }) => slot.id === state.slotId) ?? null;

    replace(
      periodsArea,
      h(
        "div",
        { class: "flex flex-wrap items-baseline justify-between gap-2" },
        h("p", { class: "field-label" }, "Period"),
        h("p", { class: "field-help" }, progressLine(subject, left)),
      ),
      tappedNote(options, left),
      left <= 0
        ? h("p", { class: "rounded-lg bg-surface-muted p-3 text-sm" }, "This subject already has all its minutes. Choose another subject, or remove one of its classes first.")
        : [
            options.length === 0 ? h("p", { role: "status", class: `${NOTE} p-3` }, "No period is free for this subject now: each one below says why. Try another room or teacher, or free a period first.") : null,
            h(
              "div",
              { role: "radiogroup", "aria-label": "Period", class: "grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2" },
              periodBlocks({ patterns: plotter.patterns, fits: options, free: state.free, left, subjectName: subject.subject }).map((block) =>
                periodButton(block, {
                  subject,
                  isChosen: !block.reason && state.slotId === block.slot.id,
                  showPattern: plotter.patterns.length > 1,
                  onClick: () => {
                    if (block.reason) {
                      showError(`${slotTimeLabel(block.slot)} cannot be used: ${block.reason.text}`);
                      return;
                    }
                    state.slotId = block.slot.id;
                    drawPeriods();
                  },
                }),
              ),
            ),
          ],
      // Typing a time is the other way, kept out of the way when the bell schedule has periods.
      left > 0 ? h("button", { type: "button", class: "btn btn-quiet px-0 text-small text-muted-foreground", onclick: () => typeTime(true) }, icon("clock"), "Other time… (type the start and end)") : null,
      chosen?.slot.is_async ? h("p", { class: "rounded-lg bg-sky-50 p-2 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100" }, "Asynchronous session: this class needs no room, so the room above is not used.") : null,
    );
    drawDays(chosen);
  };

  /**
   * How far along the subject is, said above the periods.
   * @param {Loading} subject
   * @param {number} left
   */
  const progressLine = (subject, left) => {
    if (subject.target) return `${subject.subject}: ${progressText(subject)}.`;
    if (left === Infinity) return `${subject.subject}: ${subject.scheduled_minutes} mins a week on the schedule so far.`;
    return left > 0 ? `${subject.subject}: ${left} mins a week still to place.` : `${subject.subject} is complete.`;
  };

  /**
   * The period that was tapped but cannot be offered: why, in plain words.
   * @param {Fit[]} options
   * @param {number} left
   */
  const tappedNote = (options, left) => {
    if (!tappedSlot || options.some(({ slot }) => slot.id === tappedSlot.id)) return null;
    const busy = (state.free?.find(({ slot_id: slotId }) => slotId === tappedSlot.id)?.busy ?? []).filter(({ day }) => day === target.day);
    const isTooLong = !tappedSlot.is_break && tappedSlot.minutes > left && busy.length === 0;
    if (!busy.length && !isTooLong) return null;
    const why = busy.length ? busy.map(({ day, reason }) => `${DAY_NAMES[day]}: ${reason}`).join(" ") : `It is ${tappedSlot.minutes} mins, more than the ${left} mins left.`;
    return h("p", { class: NOTE }, `${slotTimeLabel(tappedSlot)} is not offered. `, why);
  };

  /**
   * The days of the chosen period. Busy days cannot be picked and say why.
   * @param {Fit | null} chosen
   */
  const drawDays = (chosen) => {
    const allDays = chosen ? chosen.pattern.days : [1, 2, 3, 4, 5];
    const usable = chosen ? chosen.freeDays : allDays;
    if (state.days.length === 0 || state.days.some((day) => !usable.includes(day))) {
      state.days = chosen ? defaultDays(plotter, chosen.pattern, chosen.slot, target.day, chosen.freeDays) : [target.day];
      if (state.days.length === 0 && usable.length > 0) state.days = [usable[0]];
    }

    const subject = loading();
    const total = chosen && subject ? classMinutes(subject, chosen.slot) * state.days.length : 0;
    const left = subject ? minutesLeft(subject) : 0;
    replace(
      daysArea,
      dayToggles(
        { days: allDays, chosen: state.days, isUsable: (day) => usable.includes(day), disabled: isCurrentLocked, onChange: (days) => { state.days = days; drawDays(chosen); } },
        [
          chosen && chosen.busy.length > 0 ? h("ul", { class: "space-y-1" }, chosen.busy.map(({ day, reason }) => h("li", { class: "text-small text-muted-foreground" }, `${DAY_NAMES[day]}: ${reason}`))) : null,
          subject && total > left && !isEditing ? h("p", { class: "field-help text-warning" }, `This adds ${total} mins, ${total - left} more than ${subject.subject} still needs. It will be saved and flagged.`) : null,
        ],
      ),
    );
  };

  /* ---------- Save and remove ---------- */

  /**
   * The period of each chosen day: the chosen period, or a typed time made into a period.
   * Null (with the reason shown) when something is missing.
   * @returns {Promise<Map<number, number[]> | null>}  slot id => days
   */
  const placementsToSave = async () => {
    if (state.days.length === 0) {
      showError(state.typing ? "Choose at least one day." : "Choose a period and at least one day.");
      return null;
    }
    if (!state.typing) {
      if (!state.slotId) {
        showError("Choose a period and at least one day.");
        return null;
      }
      return new Map([[state.slotId, state.days]]);
    }
    const start = startPicker.getValue();
    const end = endPicker.getValue();
    if (!start || !end) {
      showError("Choose the start and end time.");
      return null;
    }
    if (!checkTyped()) {
      showError(typedError.textContent ?? "Check the time.");
      return null;
    }
    const slots = await resolvePeriod(termId, sectionId, { days: state.days, start_time: start, end_time: end });
    /** @type {Map<number, number[]>} */
    const placements = new Map();
    for (const day of state.days) {
      const slotId = slots[String(day)];
      placements.set(slotId, [...(placements.get(slotId) ?? []), day]);
    }
    return placements;
  };

  const saveSubject = async () => {
    const subject = loading();
    if (!subject || (!state.roomId && !isAsyncChosen())) {
      showError("Choose the subject and the room.");
      return;
    }
    const placements = await placementsToSave();
    if (!placements) return;

    const teacherId = chosenTeacherId();
    if (teacherId && teacherId !== subject.teacher_id) {
      await changeTeacher(termId, sectionId, { subjectId: subject.subject_id, teacherId });
    }
    for (const [slotId, days] of placements) {
      await assignSlot(termId, sectionId, { slotId, section_subject_id: subject.id, room_id: isAsyncChosen() ? null : state.roomId, days });
    }
    // Moved to another period: take the class off its old one.
    if (isEditing && tappedSlot && !placements.has(tappedSlot.id)) {
      await clearSlot(termId, sectionId, { slotId: tappedSlot.id, days: [target.day] });
    }
    toast.success(`${subject.subject} ${isEditing ? "was changed" : "was added"}.`);
    close();
  };

  const save = async () => {
    errorBox.replaceChildren();
    setBusy(saveButton, true, "Checking...");
    try {
      // A quick tap can come before the free periods are known: wait for them first.
      await freeReady;
      setBusy(saveButton, false);
      setBusy(saveButton, true);
      if (state.kind === "subject") {
        await saveSubject();
      } else if (!activity) {
        showError("Choose an activity and at least one day.");
      } else if (await activity.save()) {
        close();
      }
    } catch (error) {
      showConflict(error);
      toast.error(error);
      // The blocks may have changed (another user took one): check them again, so the list is current.
      if (conflictDetailsOf(error)) refreshFree();
    } finally {
      if (saveButton.isConnected) setBusy(saveButton, false);
    }
  };

  const remove = async () => {
    if (!tappedSlot || !current) return;
    // The days chosen under Days (the tapped day at first).
    const days = state.days.length > 0 ? state.days : [target.day];
    const isSure = await confirmAction({
      title: `Remove ${current.subject ?? "this class"}?`,
      message: `This takes it off ${days.map((day) => DAY_NAMES[day]).join(", ")} at ${slotTimeLabel(tappedSlot)}. The teacher loading stays.`,
      confirmLabel: "Yes, remove it",
    });
    if (!isSure) return;
    setBusy(removeButton, true, "Removing...");
    try {
      await clearSlot(termId, sectionId, { slotId: tappedSlot.id, days });
      toast.success(`${current.subject ?? "The class"} was removed.`);
      close();
    } catch (error) {
      showError(errorMessage(error));
      toast.error(error);
    } finally {
      if (removeButton.isConnected) setBusy(removeButton, false);
    }
  };

  // While the dialog is open, another scheduler may take a block: check again every 30 seconds and
  // when the window comes back into focus, so a taken block turns Full before anyone saves.
  function onFocus() {
    if (loading()) refreshFree({ quiet: true });
  }
  recheck = setInterval(onFocus, 30_000);
  window.addEventListener("focus", onFocus);

  drawKind();
  drawFields();
  if (target.error) showConflict(target.error);
}
