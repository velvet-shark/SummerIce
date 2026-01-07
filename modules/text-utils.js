import { CONFIG } from "../constants.js";

export const getTextLength = (text) =>
  typeof text === "string" ? text.length : 0;

export const isContentTooShort = (
  text,
  minLength = CONFIG.MIN_CONTENT_LENGTH,
) => getTextLength(text) < minLength;
