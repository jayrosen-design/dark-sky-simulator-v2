"""Traffic Insights (WildSight) crash model and data package."""
import json
import math
from pathlib import Path

import numpy as np
import pytest

from pipeline.wildsight import captured, eb, fit_nb, group_of, nb_nll, parse_lanes, parse_speed

DATA = Path(__file__).resolve().parents[1] / "web" / "public" / "data"


def test_negative_binomial_fit_recovers_known_coefficients():
    rng = np.random.default_rng(3)
    n = 40000
    X = np.column_stack([np.ones(n), rng.normal(size=n), rng.uniform(size=n)])
    beta, alpha = np.array([-1.0, 0.6, 0.8]), 0.7
    mu = np.exp(X @ beta)
    lam = rng.gamma(1 / alpha, alpha * mu)          # gamma-Poisson mixture = NB2
    y = rng.poisson(lam)
    b, a, res = fit_nb(X, y, np.zeros(n))
    assert res.success
    # A maximum-likelihood fit is at least as likely as the true parameters, and close to them at this sample size.
    assert nb_nll(np.r_[b, math.log(a)], X, y, np.zeros(n)) <= nb_nll(np.r_[beta, math.log(alpha)], X, y, np.zeros(n)) + 1e-6
    assert np.allclose(b, beta, atol=0.06)
    assert abs(a - alpha) < 0.1


def test_empirical_bayes_leans_on_the_model_when_the_record_is_thin():
    # alpha -> 0: no overdispersion, trust the model; huge alpha: trust the observed count.
    assert eb(np.array([2.0]), np.array([10.0]), 1e-9)[0] == pytest.approx(2.0)
    assert eb(np.array([2.0]), np.array([10.0]), 1e9)[0] == pytest.approx(10.0, rel=1e-6)
    mid = eb(np.array([2.0]), np.array([10.0]), 1.0)[0]
    assert 2.0 < mid < 10.0


def test_capture_share_counts_crashes_on_the_top_ranked_length():
    score = np.array([5.0, 1.0, 3.0, 0.0])
    length = np.array([1.0, 1.0, 1.0, 1.0])
    test = np.array([6.0, 1.0, 3.0, 0.0])
    assert captured(score, length, test, 0.25) == pytest.approx(0.6)
    assert captured(score, length, test, 0.5) == pytest.approx(0.9)


def test_species_groups_and_tag_parsing():
    assert group_of({"Species_ID": "deer", "Species_Class": "Wildlife"}) == 0
    assert group_of({"Species_ID": "bear", "Species_Class": "Wildlife"}) == 1
    assert group_of({"Species_ID": "wild pig", "Species_Class": "Wildlife"}) == 2
    assert group_of({"Species_ID": "dog", "Species_Class": "Domestic"}) == 3
    assert group_of({"Species_ID": "cattle", "Species_Class": "Livestock"}) == 4
    assert group_of({"Species_ID": "multiple", "Species_Class": "Other"}) == 5
    assert parse_speed("55 mph") == 55 and parse_speed("45") == 45
    assert parse_speed("80 km/h") == pytest.approx(49.7, abs=0.1) and parse_speed("") is None
    assert parse_lanes("2;4") == 2 and parse_lanes("") is None


META = json.loads((DATA / "wildsight.json").read_text()) if (DATA / "wildsight.json").exists() else None


@pytest.mark.skipif(META is None, reason="run python -m pipeline.wildsight first")
def test_package_is_consistent_and_the_ranking_beats_chance():
    roads = json.loads((DATA / "wildsight_roads.json").read_text())
    cols = roads["cols"]
    rows = roads["rows"]
    km = sum(r[cols.index("km")] for r in rows)
    crashes = sum(r[cols.index("crashes")] for r in rows)
    assert km == pytest.approx(META["network_km"], rel=1e-3)
    assert crashes == META["crashes"]["on_network"] <= META["crashes"]["bbox"]
    assert all(sum(r[cols.index("groups")]) == r[cols.index("crashes")] for r in rows)
    eb_total = sum(r[cols.index("eb_per_year")] for r in rows)
    # Empirical Bayes keeps the network total close to the observed yearly average.
    assert eb_total == pytest.approx(crashes / 11, rel=0.15)
    bt = META["backtest"]["share_of_test_crashes_on_top_miles"]
    assert bt["eb"]["top10"] > 2 * bt["length"]["top10"]
    assert META["model"]["converged"]
    assert not math.isnan(META["model"]["alpha"])
