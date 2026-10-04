// Chapter 5.5 Art in Public Places ledger over a capital program: which projects owe the art allocation, how much
// (1% of the eligible construction budget, capped), and where the money goes. Compares the 1989 code with the
// Trust's discussion draft (Aug 31 2026): $300,000 cap indexed to CPI-U from Oct 1 2027 (FY2028) and rounded to
// $5,000, wider exclusions, a 15% Conservation Reserve on unrestricted allocations, and restricted sources kept in
// their own sub-accounts. Both versions retain allocations not used on site in the trust fund ("pooled" here) for
// art at other public places: the 1989 code already allows that (Sec. 5.5-3(d)); the draft makes it explicit.
// Pure functions. Every output is a planning estimate on an illustrative capital program.
import type { CipProject, Seed } from "../types";

export type Code = "1989" | "draft";
export type RestrictedMode = "segregate" | "exclude";

export interface PolicyParams {
  code: Code;
  capDraft: number;              // draft single-project cap before indexing
  indexCpi: boolean;             // draft: index the cap to CPI-U
  cpiForward: number;            // CPI-U growth per year after the last observation
  reserveShare: number;          // draft: share of unrestricted allocations to the Conservation Reserve
  horizon: 5 | 10;
  categories: string[];          // project categories that owe the allocation
  restrictedMode: RestrictedMode; // draft: restricted sources allocate into sub-accounts, or are excluded as unusable for art
  surtaxRestricted: boolean;     // treat the County infrastructure surtax as a restricted source (an open legal question)
}

export const DEFAULT_CATEGORIES = ["building_new", "building_major_renovation", "park_public_space"];
export const ALL_CATEGORIES = ["building_new", "building_major_renovation", "park_public_space", "transportation", "utility", "stormwater",
  "it_equipment", "land", "repair_maintenance", "other"];

export function defaultPolicy(seed: Seed, code: Code = "draft"): PolicyParams {
  return { code, capDraft: seed.policy.cap_draft.value, indexCpi: true, cpiForward: seed.policy.cpi_forward_rate.value,
    reserveShare: seed.policy.reserve_share.value, horizon: 5, categories: [...DEFAULT_CATEGORIES], restrictedMode: "segregate", surtaxRestricted: true };
}

/** CPI-U for a year and month: observed, or projected from the last observation at `forward` per year. */
export function cpiAt(monthly: [string, number][], year: number, month: number, forward: number) {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const hit = monthly.find(([k]) => k === key);
  if (hit) return hit[1];
  const [lastKey, lastV] = monthly[monthly.length - 1];
  const [ly, lm] = lastKey.split("-").map(Number);
  const months = (year - ly) * 12 + (month - lm);
  return lastV * (1 + forward) ** (months / 12);
}

export const round5k = (x: number, to = 5000) => Math.round(x / to) * to;

/** Single-project cap for a fiscal year. */
export function capFor(fy: number, P: PolicyParams, seed: Seed, cpi: [string, number][]) {
  if (P.code === "1989") return seed.policy.cap_1989.value;
  if (!P.indexCpi || fy < seed.policy.index_first_fy.value) return P.capDraft;
  const m = seed.policy.cpi_reference_month.value, base = seed.policy.cpi_base_year.value;
  // Each year is indexed from the unrounded base, so rounding never compounds.
  return round5k(P.capDraft * (cpiAt(cpi, fy - 1, m, P.cpiForward) / cpiAt(cpi, base, m, P.cpiForward)), seed.policy.cap_round_to.value);
}

/** Construction budget that counts toward the allocation (exclusions removed). */
export function eligibleBudget(p: CipProject, code: Code, seed: Seed) {
  const ex = code === "1989" ? seed.policy.exclusions_1989.value : seed.policy.exclusions_draft.value;
  const c = p.components ?? {};
  const removed = ex.reduce((a, k) => a + (Number(c[k as keyof typeof c]) || 0), 0);
  return Math.max(0, p.budget_usd - removed);
}

export interface ProjectAlloc {
  id: string; name: string; fy: number; repeat: boolean; category: string; funding: string; restricted: boolean;
  applies: boolean; eligible: number; raw: number; cap: number; alloc: number; capped: number;
  reserve: number; onsite: number; pooled: number; restrictedSub: number; commingled: number; excluded: number;
}

