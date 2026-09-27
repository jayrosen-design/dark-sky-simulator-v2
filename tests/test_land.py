"""Land and facility pricing for Module B (pipeline/land.py)."""
import numpy as np
import pytest

from pipeline.land import CATS, PUBLIC, owner_category, qualified_sales

LP = {"qualified_sale_code": {"value": "01"}, "sale_years": {"value": [2021, 2025]}}


@pytest.mark.parametrize("dor, owner, flag, expected", [
    ("087", "BOARD OF TRUSTEES OF THE INTERNAL IMPROVEMENT TRUST FUND", "T", 6),
    ("059", "S R W M D", "", 8),                        # agency land coded agricultural still counts as public
    ("088", "UNITED STATES OF AMERICA", "F", 7),
    ("086", "LEVY COUNTY BOARD OF COUNTY COMMISSIONERS", "C", 4),
    ("089", "CITY OF CHIEFLAND", "M", 5),
    ("084", "UNIVERSITY OF FLORIDA BOARD OF TRUSTEES", "", 9),
    ("059", "COUNTY LINE FARMS LLC", "", 1),            # private company named "county": stays private agricultural
    ("002", "SMITH JOHN", "", 3),
    ("000", "ACME LAND LLC", "", 2),
    ("082", "SOMETHING PARK", "P", 10),
])
def test_owner_category(dor, owner, flag, expected):
    assert owner_category(dor, owner, flag) == expected


def test_public_categories_are_consistent():
    assert PUBLIC == {4, 5, 6, 7, 8, 9, 10}
    assert set(CATS) == set(range(1, 11))


def _row(price, yr, qual, vi, jv=100_000, acres=10, price2=0, yr2=0, qual2="", vi2=""):
    # ("fips", lon, lat, dor_uc, jv, lnd_val, lnd_sqft, sale_prc1, sale_yr1, qual1, vi1, sale_prc2, sale_yr2, qual2, vi2, ...)
    return ("12075", -82.8, 29.4, "059", jv, jv, acres * 43_560, price, yr, qual, vi, price2, yr2, qual2, vi2, "X", "", "P1", 2025)


def test_qualified_sales_filter():
    rows = [
        _row(120_000, 2023, "01", "V"),              # kept: $12,000/acre
        _row(120_000, 2023, "11", "V"),              # disqualified code
        _row(120_000, 2019, "01", "V"),              # outside the window
        _row(120_000, 2023, "01", "I"),              # improved at sale
        _row(100, 2023, "01", "V"),                  # nominal transfer
        _row(0, 0, "", "", price2=50_000, yr2=2022, qual2="01", vi2="V"),  # second sale used
    ]
    s = qualified_sales(rows, LP)
    assert [round(x[2]) for x in s] == [12_000, 5_000]
    assert s[0][4] == pytest.approx(1.2)          # price / just value
    assert all(np.isfinite(x[2]) for x in s)
