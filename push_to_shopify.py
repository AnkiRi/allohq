#!/usr/bin/env python3
"""
Push mock data from Excel files to Shopify store via Admin REST API.

Steps:
  1. Create products from Hero_Master + SKU_Master (119 heroes, 409 SKU variants)
  2. Create customers — top 2000 by total spend (extracted from order sheets)
  3. Create orders — most recent 2000 orders referencing created products/customers

Rate limit: 2 req/sec (Shopify REST), handles 429 with exponential back-off.
"""

import time
import math
import json
import re
import sys
import os
from datetime import datetime, timezone

import requests
import pandas as pd

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SHOP = os.environ.get("SHOPIFY_SHOP", "allo-test-5.myshopify.com")
TOKEN = os.environ.get("SHOPIFY_ADMIN_TOKEN")
if not TOKEN:
    sys.exit("Set SHOPIFY_ADMIN_TOKEN (Shopify Admin API access token) before running.")
API_VER = "2024-01"
BASE_URL = f"https://{SHOP}/admin/api/{API_VER}"

HEADERS = {
    "X-Shopify-Access-Token": TOKEN,
    "Content-Type": "application/json",
}

RATE_LIMIT_SLEEP = 0.6   # ~1.6 req/sec — safely under the 2/sec REST limit
# Development store order API limit: ~4/min. Use 16s gap = 3.75/min to stay safe.
ORDER_RATE_SLEEP  = 16.0
MAX_RETRIES = 5

# Limits for customers and orders (products: ALL)
CUSTOMER_LIMIT = 2000
ORDER_LIMIT    = 500

FILE1 = "/Users/ujjawalasthana/allohq/Mock Orders 1.xlsx"
FILE2 = "/Users/ujjawalasthana/allohq/Mock Orders 2.xlsx"


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def shopify_get(path, params=None):
    url = f"{BASE_URL}{path}"
    for attempt in range(MAX_RETRIES):
        time.sleep(RATE_LIMIT_SLEEP)
        resp = requests.get(url, headers=HEADERS, params=params)
        if resp.status_code == 429:
            wait = 2 ** attempt
            print(f"  [429] Rate limited — sleeping {wait}s")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError(f"GET {path} failed after {MAX_RETRIES} retries")


def shopify_post(path, payload):
    url = f"{BASE_URL}{path}"
    for attempt in range(MAX_RETRIES):
        time.sleep(RATE_LIMIT_SLEEP)
        resp = requests.post(url, headers=HEADERS, json=payload)
        if resp.status_code == 429:
            retry_after = float(resp.headers.get("Retry-After", 2 ** attempt))
            wait = max(retry_after, 2 ** attempt)
            print(f"  [429] Rate limited — sleeping {wait:.1f}s")
            time.sleep(wait)
            continue
        if resp.status_code in (200, 201):
            return resp.json()
        # Non-retriable error — log and return None
        print(f"  [ERROR {resp.status_code}] POST {path}: {resp.text[:300]}")
        return None
    print(f"  [FAIL] POST {path} failed after {MAX_RETRIES} retries")
    return None


def shopify_post_no_sleep(path, payload):
    """Like shopify_post but without the initial sleep (caller handles timing).
    On 429 for orders (dev store limit), waits 65 seconds (1 full minute + buffer).
    """
    url = f"{BASE_URL}{path}"
    for attempt in range(MAX_RETRIES):
        resp = requests.post(url, headers=HEADERS, json=payload)
        if resp.status_code == 429:
            # Check if it's the order-specific rate limit message
            body = resp.text
            if "order API rate limit" in body:
                wait = 65  # wait a full minute for dev store order limit reset
            else:
                retry_after = float(resp.headers.get("Retry-After", 2 ** (attempt + 1)))
                wait = max(retry_after, 2 ** (attempt + 1))
            print(f"  [429] Rate limited (attempt {attempt+1}) — sleeping {wait:.1f}s")
            time.sleep(wait)
            continue
        if resp.status_code in (200, 201):
            return resp.json()
        print(f"  [ERROR {resp.status_code}] POST {path}: {resp.text[:300]}")
        return None
    print(f"  [FAIL] POST {path} failed after {MAX_RETRIES} retries")
    return None


