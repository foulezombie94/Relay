// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import type { Attribute, CrmRecord } from "@/lib/domain/types";
import { CompanyContactSidebar } from "./company-contact-sidebar";
vi.mock("./company-logo", () => ({ CompanyLogo: () => <span>Logo</span> }));
const record: CrmRecord = {
  id: "company",
  workspace_id: "workspace",
  object_id: "companies",
  created_at: "2026-10-27",
  display_name: "GreenTech",
  email: "hello@example.com",
  domain: "example.com",
  stage: "Prospect",
  amount: 0,
  currency: "EUR",
  owner_id: null,
  attributes: {
    phone: "+33 1 23 45 67 89",
    linkedin: "https://linkedin.com/company/example",
    address: "12 rue des Fleurs\nLyon",
    employees: "25–49",
  },
  archived: false,
  version: 1,
  close_date: null,
};
const attributes: Attribute[] = ["phone", "linkedin", "address", "employees"].map((key) => ({
  id: key,
  key,
  name: key,
  type: key === "phone" ? "phone" : "text",
  workspace_id: "workspace",
  object_id: "companies",
  created_at: "2026-10-27",
  required: false,
  options: [],
  archived: false,
}));
const visibleFields = ["email", "domain", ...attributes.map((a) => "attr_" + a.key)];
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows actual contact links and opens the existing editor", () => {
  const onEdit = vi.fn();
  render(
    <CompanyContactSidebar
      record={record}
      attributes={attributes}
      visibleFields={visibleFields}
      readonly={false}
      onEdit={onEdit}
    />,
  );
  expect(screen.getByRole("link", { name: "+33 1 23 45 67 89" }).getAttribute("href")).toBe(
    "tel:+33123456789",
  );
  expect(screen.getByRole("link", { name: "LinkedIn" }).getAttribute("rel")).toBe(
    "noopener noreferrer",
  );
  expect(screen.getByText("25–49")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Modifier les coordonnées de l’entreprise" }));
  expect(onEdit).toHaveBeenCalledOnce();
});
it("respects hidden and archived attributes and read-only permissions", () => {
  render(
    <CompanyContactSidebar
      record={record}
      attributes={attributes.map((a) => ({ ...a, archived: true }))}
      visibleFields={[]}
      readonly
      onEdit={vi.fn()}
    />,
  );
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByText("25–49")).toBeNull();
  expect(screen.getByText("Les coordonnées de cette entreprise apparaîtront ici.")).toBeDefined();
});
it("does not turn unsafe or mismatched social URLs into links", () => {
  render(
    <CompanyContactSidebar
      record={{
        ...record,
        domain: "javascript:alert(1)",
        email: "bad\r\n@example.com",
        attributes: { phone: "javascript:alert(1)", linkedin: "https://evil.example/linkedin.com" },
      }}
      attributes={attributes}
      visibleFields={visibleFields}
      readonly
      onEdit={vi.fn()}
    />,
  );
  expect(screen.queryByRole("link")).toBeNull();
});
