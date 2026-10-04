// Fixed geography and palette for the Public Art Policy Simulator.

/** Downtown Gainesville (lon, lat): the reference point for Sun position and the default view. */
export const GNV_CENTER: [number, number] = [-82.325, 29.652];

/** City of Gainesville plus Celebration Pointe: the analysis extent (west, south, east, north). */
export const GNV_BOUNDS: [[number, number], [number, number]] = [[-82.47, 29.58], [-82.2, 29.76]];

export const ACCENT = "#b79cff";

/** Marker colour by funding/provenance category. */
export const PROVENANCE_COLOR: Record<string, string> = {
  municipal: "#f6b44b",  // City Art in Public Places / CIP
  county: "#7cc4ff",
  cra: "#5fd6c4",
  uf: "#8fe38f",
  private: "#f08ab8",
  partner: "#d9d2bd",
  proposed: ACCENT,
};

export const PROVENANCE_LABEL: Record<string, string> = {
  municipal: "City (Art in Public Places)", county: "Alachua County", cra: "Community Reinvestment Area", uf: "University of Florida",
  private: "Private / incentive", partner: "Partner or other", proposed: "Proposed in this scenario",
};
