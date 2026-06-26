"""
Seed orders from Mock Orders Excel files into Railway prod database.
Links orders to existing customers by email and products by title/SKU.
"""
import psycopg2
import psycopg2.extras
import openpyxl
from datetime import datetime, timezone
import string
import random
import sys
import os

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("Set DATABASE_URL (Railway Postgres connection string) before running.")
STORE_ID = os.environ.get("STORE_ID", "cmnm004ba0005ii04xa4h5zti")

SHEETS = [
    ("Mock Orders 1.xlsx", "Orders_2023"),
    ("Mock Orders 1.xlsx", "Orders_2024"),
    ("Mock Orders 2.xlsx", "Orders_2025_2"),
    ("Mock Orders 2.xlsx", "Orders_2026"),
]

def cuid():
    """Generate a cuid-like ID."""
    ts = hex(int(datetime.now().timestamp() * 1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=12))
    return f"cm{ts}{rand}"

def parse_dt(val):
    """Parse datetime from Excel — could be string or datetime object."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        # Format: "2023-04-25 13:35:17 +0530"
        return datetime.strptime(str(val).strip(), "%Y-%m-%d %H:%M:%S %z")
    except:
        return None

def map_status(financial_status, fulfillment_status):
    """Map Shopify statuses to our status field."""
    fs = (financial_status or "").lower()
    if fs == "paid":
        fulf = (fulfillment_status or "").lower()
        if fulf == "fulfilled":
            return "fulfilled"
        return "paid"
    if fs == "refunded":
        return "cancelled"
    if fs == "voided":
        return "cancelled"
    if fs == "partially_refunded":
        return "paid"
    return "pending"

def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Build email -> customer_id lookup
    print("Loading customer email map...")
    cur.execute('SELECT id, email FROM customers WHERE "storeId" = %s', (STORE_ID,))
    email_to_cid = {}
    for cid, email in cur.fetchall():
        if email:
            email_to_cid[email.lower()] = cid
    print(f"  {len(email_to_cid)} customers loaded")

    # Build product title -> product_id lookup
    print("Loading product map...")
    cur.execute('SELECT id, title FROM products WHERE "storeId" = %s', (STORE_ID,))
    title_to_pid = {}
    for pid, title in cur.fetchall():
        if title:
            title_to_pid[title.lower()] = pid
    print(f"  {len(title_to_pid)} products loaded")

    # Check existing orders to avoid duplicates
    print("Loading existing order numbers...")
    cur.execute('SELECT "orderNumber" FROM orders WHERE "storeId" = %s', (STORE_ID,))
    existing_orders = set(r[0] for r in cur.fetchall())
    print(f"  {len(existing_orders)} existing orders")

    # Read all order sheets and group line items by order number
    print("\nReading Excel files...")
    orders = {}  # order_number -> {order_data, items: []}

    for fname, sheet_name in SHEETS:
        print(f"  Reading {fname} / {sheet_name}...")
        wb = openpyxl.load_workbook(fname, read_only=True)
        ws = wb[sheet_name]
        headers = None

        for row_num, row in enumerate(ws.iter_rows(values_only=True)):
            if row_num == 0:
                headers = [str(h).strip() if h else "" for h in row]
                continue

            r = dict(zip(headers, row))
            order_num = str(r.get("Name", "")).strip()
            if not order_num:
                continue

            email = (r.get("Email") or "").strip().lower()
            if not email:
                continue

            if order_num not in orders:
                orders[order_num] = {
                    "orderNumber": order_num,
                    "email": email,
                    "externalId": str(int(r["Id"])) if r.get("Id") else order_num,
                    "totalPrice": float(r.get("Total") or 0),
                    "subtotal": float(r.get("Subtotal") or 0),
                    "tax": float(r.get("Taxes") or 0),
                    "shipping": float(r.get("Shipping") or 0),
                    "currency": r.get("Currency") or "INR",
                    "status": map_status(r.get("Financial Status"), r.get("Fulfillment Status")),
                    "createdAt": parse_dt(r.get("Created at")),
                    "items": [],
                }

            # Add line item
            li_name = r.get("Lineitem name")
            li_price = float(r.get("Lineitem price") or 0)
            li_qty = int(float(r.get("Lineitem quantity") or 1))
            li_sku = r.get("Lineitem sku") or ""

            if li_name:
                orders[order_num]["items"].append({
                    "title": str(li_name),
                    "price": li_price,
                    "quantity": li_qty,
                    "sku": str(li_sku),
                })

        wb.close()

    print(f"\n  Total unique orders: {len(orders)}")

    # Filter out existing orders
    new_orders = {k: v for k, v in orders.items() if k not in existing_orders}
    print(f"  New orders to insert: {len(new_orders)}")

    # Insert in batches
    BATCH = 1000
    order_list = list(new_orders.values())
    inserted = 0
    skipped_no_customer = 0
    items_inserted = 0

    for batch_start in range(0, len(order_list), BATCH):
        batch = order_list[batch_start:batch_start + BATCH]
        order_rows = []
        item_rows = []

        for o in batch:
            customer_id = email_to_cid.get(o["email"])
            if not customer_id:
                skipped_no_customer += 1
                continue

            order_id = cuid()
            now = datetime.now(timezone.utc)
            created = o["createdAt"] or now

            order_rows.append((
                order_id,
                STORE_ID,
                customer_id,
                o["externalId"],
                o["orderNumber"],
                o["totalPrice"],
                o["subtotal"],
                o["tax"],
                o["shipping"],
                o["currency"],
                o["status"],
                created,
                now,
            ))

            for item in o["items"]:
                product_id = title_to_pid.get(item["title"].lower(), "")
                if not product_id:
                    # Try matching by "Hero X" pattern from title
                    for key in title_to_pid:
                        if key in item["title"].lower():
                            product_id = title_to_pid[key]
                            break
                if not product_id:
                    product_id = "unknown"

                item_rows.append((
                    cuid(),
                    order_id,
                    product_id,
                    None,  # variantId
                    item["title"],
                    item["quantity"],
                    item["price"],
                ))

        if order_rows:
            # Use RETURNING to know which orders actually got inserted (vs skipped by conflict)
            inserted_ids = set()
            result = psycopg2.extras.execute_values(
                cur,
                """INSERT INTO orders (id, "storeId", "customerId", "externalId", "orderNumber",
                   "totalPrice", subtotal, tax, shipping, currency, status, "createdAt", "updatedAt")
                   VALUES %s ON CONFLICT ("storeId", "externalId") DO NOTHING RETURNING id""",
                order_rows,
                page_size=500,
                fetch=True,
            )
            inserted_ids = set(r[0] for r in result)
            inserted += len(inserted_ids)

            # Only insert items for orders that were actually inserted
            valid_items = [row for row in item_rows if row[1] in inserted_ids]
            if valid_items:
                psycopg2.extras.execute_values(
                    cur,
                    """INSERT INTO order_items (id, "orderId", "productId", "variantId", title, quantity, price)
                       VALUES %s""",
                    valid_items,
                    page_size=500,
                )
                items_inserted += len(valid_items)

        conn.commit()
        pct = min(100, int((batch_start + BATCH) / len(order_list) * 100))
        print(f"  Progress: {pct}% — {inserted} orders, {items_inserted} items inserted", end="\r")

    print(f"\n\nDone!")
    print(f"  Orders inserted: {inserted}")
    print(f"  Order items inserted: {items_inserted}")
    print(f"  Skipped (no matching customer): {skipped_no_customer}")

    # Verify
    cur.execute('SELECT count(*) FROM orders WHERE "storeId" = %s', (STORE_ID,))
    print(f"  Total orders in DB: {cur.fetchone()[0]}")
    cur.execute('SELECT count(*) FROM order_items')
    print(f"  Total order items in DB: {cur.fetchone()[0]}")

    conn.close()

if __name__ == "__main__":
    main()
