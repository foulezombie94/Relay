import "server-only";
import { request } from "node:https";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveWorkflowDestination } from "./workflow-http";
import {
  matchRegistry,
  parseCompanySite,
  personalMailDomain,
  type CompanyEnrichment,
} from "@/lib/domain/enrichment";
import { companySite } from "@/lib/domain/company-site";

const maxBytes = 600_000;
const sameSite = (a: string, b: string) => a.replace(/^www\./, "") === b.replace(/^www\./, "");

/**
 * GET of a public homepage. DNS is resolved and checked against private ranges
 * on every hop and pinned for the connection; at most 3 redirects, same site only.
 */
export async function fetchHomepage(domain: string) {
  let target = `https://${domain}/`;
  for (let hop = 0; hop < 4; hop++) {
    const { url, chosen } = await resolveWorkflowDestination(target);
    const response = await new Promise<{
      status: number;
      location?: string;
      type: string;
      body: string;
    }>((resolve, reject) => {
      const req = request(
        url,
        {
          method: "GET",
          headers: {
            "User-Agent": "ZyliadEnrichment/1.0 (+https://zyliad.fr)",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "fr,en;q=0.8",
          },
          lookup: (_host, _options, callback) => callback(null, chosen.address, chosen.family),
        },
        (res) => {
          const type = String(res.headers["content-type"] ?? "");
          if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400) {
            res.resume();
            return resolve({
              status: res.statusCode ?? 0,
              location: res.headers.location,
              type,
              body: "",
            });
          }
          let size = 0;
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            // Metadata sits in the head: stop reading large pages instead of failing.
            if (size > maxBytes) {
              chunks.push(chunk);
              res.destroy();
              return resolve({
                status: res.statusCode ?? 0,
                type,
                body: Buffer.concat(chunks).toString("utf8"),
              });
            }
            chunks.push(chunk);
          });
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              type,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
          res.on("error", reject);
        },
      );
      const timer = setTimeout(() => req.destroy(new Error("Délai du site dépassé.")), 8000);
      req.on("close", () => clearTimeout(timer));
      req.on("error", reject);
      req.end();
    });
    if (response.location) {
      const next = new URL(response.location, url);
      if (next.protocol !== "https:" || !sameSite(next.hostname, domain))
        throw new Error("Redirection vers un autre site ignorée.");
      target = next.toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Site indisponible (HTTP ${response.status}).`);
    if (!/html/i.test(response.type)) throw new Error("La page d’accueil n’est pas du HTML.");
    return { url: url.toString(), html: response.body };
  }
  throw new Error("Trop de redirections.");
}

/** French public business registry (Annuaire des entreprises, no key). */
async function frenchRegistry(names: string[]) {
  if (process.env.ENRICHMENT_FR_REGISTRY === "false") return {};
  const query = names.find((n) => n.trim().length >= 3);
  if (!query) return {};
  const url = new URL("https://recherche-entreprises.api.gouv.fr/search");
  url.searchParams.set("q", query.slice(0, 100));
  url.searchParams.set("per_page", "5");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "ZyliadEnrichment/1.0" },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) return {};
  const data = (await response.json()) as { results?: unknown };
  return matchRegistry(data.results, names);
}

type Job = {
  record_id: string;
  kind: string;
  display_name: string;
  domain: string | null;
  email: string | null;
};

export async function enrichRecord(job: Job): Promise<{
  outcome: "done" | "skipped";
  data: CompanyEnrichment;
  sources: string[];
}> {
  if (job.kind === "people") {
    const domain = job.email?.split("@")[1]?.toLowerCase();
    if (!domain || personalMailDomain(domain)) return { outcome: "skipped", data: {}, sources: [] };
    return { outcome: "done", data: { company_domain: domain }, sources: ["email"] };
  }
  const site = companySite(job.domain);
  if (!site) return { outcome: "skipped", data: {}, sources: [] };
  const sources: string[] = [];
  let data: CompanyEnrichment = {};
  try {
    const page = await fetchHomepage(site.host);
    data = parseCompanySite(page.html, page.url);
    sources.push("site");
  } catch {
    // An unreachable site still allows registry data.
  }
  const french = site.host.endsWith(".fr") || /france/i.test(data.country ?? "");
  if (french) {
    try {
      const registry = await frenchRegistry(
        [data.name, job.display_name].filter((n): n is string => !!n),
      );
      if (Object.keys(registry).length) {
        // Official registry facts win over self-declared website facts.
        data = { ...data, ...registry };
        sources.push("annuaire-entreprises");
      }
    } catch {
      /* Registry unavailable: keep website data. */
    }
  }
  if (!sources.length) throw new Error("Aucune source accessible pour ce domaine.");
  return { outcome: "done", data, sources };
}

/** Worker task: claim queued records under a lease, enrich them, store the result. */
export async function runEnrichment(admin: SupabaseClient, worker: string, batch = 8) {
  const { data, error } = await admin.rpc("enrichment_claim", { worker, batch });
  if (error) throw Object.assign(new Error("enrichment_claim"), { code: error.code });
  const jobs = (Array.isArray(data) ? data : []) as Job[];
  let done = 0;
  let failed = 0;
  for (const job of jobs) {
    let result: Awaited<ReturnType<typeof enrichRecord>> | null = null;
    let failure: string | null = null;
    try {
      result = await enrichRecord(job);
    } catch (e) {
      failure = e instanceof Error ? e.message.slice(0, 200) : "Enrichissement impossible.";
    }
    const { error: completeError } = await admin.rpc("enrichment_complete", {
      rec: job.record_id,
      worker,
      outcome: result ? result.outcome : "failed",
      result: result?.data ?? {},
      origin: result?.sources ?? [],
      error_text: failure,
    });
    if (completeError)
      throw Object.assign(new Error("enrichment_complete"), { code: completeError.code });
    if (result) done++;
    else failed++;
  }
  return { done, failed };
}
