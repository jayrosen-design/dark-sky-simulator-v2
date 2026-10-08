// Data-package types for the Public Art Policy Simulator (web/public/public-art/data, built by publicart/build.py).
import type { FeatureCollection, MultiLineString, Point } from "geojson";

export interface SeedValue<T = number> { value: T; low?: number; high?: number; provenance?: string }
type V<T = number> = SeedValue<T>;
export type Scale = "small" | "medium" | "large" | "landmark";
export type ArtTypeName = "figure" | "sculpture" | "mural" | "fence" | "wall" | "functional";
export type Provenance = "municipal" | "county" | "cra" | "uf" | "private" | "partner";

export interface Seed {
  policy: {
    allocation_rate: V; cap_1989: V; cap_draft: V; index_first_fy: V; cap_round_to: V; cpi_base_year: V; cpi_reference_month: V;
    cpi_forward_rate: V; reserve_share: V; exclusions_1989: V<string[]>; exclusions_draft: V<string[]>; avg_commission: V; local_artist_target: V;
  };
  roads: { default_aadt: V<Record<string, number>>; default_mph: V<Record<string, number>> };
  impressions: {
    view_radius_m: V<Record<Scale, number>>; glance_tau_s: V; vehicle_occupancy: V; salience: V<Record<ArtTypeName, number>>;
    ped_radius_factor: V<{ min: number; max: number; per_m: number }>;
    night: V<{ lit: number; unlit: number; per_lamp: number; lamp_cap: number; lamp_radius_m: number }>;
    stop_probability: V; dwell_minutes: V; hourly_vehicle: V<number[]>; hourly_ped: V<{ commute: number[]; midday: number[]; night: number[] }>;
    attraction: V<{ scale: Record<Scale, number>; lit: number; seating: number; interactive: number }>;
  };
  conservation: {
    florida_factor: V; value_per_m2_mural: V; start_condition: V; replacement_value: V<Record<Scale, number>>;
    materials: V<Record<string, { decay: number; threshold: number; intervention: number; routine: number; routine_every: number }>>;
  };
  equity: { walk_radius_m: V; low_income_ratio: V; east_divide_lon: V; gap_weight_low_income: V; gap_weight_east: V };
  economics: {
    aep6: V<Aep6>; share_nonlocal: V; incremental_visit_share: V; destination_visits: V<Record<Scale, number>>;
    realisation: V; overnight_share: V; persons_per_room: V; adr: V; tdt_rate: V; retail_lift: V; sales_per_establishment: V;
  };
  facilities: {
    expansion_min_sqft: V; expansion_min_share: V; state_rule: V<{ rate: number; cap: number; applies_to: string }>; county_rule: V<null>; city_rule_note: V<string>;
  };
  staff_study: {
    ch30_options: V<Record<"A" | "B" | "C", { label: string; rate: number }>>; ch30_bonus_caps: V<{ far: number; stories: number; parking: number }>;
    ch30_uptake: V; ch30_private_construction: V; ch30_land_value_per_buildable_sf: V; gru_nexus: V<string[]>;
    interlocal: V<{ manager_cost: number; conservator_cost: number; separate_overhead: number; shared_overhead: number; shared_capacity: number; split: string }>;
    populations: V<{ city: number; county_unincorporated: number }>;
  };
}

export interface Meta {
  built: string;
  seed: Seed;
  data: Record<string, unknown> & { acs_release: string; county_mhi: number; cpi_last: [string, number]; gtfs_service_date: string };
  report: {
    registry: { entries: number; on_map: number; unlocated: { id: string; title: string; reason: string }[]; by_provenance: Record<string, number>; by_status: Record<string, number>;
      by_setting: Record<string, number>; from_archive: number };
    roads: { pieces: number; motor_pieces: number; fdot_joined: number };
    pedestrian_model: { features: string[]; n_counters: number; r2_log: number; loo_median_factor: number; loo_max_factor: number; counter_vs_model: [string, number, number][] };
  };
  notes: string[];
}

export interface ArtProps {
  id: string; title: string; artist: string | null; year: number | null; status: "existing" | "planned" | "removed" | "off_view" | "proposed";
  /** Indoor and unverified works (Public Art Archive records) get no street impressions and no 3D model. Absent = outdoor. */
  setting?: "outdoor" | "indoor" | "unverified";
  type: ArtTypeName; material: string; height: number; width: number; dims_estimated?: boolean; bearing: number; bearing_estimated?: boolean;
  lit: boolean; provenance: Provenance | "proposed"; scale: Scale; owner?: string | null; address?: string | null; location_note?: string | null;
  budget?: number | null; budget_note?: string | null; artist_local?: boolean | null; source_url?: string | null; notes?: string | null;
  located_by?: string; in_city?: boolean; seating?: boolean; interactive?: boolean;
}
export interface Artwork extends ArtProps { lon: number; lat: number }

export interface CipProject {
  id: string; name: string; department?: string; fy: number; budget_usd: number; budget_basis?: "published" | "estimated";
  components?: Partial<Record<"land_acquisition" | "equipment_furniture" | "financing" | "repair_maintenance", number>>;
  category: string; public_use?: boolean | null; funding: string; funding_note?: string; restricted: boolean;
  address?: string | null; lon?: number | null; lat?: number | null; visibility?: "high" | "medium" | "low" | null; source_url?: string; notes?: string;
}
export interface Cip { fiscal_years?: number[]; source_documents?: { title: string; url: string; note?: string }[]; projects: CipProject[] }

export interface Grid { west: number; south: number; nx: number; ny: number; res_m: number; kx: number; ky: number }
export interface Cells {
  grid: Grid; zone_codes: string[]; flags: Record<string, string>;
  cols: { ped: number[]; veh_ref: number[]; ped_ref: number[]; mix_commute: number[]; mix_midday: number[]; mix_night: number[]; zone: number[]; flags: number[]; pop: number[]; walk_m: number[] };
}

export interface RoadPiece { cls: number; name: string; mph: number; aadt: number; fdot: boolean; coords: [number, number][] }
export interface Block { lon: number; lat: number; pop: number; bg: number }
export interface BgProps { geoid: string; pop: number; mhi: number | null; moe: number | null; low_income: boolean; east: boolean; in_city: boolean }

export interface Pkg {
  meta: Meta; cells: Cells; roads: RoadPiece[]; roadClasses: string[]; art: Artwork[]; cip: Cip;
  cpi: { monthly: [string, number][] }; blocks: Block[]; equity: FeatureCollection; areas: FeatureCollection;
  trails: FeatureCollection<MultiLineString>; counters: FeatureCollection<Point>; streetlights: [number, number][];
  pois: { cats: string[]; rows: [number, number, number][] }; transit: { rows: [string, number, number, number, number[]][] };
}

export interface Aep6 {
  total_activity: number; organizations: number; audiences: number; jobs: number; tax_local: number; tax_state: number; tax_federal: number;
  attendance: number; share_nonlocal: number; spend_nonlocal: number; spend_local: number; spend_all: number; pride: number;
}
