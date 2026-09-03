// Plain assertion checks for src/lib/validation/identity.ts — the project
// has no test runner, so this runs standalone:
//   npm run test:validation
// (which is `node --experimental-strip-types` so the .ts can be imported
// directly). Every example here is taken straight from the enhancement spec.

import assert from "node:assert/strict";
import {
  normalizeEmail,
  isValidEmail,
  normalizePhone,
  isValidLocalPhone,
} from "../src/lib/validation/identity.ts";

// ── email: valid ──
for (const e of [
  "user@gmail.com",
  "john.doe@gmail.com",
  "hello@example.com",
  "user@example.org",
  "student@university.edu",
  "name@company.com.np",
  "player@futsal.net",
  "someone@school.np",
]) assert.equal(isValidEmail(e), true, `expected valid: ${e}`);

// ── email: invalid ──
for (const e of [
  "user",
  "user@",
  "@gmail.com",
  "user@gmail",
  "user @gmail.com",
  "user@gmail..com",
  "",
  "   ",
]) assert.equal(isValidEmail(e), false, `expected invalid: ${e}`);

// ── email: normalization ──
assert.equal(normalizeEmail("  John.Doe@GMAIL.COM "), "john.doe@gmail.com");
assert.equal(
  normalizeEmail("John.Doe@GMAIL.COM"),
  normalizeEmail("john.doe@gmail.com"),
);

// ── phone: valid ──
for (const p of ["9812345678", "9801234567", "9761234567"])
  assert.equal(isValidLocalPhone(p), true, `expected valid: ${p}`);

// ── phone: invalid ──
for (const p of [
  "981234567",
  "98123456789",
  "98-12345678",
  "+9779812345678",
  "98123 45678",
  "abcdefghij",
  "",
]) assert.equal(isValidLocalPhone(p), false, `expected invalid: ${p}`);

assert.equal(normalizePhone("98-1234 5678"), "9812345678");

console.log("identity validation: all checks passed");
