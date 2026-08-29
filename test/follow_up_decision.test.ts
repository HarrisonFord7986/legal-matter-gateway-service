import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
const { decideFollowUp, server } = await import("../src/matter_intake");

after(() => server.close());

test("a filing due inside 72 hours is marked urgent", () => {
  const now = new Date("2026-08-16T09:00:00.000Z");
  const dueAt = "2026-08-18T08:59:00.000Z";
  assert.equal(decideFollowUp(dueAt, now), "urgent");
});

test("a later filing stays scheduled", () => {
  const now = new Date("2026-08-16T09:00:00.000Z");
  const dueAt = "2026-08-21T09:00:00.000Z";
  assert.equal(decideFollowUp(dueAt, now), "scheduled");
});
