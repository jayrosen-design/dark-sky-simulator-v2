"""Effective upward flux of a fixture stock for each kernel term (PRD 2.1). Pure functions.

A stock is {n, cohorts: [{spd, u, frac, lm}]}: n fixtures split into cohorts by SPD class and TM-15
U-rating, each with lumens per fixture. For kernel term 'direct' the effective flux is the uplight
lm * ULOR(u); for 'reflected' it is the downward light lm * (1 - ULOR(u)) * albedo. Both are weighted by
the SPD's spectral skyglow factor for the output mode, so V-mode flux times the V kernel gives cd m^-2.

The browser's scenario combiner (web/src/engine/scenario.ts) implements the same formula; the pipeline
exports these baseline values so a Vitest case can assert both sides agree.
"""
from __future__ import annotations

TERMS = ("direct", "reflected")


def effective_flux(stock: dict, term: str, mode: str, ulor: dict[int, float], albedo: float,
                   spectral: dict) -> float:
    total = 0.0
    for c in stock["cohorts"]:
        u = ulor[int(c["u"])]
        geom = u if term == "direct" else (1.0 - u) * albedo
        total += c["frac"] * c["lm"] * geom * spectral[term][mode][c["spd"]]
    return stock["n"] * total


def component_flux(stocks: list[dict], term: str, mode: str, ulor, albedo, spectral) -> float:
    return sum(effective_flux(s, term, mode, ulor, albedo, spectral) for s in stocks)
