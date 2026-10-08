"""Florida catalog: term cleaning, budget matching, the curated budgets file and the built catalog."""
import json
from pathlib import Path

import pytest
import yaml

from publicart.florida import BUDGET_KINDS, OUT, key, term, terms

BUDGETS = Path(__file__).resolve().parents[1] / "florida_budgets.yaml"


def test_archive_terms_lose_their_qualifiers():
    assert term("bronze (metal)") == "bronze" and term("paintings (visual works)") == "paintings"
    assert terms(["steel (alloy)", "steel", "aluminum (metal)", None]) == "steel, aluminum" and terms([]) is None


def test_budget_keys_ignore_case_accents_punctuation_and_first_names():
    assert key("Café Mural #2", "José Álvarez") == key("cafe mural 2", "Alvarez") == "cafe mural 2|alvarez"
    assert key("Wave", "Ann Smith") != key("Wave", "Bob Jones")


@pytest.mark.skipif(not BUDGETS.exists(), reason="no curated budgets yet")
def test_budgets_are_sourced_and_labelled():
    for b in yaml.safe_load(BUDGETS.read_text(encoding="utf-8"))["budgets"]:
        assert b["amount_usd"] > 0 and b["kind"] in BUDGET_KINDS, b["title"]
        assert str(b["source_url"]).startswith("http"), b["title"]
        assert not any(d in b["source_url"] for d in ("publicartarchive.org", "callforentry.org", "wearecreativewest.org", "nyfa.org", "graffitistreet")), b["title"]


@pytest.mark.skipif(not OUT.exists(), reason="Florida catalog not built")
def test_florida_catalog_is_facts_only_and_in_florida():
    pkg = json.loads(OUT.read_text(encoding="utf-8"))
    cols, rows = pkg["works"]["cols"], pkg["works"]["rows"]
    assert len(rows) > 1000 and len({r[0] for r in rows}) == len(rows)
    assert "description" not in cols and all(len(r) == len(cols) for r in rows)
    c = {k: i for i, k in enumerate(cols)}
    for r in rows:
        assert -87.7 <= r[c["lon"]] <= -79.8 and 24.3 <= r[c["lat"]] <= 31.1, r[0]
        assert r[c["url"]].startswith("https://www.publicartarchive.org/art/") and r[c["url"]].endswith("/" + r[0]), r[0]
        assert (r[c["budget"]] is None) == (r[c["budget_source"]] is None), r[0]           # every budget keeps its source
    assert sum(r[c["county"]] is not None for r in rows) >= 0.98 * len(rows)
