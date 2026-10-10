// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertReplayedValues, creationAttempt } from "./save-attempt";
vi.stubGlobal("crypto", webcrypto);
afterEach(() => sessionStorage.clear());
describe("safe creation retries", () => {
  it("keeps a stable attempt across retry, but separates users and changed payloads", async () => {
    const a = await creationAttempt("user-a:workspace", "records", {
      name: "Alice",
      email: "a@example.test",
    });
    expect(
      (
        await creationAttempt("user-a:workspace", "records", {
          email: "a@example.test",
          name: "Alice",
        })
      ).id,
    ).toBe(a.id);
    expect(
      (
        await creationAttempt("user-b:workspace", "records", {
          name: "Alice",
          email: "a@example.test",
        })
      ).id,
    ).not.toBe(a.id);
    expect((await creationAttempt("user-a:workspace", "records", { name: "Bob" })).id).not.toBe(
      a.id,
    );
    expect(Object.keys(sessionStorage).join(" ")).not.toContain("Alice");
    a.confirm();
    expect(
      (
        await creationAttempt("user-a:workspace", "records", {
          name: "Alice",
          email: "a@example.test",
        })
      ).id,
    ).not.toBe(a.id);
  });
  it("checks replayed values, including timestamps serialized by PostgreSQL", () => {
    expect(() =>
      assertReplayedValues(
        { due_date: "2026-10-10T12:00:00+00:00", attributes: { b: 2, a: 1 } },
        { due_date: "2026-10-10T12:00:00Z", attributes: { a: 1, b: 2 } },
      ),
    ).not.toThrow();
    expect(() => assertReplayedValues({ name: "Bob" }, { name: "Alice" })).toThrow("différentes");
  });
});
