export function localTestDatabaseUrl(value = process.env.RELAY_TEST_DATABASE_URL) {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error("Set RELAY_TEST_DATABASE_URL to a disposable local test database.");
  }
  // libpq accepts query-string connection overrides; reject them before connecting.
  if (
    !value ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.search ||
    url.hash ||
    !/^\/relay_test(?:_[a-z0-9_]+)?$/.test(url.pathname)
  )
    throw new Error("SQL tests require a local relay_test* database with no connection overrides.");
  return value;
}
