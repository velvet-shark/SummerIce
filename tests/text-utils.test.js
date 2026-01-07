import { describe, expect, it } from "vitest";
import { CONFIG } from "../constants.js";
import { getTextLength, isContentTooShort } from "../modules/text-utils.js";

describe("text utils", () => {
  it("returns 0 length for non-string input", () => {
    expect(getTextLength(null)).toBe(0);
    expect(getTextLength(undefined)).toBe(0);
    expect(getTextLength(123)).toBe(0);
  });

  it("flags content shorter than the minimum", () => {
    const shortText = "x".repeat(CONFIG.MIN_CONTENT_LENGTH - 1);
    const longText = "x".repeat(CONFIG.MIN_CONTENT_LENGTH);

    expect(isContentTooShort(shortText)).toBe(true);
    expect(isContentTooShort(longText)).toBe(false);
  });
});
