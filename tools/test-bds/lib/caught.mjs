// Which [Scripting] WARN lines report a caught error (counted by run.mjs, and failing a --strict run).
// A pack's catch usually logs the error as it is: `[elite] InvalidEntityError: Failed to call function 'hasTag' ...`
// or `[x] TypeError: ...`, where the class name has no word boundary before "Error", so a plain \berror\b misses it.

/** @param {string} text a log line's text after the level, e.g. "[Scripting] [elite] InvalidEntityError: ..." */
export function isCaughtErrorWarning(text) {
  return text.startsWith("[Scripting]") && (/\b(error|exception)\b/i.test(text) || /[A-Za-z](?:Error|Exception)\b/.test(text));
}
