// @ts-check
import { describe, expect, it, vi } from "vitest";
import { searchableSelect } from "./searchable-select.js";
import { timePicker } from "./time-picker.js";
import { confirmAction, openDialog } from "./dialog.js";
import { toast } from "./toast.js";
import { openListEditor } from "./list-editor.js";
import { noMatches } from "./page-header.js";
import { openFormDialog } from "./form-dialog.js";
import { ApiError } from "@/api/client.js";
import { button, byText, find, findInput, key, lastDialog, settle, textOf, type } from "@/test-helpers.js";

// jsdom has no <dialog> methods; these stand in for the browser's.
HTMLDialogElement.prototype.showModal = function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close = function close() {
  this.open = false;
  this.dispatchEvent(new Event("close"));
};

describe("searchable select (UI requirement 3)", () => {
  const options = [
    { value: 1, label: "Ana Reyes", hint: "Math" },
    { value: 2, label: "Ben Cruz", hint: "Science" },
    { value: 3, label: "Carla Lim", hint: "English" },
  ];

  /** A select on the page, opened, with its search box. */
  const openSelect = (/** @type {Parameters<typeof searchableSelect>[0]} */ props) => {
    const select = searchableSelect(props);
    document.body.append(select);
    find("button", select).click();
    return { select, search: findInput(select) };
  };

  it("filters as the user types, and says when nothing matches", () => {
    const { select, search } = openSelect({ label: "Teacher", options });

    type(search, "ben");
    expect([...select.querySelectorAll("[role=option]")].map(textOf)).toEqual(["Ben CruzScience"]);

    type(search, "science");
    expect(select.querySelectorAll("[role=option]")).toHaveLength(1);

    type(search, "zzz");
    expect(select.textContent).toContain("No results");
  });

  it("chooses with the keyboard", () => {
    const onChange = vi.fn();
    const { select, search } = openSelect({ label: "Teacher", options, onChange });

    key(search, "ArrowDown");
    key(search, "Enter");

    expect(onChange).toHaveBeenCalledWith(2, options[1]);
    expect(select.getValue()).toBe(2);
    expect(find("button", select).textContent).toContain("Ben Cruz");
  });

  it("offers to add what was typed, for a new teacher", async () => {
    const run = vi.fn();
    const { select, search } = openSelect({ label: "Teacher", options, create: { label: (typed) => `Add new teacher "${typed}"`, run } });
    type(search, "Dina Santos");

    const add = byText("[role=option]", "Add new teacher", select, { partial: true });
    expect(add.textContent).toContain('Add new teacher "Dina Santos"');
    add.click();
    await Promise.resolve();
    expect(run).toHaveBeenCalledWith("Dina Santos");
  });

  it("is labelled for screen readers", () => {
    const select = searchableSelect({ label: "Room", options });
    document.body.append(select);
    const label = /** @type {HTMLLabelElement} */ (find("label", select));
    expect(label.textContent).toBe("Room");
    expect(document.getElementById(label.htmlFor)).toBe(find("button", select));
  });
});

describe("12-hour time picker (UI requirement 5): chosen, never typed", () => {
  /**
   * Opens one of the picker's lists and picks an option.
   * @param {HTMLElement} picker
   * @param {string} label  "Hour" or "Minutes"
   * @param {string} option
   */
  const pick = (picker, label, option) => {
    const field = /** @type {HTMLElement} */ (byText("label", label, picker).parentElement);
    find("button", field).click();
    byText("[role=option]", option, field).click();
  };

  it("gives 24-hour time to the API from the chosen hour, minutes and PM", () => {
    const onChange = vi.fn();
    const picker = timePicker({ label: "Start time", onChange });
    document.body.append(picker);
    pick(picker, "Hour", "1");
    pick(picker, "Minutes", "30");
    button("PM", picker).click();

    expect(picker.getValue()).toBe("13:30");
    expect(onChange).toHaveBeenLastCalledWith("13:30");
    expect(picker.querySelector("input[type=text], input:not([type])")).toBeNull();
  });

  it("shows a 24-hour value as 12-hour, keeping an odd minute", () => {
    const picker = timePicker({ label: "End time", value: "14:07" });
    expect(picker.textContent).toContain("2");
    expect(picker.textContent).toContain("07");
    expect(button("PM", picker).getAttribute("aria-pressed")).toBe("true");
    expect(picker.getValue()).toBe("14:07");
  });

  it("says what is missing when only the hour is chosen", () => {
    const picker = timePicker({ label: "Start time" });
    document.body.append(picker);
    pick(picker, "Hour", "7");

    expect(picker.getValue()).toBeNull();
    expect(picker.validate()).toBe(false);
    expect(picker.textContent).toContain("Choose the minutes too.");
  });
});

