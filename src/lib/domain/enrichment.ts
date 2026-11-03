import { z } from "zod";

export type CompanyEnrichment = {
  name?: string;
  description?: string;
  logo_url?: string;
  website?: string;
  linkedin_url?: string;
  twitter_url?: string;
  facebook_url?: string;
  instagram_url?: string;
  youtube_url?: string;
  phone?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  industry?: string;
  naf_code?: string;
  employees?: string;
  founded_year?: number;
  siren?: string;
  legal_name?: string;
  company_domain?: string;
  company_name?: string;
};

const decode = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
const clip = (value: string | undefined, max: number) =>
  value ? decode(value).slice(0, max) || undefined : undefined;

function attribute(tag: string, name: string) {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? match[4]) : undefined;
}
function meta(html: string, key: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = (attribute(tag, "property") ?? attribute(tag, "name"))?.toLowerCase();
    if (name === key) return attribute(tag, "content");
  }
}
function absolute(value: string | undefined, base: string) {
  if (!value) return undefined;
  try {
    const url = new URL(decode(value), base);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString().slice(0, 1000)
      : undefined;
  } catch {
    return undefined;
  }
}
const socialPatterns: [keyof CompanyEnrichment, RegExp][] = [
  [
    "linkedin_url",
    /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|school|showcase)\/[^/?#\s]+/i,
  ],
  [
    "twitter_url",
    /^https?:\/\/(www\.)?(twitter|x)\.com\/(?!intent|share|home)[A-Za-z0-9_]{1,15}\/?$/i,
  ],
  ["facebook_url", /^https?:\/\/(www\.|m\.)?facebook\.com\/(?!sharer|share|dialog)[^/?#\s]+\/?$/i],
  ["instagram_url", /^https?:\/\/(www\.)?instagram\.com\/[^/?#\s]+\/?$/i],
  ["youtube_url", /^https?:\/\/(www\.)?youtube\.com\/(@|c\/|channel\/|user\/)[^/?#\s]+/i],
];
function socials(urls: string[]) {
  const found: Partial<CompanyEnrichment> = {};
  for (const url of urls)
    for (const [key, pattern] of socialPatterns) {
      const match = pattern.exec(url);
      if (match && !found[key])
        (found as Record<string, string>)[key] = match[0].replace(/\/$/, "");
    }
  return found;
}
type JsonLd = Record<string, unknown>;
function organizations(html: string) {
  const found: JsonLd[] = [];
  for (const block of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(block[1].trim());
      const queue: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      while (queue.length && found.length < 10) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        const record = item as JsonLd;
        if (Array.isArray(record["@graph"])) queue.push(...record["@graph"]);
        const type = ([] as unknown[]).concat(record["@type"] ?? []).map(String);
        if (type.some((t) => /Organization|Corporation|LocalBusiness|Company/i.test(t)))
          found.push(record);
      }
    } catch {
      /* Invalid JSON-LD is ignored. */
    }
  }
  return found;
}
const text = (value: unknown) => (typeof value === "string" ? value : undefined);

/** Company facts from a homepage: metadata, JSON-LD Organization and social links. */
export function parseCompanySite(html: string, pageUrl: string): CompanyEnrichment {
  const head = html.slice(0, 400000);
  const org = organizations(head)[0] ?? {};
  const logo =
    org.logo && typeof org.logo === "object" ? text((org.logo as JsonLd).url) : text(org.logo);
  const address = (org.address && typeof org.address === "object" ? org.address : {}) as JsonLd;
  const employees =
    org.numberOfEmployees && typeof org.numberOfEmployees === "object"
      ? (org.numberOfEmployees as JsonLd)
      : {};
  const employeeText =
    text(employees.value as string) ??
    (employees.minValue || employees.maxValue
      ? `${employees.minValue ?? "?"} à ${employees.maxValue ?? "?"}`
      : typeof org.numberOfEmployees === "number" || typeof org.numberOfEmployees === "string"
        ? String(org.numberOfEmployees)
        : undefined);
  const icons = [...head.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /\brel\s*=\s*["']?[^"'>]*(apple-touch-icon|icon)/i.test(tag))
    .sort((a, b) => Number(/apple-touch-icon/i.test(b)) - Number(/apple-touch-icon/i.test(a)))
    .map((tag) => attribute(tag, "href"));
  const anchors = [...head.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map((m) =>
    decode(m[1]),
  );
  const sameAs = ([] as unknown[])
    .concat(org.sameAs ?? [])
    .filter((v): v is string => typeof v === "string");
  const founded = Number(String(text(org.foundingDate) ?? "").slice(0, 4));
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  return Object.fromEntries(
    Object.entries({
      name: clip(
        text(org.name) ?? meta(head, "og:site_name") ?? title?.split(/\s[|\-–—]\s/)[0],
        200,
      ),
      description: clip(
        text(org.description) ?? meta(head, "description") ?? meta(head, "og:description"),
        500,
      ),
      logo_url: absolute(logo ?? icons[0], pageUrl),
      website: pageUrl,
      phone: clip(text(org.telephone), 40),
      city: clip(text(address.addressLocality), 120),
      postal_code: clip(text(address.postalCode), 20),
      country: clip(
        text(address.addressCountry) ??
          (address.addressCountry && typeof address.addressCountry === "object"
            ? text((address.addressCountry as JsonLd).name)
            : undefined),
        60,
      ),
      employees: clip(employeeText, 60),
      founded_year: founded >= 1800 && founded <= new Date().getFullYear() ? founded : undefined,
      ...socials([...sameAs, ...anchors]),
    }).filter(([, value]) => value !== undefined && value !== ""),
  ) as CompanyEnrichment;
}

/** INSEE workforce bands (tranche_effectif_salarie). */
export const workforceBands: Record<string, string> = {
  "00": "0 salarié",
  "01": "1 à 2 salariés",
  "02": "3 à 5 salariés",
  "03": "6 à 9 salariés",
  "11": "10 à 19 salariés",
  "12": "20 à 49 salariés",
  "21": "50 à 99 salariés",
  "22": "100 à 199 salariés",
  "31": "200 à 249 salariés",
  "32": "250 à 499 salariés",
  "41": "500 à 999 salariés",
  "42": "1 000 à 1 999 salariés",
  "51": "2 000 à 4 999 salariés",
  "52": "5 000 à 9 999 salariés",
  "53": "10 000 salariés et plus",
};
/** NAF rev. 2 sections. */
export const nafSections: Record<string, string> = {
  A: "Agriculture, sylviculture et pêche",
  B: "Industries extractives",
  C: "Industrie manufacturière",
  D: "Énergie",
  E: "Eau, assainissement et déchets",
  F: "Construction",
  G: "Commerce",
  H: "Transports et entreposage",
  I: "Hébergement et restauration",
  J: "Information et communication",
  K: "Finance et assurance",
  L: "Immobilier",
  M: "Activités spécialisées, scientifiques et techniques",
  N: "Services administratifs et de soutien",
  O: "Administration publique",
  P: "Enseignement",
  Q: "Santé humaine et action sociale",
  R: "Arts, spectacles et loisirs",
  S: "Autres activités de services",
  T: "Activités des ménages",
  U: "Activités extra-territoriales",
};
export const normalizeCompanyName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(sas|sasu|sarl|sa|eurl|sci|snc|groupe|group|inc|ltd|gmbh|france)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");

const registryResult = z.object({
  siren: z.string().regex(/^\d{9}$/),
  nom_complet: z.string().optional(),
  nom_raison_sociale: z.string().nullable().optional(),
  sigle: z.string().nullable().optional(),
  activite_principale: z.string().nullable().optional(),
  section_activite_principale: z.string().nullable().optional(),
  tranche_effectif_salarie: z.string().nullable().optional(),
  date_creation: z.string().nullable().optional(),
  etat_administratif: z.string().nullable().optional(),
  siege: z
    .object({
      code_postal: z.string().nullable().optional(),
      libelle_commune: z.string().nullable().optional(),
    })
    .partial()
    .nullable()
    .optional(),
});
/**
 * Picks the registry entry whose name exactly matches one of the candidate names
 * (normalized). No match, or several distinct matches, means no registry data:
 * a wrong company is worse than an empty field.
 */
export function matchRegistry(results: unknown, candidates: string[]): Partial<CompanyEnrichment> {
  const wanted = new Set(candidates.map(normalizeCompanyName).filter((n) => n.length >= 3));
  const parsed = z.array(z.unknown()).safeParse(results);
  if (!parsed.success || !wanted.size) return {};
  const matches = parsed.data
    .map((item) => registryResult.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data)
    .filter(
      (r) =>
        r.etat_administratif !== "C" &&
        [r.nom_complet, r.nom_raison_sociale, r.sigle].some(
          (name) => name && wanted.has(normalizeCompanyName(name)),
        ),
    );
  if (new Set(matches.map((m) => m.siren)).size !== 1) return {};
  const m = matches[0];
  const year = Number(m.date_creation?.slice(0, 4));
  return Object.fromEntries(
    Object.entries({
      siren: m.siren,
      legal_name: m.nom_raison_sociale ?? m.nom_complet,
      naf_code: m.activite_principale ?? undefined,
      industry: m.section_activite_principale
        ? nafSections[m.section_activite_principale]
        : undefined,
      employees: m.tranche_effectif_salarie
        ? workforceBands[m.tranche_effectif_salarie]
        : undefined,
      founded_year: year > 1800 ? year : undefined,
      postal_code: m.siege?.code_postal ?? undefined,
      city: m.siege?.libelle_commune ?? undefined,
      country: "France",
    }).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

/** Same list as relay_private.personal_mail_domain(). */
export function personalMailDomain(domain: string) {
  return /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|gmx|proton|protonmail|pm|mail|yandex|zoho|orange|wanadoo|free|laposte|sfr|neuf|bbox|numericable|club-internet|aliceadsl|tutanota|fastmail|hey)\.[a-z.]{2,10}$/.test(
    domain,
  );
}
