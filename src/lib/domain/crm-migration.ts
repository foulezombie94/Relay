import { automaticMapping, type ImportTable } from "./imports";
export { crmSources, type CrmSource } from "./crm-sources";
export const migrationFields = ["_source_id", "_company_ids", "_person_ids"] as const;
export const importLabels: Record<string, string> = {
  display_name: "Nom",
  email: "Email",
  domain: "Site internet",
  stage: "Étape",
  amount: "Montant",
  currency: "Devise",
  close_date: "Clôture prévue",
  lost_reason: "Raison de perte",
  probability: "Probabilité (%)",
  attributes: "Attributs JSON",
  _source_id: "ID de la fiche dans le CRM source",
  _company_ids: "ID des entreprises associées",
  _person_ids: "ID des personnes associées",
};
export function normalizedHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
export function crmMapping(headers: string[], kind: string) {
  const map = automaticMapping(headers);
  const aliases: Record<string, string> = {
    recordid: "_source_id",
    id: "_source_id",
    hsobjectid: "_source_id",
    recordidentifier: "_source_id",
    identifiantdelenregistrement: "_source_id",
    contactid: kind === "people" ? "_source_id" : "_person_ids",
    personid: kind === "people" ? "_source_id" : "_person_ids",
    accountid: kind === "companies" ? "_source_id" : "_company_ids",
    companyid: kind === "companies" ? "_source_id" : "_company_ids",
    organizationid: kind === "companies" ? "_source_id" : "_company_ids",
    dealid: kind === "deals" ? "_source_id" : "",
    opportunityid: kind === "deals" ? "_source_id" : "",
    leadid: kind === "companies" ? "_source_id" : "_company_ids",
    associatedcompanyids: "_company_ids",
    associatedcompany: "_company_ids",
    associatedcontactids: "_person_ids",
    associatedcontacts: "_person_ids",
    nomcompletrelay: "display_name",
    dealname: "display_name",
    dealtitle: "display_name",
    opportunityname: "display_name",
    contactname: "display_name",
    accountname: "display_name",
    organisation: "display_name",
    organizationname: "display_name",
    leadname: kind === "companies" ? "display_name" : "",
    displayname: "display_name",
    primarycontactemails: "email",
    emailaddress: "email",
    companydomainname: "domain",
    url: "domain",
    dealvalue: "amount",
    value: "amount",
    valuecurrency: "currency",
    expectedclosedate: "close_date",
    expectedwondate: "close_date",
    closingdate: "close_date",
    dealstage: "stage",
    statuslabel: kind === "deals" ? "stage" : "",
    winprobability: "probability",
    confidence: "probability",
  };
  const used = new Set<string>();
  for (const h of headers) {
    const k = normalizedHeader(h);
    const field = aliases[k] ?? map[h];
    map[h] = field && !used.has(field) ? field : "";
    if (map[h]) used.add(map[h]);
  }
  return map;
}
export function withFullName(table: ImportTable): ImportTable {
  const norm = table.headers.map(normalizedHeader);
  if (
    norm.some((h) => ["name", "fullname", "displayname", "contactname", "nomcomplet"].includes(h))
  )
    return table;
  const first = norm.findIndex((h) => ["firstname", "prenom", "givenname"].includes(h)),
    last = norm.findIndex((h) => ["lastname", "nomdefamille", "surname"].includes(h));
  if (first < 0 && last < 0) return table;
  return {
    ...table,
    headers: ["Nom complet (Zyliad)", ...table.headers],
    rows: table.rows.map((r) => [
      [first >= 0 ? r[first] : "", last >= 0 ? r[last] : ""].filter(Boolean).join(" "),
      ...r,
    ]),
  };
}
export function referenceIds(cell: string) {
  const values: unknown = cell.trim().startsWith("[")
    ? JSON.parse(cell)
    : cell
        .split(/[;|,]/)
        .map((s) => s.trim())
        .filter(Boolean);
  if (
    !Array.isArray(values) ||
    values.length > 20 ||
    values.some(
      (v) => typeof v !== "string" || !v.trim() || v.length > 200 || /[\x00-\x1f]/.test(v),
    )
  )
    throw new Error(
      "Les associations demandent au maximum 20 identifiants texte par ligne (séparés par ;).",
    );
  return [...new Set(values.map((v) => (v as string).trim()))];
}