describe("centered dialog (UI requirement 2) and confirmations", () => {
  it("opens with a title and closes with its button", () => {
    const onClose = vi.fn();
    const { element } = openDialog({ title: "Add class", body: "Fields", onClose });

    expect(element.open).toBe(true);
    expect(find("h2", element).textContent).toBe("Add class");
    button("Close", element, { partial: true }).click();
    expect(onClose).toHaveBeenCalled();
    expect(document.body.contains(element)).toBe(false);
  });

  it("asks before something that cannot be undone", async () => {
    const answer = confirmAction({ title: "Clear this schedule?", message: "This removes all 12 classes.", confirmLabel: "Yes, clear it" });
    const dialog = lastDialog();
    expect(dialog.textContent).toContain("This removes all 12 classes.");
    button("Yes, clear it", dialog).click();

    await expect(answer).resolves.toBe(true);
  });

  it("resolves false on Cancel", async () => {
    const answer = confirmAction({ title: "Remove?", message: "Gone.", confirmLabel: "Remove" });
    button("Cancel", lastDialog()).click();
    await expect(answer).resolves.toBe(false);
  });
});

describe("pop-up notifications (UI requirement 4)", () => {
  it("shows success and the API's own error message", () => {
    toast.success("Math 7 was added.");
    toast.error(new ApiError(422, "Ana Reyes is teaching Grade 7 – Hope on Monday at 7:00 AM."));

    const area = find("#toasts");
    expect(find("[role=status]", area).textContent).toContain("Math 7 was added.");
    expect(find("[role=alert]", area).textContent).toContain("Ana Reyes is teaching");
    // Each says plainly how it went; the newest is on top.
    expect(area.firstElementChild?.textContent).toContain("Failed");
    expect(find("[role=status]", area).textContent).toContain("Success");
  });

  it("keeps a message shown inside a dialog on screen when the dialog closes", () => {
    const { element, close } = openDialog({ title: "Add class", body: "Fields" });
    // In a browser, a message shown while a dialog is open goes inside it (outside is inert).
    element.append(find("#toasts"));
    toast.success("Values Education was added.");
    close();

    const area = find("#toasts");
    expect(area.parentElement).toBe(document.body);
    expect(area.textContent).toContain("Values Education was added.");
  });
});

describe("list editor (tracks, departments, designations, tasks)", () => {
  it("lists the names, adds one and deletes one after confirming", async () => {
    let items = [{ id: 1, name: "Academic" }];
    const add = vi.fn(async (/** @type {string} */ name) => { items = [...items, { id: 2, name }]; });
    const remove = vi.fn(async (/** @type {{ id: number }} */ item) => { items = items.filter((other) => other.id !== item.id); });
    openListEditor({ title: "Tracks", load: async () => [{ label: "Tracks", noun: "track", items, add, remove }] });
    await settle();
    const dialog = lastDialog();
    expect(dialog.textContent).toContain("Academic");

    findInput(dialog).value = "TechPro";
    find("form", dialog).dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();
    await settle();
    expect(add).toHaveBeenCalledWith("TechPro");
    expect(dialog.textContent).toContain("TechPro");

    find('[aria-label="Delete Academic"]', dialog).click();
    await settle();
    button("Delete", lastDialog()).click();
    await settle();
    await settle();
    expect(remove).toHaveBeenCalledWith({ id: 1, name: "Academic" });
    expect(dialog.textContent).not.toContain("Academic");
  });

  it("hides Delete when the user may not delete, and says who can", async () => {
    openListEditor({ title: "Tracks", load: async () => [{ label: "Tracks", noun: "track", items: [{ id: 1, name: "Academic" }], add: async () => {}, note: "Only the Admin can delete a track." }] });
    await settle();
    const dialog = lastDialog();
    expect(dialog.querySelector('[aria-label="Delete Academic"]')).toBeNull();
    expect(dialog.textContent).toContain("Only the Admin can delete a track.");
  });
});

