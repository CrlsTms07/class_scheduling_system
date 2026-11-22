// @ts-check
/**
 * Helpers for the tests. Each one finds what it is asked for or fails with a clear message, so a
 * test reads as plain steps ("type Ben", "click Save") with no null checks in between.
 */

/**
 * The first element that matches, inside root.
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {HTMLElement}
 */
export function find(selector, root = document) {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Not found: ${selector}`);
  return element;
}

/**
 * The first input that matches, inside root.
 * @param {ParentNode} [root]
 * @param {string} [selector]
 * @returns {HTMLInputElement}
 */
export function findInput(root = document, selector = "input") {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Not found: ${selector}`);
  return element;
}

/**
 * The first element that matches and whose text is `text` (or contains it, with `partial`).
 * @param {string} selector
 * @param {string} text
 * @param {ParentNode} [root]
 * @param {{ partial?: boolean }} [options]
 * @returns {HTMLElement}
 */
export function byText(selector, text, root = document, { partial = false } = {}) {
  const match = [...root.querySelectorAll(selector)].find((element) => {
    const content = (element.textContent ?? "").trim();
    return partial ? content.includes(text) : content === text;
  });
  if (!(match instanceof HTMLElement)) throw new Error(`No ${selector} with the text "${text}"`);
  return match;
}

/**
 * The button with this text.
 * @param {string} text
 * @param {ParentNode} [root]
 * @param {{ partial?: boolean }} [options]
 */
export function button(text, root = document, options = {}) {
  return byText("button", text, root, options);
}

/** The dialog opened last. */
export function lastDialog() {
  const dialog = [...document.querySelectorAll("dialog")].at(-1);
  if (!dialog) throw new Error("No dialog is open");
  return dialog;
}

/**
 * Types into an input the way a user does: the value changes, then an input event.
 * @param {HTMLInputElement} input
 * @param {string} text
 */
export function type(input, text) {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Presses a key on an element.
 * @param {Element} element
 * @param {string} name  like "Enter" or "ArrowDown"
 */
export function key(element, name) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
}

/** The text of an element, "" when it has none. */
export function textOf(/** @type {Element} */ element) {
  return element.textContent ?? "";
}

/** Waits for the promises already started to settle. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
