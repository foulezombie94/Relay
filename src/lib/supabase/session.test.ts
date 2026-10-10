import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthApiError,
  AuthRetryableFetchError,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  assertAuthAvailable,
  authEmail,
  authFailureMessage,
  AuthUnavailableError,
  loginDestination,
  observeSession,
  sessionCookieOptions,
} from "./session";

afterEach(() => vi.unstubAllEnvs());

describe("authentication form validation and errors", () => {
  it.each([undefined, null, "", "   ", "invalid"])("rejects invalid email %s", (email) => {
    expect(() => authEmail(email)).toThrow("Adresse email requise ou invalide");
  });
  it("normalizes the submitted email", () => {
    expect(authEmail("  alice@example.test  ")).toBe("alice@example.test");
  });
  it.each([
    new TypeError("ECONNRESET secret"),
    new AuthRetryableFetchError("fetch failed secret", 502),
    { name: "TimeoutError" },
    { status: 503, message: "private upstream detail" },
  ])("hides network and upstream details", (error) => {
    expect(authFailureMessage(error)).toBe(
      "Connexion interrompue. Vérifiez votre connexion puis réessayez.",
    );
  });
  it("offers actionable application errors without exposing internal messages", () => {
    expect(authFailureMessage({ code: "invalid_credentials" })).toContain("incorrect");
    expect(authFailureMessage({ status: 429 })).toContain("Patientez");
    expect(authFailureMessage(new Error("private detail"))).not.toContain("private");
  });
});

describe("persistent session security", () => {
  it("uses HTTPS-only, host-only SameSite cookies in production without extending token validity", () => {
    vi.stubEnv("NODE_ENV", "production");
    const options = sessionCookieOptions();
    expect(options).toMatchObject({ path: "/", secure: true, sameSite: "lax", priority: "high" });
    expect(options).not.toHaveProperty("domain");
    expect(options).not.toHaveProperty("maxAge");
    expect(options).not.toHaveProperty("httpOnly"); // The SSR SDK also refreshes in the browser.
  });

  it("allows local HTTP development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it.each([0, 429, 500, 503])(
    "does not misclassify a temporary auth HTTP %i error as logout",
    (status) => {
      expect(() =>
        assertAuthAvailable(new AuthApiError("private upstream details", status, "fixture")),
      ).toThrow(AuthUnavailableError);
    },
  );

  it("sanitizes network errors without treating missing or revoked sessions as temporary", () => {
    expect(() =>
      assertAuthAvailable(new AuthRetryableFetchError("secret upstream details", 502)),
    ).toThrow("temporairement indisponible");
    expect(() =>
      assertAuthAvailable(new AuthApiError("invalid session", 401, "session_not_found")),
    ).not.toThrow();
    expect(() => assertAuthAvailable(null)).not.toThrow();
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/app/dashboard?redirect=https://evil.example",
    null,
  ])("rejects untrusted redirect destinations: %s", (next) => {
    expect(loginDestination(next)).toBe("/app/dashboard");
  });
  it("preserves the invitation flow", () => expect(loginDestination("/invite")).toBe("/invite"));
});

describe("browser session and private cache lifecycle", () => {
  function fixture() {
    let callback!: (event: AuthChangeEvent, session: Session | null) => void;
    const unsubscribe = vi.fn();
    const auth = {
      onAuthStateChange: vi.fn((fn) => {
        callback = fn;
        return { data: { subscription: { unsubscribe } } };
      }),
    } as unknown as Pick<SupabaseClient["auth"], "onAuthStateChange">;
    const clear = vi.fn(),
      signOut = vi.fn(),
      switchAccount = vi.fn();
    const dispose = observeSession(auth, "user-a", clear, signOut, switchAccount);
    const session = (id: string) => ({ user: { id } }) as Session;
    return {
      emit: (event: AuthChangeEvent, id: string | null) => callback(event, id ? session(id) : null),
      clear,
      signOut,
      switchAccount,
      dispose,
      unsubscribe,
    };
  }

  it("keeps the CRM open through normal refresh and a temporary null initial session", () => {
    const f = fixture();
    f.emit("INITIAL_SESSION", null);
    f.emit("INITIAL_SESSION", "user-a");
    f.emit("TOKEN_REFRESHED", "user-a");
    f.emit("SIGNED_IN", "user-a");
    expect(f.clear).not.toHaveBeenCalled();
    expect(f.signOut).not.toHaveBeenCalled();
    expect(f.switchAccount).not.toHaveBeenCalled();
  });

  it("clears CRM data before redirecting after logout, including logout from another tab", () => {
    const f = fixture();
    f.emit("SIGNED_OUT", null);
    f.emit("SIGNED_OUT", null);
    expect(f.clear).toHaveBeenCalledTimes(1);
    expect(f.signOut).toHaveBeenCalledTimes(1);
    expect(f.clear.mock.invocationCallOrder[0]).toBeLessThan(f.signOut.mock.invocationCallOrder[0]);
    expect(f.switchAccount).not.toHaveBeenCalled();
  });

  it("never reuses user A's cache when user B signs in on another tab", () => {
    const f = fixture();
    f.emit("SIGNED_IN", "user-b");
    f.emit("TOKEN_REFRESHED", "user-b");
    expect(f.clear).toHaveBeenCalledTimes(1);
    expect(f.switchAccount).toHaveBeenCalledTimes(1);
    expect(f.clear.mock.invocationCallOrder[0]).toBeLessThan(
      f.switchAccount.mock.invocationCallOrder[0],
    );
    expect(f.signOut).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", () => {
    const f = fixture();
    f.dispose();
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
