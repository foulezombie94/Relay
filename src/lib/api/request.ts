export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

const interrupted = "Connexion interrompue. Vérifiez votre connexion puis réessayez.";
const uncertain = " L’enregistrement n’est pas confirmé. Votre saisie est conservée.";

export async function request<T = Record<string, unknown>>(
  url: string,
  method = "GET",
  body?: unknown,
  options: { timeoutMs?: number; idempotencyKey?: string } = {},
): Promise<T> {
  const writing = !["GET", "HEAD"].includes(method.toUpperCase());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
  try {
    const headers = new Headers();
    const multipart = typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !multipart) headers.set("Content-Type", "application/json");
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
    const response = await fetch(url, {
      method,
      headers,
      body: multipart ? body : body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new RequestError(
        (response.ok
          ? "Réponse du serveur invalide."
          : "Le serveur est temporairement indisponible.") + (writing ? uncertain : " Réessayez."),
        response.ok ? 502 : response.status,
      );
    }
    if (!response.ok) {
      const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
      // Only structured application errors may reach the UI; never raw upstream 5xx details.
      const message =
        response.status >= 500
          ? "Le serveur est temporairement indisponible." + (writing ? uncertain : " Réessayez.")
          : typeof payload.error === "string"
            ? payload.error
            : "Action impossible. Réessayez.";
      throw new RequestError(
        message,
        response.status,
        typeof payload.requestId === "string" ? payload.requestId : undefined,
      );
    }
    if (data === null || typeof data !== "object")
      throw new RequestError("Réponse du serveur invalide." + (writing ? uncertain : ""), 502);
    return data as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      (controller.signal.aborted
        ? "Le serveur met trop de temps à répondre. Réessayez."
        : interrupted) + (writing ? uncertain : ""),
      controller.signal.aborted ? 504 : 0,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function confirmedRow<T extends { id: string }>(
  data: T | null | undefined,
  expectedId?: string,
): T {
  if (!data || typeof data.id !== "string" || !data.id || (expectedId && data.id !== expectedId))
    throw new RequestError(
      "Aucune ligne enregistrée n’a été confirmée. Votre saisie est conservée.",
      502,
    );
  return data;
}
export function confirmedRows<T>(result: { data: T[]; count: number }) {
  if (!result || !Array.isArray(result.data))
    throw new RequestError("Le chargement des données n’a pas été confirmé. Réessayez.", 502);
  return result;
}
