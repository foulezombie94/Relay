import { z } from "zod";
import type { Attribute } from "./types";
export function validateAttributes(
  values: Record<string, unknown>,
  attributes: Attribute[],
  previous?: Record<string, unknown>,
) {
  const issues: string[] = [];
  const active = attributes.filter((a) => !a.archived);
  for (const [key, value] of Object.entries(values)) {
    const attr = active.find((a) => a.key === key);
    if (!attr) {
      if (
        attributes.some((a) => a.key === key && a.archived) &&
        previous &&
        Object.hasOwn(previous, key) &&
        JSON.stringify(previous[key]) === JSON.stringify(value)
      )
        continue;
      issues.push(`Attribut inconnu : ${key}`);
      continue;
    }
    if (value === null || value === "") continue;
    let valid = true;
    switch (attr.type) {
      case "number":
      case "money":
        valid = typeof value === "number" && Number.isFinite(value);
        break;
      case "boolean":
        valid = typeof value === "boolean";
        break;
      case "email":
        valid = z.email().safeParse(value).success;
        break;
      case "phone":
        valid =
          typeof value === "string" &&
          /^\+?[\d\s().-]+$/.test(value) &&
          value.replace(/\D/g, "").length >= 6 &&
          value.replace(/\D/g, "").length <= 15;
        break;
      case "url":
        valid = z.url({ protocol: /^https?$/ }).safeParse(value).success;
        break;
      case "select":
        valid = attr.options.includes(String(value));
        break;
      case "multi_select":
        valid = Array.isArray(value) && value.every((v) => attr.options.includes(String(v)));
        break;
      case "date":
        valid =
          typeof value === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          !isNaN(Date.parse(value)) &&
          new Date(value).toISOString().slice(0, 10) === value;
        break;
      case "datetime":
        valid = typeof value === "string" && !isNaN(Date.parse(value));
        break;
      case "relation":
      case "user":
        valid = z.uuid().safeParse(value).success;
        break;
      case "formula":
        valid = false;
        break;
      default:
        valid = typeof value === "string" && value.length <= 10000;
    }
    if (!valid) issues.push(`Valeur invalide : ${attr.name}`);
  }
  for (const attr of active)
    if (
      attr.required &&
      (values[attr.key] === undefined ||
        values[attr.key] === null ||
        (typeof values[attr.key] === "string" && !String(values[attr.key]).trim()))
    )
      issues.push(`Champ requis : ${attr.name}`);
  return issues;
}
export function safeCsvCell(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
