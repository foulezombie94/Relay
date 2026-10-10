export const supabaseFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    signal: AbortSignal.any([AbortSignal.timeout(25000), ...(init?.signal ? [init.signal] : [])]),
  });
