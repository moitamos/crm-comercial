import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(
  path.join(root, "src/app/api/invoices/[id]/document/route.ts"), "utf8",
);
const matched = route.match(/^const UUID = (\/.*\/i);$/m);
assert.ok(matched, "Missing invoice document UUID validator");
const validate = vm.runInNewContext(matched[1]);

test("document route accepts a standard five-group UUID", () => {
  assert.equal(route.includes("if (!UUID.test(id))"), true);
  assert.equal(validate.test("123e4567-e89b-42d3-a456-426614174000"), true);
  assert.equal(validate.test("123E4567-E89B-42D3-A456-426614174000"), true);
});

test("document route rejects malformed UUID values", () => {
  assert.equal(validate.test("123e4567-e89b-42d3-426614174000"), false);
  assert.equal(validate.test("123e4567-e89b-42d3-a456-42661417400z"), false);
  assert.equal(validate.test("not-an-id"), false);
  assert.equal(validate.test("123e4567-e89b-42d3-a456-426614174000/extra"), false);
});
