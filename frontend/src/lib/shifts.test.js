// @ts-check
import { describe, expect, it } from "vitest";
import { shiftHoursProblem, shiftHoursText } from "./shifts.js";

describe("Junior High shift hours (Nov 22, 2026)", () => {
  const morning = { from: null, to: "12:30", name: "morning" };
  const afternoon = { from: "12:20", to: "18:30", name: "afternoon" };

  it("says, in the server's words, when a row runs past the shift", () => {
    expect(shiftHoursProblem(morning, "11:45", "12:30")).toBeNull();
    expect(shiftHoursProblem(morning, "11:45", "12:45")).toBe("The morning shift ends at 12:30 PM, so a row cannot end at 12:45 PM.");
    expect(shiftHoursProblem(afternoon, "12:00", "12:40")).toBe("The afternoon shift starts at 12:20 PM, so a row cannot start at 12:00 PM.");
    expect(shiftHoursProblem(null, "05:00", "23:00")).toBeNull();
  });

  it("names the hours for the page", () => {
    expect(shiftHoursText(morning)).toBe("Morning shift: until 12:30 PM");
    expect(shiftHoursText(afternoon)).toBe("Afternoon shift: 12:20 PM – 6:30 PM");
    expect(shiftHoursText(null)).toBeNull();
  });
});