# ---------------------------------------------------------------------------
# 0. Load Excel data
# ---------------------------------------------------------------------------

def load_data():
    print("\n=== Loading Excel data ===")
    xl1 = pd.ExcelFile(FILE1)
    xl2 = pd.ExcelFile(FILE2)

    hero_df = xl1.parse("Hero_Master")
    sku_df  = xl1.parse("SKU_Master")

    print(f"  Hero_Master: {len(hero_df)} rows")
    print(f"  SKU_Master:  {len(sku_df)} rows")

    order_sheets = {
        "Orders_2023":   xl1.parse("Orders_2023"),
        "Orders_2024":   xl1.parse("Orders_2024"),
        "Orders_2025_1": xl1.parse("Orders_2025_1"),
        "Orders_2025_2": xl2.parse("Orders_2025_2"),
        "Orders_2026":   xl2.parse("Orders_2026"),
    }
    for sheet, df in order_sheets.items():
        print(f"  {sheet}: {len(df)} rows")

    all_orders = pd.concat(list(order_sheets.values()), ignore_index=True)
    print(f"  Total order rows: {len(all_orders)}")
    return hero_df, sku_df, all_orders


# ---------------------------------------------------------------------------
# 1. Create Products
# ---------------------------------------------------------------------------

def fetch_existing_products():
    """Return dict of title -> {id, variants: {sku -> variant_id}}."""
    existing = {}
    page_info = None
    while True:
        params = {"limit": 250, "fields": "id,title,variants"}
        if page_info:
            params["page_info"] = page_info
        data = shopify_get("/products.json", params=params)
        for p in data.get("products", []):
            variants_map = {v["sku"]: v["id"] for v in p.get("variants", []) if v.get("sku")}
            existing[p["title"]] = {"id": p["id"], "variants": variants_map}
        # Pagination: Shopify uses Link header
        # We re-request via simple params since we have < 250 existing products
        break
    print(f"  Existing products in store: {len(existing)}")
    return existing


def build_product_payloads(hero_df, sku_df):
    """Build list of Shopify product payloads grouped by Hero."""
    products = []
    for _, hero in hero_df.iterrows():
        hero_name = str(hero["Hero Product"]).strip()
        # Get all SKUs for this hero
        skus = sku_df[sku_df["Hero"] == hero_name].copy()

        variants = []
        for _, sku_row in skus.iterrows():
            sku_code = str(sku_row["Variant SKU"]).strip()
            price    = float(sku_row["Avg_Selling_Price"]) if pd.notna(sku_row["Avg_Selling_Price"]) else 0.0
            variants.append({
                "option1":             sku_code,   # must match options field
                "sku":                 sku_code,
                "price":               f"{price:.2f}",
                "fulfillment_service": "manual",
                "taxable":             True,
            })

        if not variants:
            # Fallback — one default variant using hero avg price
            hero_avg = float(hero.get("Avg_Selling_Price", 0)) if pd.notna(hero.get("Avg_Selling_Price")) else 0.0
            variants = [{
                "option1": "Default",
                "price":   f"{hero_avg:.2f}",
                "taxable": True,
            }]

        payload = {
            "product": {
                "title":        hero_name,
                "product_type": "Health & Wellness",
                "vendor":       "HealthifyMe",
                "status":       "active",
                "options":      [{"name": "SKU"}],
                "variants":     variants,
            }
        }
        products.append((hero_name, payload))

    return products


