type ConfigEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_RELAY_ENVIRONMENT?: string;
  NEXT_PUBLIC_SUPABASE_PROJECT_REF?: string;
  NEXT_PUBLIC_RELAY_PRODUCTION_PROJECT_REF?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
};

export function supabaseConfig(env: ConfigEnvironment, requireKey = true) {
  const environment = env.NEXT_PUBLIC_RELAY_ENVIRONMENT;
  if (!environment || !["development", "test", "preview", "production"].includes(environment))
    throw new Error(
      "NEXT_PUBLIC_RELAY_ENVIRONMENT must explicitly identify development, test, preview or production.",
    );
  if (env.VERCEL_ENV && env.VERCEL_ENV !== environment)
    throw new Error("The declared Zyliad environment does not match VERCEL_ENV.");
  if (environment === "production" && env.NODE_ENV && env.NODE_ENV !== "production")
    throw new Error("Development and test processes cannot connect to production Supabase.");
  let url: URL;
  try {
    url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing or invalid.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname))
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be an API origin without credentials or a path.",
    );
  const projectRef = env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;
  const productionRef = env.NEXT_PUBLIC_RELAY_PRODUCTION_PROJECT_REF;
  if (local) {
    if (environment === "production" || !["http:", "https:"].includes(url.protocol))
      throw new Error("Production cannot use a local Supabase endpoint.");
  } else {
    if (
      !projectRef ||
      !productionRef ||
      url.protocol !== "https:" ||
      url.hostname !== `${projectRef}.supabase.co` ||
      url.port
    )
      throw new Error(
        "Remote Supabase requires HTTPS and explicit project and production references.",
      );
    if ((environment === "production") !== (projectRef === productionRef))
      throw new Error("Test/preview and production must use separate Supabase projects.");
  }
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (requireKey && !key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.");
  if (key && !key.startsWith("sb_publishable_")) {
    try {
      const claims = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (claims.role !== "anon" || (claims.ref && claims.ref !== projectRef)) throw new Error();
    } catch {
      throw new Error(
        "The browser key must be a publishable key or an anon key for the selected project.",
      );
    }
  }
  return { url: url.origin, key: key ?? "", environment, projectRef: projectRef ?? url.host };
}

export function getSupabaseConfig(requireKey = true) {
  // Next.js inlines these explicit public accesses at build time.
  return supabaseConfig(
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_RELAY_ENVIRONMENT: process.env.NEXT_PUBLIC_RELAY_ENVIRONMENT,
      NEXT_PUBLIC_SUPABASE_PROJECT_REF: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
      NEXT_PUBLIC_RELAY_PRODUCTION_PROJECT_REF:
        process.env.NEXT_PUBLIC_RELAY_PRODUCTION_PROJECT_REF,
      VERCEL_ENV: typeof window === "undefined" ? process.env.VERCEL_ENV : undefined,
      NODE_ENV: process.env.NODE_ENV,
    },
    requireKey,
  );
}