describe("list editor checks names while typing", () => {
  it("refuses letters typed at random, says why, and does not call the server", async () => {
    const add = vi.fn(async () => {});
    openListEditor({ title: "Lists", load: async () => [{ label: "Departments", noun: "department", items: [], add }] });
    await settle();
    const dialog = lastDialog();
    type(findInput(dialog), "vffxfszv");
    expect(find("[role=alert]", dialog).textContent).toContain("no vowel");
    find("form", dialog).dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();
    expect(add).not.toHaveBeenCalled();
  });

  it("does not close on Done while a typed name was not added", async () => {
    openListEditor({ title: "Lists", load: async () => [{ label: "Departments", noun: "department", items: [], add: async () => {} }] });
    await settle();
    const dialog = lastDialog();
    findInput(dialog).value = "Science";
    button("Done", dialog).click();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('"Science" was not added yet');
  });
});

describe("a filtered list with nothing in it says why", () => {
  it("names the search and the filters, and clears them", () => {
    const onClear = vi.fn();
    const box = noMatches({ noun: "teacher", search: "dito", filters: ["Senior High", null, "Inactive"], onClear });
    expect(box.textContent).toContain('No teacher matches the search "dito" with the filters Senior High, Inactive.');
    expect(box.textContent).toContain("only looks inside the filters");
    button("Clear", box, { partial: true }).click();
    expect(onClear).toHaveBeenCalled();
  });
});

describe("forms check each field while it is filled in", () => {
  it("shows a field's problem as soon as it is typed, before Save", () => {
    const onSubmit = vi.fn(async () => "Saved.");
    openFormDialog({
      title: "Add a room",
      fields: [{ name: "capacity", label: "Seats", type: "number", check: (value) => (value !== null && value > 60 ? "A room holds at most 60 seats." : null) }],
      submitLabel: "Add room",
      onSubmit,
    });
    const dialog = lastDialog();
    const input = findInput(dialog);
    type(input, "80");
    expect(dialog.textContent).toContain("A room holds at most 60 seats.");
    expect(onSubmit).not.toHaveBeenCalled();

    type(input, "40");
    expect(dialog.textContent).not.toContain("A room holds at most 60 seats.");
  });

  it("asks for a field only when another one needs it (a Senior High section's strand), with no (optional) mark", async () => {
    const onSubmit = vi.fn(async () => "Saved.");
    openFormDialog({
      title: "Add a section",
      fields: [
        { name: "level", label: "Level" },
        { name: "strand", label: "Strand", requiredWhen: (values) => values.level === "SHS" },
      ],
      submitLabel: "Add section",
      onSubmit,
    });
    const dialog = lastDialog();
    const [level, strand] = /** @type {HTMLInputElement[]} */ ([...dialog.querySelectorAll("input")]);
    expect(find(`label[for="${strand.id}"]`, dialog).textContent).toBe("Strand");
    type(level, "SHS");
    button("Add section", dialog).click();
    await Promise.resolve();
    expect(dialog.textContent).toContain("Strand is required");
    expect(onSubmit).not.toHaveBeenCalled();

    type(level, "JHS");
    expect(dialog.textContent).not.toContain("Strand is required");
  });
});