def create_products(hero_df, sku_df):
    print("\n=== Step 1: Creating Products ===")
    existing = fetch_existing_products()

    payloads = build_product_payloads(hero_df, sku_df)
    print(f"  Products to create: {len(payloads)} heroes with {sum(len(p[1]['product']['variants']) for p in payloads)} total variants")

    # Map: sku -> shopify_variant_id  (for order creation later)
    sku_to_variant_id = {}

    # Populate from existing products first
    for title, info in existing.items():
        for sku, vid in info["variants"].items():
            sku_to_variant_id[sku] = vid

    created_count = 0
    skipped_count = 0
    error_count   = 0

    for i, (hero_name, payload) in enumerate(payloads):
        if hero_name in existing:
            skipped_count += 1
            # Still populate sku map from existing
            for sku, vid in existing[hero_name]["variants"].items():
                sku_to_variant_id[sku] = vid
            if (i + 1) % 20 == 0:
                print(f"  Progress: {i+1}/{len(payloads)} (skipping existing)")
            continue

        result = shopify_post("/products.json", payload)
        if result and "product" in result:
            prod = result["product"]
            created_count += 1
            for v in prod.get("variants", []):
                if v.get("sku"):
                    sku_to_variant_id[v["sku"]] = v["id"]
        else:
            error_count += 1

        if (i + 1) % 10 == 0 or (i + 1) == len(payloads):
            print(f"  Progress: {i+1}/{len(payloads)} products | created={created_count} skipped={skipped_count} errors={error_count}")

    print(f"\n  Product summary: created={created_count}, skipped={skipped_count}, errors={error_count}")
    print(f"  SKU->VariantID mappings: {len(sku_to_variant_id)}")
    return sku_to_variant_id


# ---------------------------------------------------------------------------
# 2. Create Customers
# ---------------------------------------------------------------------------

def extract_customers(orders_df, limit=CUSTOMER_LIMIT):
    """Extract top customers by total spend from order data."""
    print(f"\n  Extracting unique customers from {len(orders_df)} order rows...")

    # Drop rows without email
    orders_df = orders_df.dropna(subset=["Email"])

    # Aggregate spend per email (use first-row data for profile)
    # Group by Name (order) first to get unique order totals
    order_totals = (
        orders_df.groupby("Name", group_keys=False)
        .first()
        .reset_index()
    )

    # Customer spend
    cust_spend = (
        order_totals.groupby("Email")["Total"]
        .sum()
        .reset_index()
        .rename(columns={"Total": "total_spend"})
        .sort_values("total_spend", ascending=False)
    )

    # First-row profile per email from raw data
    profile = orders_df.groupby("Email").first().reset_index()

    cust_df = cust_spend.merge(profile, on="Email", how="left")
    cust_df = cust_df.head(limit)
    print(f"  Unique customers found: {len(cust_df)} (capped at {limit})")
    return cust_df


def split_name(full_name):
    if pd.isna(full_name) or str(full_name).strip() == "":
        return "Unknown", "Customer"
    parts = str(full_name).strip().split(" ", 1)
    first = parts[0]
    last  = parts[1] if len(parts) > 1 else ""
    return first, last


