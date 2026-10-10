import { z } from "zod";

const providerError = z.object({
  error: z.object({
    code: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
    details: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});

export function providerFailure(status: number, payload: unknown, apiName: string) {
  const parsed = providerError.safeParse(payload);
  const error = parsed.success ? parsed.data.error : undefined;
  const reasons = new Set(
    [
      error?.code,
      error?.status,
      ...(error?.errors ?? []).map((item) => item.reason),
      ...(error?.details ?? []).map((item) => item.reason),
    ]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase().replace(/[_-]/g, "")),
  );
  const has = (...values: string[]) => values.some((value) => reasons.has(value));

  if (status === 403 && has("servicedisabled", "accessnotconfigured")) {
    return {
      status: 503,
      message: `L’API ${apiName} n’est pas activée dans le projet du fournisseur. Votre administrateur doit l’activer, puis relancer la synchronisation. Il n’est pas nécessaire de reconnecter votre compte.`,
    };
  }
  if (
    status === 429 ||
    (status === 403 &&
      has(
        "ratelimitexceeded",
        "userratelimitexceeded",
        "dailylimitexceeded",
        "quotaexceeded",
        "resourceexhausted",
      ))
  ) {
    return {
      status: 429,
      message: "Limite du fournisseur atteinte. Réessayez plus tard.",
    };
  }
  if (
    status === 401 ||
    (status === 403 &&
      has(
        "insufficientpermissions",
        "accesstokenscopeinsufficient",
        "erroraccessdenied",
        "authorizationrequestdenied",
      ))
  ) {
    return {
      status: 409,
      message:
        "L’autorisation a expiré ou les permissions sont insuffisantes. Reconnectez le service et autorisez les accès demandés.",
    };
  }
  if (status === 403 && has("domainpolicy")) {
    return {
      status: 403,
      message:
        "L’administrateur de votre organisation bloque l’accès à ce service. Contactez-le pour autoriser Zyliad.",
    };
  }
  if (status === 403) {
    return {
      status: 403,
      message:
        "Le fournisseur refuse l’accès à ce service. Vérifiez les permissions du compte et la configuration du projet.",
    };
  }
  return {
    status: 502,
    message: "Le fournisseur n’a pas pu terminer l’opération. Réessayez plus tard.",
  };
}
