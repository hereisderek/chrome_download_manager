import { test } from "node:test";
import assert from "node:assert/strict";
import { shellQuote } from "./shellQuote.ts";

test("wraps plain values in single quotes", () => {
  assert.equal(shellQuote("file.zip"), "'file.zip'");
});

test("neutralizes embedded single quotes", () => {
  assert.equal(shellQuote("it's a file.zip"), "'it'\\''s a file.zip'");
});

test("neutralizes shell metacharacters and command substitution", () => {
  const malicious = "$(rm -rf ~); `id`; a;b|c";
  // No single quotes in this payload, so it passes through untouched inside
  // the quoted run - and single-quoted text is never expanded by the shell.
  assert.equal(shellQuote(malicious), `'${malicious}'`);
});

test('breaks out attempt via embedded quote is fully escaped', () => {
  const attack = "'; rm -rf ~; echo '";
  const quoted = shellQuote(attack);
  assert.equal(quoted, "''\\''; rm -rf ~; echo '\\'''");
});
