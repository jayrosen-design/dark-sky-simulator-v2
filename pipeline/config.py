"""Seed and county-package loaders (the only place the pipeline reads seed/ and counties/)."""
from __future__ import annotations

import csv
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "seed"
COUNTIES = ROOT / "counties"


def _yaml(p: Path):
    return yaml.safe_load(p.read_text(encoding="utf-8"))


def load_region():
    return _yaml(COUNTIES / "region" / "manifest.yaml")


def load_county(fips: str):
    return _yaml(COUNTIES / fips / "manifest.yaml")


def load_seed():
    engine = _yaml(SEED / "engine_defaults.yaml")
    econ = _yaml(SEED / "econ_defaults.yaml")
    with open(SEED / "spd_class.csv", encoding="utf-8") as f:
        spd = {r["code"]: r for r in csv.DictReader(f)}
    with open(SEED / "bortle_scale.csv", encoding="utf-8") as f:
        bortle = list(csv.DictReader(f))
    with open(SEED / "certification_tier.csv", encoding="utf-8") as f:
        cert = list(csv.DictReader(f))
    return {
        "engine": engine, "econ": econ, "spd": spd, "bortle": bortle, "certification": cert,
        "mcda": _yaml(SEED / "mcda_defaults.yaml"),
        "overlay": _yaml(SEED / "overlay_rules.yaml"),
        "presets": _yaml(SEED / "presets.yaml"),
        "catalog": _yaml(SEED / "fixture_catalog.yaml"),
    }


def p(seed, key):
    """Value of an engine_defaults param."""
    return seed["engine"]["params"][key]["value"]
