// Shapes of web/public/data/engine.json (written by pipeline/build.py). Field names follow PRD 4.3.

export type Group = "GRU" | "Municipal" | "Utility" | "FDOT" | "Private" | "Sports" | "External";
export type SpdCode = "HPS" | "MH" | "LED4000" | "LED3000" | "LED2700" | "PCA590" | "NBA";
export type Term = "direct" | "reflected";
export type Mode = "V" | "scotopic" | "band_415" | "band_480" | "band_555" | "band_590" | "band_680";

export interface Cohort {
  spd: SpdCode;
  u: number; // TM-15 U-rating 0..5
  frac: number;
  lm: number; // lumens per fixture
}

export interface Stock {
  id: string;
  group: Group;
  county: string; // FIPS or "other"
  n: number;
  public: boolean;
  confidence: number;
  owners: Record<string, number | string>;
  tariff: Record<string, number>;
  cohorts: Cohort[];
  spd_mix_provenance?: string;
  kind?: string;               // county-manifest stock id, e.g. "private_residential", "sports"
  hours?: string | null;       // operating hours "HH:MM-HH:MM"; null = dusk to dawn
  burn_hours?: number | null;  // annual operating hours; null = seed burn_hours_per_year
}

export interface CatalogFixture {
  id: string; name: string; category: string; slot: "street" | "commercial" | "residential" | "sports";
  archetype: string; darksky_category: string; spd: SpdCode; u: number; lumens: number; watts: number;
  unit_cost: { value: number; low: number; high: number; provenance: string; ref: string };
  dimming?: { start: string; end: string; dim_level_pct: number };
  motion_only?: boolean;
  hours?: string;
  note?: string;
}

export interface Component {
  id: string;
  kind: "group" | "ring" | "external";
  group?: Group;
  county?: string;
  site?: string;
  ring?: number;
  r0_mi?: number;
  r1_mi?: number;
  stocks: Stock[];
  baseline_flux_V: Record<Term, number>;
  layers: Record<Term, number>;
}

export interface GridMeta {
  west: number; south: number; east: number; north: number;
  res_deg: number; nx: number; ny: number; dx_km: number; dy_km: number;
}

export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  county: string;
  seed_mag: number;
  seed_bortle: string;
  seed_range?: [number, number];
  role: string;
  reference?: boolean;
  model_mag: number;
  residual: number;
  model_bortle: number;
  contrib: Record<string, Record<Term, number>>;
}

export interface Log16Meta { file: string; encoding: "log16"; compression?: "gzip"; delta?: "row"; lo: number; hi: number; count: number; shape: [number, number] }
export interface Lin16Meta { file: string; encoding: "lin16"; compression?: "gzip"; delta?: "row"; layers: { lo: number; hi: number }[]; shape: [number, number]; names?: string[] }

export interface TariffDef {
  type: "energy" | "deemed" | "deemed_daily";
  usd_per_kwh?: number;
  dimming_savings: boolean;
  rate_date: string;
  ref: string;
}

export interface SeedParam { value: number; min?: number; max?: number; unit?: string; provenance: string; ref: string; display_blocked?: boolean }

export interface EngineData {
  version: string;
  built: string;
  mode: "seed" | "viirs";
  data_status: {
    viirs: { loaded: boolean; note: string };
    fdot_rci341: { status: string };
    cityworks: { loaded: boolean; error: string | null };
    calibration: { sqm_stations: number; rmse_mag: number | null; tier2: null };
  };
  grids: { a15: GridMeta; a30: GridMeta; region: GridMeta; b: GridMeta };
  files: {
    baseline_a15: Log16Meta;
    basis_a30: Log16Meta;
    growth_a30: Lin16Meta;
    fixtures_cat_a15: Lin16Meta;
    county_a15: { file: string; values: string[]; shape: [number, number] };
    mcda_b: Lin16Meta;
    mcda_b_county: { file: string; values: string[]; shape: [number, number] };
    viirs_a15?: Log16Meta;
    viirs_trend_a15?: Lin16Meta;
  };
  viirs: null | { years: number[]; county_pct_change: Record<string, number> };
  growth_model: { method: string; source?: string; median_ape_pct?: number; naive_median_ape_pct?: number; rmse_log?: number; n_cells?: number; note?: string };
  physics: {
    kernel_fits: Record<Term, { coeffs: number[]; d_min_km: number; d_max_km: number; max_rel_error: number }>;
    kernel_profile: Record<string, number[]>;
    atmospheres: { turbidity: number; hg_g: number }[];
    band_scatter_ratios: Record<Term, number[]>;
    spectral_factors: Record<Term, Record<Mode, Record<SpdCode, number>>>;
    ulor: Record<string, number>;
    albedo: number;
    L_nat: number;
  };
  anchor: { alpha: number; rmse_mag: number; n_sites: number; method: string; is_calibration: false };
  public_rates: { urban_per_hu: number; rural_per_hu: number; reference_counties: string[]; method: string };
  land?: {
    source: string; parcels: number; qualified_vacant_sales: number; sale_years: [number, number]; assessment_year: number | null;
    categories: Record<string, string>; public_categories: number[]; parcels_file: string;
    county: Record<string, { n_sales: number; median_usd_acre: number | null; p25: number | null; p75: number | null;
      sale_to_just_value: number | null; median_sale_year: number | null }>;
  };
  osm_roads: { segments: number; lit_yes: number };
  sanity: { globe_at_night: { n: number; n_sqm: number; median_residual: number | null; mad: number | null; median_residual_sqm: number | null; mad_sqm: number | null } };
  components: Component[];
  sites: Site[];
  overlay_sites: string[];
  light_domes: { name: string; lat: number; lon: number; population: number }[];
  inventory: {
    by_group: { county: string; group: Group; n: number; confidence: number }[];
    ingest_report: Record<string, unknown>;
    surveyed_points: number;
  };
  trend_seed: Record<string, null | {
    county_pct: number; lit_area_pct: [number, number]; gainesville_pct: number;
    city_of_alachua_pct: number; paynes_prairie_vicinity_pct: number;
  }>;
  ordinance_seed: Record<string, string>;
  county_names: Record<string, string>;
  region_county_names: Record<string, string>;
  seed: {
    engine: Record<string, number | string>;
    engine_provenance: Record<string, string>;
    econ: { params: Record<string, SeedParam>; tariffs: Record<string, TariffDef> };
    spd: Record<SpdCode, Record<string, string>>;
    bortle: { bortle: string; min_mag: string; max_mag: string; label: string }[];
    certification: { code: string; min_zenith_mag: string; notes: string }[];
    mcda: {
      weights: Record<string, { value: number; label: string }>;
      anchors: Record<string, Record<string, number | string>>;
      urban_core_min_population: { value: number };
      site_min_cells: { value: number };
      top_sites: { value: number };
      land_pricing?: { target_site_acres: { value: number; options: number[] } };
    };
    overlay: {
      lz0: { default_radius_mi: number; radius_options_mi: number[]; spd: SpdCode; motion_only: boolean };
      lz1: { default_radius_mi: number; radius_options_mi: number[]; cct_cap: SpdCode; lm_per_net_acre_cap: number };
      motion_only_equivalent_dim_pct: { value: number };
      ring_edges_mi: number[];
    };
    presets: Record<string, { label: string; ref: string; notes: string; params: Record<string, unknown> }>;
    catalog?: {
      darksky_search_url: string;
      install_allowance: { value: number };
      categories: Record<string, { label: string; icon: string }>;
      fixtures: CatalogFixture[];
    };
  };
}