export interface LedgerYear { fy: number; alloc: number; capped: number; reserveIn: number; onsite: number; pooledIn: number; restricted: number; commingled: number; excluded: number }

export interface Ledger { projects: ProjectAlloc[]; years: LedgerYear[]; totals: LedgerYear & { pooledBal: number; reserveBal: number }; fys: number[] }

/** Projects in the horizon. A 10-year horizon repeats the 5-year program five years later, budgets grown with CPI. */
export function programFor(projects: CipProject[], P: PolicyParams, cpi: [string, number][], seed: Seed): (CipProject & { repeat: boolean })[] {
  const fy0 = Math.min(...projects.map((p) => p.fy));
  const out = projects.filter((p) => p.fy < fy0 + 5).map((p) => ({ ...p, repeat: false }));
  if (P.horizon === 10) {
    const m = seed.policy.cpi_reference_month.value;
    for (const p of projects.filter((q) => q.fy < fy0 + 5)) {
      const g = cpiAt(cpi, p.fy + 4, m, P.cpiForward) / cpiAt(cpi, p.fy - 1, m, P.cpiForward);
      const comp = p.components ? Object.fromEntries(Object.entries(p.components).map(([k, v]) => [k, (v ?? 0) * g])) : undefined;
      out.push({ ...p, id: `${p.id}+5`, fy: p.fy + 5, budget_usd: p.budget_usd * g, components: comp, repeat: true });
    }
  }
  return out;
}

export function ledger(projects: CipProject[], P: PolicyParams, seed: Seed, cpi: [string, number][]): Ledger {
  const rate = seed.policy.allocation_rate.value;
  const rows: ProjectAlloc[] = programFor(projects, P, cpi, seed).map((p) => {
    const applies = P.categories.includes(p.category) && p.public_use !== false;
    const restricted = p.restricted && !(p.funding === "surtax" && !P.surtaxRestricted);
    const eligible = applies ? eligibleBudget(p, P.code, seed) : 0;
    const cap = capFor(p.fy, P, seed, cpi);
    const raw = rate * eligible;
    let alloc = Math.min(raw, cap);
    const row: ProjectAlloc = { id: p.id, name: p.name, fy: p.fy, repeat: p.repeat, category: p.category, funding: p.funding, restricted,
      applies, eligible, raw, cap, alloc, capped: raw - alloc, reserve: 0, onsite: 0, pooled: 0, restrictedSub: 0, commingled: 0, excluded: 0 };
    if (!applies || alloc <= 0) return row;
    if (restricted && P.code === "draft") {
      if (P.restrictedMode === "exclude") { row.excluded = alloc; row.alloc = alloc = 0; return row; }
      row.restrictedSub = alloc;                               // own sub-account, spent only as the source allows
      return row;
    }
    if (restricted) row.commingled = alloc;                   // 1989 code: no separate accounting
    row.reserve = P.code === "draft" ? alloc * P.reserveShare : 0;
    const rest = alloc - row.reserve;
    if (p.visibility === "low") row.pooled = rest;              // site unsuited to art: retained for another public place
    else row.onsite = rest;
    return row;
  });
  const fys = [...new Set(rows.map((r) => r.fy))].sort((a, b) => a - b);
  const sum = (rs: ProjectAlloc[], fy: number): LedgerYear => ({
    fy, alloc: rs.reduce((a, r) => a + r.alloc, 0), capped: rs.reduce((a, r) => a + r.capped, 0), reserveIn: rs.reduce((a, r) => a + r.reserve, 0),
    onsite: rs.reduce((a, r) => a + r.onsite, 0), pooledIn: rs.reduce((a, r) => a + r.pooled, 0), restricted: rs.reduce((a, r) => a + r.restrictedSub, 0),
    commingled: rs.reduce((a, r) => a + r.commingled, 0), excluded: rs.reduce((a, r) => a + r.excluded, 0) });
  const years = fys.map((fy) => sum(rows.filter((r) => r.fy === fy), fy));
  const t = sum(rows, 0);
  return { projects: rows, years, fys, totals: { ...t, pooledBal: t.pooledIn, reserveBal: t.reserveIn } };
}
