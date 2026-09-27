"""Physics engine tests (PRD 2.1, 6.1-6.2). Pure functions only."""
import numpy as np
import pytest

from engine import bortle, garstang, mcda, spectral
from engine.flux import effective_flux
from engine.grid import Grid, accumulate_points, convolve, distance_transform_km

ATMS = [garstang.Atmosphere(3.5, 0.8), garstang.Atmosphere(2.5, 0.8)]


def test_natural_background_is_0_17_mcd():
    assert bortle.luminance_from_mag(22.0) == pytest.approx(1.74e-4, rel=0.01)  # 6.1: 0.17 mcd m^-2


def test_mag_luminance_round_trip():
    for m in (17.5, 19.0, 21.2, 22.0):
        assert bortle.mag_from_luminance(bortle.luminance_from_mag(m)) == pytest.approx(m)


def test_bortle_thresholds_clear_dark_sky():
    t = [(1, 21.99), (2, 21.89), (3, 21.69), (4, 20.49), (5, 19.50), (6, 18.94), (7, 18.38), (8, None)]
    assert [bortle.bortle_class(m, t) for m in (22.0, 21.9, 21.7, 21.0, 20.0, 19.0, 18.5, 18.0)] == [1, 2, 3, 4, 5, 6, 7, 8]


def test_direct_term_follows_walkers_law():
    d = np.array([10.0, 50.0])
    b = np.mean([garstang.zenith_luminance_per_lm(d * 1000, a, "direct") for a in ATMS], axis=0)
    slope = np.log(b[1] / b[0]) / np.log(5)
    assert -2.8 < slope < -2.2  # Walker's law ~ D^-2.5


def test_reflected_light_decays_faster_than_direct_uplight():
    """Shielding (removing near-horizontal uplight) matters most for distant skyglow (PRD 2.1)."""
    d = np.array([5.0, 60.0]) * 1000
    dr = garstang.zenith_luminance_per_lm(d, ATMS[0], "direct")
    rf = garstang.zenith_luminance_per_lm(d, ATMS[0], "reflected")
    assert dr[1] / dr[0] > rf[1] / rf[0]


def test_kernel_monotone_positive():
    d = np.geomspace(0.1, 100, 50) * 1000
    for term in ("direct", "reflected"):
        b = garstang.zenith_luminance_per_lm(d, ATMS[0], term)
        assert np.all(b > 0) and np.all(np.diff(b) < 0)


@pytest.mark.parametrize("term", ["direct", "reflected"])
def test_fitted_kernel_within_10pct_of_numeric(term):
    fit = garstang.fit_kernel(term, ATMS)
    assert fit.max_rel_error < 0.10
    assert fit(150.0) == 0.0  # beyond the 100 km cutoff


def test_kernel_image_symmetric_and_peaked():
    fit = garstang.fit_kernel("direct", ATMS, d_max_km=20)
    img = garstang.kernel_image(fit, 0.8, 0.9)
    assert np.allclose(img, img[::-1, ::-1])
    assert img.argmax() == img.size // 2


def test_turbidity_brightens_near_and_dims_far():
    near, far = 500.0, 80_000.0  # crossover sits near 1 km for reflected light
    hazy, clear = garstang.Atmosphere(5.0), garstang.Atmosphere(2.0)
    assert garstang.zenith_luminance_per_lm(near, hazy, "reflected") > garstang.zenith_luminance_per_lm(near, clear, "reflected")
    assert garstang.zenith_luminance_per_lm(far, hazy, "direct") < garstang.zenith_luminance_per_lm(far, clear, "direct")


def test_spectral_monochromatic_555_is_unity():
    scatter = spectral.band_scatter_ratios("direct", ATMS)
    assert scatter[2] == pytest.approx(1.0)
    assert scatter[0] > scatter[1] > 1.0 > scatter[4]  # blue scatters more
    f = spectral.skyglow_factors({"G": np.array([0, 0, 1.0, 0, 0])}, {"direct": scatter})
    assert f["direct"]["V"]["G"] == pytest.approx(1.0)


def test_scotopic_order_matches_seed():
    from pipeline.config import load_seed
    seed = load_seed()
    bands = {k: np.array([float(r[b]) for b in spectral.BAND_KEYS]) for k, r in seed["spd"].items()}
    scatter = {"direct": spectral.band_scatter_ratios("direct", ATMS)}
    f = spectral.skyglow_factors(bands, scatter)["direct"]["scotopic"]
    seed_order = sorted(seed["spd"], key=lambda k: float(seed["spd"][k]["scotopic_factor"]))
    ours = sorted(f, key=f.get)
    assert ours[:2] == seed_order[:2] and ours[-1] in seed_order[-2:]


def test_u0_fixture_has_no_direct_uplight():
    ulor = {0: 0.0, 3: 0.06}
    spec = {"direct": {"V": {"LED3000": 1.0}}, "reflected": {"V": {"LED3000": 1.0}}}
    stock = {"n": 10, "cohorts": [{"spd": "LED3000", "u": 0, "frac": 1.0, "lm": 1000}]}
    assert effective_flux(stock, "direct", "V", ulor, 0.15, spec) == 0.0
    assert effective_flux(stock, "reflected", "V", ulor, 0.15, spec) == pytest.approx(10 * 1000 * 0.15)


def test_grid_helpers():
    g = Grid.from_bounds(-83.0, -82.0, 29.0, 30.0, 0.1)
    assert (g.nx, g.ny) == (10, 10)
    acc = accumulate_points(g, [-82.95, -82.95, -82.05, -90], [29.95, 29.95, 29.05, 29.5])
    assert acc[0, 0] == 2 and acc[-1, -1] == 1 and acc.sum() == 3
    m = np.zeros((10, 10), bool)
    m[5, 5] = True
    d = distance_transform_km(g, m)
    assert d[5, 5] == 0 and d[5, 6] == pytest.approx(g.dx_km)
    k = np.zeros((3, 3))
    k[1, 1] = 1
    assert np.allclose(convolve(acc, k), acc)


def test_mcda_normalizations():
    assert mcda.linear(21.25, 20.5, 22.0) == pytest.approx(0.5)
    assert mcda.logistic(30, 30, 8) == pytest.approx(0.5)
    assert mcda.plateau_linear(2, 3, 15) == 1.0 and mcda.plateau_linear(15, 3, 15) == 0.0
    s = mcda.wlc({"a": np.array([1.0]), "b": np.array([0.0])}, {"a": 1, "b": 3})
    assert s[0] == pytest.approx(0.25)
