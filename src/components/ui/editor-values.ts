import { z } from "zod";
import type { Field } from "../ui";

export function editorValues(form: FormData, fields: Field[]) {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = String(form.get(field.key) ?? "");
    const value = ["textarea", "json", "custom"].includes(field.type ?? "") ? raw : raw.trim();
    if (field.required && field.type !== "checkbox" && !value.trim())
      throw new Error(
        field.type === "email" ? "Adresse email requise" : `Complétez « ${field.label} ».`,
      );
    if (field.type === "checkbox") values[field.key] = form.has(field.key);
    else if (field.type === "json" || field.type === "custom") {
      try {
        values[field.key] = JSON.parse(value || "null");
      } catch {
        throw new Error(`Valeur invalide pour « ${field.label} ».`);
      }
      if (field.required && values[field.key] == null)
        throw new Error(`Complétez « ${field.label} ».`);
    } else if (field.type === "number") {
      if (value && !Number.isFinite(Number(value)))
        throw new Error(`Nombre invalide pour « ${field.label} ».`);
      values[field.key] = value === "" ? 0 : Number(value);
    } else if (field.type === "datetime-local") {
      if (value && Number.isNaN(Date.parse(value)))
        throw new Error(`Date invalide pour « ${field.label} ».`);
      values[field.key] = value ? new Date(value).toISOString() : null;
    } else if (field.type === "email" && value && !z.email().safeParse(value).success)
      throw new Error("Adresse email invalide");
    else if (
      field.type === "tel" &&
      value &&
      (!/^\+?[\d\s().-]+$/.test(value) ||
        value.replace(/\D/g, "").length < 6 ||
        value.replace(/\D/g, "").length > 15)
    )
      throw new Error("Numéro de téléphone invalide");
    else if (
      field.type === "select" &&
      value &&
      !field.options?.some((option) => option.value === value)
    )
      throw new Error(`Choix invalide pour « ${field.label} ».`);
    else if (
      field.type === "date" &&
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      throw new Error(`Date invalide pour « ${field.label} ».`);
    else if (value !== "" || field.required) values[field.key] = value;
    else if (field.type === "date" || field.nullable) values[field.key] = null;
  }
  return values;
}
