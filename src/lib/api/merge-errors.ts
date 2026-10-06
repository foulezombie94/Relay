import "server-only";
import { ApiError } from "./context";
export function mergeError(error: { code?: string; message: string } | null) {
  if (!error) return;
  const status =
    error.code === "42501"
      ? 403
      : ["40001", "40P01"].includes(error.code ?? "")
        ? 409
        : 400;
  throw new ApiError(
    ["22023", "23514", "40001", "42501"].includes(error.code ?? "")
      ? error.message
      : error.code === "40P01"
        ? "Une autre opération est en cours. Actualisez puis réessayez."
        : "Cette opération n’a pas pu être enregistrée.",
    status,
  );
}
