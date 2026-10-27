import { expect, it } from "vitest";
import { recordHref, workspaceHref, workspaceSwitchHref } from "./workspace-navigation";

it("keeps record selectors, repeated filters and hash when qualifying a link", () => {
  const url = new URL(
    workspaceHref("/app/companies?record=r&tag=a&tag=b#notes", "space-b"),
    "https://crm.test",
  );
  expect(url.searchParams.get("workspace")).toBe("space-b");
  expect(url.searchParams.get("record")).toBe("r");
  expect(url.searchParams.getAll("tag")).toEqual(["a", "b"]);
  expect(url.hash).toBe("#notes");
});
it("replaces a previous workspace without adding ambiguous duplicate parameters", () => {
  const url = new URL(
    workspaceHref("/app/people?workspace=a&workspace=c", "b"),
    "https://crm.test",
  );
  expect(url.searchParams.getAll("workspace")).toEqual(["b"]);
});
it.each(["https://evil.test/app", "//evil.test/app", "/application", "/login"])(
  "refuses a non-application destination: %s",
  (path) => {
    expect(() => workspaceHref(path, "b")).toThrow();
  },
);
it("does not carry an old resource selector into a new workspace", () => {
  expect(workspaceSwitchHref("/app/companies", "#notes", "b")).toBe(
    "/app/companies?workspace=b#notes",
  );
  expect(workspaceSwitchHref("/app/list-abc", "", "b")).toBe("/app/dashboard?workspace=b");
  expect(workspaceSwitchHref("/app/object-custom", "", "b")).toBe("/app/dashboard?workspace=b");
});
it.each([
  { standard: true, slug: "companies" },
  { standard: false, slug: "projects" },
])("builds a deep link with both record and workspace: %o", (object) => {
  const url = new URL(recordHref("space-b", object, "record-b"), "https://crm.test");
  expect(url.pathname).toBe(object.standard ? "/app/companies" : "/app/object-projects");
  expect(url.searchParams.get("record")).toBe("record-b");
  expect(url.searchParams.get("workspace")).toBe("space-b");
});