def clean_phone(raw):
    """Convert a raw phone value (float, int, or string) to E.164 format, or None."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    # Handle float stored numbers like 1111120937.0
    if isinstance(raw, (int, float)):
        digits = str(int(raw))
    else:
        digits = re.sub(r"[^\d]", "", str(raw))
    if not digits:
        return None
    # Take last 10 digits as Indian mobile
    digits = digits[-10:]
    if len(digits) != 10:
        return None
    # Must start with 6-9 for Indian mobile
    if digits[0] not in "6789":
        return None
    return f"+91{digits}"


def fetch_existing_customers():
    """Return dict of email -> customer_id for all existing customers (all pages)."""
    email_map = {}
    params = {"limit": 250, "fields": "id,email"}
    page = 0
    while True:
        data = shopify_get("/customers.json", params=params)
        custs = data.get("customers", [])
        for c in custs:
            if c.get("email"):
                email_map[c["email"].lower()] = c["id"]
        page += 1
        if len(custs) < 250:
            break
        # Use since_id pagination for customers
        last_id = custs[-1]["id"]
        params = {"limit": 250, "fields": "id,email", "since_id": last_id}
    print(f"  Existing customers in store: {len(email_map)} (fetched {page} pages)")
    return email_map


def create_customers(orders_df):
    print("\n=== Step 2: Creating Customers ===")
    existing_map = fetch_existing_customers()  # email -> customer_id

    cust_df = extract_customers(orders_df, limit=CUSTOMER_LIMIT)

    # Map email -> shopify customer_id (start with existing)
    email_to_customer_id = dict(existing_map)

    created_count = 0
    skipped_count = 0
    error_count   = 0

    for i, row in cust_df.iterrows():
        email = str(row["Email"]).strip().lower()

        if email in existing_map:
            skipped_count += 1
            continue

        first, last = split_name(row.get("Billing Name"))
        phone = clean_phone(row.get("Billing Phone"))

        accepts_mkt = str(row.get("Accepts Marketing", "no")).lower() == "yes"

        payload = {
            "customer": {
                "email":               email,
                "first_name":          first,
                "last_name":           last,
                "accepts_marketing":   accepts_mkt,
                "currency":            "INR",
            }
        }
        if phone:
            payload["customer"]["phone"] = phone

        # Address
        city     = str(row.get("Billing City", "")).strip()
        province = str(row.get("Billing Province", "")).strip()
        country  = str(row.get("Billing Country", "")).strip() or "IN"
        zipcode  = str(row.get("Billing Zip", "")).strip()

        if city or province:
            payload["customer"]["addresses"] = [{
                "first_name": first,
                "last_name":  last,
                "city":       city if city else None,
                "province":   province if province and province != "nan" else None,
                "country":    country if country and country != "nan" else "IN",
                "zip":        zipcode if zipcode and zipcode != "nan" else None,
                "phone":      phone,
            }]

        result = shopify_post("/customers.json", payload)
        if result and "customer" in result:
            created_count += 1
            email_to_customer_id[email] = result["customer"]["id"]
        else:
            error_count += 1

        if (created_count + error_count) % 100 == 0 and (created_count + error_count) > 0:
            print(f"  Progress: processed={created_count+error_count} | created={created_count} skipped={skipped_count} errors={error_count}")

    print(f"\n  Customer summary: created={created_count}, skipped={skipped_count}, errors={error_count}")
    return email_to_customer_id


# ---------------------------------------------------------------------------
# 3. Create Orders
# ---------------------------------------------------------------------------

def parse_created_at(val):
    """Parse Shopify-style datetime string to ISO 8601 UTC."""
    if pd.isna(val):
        return None
    s = str(val).strip()
    # Format: "2024-01-01 06:14:06 +0530"
    for fmt in ("%Y-%m-%d %H:%M:%S %z", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
    return None


def normalize_financial_status(status):
    valid = {"pending", "authorized", "partially_paid", "paid", "partially_refunded", "refunded", "voided"}
    if pd.isna(status):
        return "paid"
    s = str(status).strip().lower().replace(" ", "_")
    # "cancelled" is not a valid financial_status — map to voided
    if s == "cancelled":
        return "voided"
    return s if s in valid else "paid"


def normalize_fulfillment_status(status):
    valid = {"fulfilled", "null", "partial", "restocked"}
    if pd.isna(status) or str(status).strip().lower() in ("", "unfulfilled", "nan"):
        return None   # Shopify treats None as unfulfilled
    s = str(status).strip().lower()
    return s if s in valid else None


def build_orders(orders_df, sku_to_variant_id, email_to_customer_id, limit=ORDER_LIMIT):
    """
    Build order payloads from the most-recent orders in the dataset.
    Group rows by order Name (one Shopify order per Name).
    Select most-recent `limit` orders.
    """
    print(f"\n  Building order payloads from {len(orders_df)} rows...")

    # Parse created_at for sorting
    orders_df = orders_df.copy()
    orders_df["_created_dt"] = pd.to_datetime(
        orders_df["Created at"], errors="coerce", utc=True
    )

    # Pick one representative row per order Name for header info + all line-item rows
    order_names = (
        orders_df.dropna(subset=["Name"])
        .groupby("Name")["_created_dt"]
        .max()
        .reset_index()
        .sort_values("_created_dt", ascending=False)
        .head(limit)
    )

    selected_names = set(order_names["Name"].tolist())
    subset = orders_df[orders_df["Name"].isin(selected_names)]

    payloads = []
    for name, group in subset.groupby("Name"):
        first_row = group.iloc[0]

        created_at = parse_created_at(first_row.get("Created at"))
        if not created_at:
            continue

        fin_status = normalize_financial_status(first_row.get("Financial Status"))
        ful_status = normalize_fulfillment_status(first_row.get("Fulfillment Status"))
        email      = str(first_row.get("Email", "")).strip().lower()
        currency   = str(first_row.get("Currency", "INR")).strip() or "INR"

        # Build line items
        line_items = []
        for _, row in group.iterrows():
            sku      = str(row.get("Lineitem sku", "")).strip()
            qty      = int(row["Lineitem quantity"]) if pd.notna(row.get("Lineitem quantity")) else 1
            price    = float(row["Lineitem price"]) if pd.notna(row.get("Lineitem price")) else 0.0
            item_name = str(row.get("Lineitem name", sku)).strip()

            li = {
                "title":    item_name if item_name and item_name != "nan" else sku,
                "quantity": qty,
                "price":    f"{price:.2f}",
                "taxable":  True,
            }

            variant_id = sku_to_variant_id.get(sku)
            if variant_id:
                li["variant_id"] = variant_id
            elif sku and sku != "nan":
                li["sku"] = sku

            line_items.append(li)

        if not line_items:
            continue

        # Address
        def addr(row, prefix):
            city     = str(row.get(f"{prefix} City", "")).strip()
            province = str(row.get(f"{prefix} Province", "")).strip()
            country  = str(row.get(f"{prefix} Country", "IN")).strip()
            zipcode  = str(row.get(f"{prefix} Zip", "")).strip()
            name_val = str(row.get(f"{prefix} Name", "")).strip()
            phone = clean_phone(row.get(f"{prefix} Phone"))

            if not city and not province:
                return None

            first_n, last_n = split_name(name_val)
            a = {
                "first_name": first_n,
                "last_name":  last_n,
                "city":       city or None,
                "province":   province if province and province != "nan" else None,
                "country":    country if country and country != "nan" else "IN",
                "zip":        zipcode if zipcode and zipcode != "nan" else None,
            }
            if phone:
                a["phone"] = phone
            return a

        billing  = addr(first_row, "Billing")
        shipping = addr(first_row, "Shipping")

        order_payload = {
            "order": {
                "name":              name,
                "email":             email if email and email != "nan" else None,
                "currency":          currency,
                "financial_status":  fin_status,
                "line_items":        line_items,
                "created_at":        created_at,
                "processed_at":      created_at,
                "send_receipt":      False,
                "send_fulfillment_receipt": False,
            }
        }

        if ful_status:
            order_payload["order"]["fulfillment_status"] = ful_status

        if billing:
            order_payload["order"]["billing_address"] = billing
        if shipping:
            order_payload["order"]["shipping_address"] = shipping

        # Customer link
        customer_id = email_to_customer_id.get(email) if email else None
        if customer_id:
            order_payload["order"]["customer"] = {"id": customer_id}

        # Discount
        discount_code   = first_row.get("Discount Code")
        discount_amount = first_row.get("Discount Amount")
        if pd.notna(discount_code) and pd.notna(discount_amount) and float(discount_amount) > 0:
            order_payload["order"]["discount_codes"] = [{
                "code":   str(discount_code).strip(),
                "amount": f"{float(discount_amount):.2f}",
                "type":   "fixed_amount",
            }]

        # Tags
        tags = []
        risk = str(first_row.get("Risk Level", "")).strip()
        if risk and risk != "nan":
            tags.append(f"risk:{risk}")
        source = str(first_row.get("Source", "")).strip()
        if source and source != "nan":
            tags.append(f"source:{source}")
        if tags:
            order_payload["order"]["tags"] = ", ".join(tags)

        payloads.append(order_payload)

    print(f"  Order payloads built: {len(payloads)}")
    return payloads


def fetch_existing_order_names():
    """Return set of order names (like '#1001') already in Shopify.
    Uses created_at_min/max pagination since since_id doesn't work well with all statuses.
    """
    names = set()
    # Fetch in pages using since_id ascending
    params = {"limit": 250, "status": "any", "fields": "id,name", "order": "id asc"}
    while True:
        data = shopify_get("/orders.json", params=params)
        orders = data.get("orders", [])
        for o in orders:
            if o.get("name"):
                names.add(o["name"])
        if len(orders) < 250:
            break
        last_id = orders[-1]["id"]
        params = {"limit": 250, "status": "any", "fields": "id,name", "order": "id asc", "since_id": last_id}
    print(f"  Existing orders in store: {len(names)}")
    return names


def create_orders(orders_df, sku_to_variant_id, email_to_customer_id):
    print("\n=== Step 3: Creating Orders ===")

    existing_names = fetch_existing_order_names()
    payloads = build_orders(orders_df, sku_to_variant_id, email_to_customer_id, limit=ORDER_LIMIT)

    created_count = 0
    skipped_count = 0
    error_count   = 0
    order_start   = time.time()

    for i, payload in enumerate(payloads):
        order_name = payload["order"].get("name", "")
        if order_name in existing_names:
            skipped_count += 1
            continue

        time.sleep(ORDER_RATE_SLEEP)  # throttle to ~3.75/min for dev store limit
        result = shopify_post_no_sleep("/orders.json", payload)
        if result and "order" in result:
            created_count += 1
        else:
            error_count += 1

        total_done = created_count + error_count
        if total_done > 0 and total_done % 5 == 0:
            elapsed   = time.time() - order_start
            rate      = total_done / elapsed * 60
            remaining = len(payloads) - i - 1
            eta_min   = remaining / max(rate, 0.01)
            print(f"  Progress: {i+1}/{len(payloads)} | created={created_count} skipped={skipped_count} errors={error_count} | {rate:.1f}/min | ETA {eta_min:.0f}min")

    print(f"\n  Order summary: created={created_count}, skipped={skipped_count}, errors={error_count}")
    return created_count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    start = time.time()
    print("=" * 60)
    print("Shopify Mock Data Push Script")
    print(f"Store: {SHOP}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Load
    hero_df, sku_df, all_orders_df = load_data()

    # Step 1: Products
    sku_to_variant_id = create_products(hero_df, sku_df)

    # Step 2: Customers — skip if already at limit
    r = requests.get(f"{BASE_URL}/customers/count.json", headers=HEADERS)
    current_customers = r.json().get("count", 0)
    if current_customers >= CUSTOMER_LIMIT:
        print(f"\n=== Step 2: Skipping customer creation ({current_customers} already in store) ===")
        # Still build email->id map for order linking
        email_to_customer_id = fetch_existing_customers()
    else:
        email_to_customer_id = create_customers(all_orders_df)

    # Step 3: Orders
    orders_created = create_orders(all_orders_df, sku_to_variant_id, email_to_customer_id)

    elapsed = time.time() - start
    print("\n" + "=" * 60)
    print("FINAL SUMMARY")
    print("=" * 60)
    print(f"  Products: {len(sku_to_variant_id)} SKU->VariantID mappings created/found")
    print(f"  Customers: {len(email_to_customer_id)} customers in store")
    print(f"  Orders: {orders_created} orders created")
    print(f"  Total time: {elapsed:.0f}s ({elapsed/60:.1f} min)")
    print("=" * 60)


if __name__ == "__main__":
    main()
