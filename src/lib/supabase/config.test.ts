import { describe, expect, it } from "vitest";
import { supabaseConfig } from "./config";
import { localTestDatabaseUrl } from "../../../scripts/tests/database-target";
const production = {
  NEXT_PUBLIC_RELAY_ENVIRONMENT: "production",
  NEXT_PUBLIC_SUPABASE_PROJECT_REF: "prod",
  NEXT_PUBLIC_RELAY_PRODUCTION_PROJECT_REF: "prod",
  NEXT_PUBLIC_SUPABASE_URL: "https://prod.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
};
describe("test/production isolation", () => {
  it("allows explicitly bound production and isolated preview projects", () => {
    expect(supabaseConfig(production).environment).toBe("production");
    expect(
      supabaseConfig({
        ...production,
        NEXT_PUBLIC_RELAY_ENVIRONMENT: "preview",
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_PROJECT_REF: "test",
        NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      }).projectRef,
    ).toBe("test");
  });
  it.each(["development", "test", "preview"])(
    "prevents %s from touching production",
    (environment) => {
      expect(() =>
        supabaseConfig({ ...production, NEXT_PUBLIC_RELAY_ENVIRONMENT: environment }),
      ).toThrow("separate");
    },
  );
  it.each([
    { NEXT_PUBLIC_SUPABASE_URL: undefined },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined },
    { NEXT_PUBLIC_RELAY_ENVIRONMENT: undefined },
    { NEXT_PUBLIC_SUPABASE_PROJECT_REF: "test" },
    { NEXT_PUBLIC_RELAY_PRODUCTION_PROJECT_REF: undefined },
    { VERCEL_ENV: "preview" },
    { NODE_ENV: "development" },
    { NODE_ENV: "test" },
    { NEXT_PUBLIC_SUPABASE_URL: "http://prod.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://prod.supabase.co/other" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://prod.supabase.co?override=1" },
    { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_do_not_expose" },
  ])("fails closed on configuration mismatch %s", (override) => {
    expect(() => supabaseConfig({ ...production, ...override })).toThrow();
  });
  it("rejects privileged legacy JWT keys", () => {
    const key = `header.${btoa(JSON.stringify({ role: "service_role", ref: "prod" }))}.signature`;
    expect(() =>
      supabaseConfig({ ...production, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }),
    ).toThrow("browser key");
  });
  it("allows a local disposable development Supabase", () => {
    expect(
      supabaseConfig({
        NEXT_PUBLIC_RELAY_ENVIRONMENT: "development",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
      }).url,
    ).toContain("127.0.0.1");
  });
  it.each([
    undefined,
    "postgresql://user:pass@db.prod.supabase.co:5432/relay_test",
    "postgresql://user:pass@localhost:5432/postgres",
    "postgresql://user:pass@localhost:5432/relay_test?host=db.prod.supabase.co",
    "postgresql://user:pass@localhost:5432/relay_test#host=prod",
    "https://localhost/relay_test",
  ])("refuses unsafe SQL test destinations without echoing credentials", (url) => {
    expect(() => localTestDatabaseUrl(url)).toThrow(/local|disposable/);
  });
  it("allows only disposable local SQL databases", () => {
    const url = "postgresql://tester:fixture@127.0.0.1:5432/relay_test_audit";
    expect(localTestDatabaseUrl(url)).toBe(url);
  });
});
