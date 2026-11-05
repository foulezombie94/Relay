import { describe, expect, it } from "vitest";
import {
  matchRegistry,
  normalizeCompanyName,
  parseCompanySite,
  personalMailDomain,
} from "./enrichment";

const html = `<!doctype html><html lang="fr"><head>
<title>Acme Conseil | Cabinet de stratégie</title>
<meta name="description" content="Cabinet &amp; conseil en stratégie B2B.">
<meta property="og:site_name" content="Acme">
<link rel="icon" href="/favicon.png"><link rel="apple-touch-icon" href="/touch.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme Conseil",
"logo":{"@type":"ImageObject","url":"https://cdn.acme.fr/logo.svg"},"foundingDate":"2012-04-01",
"numberOfEmployees":{"@type":"QuantitativeValue","minValue":20,"maxValue":49},
"address":{"addressLocality":"Lyon","postalCode":"69002","addressCountry":"FR"},
"sameAs":["https://www.linkedin.com/company/acme-conseil/","https://x.com/acme"]}]}</script>
</head><body><a href="https://www.facebook.com/acmeconseil">fb</a><a href="https://twitter.com/intent/tweet">share</a></body></html>`;

describe("company enrichment", () => {
  it("reads metadata, JSON-LD and social profiles", () => {
    const data = parseCompanySite(html, "https://acme.fr/");
    expect(data).toMatchObject({
      name: "Acme Conseil",
      description: "Cabinet & conseil en stratégie B2B.",
      logo_url: "https://cdn.acme.fr/logo.svg",
      city: "Lyon",
      postal_code: "69002",
      employees: "20 à 49",
      founded_year: 2012,
      linkedin_url: "https://www.linkedin.com/company/acme-conseil",
      twitter_url: "https://x.com/acme",
      facebook_url: "https://www.facebook.com/acmeconseil",
    });
  });
  it("falls back to icons and title without JSON-LD", () => {
    const data = parseCompanySite(
      '<title>Globex — Logistique</title><link rel="shortcut icon" href="/i.ico">',
      "https://globex.fr/",
    );
    expect(data.name).toBe("Globex");
    expect(data.logo_url).toBe("https://globex.fr/i.ico");
  });
  it("keeps registry data only for one exact, active match", () => {
    const results = [
      {
        siren: "123456789",
        nom_complet: "ACME CONSEIL",
        section_activite_principale: "M",
        tranche_effectif_salarie: "12",
        date_creation: "2012-03-15",
        etat_administratif: "A",
        siege: { code_postal: "69002", libelle_commune: "LYON" },
      },
      { siren: "987654321", nom_complet: "ACME CONSEIL INTERNATIONAL", etat_administratif: "A" },
    ];
    expect(matchRegistry(results, ["Acme Conseil SAS"])).toMatchObject({
      siren: "123456789",
      industry: "Activités spécialisées, scientifiques et techniques",
      employees: "20 à 49 salariés",
      founded_year: 2012,
    });
    expect(matchRegistry(results, ["Acme"])).toEqual({});
    expect(matchRegistry([{ ...results[0], etat_administratif: "C" }], ["Acme Conseil"])).toEqual(
      {},
    );
  });
  it("normalizes legal forms and recognizes personal mailboxes", () => {
    expect(normalizeCompanyName("Société Générale SA")).toBe("societegenerale");
    expect(personalMailDomain("gmail.com")).toBe(true);
    expect(personalMailDomain("acme.fr")).toBe(false);
  });
});
