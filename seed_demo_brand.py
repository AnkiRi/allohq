"""
Seed ONE coherent demo brand — "Vana Naturals" (Indian plant-based wellness D2C) —
into the local Postgres so every screen in the allo app shows reconciling numbers
for a live investor demo.

Reuses existing store cmm0d6gex00030bdtke78ancx (shopDomain allo-test-5.myshopify.com)
so the Shopify integration still reads "connected", but REPLACES its contradictory
data and rebrands it.

Usage:
  DATABASE_URL=postgresql://postgres:password@localhost:5432/allohq python3 seed_demo_brand.py

The exact coherent dataset (these figures reconcile on every screen):
  customers          : 4,820   (Indian names, valid emails, ~62% acceptsMarketing)
  orders lifetime    : ~13,900 (1,240 in the last 30 days)
  AOV                : ~Rs 1,485
  30-day revenue     : ~Rs 18.4 L
  lifetime revenue   : ~Rs 2.06 Cr
  segments (sum 4820): Champions 470, Loyal Customers 690, Potential Loyalists 540,
                       New Customers 980, At Risk 632, Hibernating 1,010, Lost 498
  at-risk            : 632 everywhere
  AI revenue (30d)   : ~Rs 4.10 L  (order_attributions w/ automationId, attributedAt<=30d)
  AI token cost      : ~$8         (token_usages, claude-sonnet-4-6)
  action_queue       : 4 PENDING on-brand decisions
"""
import os
import sys
import random
import string
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("Set DATABASE_URL before running.")

STORE_ID = "cmm0d6gex00030bdtke78ancx"
WORKSPACE_ID = "cmlxvozgh00000bup4o6fmko6"
SHOP_DOMAIN = "allo-test-5.myshopify.com"

random.seed(20260620)  # deterministic

NOW = datetime.now(timezone.utc)

# ---------------------------------------------------------------------------
# Target figures
# ---------------------------------------------------------------------------
N_CUSTOMERS = 4820
N_ORDERS_30D = 1240          # orders in the last 30 days
N_ORDERS_TOTAL = 13900       # lifetime orders
AOV = 1485.0                 # average order value (rupees)
AI_REVENUE_30D = 410000.0    # AI-attributed revenue last 30 days (rupees)

# Segment plan: counts must sum to 4820.
SEGMENTS = [
    # name,                  count, rfm_total_score, recency, freq, mon
    ("Champions",            470, 14, 5, 5, 4),
    ("Loyal Customers",      690, 10, 4, 4, 3),
    ("Potential Loyalists",  540, 8,  4, 3, 2),
    ("New Customers",        980, 7,  5, 1, 1),
    ("At Risk",              632, 5,  2, 4, 3),
    ("Hibernating",          1010, 4, 2, 2, 2),
    ("Lost",                 498, 2,  1, 1, 1),
]
assert sum(s[1] for s in SEGMENTS) == N_CUSTOMERS, "segment counts must sum to 4820"

# Per-segment average lifetime spend (rupees). Drives totalSpent / LTV / order share.
# Chosen so total lifetime revenue lands near Rs 2.06 Cr and AOV near 1485.
SEGMENT_SPEND = {
    "Champions":           13000.0,
    "Loyal Customers":      8250.0,
    "Potential Loyalists":  3850.0,
    "New Customers":        1480.0,
    "At Risk":              4850.0,
    "Hibernating":          1880.0,
    "Lost":                  820.0,
}
# Per-segment average order count (lifetime).
SEGMENT_ORDERS = {
    "Champions":           8.2,
    "Loyal Customers":     5.4,
    "Potential Loyalists": 2.5,
    "New Customers":       1.02,
    "At Risk":             3.1,
    "Hibernating":         1.25,
    "Lost":                1.0,
}
# Per-segment churn probability (0-1).
SEGMENT_CHURN = {
    "Champions":           0.05,
    "Loyal Customers":     0.12,
    "Potential Loyalists": 0.25,
    "New Customers":       0.30,
    "At Risk":             0.78,
    "Hibernating":         0.85,
    "Lost":                0.95,
}

FIRST_NAMES = [
    "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Krishna", "Ishaan",
    "Rohan", "Kabir", "Ananya", "Diya", "Aadhya", "Saanvi", "Aanya", "Pari", "Myra",
    "Sara", "Ira", "Riya", "Kiara", "Navya", "Prisha", "Anvi", "Siya", "Aarohi",
    "Rahul", "Karan", "Nikhil", "Sanjay", "Vikram", "Amit", "Ravi", "Suresh", "Manish",
    "Priya", "Neha", "Pooja", "Kavya", "Sneha", "Deepika", "Anjali", "Meera", "Shreya",
    "Aishwarya", "Lakshmi", "Divya", "Tanvi", "Ritu", "Nisha", "Gauri", "Isha",
    "Aryan", "Dev", "Yash", "Harsh", "Tarun", "Varun", "Siddharth", "Akash",
]
LAST_NAMES = [
    "Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Reddy", "Nair", "Iyer",
    "Mehta", "Shah", "Joshi", "Desai", "Chopra", "Malhotra", "Kapoor", "Bhat",
    "Rao", "Pillai", "Menon", "Naidu", "Agarwal", "Bansal", "Mishra", "Pandey",
    "Chauhan", "Yadav", "Saxena", "Bhatt", "Trivedi", "Goswami", "Sinha", "Das",
    "Banerjee", "Chatterjee", "Mukherjee", "Ghosh", "Bose", "Sen", "Dutta",
]
EMAIL_DOMAINS = ["gmail.com", "yahoo.in", "outlook.com", "rediffmail.com", "hotmail.com"]

PRODUCTS = [
    "Ashwagandha Calm Capsules", "Triphala Digestive Blend", "Turmeric Gold Latte Mix",
    "Moringa Greens Powder", "Brahmi Focus Tonic", "Tulsi Immunity Drops",
    "Amla Vitamin C Booster", "Shatavari Womens Wellness", "Neem Skin Clarity Tablets",
    "Spirulina Protein Boost", "Giloy Wellness Shots", "Chyawanprash Daily Vitality",
]


def cuid(prefix="cm"):
    ts = hex(int(datetime.now().timestamp() * 1000))[2:]
    rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=14))
    return f"{prefix}{ts}{rand}"


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # -----------------------------------------------------------------------
    # (a) CLEAN SLATE — delete contradictory data for this store/workspace
    # -----------------------------------------------------------------------
    print("Cleaning existing data for the store...")
    # order_attributions cascade off orders, but delete explicitly by storeId too.
    cur.execute('DELETE FROM order_attributions WHERE "storeId" = %s', (STORE_ID,))
    cur.execute(
        'DELETE FROM order_items WHERE "orderId" IN '
        '(SELECT id FROM orders WHERE "storeId" = %s)', (STORE_ID,))
    cur.execute('DELETE FROM orders WHERE "storeId" = %s', (STORE_ID,))
    cur.execute('DELETE FROM rfm_scores WHERE "storeId" = %s', (STORE_ID,))
    cur.execute('DELETE FROM customer_lifetime_values WHERE "storeId" = %s', (STORE_ID,))
    cur.execute('DELETE FROM customer_states WHERE "storeId" = %s', (STORE_ID,))
    cur.execute('DELETE FROM customer_segments WHERE "storeId" = %s', (STORE_ID,))
    cur.execute('DELETE FROM action_queue WHERE "storeId" = %s', (STORE_ID,))
    cur.execute('DELETE FROM store_baselines WHERE "storeId" = %s', (STORE_ID,))
    cur.execute('DELETE FROM customers WHERE "storeId" = %s', (STORE_ID,))
    # token_usages + message_logs are workspace-scoped and feed ROI/AI cost.
    # Wipe the whole workspace's rows so AI cost/revenue are deterministic.
    cur.execute('DELETE FROM message_logs WHERE "workspaceId" = %s', (WORKSPACE_ID,))
    cur.execute('DELETE FROM token_usages WHERE "workspaceId" = %s', (WORKSPACE_ID,))
    conn.commit()
    print("  done")

    # -----------------------------------------------------------------------
    # (b) REBRAND store + brand_profiles
    # -----------------------------------------------------------------------
    print("Rebranding store + brand profile...")
    cur.execute(
        '''UPDATE stores SET "storeName" = %s, "storeEmail" = %s, "storeDescription" = %s,
               currency = %s, timezone = %s, "storeCategory" = %s WHERE id = %s''',
        ("Vana Naturals", "hello@vananaturals.in",
         "Plant-based wellness & Ayurvedic supplements, made in India.",
         "INR", "Asia/Kolkata", "health", STORE_ID))

    tone = psycopg2.extras.Json({"formality": 0.4, "humor": 0.3, "energy": 0.7, "warmth": 0.9})
    vocab = psycopg2.extras.Json({
        "preferredWords": ["nourish", "rooted", "ritual", "wellness", "plant-powered", "balance", "calm", "vitality"],
        "phrases": ["rooted in nature", "your daily ritual", "wellness the Ayurvedic way"],
        "ctaPatterns": ["Begin your ritual", "Nourish today", "Shop wellness"],
    })
    visual = psycopg2.extras.Json({
        "colors": {"primary": "#2F5D3A", "secondary": "#D9C7A3", "accent": "#E07A5F"},
        "fontPreferences": ["serif headlines", "clean sans body"],
        "imageStyle": "warm, earthy, botanical, natural light, hands & herbs",
    })
    sample = psycopg2.extras.Json({"examples": [
        "Slow mornings, steadier you. Our Ashwagandha Calm capsules are rooted in centuries of Ayurveda.",
        "Greens that love you back. Moringa, the way nature intended.",
    ]})

    # brand_profiles uniqueness is (workspaceId, storeId) — upsert.
    cur.execute('SELECT id FROM brand_profiles WHERE "workspaceId" = %s AND "storeId" = %s',
                (WORKSPACE_ID, STORE_ID))
    row = cur.fetchone()
    if row:
        cur.execute(
            '''UPDATE brand_profiles SET "brandName" = %s, "brandDescription" = %s,
                   "toneAttributes" = %s, vocabulary = %s, "visualStyle" = %s,
                   "sampleCopy" = %s, "creativeIntensity" = %s, "headerBgColor" = %s,
                   "footerText" = %s, "updatedAt" = now() WHERE id = %s''',
            ("Vana Naturals",
             "Vana Naturals is an Indian plant-based wellness brand bringing modern, "
             "science-backed Ayurvedic supplements into everyday rituals. Warm, natural, "
             "honest — we help people nourish body and mind with plant-powered formulas.",
             tone, vocab, visual, sample, "balanced", "#2F5D3A",
             "Vana Naturals - Plant-powered wellness, made in India.", row[0]))
    else:
        cur.execute(
            '''INSERT INTO brand_profiles (id, "workspaceId", "storeId", "brandName",
                   "brandDescription", "toneAttributes", vocabulary, "visualStyle",
                   "sampleCopy", "creativeIntensity", "headerBgColor", "footerText",
                   "analyzedAt", "createdAt", "updatedAt")
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),now(),now())''',
            (cuid(), WORKSPACE_ID, STORE_ID, "Vana Naturals",
             "Vana Naturals is an Indian plant-based wellness brand bringing modern, "
             "science-backed Ayurvedic supplements into everyday rituals. Warm, natural, "
             "honest — we help people nourish body and mind with plant-powered formulas.",
             tone, vocab, visual, sample, "balanced", "#2F5D3A",
             "Vana Naturals - Plant-powered wellness, made in India."))
    conn.commit()
    print("  done")

    # -----------------------------------------------------------------------
    # (c) CUSTOMERS + RFM + CLV + CustomerState  (assign segments)
    # -----------------------------------------------------------------------
    print("Building customers + segments...")
    # Build the per-customer segment assignment list.
    seg_assign = []
    for name, count, *_ in SEGMENTS:
        seg_assign.extend([name] * count)
    random.shuffle(seg_assign)
    seg_meta = {s[0]: s for s in SEGMENTS}

    used_emails = set()

    customers = []          # (id, externalId, email, firstName, lastName, acceptsMarketing, createdAt, segment, n_orders, total_spent)
    cust_rows = []
    rfm_rows = []
    clv_rows = []
    state_rows = []
    seg_revenue = {s[0]: 0.0 for s in SEGMENTS}
    seg_count = {s[0]: 0 for s in SEGMENTS}

    for i in range(N_CUSTOMERS):
        segment = seg_assign[i]
        meta = seg_meta[segment]
        _, _, total_score, r, f, m = meta

        fn = random.choice(FIRST_NAMES)
        ln = random.choice(LAST_NAMES)
        # unique email
        base = f"{fn}.{ln}".lower()
        email = f"{base}{random.randint(1, 9999)}@{random.choice(EMAIL_DOMAINS)}"
        while email in used_emails:
            email = f"{base}{random.randint(1, 99999)}@{random.choice(EMAIL_DOMAINS)}"
        used_emails.add(email)

        accepts = random.random() < 0.62

        cid = cuid()
        ext = f"vana_{i+1}"

        # signup spread over ~18 months; New Customers skew recent
        if segment == "New Customers":
            days_ago = random.randint(1, 60)
        elif segment in ("Lost", "Hibernating"):
            days_ago = random.randint(200, 540)
        else:
            days_ago = random.randint(15, 540)
        created = NOW - timedelta(days=days_ago, hours=random.randint(0, 23))

        # lifetime order count + spend for this customer (vary around segment mean)
        avg_orders = SEGMENT_ORDERS[segment]
        n_orders = max(1, int(round(random.gauss(avg_orders, max(0.4, avg_orders * 0.3)))))
        avg_spend = SEGMENT_SPEND[segment]
        total_spent = round(max(200.0, random.gauss(avg_spend, avg_spend * 0.25)), 2)
        aov_cust = round(total_spent / n_orders, 2)

        # last order recency by segment
        if segment in ("Champions", "Loyal Customers", "New Customers", "Potential Loyalists"):
            last_days = random.randint(1, 45)
        elif segment == "At Risk":
            last_days = random.randint(70, 150)
        elif segment == "Hibernating":
            last_days = random.randint(150, 300)
        else:  # Lost
            last_days = random.randint(300, 520)
        last_order_at = NOW - timedelta(days=last_days)
        if last_order_at < created:
            last_order_at = created + timedelta(days=1)

        cust_rows.append((cid, STORE_ID, ext, email, None, fn, ln, accepts, [], created, NOW))

        rfm_rows.append((
            cuid(), cid, STORE_ID, r, f, m, total_score, segment,
            last_order_at, n_orders, total_spent, aov_cust, NOW,
        ))

        lifespan_months = max(0.5, days_ago / 30.0)
        purchase_freq = round(n_orders / lifespan_months, 3)
        churn = round(min(0.98, max(0.02, random.gauss(SEGMENT_CHURN[segment], 0.05))), 3)
        predicted_ltv = round(total_spent * (1.0 + (1.0 - churn) * 1.4), 2)
        clv_rows.append((
            cuid(), cid, STORE_ID, total_spent, predicted_ltv, aov_cust,
            purchase_freq, round(lifespan_months, 2), churn, NOW,
        ))

        # CustomerState: at-risk count for churnInterventions uses churnRisk >= 0.7.
        # Make the At Risk segment carry churnRisk >= 0.7 so that count == 632.
        if segment == "At Risk":
            churn_risk = round(random.uniform(0.70, 0.82), 3)
            lifecycle = "at_risk"
        elif segment == "Hibernating":
            churn_risk = round(random.uniform(0.55, 0.69), 3)  # below 0.7 -> not counted
            lifecycle = "at_risk"
        elif segment == "Lost":
            churn_risk = round(random.uniform(0.55, 0.69), 3)  # below 0.7 -> not counted
            lifecycle = "lost"
        elif segment == "Champions":
            churn_risk = round(random.uniform(0.02, 0.10), 3)
            lifecycle = "champion"
        elif segment == "Loyal Customers":
            churn_risk = round(random.uniform(0.05, 0.18), 3)
            lifecycle = "loyal"
        elif segment == "New Customers":
            churn_risk = round(random.uniform(0.20, 0.35), 3)
            lifecycle = "first_buyer"
        else:  # Potential Loyalists
            churn_risk = round(random.uniform(0.18, 0.30), 3)
            lifecycle = "repeat"
        state_rows.append((cuid(), cid, STORE_ID, lifecycle, churn_risk, NOW, NOW, NOW, NOW))

        customers.append({
            "id": cid, "email": email, "segment": segment, "created": created,
            "n_orders": n_orders, "total_spent": total_spent, "aov": aov_cust,
            "last_order_at": last_order_at,
        })
        seg_revenue[segment] += total_spent
        seg_count[segment] += 1

    # Insert customers
    psycopg2.extras.execute_values(
        cur,
        '''INSERT INTO customers (id, "storeId", "externalId", email, phone, "firstName",
               "lastName", "acceptsMarketing", tags, "createdAt", "updatedAt") VALUES %s''',
        cust_rows, page_size=1000)
    conn.commit()
    print(f"  {len(cust_rows)} customers")

    psycopg2.extras.execute_values(
        cur,
        '''INSERT INTO rfm_scores (id, "customerId", "storeId", recency, frequency, monetary,
               "totalScore", segment, "lastOrderAt", "orderCount", "totalSpent",
               "avgOrderValue", "calculatedAt") VALUES %s''',
        rfm_rows, page_size=1000)
    conn.commit()
    print(f"  {len(rfm_rows)} rfm_scores")

    psycopg2.extras.execute_values(
        cur,
        '''INSERT INTO customer_lifetime_values (id, "customerId", "storeId", "historicalLtv",
               "predictedLtv", "avgOrderValue", "purchaseFrequency", "customerLifespan",
               "churnProbability", "lastCalculatedAt") VALUES %s''',
        clv_rows, page_size=1000)
    conn.commit()
    print(f"  {len(clv_rows)} customer_lifetime_values")

    psycopg2.extras.execute_values(
        cur,
        '''INSERT INTO customer_states (id, "customerId", "storeId", "lifecycleStage",
               "churnRisk", "churnRiskUpdatedAt", "lastStateUpdate", "createdAt", "updatedAt")
           VALUES %s''',
        state_rows, page_size=1000)
    conn.commit()
    print(f"  {len(state_rows)} customer_states")

    # -----------------------------------------------------------------------
    # customer_segments rollup (counts + totalRevenue must match RFM totals)
    # -----------------------------------------------------------------------
    print("Building customer_segments rollup...")
    seg_defaults = {
        "Champions": ("champions", 12, 15, "#2F5D3A"),
        "Loyal Customers": ("loyal", 9, 11, "#3E7C4A"),
        "Potential Loyalists": ("potential-loyalists", 7, 9, "#5B9C6B"),
        "New Customers": ("new-customers", 6, 8, "#86B98F"),
        "At Risk": ("at-risk", 4, 6, "#E07A5F"),
        "Hibernating": ("hibernating", 3, 5, "#C9A66B"),
        "Lost": ("lost", 0, 3, "#B0826B"),
    }
    seg_desc = {
        "Champions": "Recent, frequent, high-spending wellness regulars",
        "Loyal Customers": "Buy their rituals regularly with strong spend",
        "Potential Loyalists": "Growing frequency, building a routine",
        "New Customers": "Just discovered Vana Naturals",
        "At Risk": "Used to reorder often, now slowing down",
        "Hibernating": "Low activity across all dimensions",
        "Lost": "No recent activity, lowest scores",
    }
    seg_seed_rows = []
    for name, count, *_ in SEGMENTS:
        slug, rmin, rmax, color = seg_defaults[name]
        seg_seed_rows.append((
            cuid(), STORE_ID, name, slug, seg_desc[name], rmin, rmax, color,
            seg_count[name], round(seg_revenue[name], 2), True, NOW, NOW,
        ))
    psycopg2.extras.execute_values(
        cur,
        '''INSERT INTO customer_segments (id, "storeId", name, slug, description, "rfmMin",
               "rfmMax", color, "customerCount", "totalRevenue", "isSystem", "createdAt",
               "updatedAt") VALUES %s''',
        seg_seed_rows, page_size=100)
    conn.commit()
    print(f"  {len(seg_seed_rows)} customer_segments")

    # -----------------------------------------------------------------------
    # ORDERS + order_items  (lifetime 13,900 with 1,240 in last 30d)
    # -----------------------------------------------------------------------
    print("Building orders...")
    # Each customer already has n_orders & total_spent. Total lifetime order count
    # is sum(n_orders); we want it ~13,900. We then force exactly N_ORDERS_30D of
    # the most-recent orders to fall in the last 30 days.
    # Strategy: generate per-customer orders spread between created and last_order_at,
    # at total_spent/n_orders each. Then pick N_ORDERS_30D orders (weighted to active
    # segments) to be dated within the last 30 days.

    total_planned = sum(c["n_orders"] for c in customers)
    print(f"  planned lifetime orders: {total_planned}")

    order_rows = []
    item_rows = []
    # Track candidate (order_index) for 30d placement: we will just date orders so that
    # roughly N_ORDERS_30D land in last 30 days. Easiest: choose which customers
    # contribute a "recent" order.
    # Pick recent-order customers preferentially from active segments.
    active_pool = [c for c in customers
                   if c["segment"] in ("Champions", "Loyal Customers", "New Customers",
                                        "Potential Loyalists")]
    random.shuffle(active_pool)
    recent_customers = set(id(c) for c in active_pool[:N_ORDERS_30D])
    # If not enough active customers, top up from everyone.
    if len(recent_customers) < N_ORDERS_30D:
        rest = [c for c in customers if id(c) not in recent_customers]
        random.shuffle(rest)
        for c in rest:
            recent_customers.add(id(c))
            if len(recent_customers) >= N_ORDERS_30D:
                break

    order_seq = 1000
    for c in customers:
        n = c["n_orders"]
        per = round(c["total_spent"] / n, 2)
        # spread the orders between created and last_order_at
        span_start = c["created"]
        span_end = c["last_order_at"]
        span_days = max(1, (span_end - span_start).days)

        make_recent = id(c) in recent_customers
        for k in range(n):
            order_seq += 1
            oid = cuid()
            # the LAST order of a "recent" customer is forced into last 30 days
            if make_recent and k == n - 1:
                created_at = NOW - timedelta(days=random.randint(0, 29),
                                             hours=random.randint(0, 23))
            else:
                off = int(span_days * (k + 1) / (n + 1))
                created_at = span_start + timedelta(days=off, hours=random.randint(0, 23))
                # keep non-recent orders out of the last 30 days to hit 1,240 exactly
                if created_at > NOW - timedelta(days=30):
                    created_at = NOW - timedelta(days=random.randint(31, 60))
            if created_at > NOW:
                created_at = NOW - timedelta(days=1)

            subtotal = round(per * 0.88, 2)
            tax = round(per * 0.05, 2)
            shipping = round(per * 0.07, 2)
            order_rows.append((
                oid, STORE_ID, c["id"], f"vanaord_{order_seq}", str(order_seq),
                per, subtotal, tax, shipping, "INR", "fulfilled", created_at, NOW,
            ))
            # 1-2 line items
            n_items = 1 if random.random() < 0.6 else 2
            remaining = per
            for li in range(n_items):
                title = random.choice(PRODUCTS)
                if li == n_items - 1:
                    price = round(remaining, 2)
                else:
                    price = round(per * 0.5, 2)
                    remaining -= price
                item_rows.append((cuid(), oid, "vana_prod", None, title, 1, price))

    print(f"  generated {len(order_rows)} orders, {len(item_rows)} items")

    for start in range(0, len(order_rows), 2000):
        batch = order_rows[start:start + 2000]
        psycopg2.extras.execute_values(
            cur,
            '''INSERT INTO orders (id, "storeId", "customerId", "externalId", "orderNumber",
                   "totalPrice", subtotal, tax, shipping, currency, status, "createdAt",
                   "updatedAt") VALUES %s''',
            batch, page_size=1000)
        conn.commit()
    for start in range(0, len(item_rows), 3000):
        batch = item_rows[start:start + 3000]
        psycopg2.extras.execute_values(
            cur,
            '''INSERT INTO order_items (id, "orderId", "productId", "variantId", title,
                   quantity, price) VALUES %s''',
            batch, page_size=1500)
        conn.commit()
    print("  orders + items inserted")

    # -----------------------------------------------------------------------
    # ORDER ATTRIBUTIONS — AI revenue (automationId set, attributedAt within 30d)
    # ROI calc sums orderAttribution.revenue where automationId != null AND
    # attributedAt >= since(30d). Target ~Rs 4.10 L.
    # We attach attributions to a subset of recent orders.
    # -----------------------------------------------------------------------
    print("Building order_attributions (AI revenue)...")
    # gather recent orders (last 30d) we just inserted
    cur.execute(
        '''SELECT id, "customerId", "totalPrice", "createdAt" FROM orders
           WHERE "storeId" = %s AND "createdAt" >= %s ORDER BY "createdAt" DESC''',
        (STORE_ID, NOW - timedelta(days=30)))
    recent_orders = cur.fetchall()

    automation_id = "vana_winback_automation"  # synthetic automation id for attribution
    channels = ["email", "whatsapp", "sms"]
    attr_rows = []
    accumulated = 0.0
    for oid, custid, total, created_at in recent_orders:
        if accumulated >= AI_REVENUE_30D:
            break
        rev = float(total)
        attr_rows.append((
            cuid(), oid, custid, STORE_ID, None, None, automation_id,
            random.choice(channels), rev, created_at, "click", 14,
        ))
        accumulated += rev

    psycopg2.extras.execute_values(
        cur,
        '''INSERT INTO order_attributions (id, "orderId", "customerId", "storeId",
               "messageLogId", "campaignId", "automationId", channel, revenue,
               "attributedAt", "touchType", "windowDays") VALUES %s''',
        attr_rows, page_size=1000)
    conn.commit()
    print(f"  {len(attr_rows)} attributions totalling Rs {accumulated:,.0f}")

    # -----------------------------------------------------------------------
    # MESSAGE LOGS — automationsSent count (automationId != null, last 30d)
    # -----------------------------------------------------------------------
    print("Building message_logs...")
    ml_rows = []
    for i in range(900):
        sent = NOW - timedelta(days=random.randint(0, 29), hours=random.randint(0, 23))
        ch = random.choice(channels)
        ml_rows.append((
            cuid(), WORKSPACE_ID, STORE_ID, None, ch, "customer@example.com",
            "Your wellness ritual awaits" if ch == "email" else None,
            None, automation_id, "delivered", sent, sent, sent,
        ))
    psycopg2.extras.execute_values(
        cur,
        '''INSERT INTO message_logs (id, "workspaceId", "storeId", "customerId", channel,
               "to", subject, "campaignId", "automationId", status, "sentAt", "createdAt",
               "updatedAt")
           VALUES %s''',
        ml_rows, page_size=1000)
    conn.commit()
    print(f"  {len(ml_rows)} message_logs")

    # -----------------------------------------------------------------------
    # TOKEN USAGE — aiTokenCost ~ $8 (claude-sonnet-4-6: $3/$15 per 1M)
    # 1.2M input -> $3.60 ; 0.30M output -> $4.50 ; total = $8.10
    # -----------------------------------------------------------------------
    print("Building token_usages...")
    tu_rows = []
    # spread over the last 30 days across ~120 calls
    remaining_in = 1_200_000
    remaining_out = 300_000
    n_calls = 120
    for i in range(n_calls):
        created = NOW - timedelta(days=random.randint(0, 29), hours=random.randint(0, 23))
        if i == n_calls - 1:
            in_tok, out_tok = remaining_in, remaining_out
        else:
            in_tok = remaining_in // (n_calls - i)
            out_tok = remaining_out // (n_calls - i)
            remaining_in -= in_tok
            remaining_out -= out_tok
        tu_rows.append((
            cuid(), WORKSPACE_ID, "claude-sonnet-4-6", in_tok, out_tok,
            random.choice(["generate_email", "generate_whatsapp", "brand_analysis"]), created,
        ))
    psycopg2.extras.execute_values(
        cur,
        '''INSERT INTO token_usages (id, "workspaceId", model, "inputTokens", "outputTokens",
               purpose, "createdAt") VALUES %s''',
        tu_rows, page_size=500)
    conn.commit()
    cost = (1_200_000 / 1e6) * 3 + (300_000 / 1e6) * 15
    print(f"  {len(tu_rows)} token_usages -> AI cost ~${cost:.2f}")

    # -----------------------------------------------------------------------
    # STORE BASELINE
    # -----------------------------------------------------------------------
    print("Building store_baseline...")
    baseline_metrics = psycopg2.extras.Json({
        "capturedAt": NOW.isoformat(),
        "totalCustomers": N_CUSTOMERS,
        "lifetimeRevenue": round(sum(seg_revenue.values()), 2),
        "aov": AOV,
        "atRiskCustomers": 632,
        "monthlyRevenue": 1840000,
        "currency": "INR",
        "segments": {name: seg_count[name] for name, *_ in SEGMENTS},
    })
    cur.execute(
        '''INSERT INTO store_baselines (id, "storeId", "capturedAt", metrics)
           VALUES (%s, %s, %s, %s)''',
        (cuid(), STORE_ID, NOW - timedelta(days=180), baseline_metrics))
    conn.commit()
    print("  done")

    # -----------------------------------------------------------------------
    # ACTION QUEUE — 4 PENDING on-brand decisions
    # -----------------------------------------------------------------------
    print("Building action_queue...")
    actions = [
        {
            "type": "churn_intervention", "category": "retention",
            "urgency": 92, "confidence": 87, "revenue": 341000.0,
            "reasoning": "632 At-Risk buyers haven't reordered in 70+ days. A warm, "
                         "personalised win-back across WhatsApp + email before Diwali can "
                         "recover an estimated Rs 3.4L. Recommended: 15% ritual-refresh offer.",
            "payload": {"targetSegment": {"name": "At Risk", "count": 632},
                        "campaignName": "Win back 632 lapsed buyers before Diwali",
                        "channel": "whatsapp", "interventionType": "winback",
                        "subjectLine": "We saved your wellness ritual"},
        },
        {
            "type": "campaign", "category": "loyalty",
            "urgency": 74, "confidence": 91, "revenue": 168000.0,
            "reasoning": "470 Champions drive the highest LTV. Reward them with early access "
                         "to the new Brahmi Focus Tonic + a thank-you gift to deepen loyalty.",
            "payload": {"targetSegment": {"name": "Champions", "count": 470},
                        "campaignName": "Reward 470 champions with early access",
                        "channel": "email", "subjectLine": "A little thank-you, just for you"},
        },
        {
            "type": "cart_recovery", "category": "conversion",
            "urgency": 81, "confidence": 79, "revenue": 96500.0,
            "reasoning": "Abandoned carts from the last 24h hold Rs 96.5K in plant-based "
                         "wellness orders. A 2-step reminder (email then WhatsApp) typically "
                         "recovers ~22% of this value.",
            "payload": {"campaignName": "Recover abandoned carts",
                        "channel": "email", "interventionType": "cart_recovery"},
        },
        {
            "type": "repurchase_reminder", "category": "retention",
            "urgency": 68, "confidence": 84, "revenue": 124000.0,
            "reasoning": "690 Loyal Customers are due to run out of their Ashwagandha & Triphala "
                         "rituals this week. A timely repurchase nudge keeps their routine "
                         "uninterrupted and protects recurring revenue.",
            "payload": {"targetSegment": {"name": "Loyal Customers", "count": 690},
                        "campaignName": "Nudge loyal customers to reorder their ritual",
                        "channel": "whatsapp", "interventionType": "repurchase"},
        },
    ]
    aq_rows = []
    for a in actions:
        aq_rows.append((
            cuid(), STORE_ID, a["type"], "pending", a["category"], a["urgency"],
            a["confidence"], NOW + timedelta(days=7), a["reasoning"], a["revenue"],
            psycopg2.extras.Json(a["payload"]), NOW,
        ))
    psycopg2.extras.execute_values(
        cur,
        '''INSERT INTO action_queue (id, "storeId", type, status, category, "urgencyScore",
               "confidenceScore", "expiresAt", reasoning, "estimatedRevenue", payload,
               "createdAt") VALUES %s''',
        aq_rows, page_size=50)
    conn.commit()
    print(f"  {len(aq_rows)} pending actions")

    # -----------------------------------------------------------------------
    # CONTROL-GROUP EXPERIMENT (Track B moat) — one CLOSED experiment over a
    # matched cohort, with message_logs carrying treatmentArm CONTROL/TREATMENT
    # and REALISTIC measured outcomes (outcome='purchased' for a believable
    # share, outcomeRevenue + outcomeMargin set). Treatment mean > control mean
    # by design (a believable positive lift), so analytics.controlLift returns
    # REAL computed lift and the outcomes screen flips off the representative
    # figures. Idempotent: clears any prior demo experiment for this store first.
    # -----------------------------------------------------------------------
    print("Building control-group experiment (Track B moat)...")

    # Ensure the store has a contribution margin (used by the fee math fallback).
    cur.execute(
        'UPDATE stores SET "defaultContributionMargin" = %s WHERE id = %s',
        (0.6, STORE_ID))

    # Idempotent clear: drop message_logs tied to prior demo experiments + the
    # experiments themselves for this store (additive; never touches the view).
    cur.execute(
        'DELETE FROM message_logs WHERE "experimentId" IN '
        '(SELECT id FROM experiments WHERE "storeId" = %s)', (STORE_ID,))
    cur.execute('DELETE FROM experiments WHERE "storeId" = %s', (STORE_ID,))

    EXP_TREATMENT = 1840   # received allo's retention
    EXP_CONTROL = 460      # held out — received nothing
    EXP_WINDOW_DAYS = 90
    # Per-customer measured outcome (revenue), realistic positive lift:
    EXP_CONTROL_MEAN = 1690.0    # ₹ / control customer
    EXP_TREATMENT_MEAN = 2140.0  # ₹ / treatment customer
    # Believable share that actually purchased in each arm.
    CONTROL_PURCHASE_RATE = 0.34
    TREATMENT_PURCHASE_RATE = 0.41
    CONTRIB_MARGIN = 0.6  # margin = revenue × contribution margin

    exp_id = cuid()
    cohort_def = psycopg2.extras.Json({
        "label": "At-Risk + Loyal win-back · matched cohort",
        "segments": ["At Risk", "Loyal Customers", "Potential Loyalists"],
        "matchedOn": ["rfmSegment", "recencyBucket"],
        "windowDays": EXP_WINDOW_DAYS,
    })
    exp_start = NOW - timedelta(days=EXP_WINDOW_DAYS)
    exp_end = NOW - timedelta(days=1)
    cur.execute(
        '''INSERT INTO experiments (id, "storeId", "cohortDefinition", "splitRatio",
               "assignmentSeed", "startAt", "endAt", status, "createdAt")
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
        (exp_id, STORE_ID, cohort_def,
         round(EXP_CONTROL / (EXP_CONTROL + EXP_TREATMENT), 3),
         "vana-winback-2026", exp_start, exp_end, "closed", exp_start))

    # Pull a real cohort of customers to attach assignments to (deterministic).
    cur.execute(
        '''SELECT id FROM customers WHERE "storeId" = %s ORDER BY id LIMIT %s''',
        (STORE_ID, EXP_TREATMENT + EXP_CONTROL))
    cohort_ids = [r[0] for r in cur.fetchall()]
    # If somehow short, just use what we have.
    treat_ids = cohort_ids[:EXP_TREATMENT]
    ctrl_ids = cohort_ids[EXP_TREATMENT:EXP_TREATMENT + EXP_CONTROL]

    channels_exp = ["email", "whatsapp", "sms"]

    def build_arm(custids, arm, purchase_rate, mean_rev):
        """One message_log row per customer in the arm. A believable share
        'purchased' with revenue drawn around the arm mean; the rest have no
        measured outcome. AVG(outcome) over purchasers ≈ mean_rev by design."""
        rows = []
        purchasers = [c for c in custids if random.random() < purchase_rate]
        # Force the AVG of purchasers to land on mean_rev: draw around it then
        # the law of large numbers + a final corrector keeps it believable.
        revs = [max(200.0, random.gauss(mean_rev, mean_rev * 0.28)) for _ in purchasers]
        if revs:
            # corrector: scale so the mean is exactly mean_rev
            scale = mean_rev / (sum(revs) / len(revs))
            revs = [round(r * scale, 2) for r in revs]
        purchaser_set = {}
        for cid, rev in zip(purchasers, revs):
            purchaser_set[cid] = rev
        for cid in custids:
            sent = exp_start + timedelta(
                days=random.randint(0, EXP_WINDOW_DAYS - 2),
                hours=random.randint(0, 23))
            ch = "withheld" if arm == "CONTROL" else random.choice(channels_exp)
            if cid in purchaser_set:
                rev = purchaser_set[cid]
                # outcomeMargin left NULL so the per-customer figure (and the
                # screen) reads as the believable revenue/customer; the fee math
                # derives incremental margin via the store contribution margin.
                margin = None
                outcome = "purchased"
                status = "delivered" if arm == "TREATMENT" else "suppressed"
            else:
                rev = None
                margin = None
                outcome = "ignored"
                status = "delivered" if arm == "TREATMENT" else "suppressed"
            # (id, workspaceId, storeId, customerId, channel, to, status,
            #  experimentId, treatmentArm, outcome, outcomeRevenue, outcomeMargin,
            #  outcomeTimestamp, sentAt, createdAt, updatedAt)
            rows.append((
                cuid(), WORKSPACE_ID, STORE_ID, cid, ch, "customer@example.com",
                status, exp_id, arm, outcome, rev, margin,
                sent if outcome == "purchased" else None, sent, sent, sent,
            ))
        return rows, len(purchaser_set)

    treat_rows, treat_purch = build_arm(
        treat_ids, "TREATMENT", TREATMENT_PURCHASE_RATE, EXP_TREATMENT_MEAN)
    ctrl_rows, ctrl_purch = build_arm(
        ctrl_ids, "CONTROL", CONTROL_PURCHASE_RATE, EXP_CONTROL_MEAN)

    exp_ml_rows = treat_rows + ctrl_rows
    psycopg2.extras.execute_values(
        cur,
        '''INSERT INTO message_logs (id, "workspaceId", "storeId", "customerId", channel,
               "to", status, "experimentId", "treatmentArm", outcome, "outcomeRevenue",
               "outcomeMargin", "outcomeTimestamp", "sentAt", "createdAt", "updatedAt")
           VALUES %s''',
        exp_ml_rows, page_size=1000)
    conn.commit()
    print(f"  experiment {exp_id} (closed)")
    print(f"  treatment arm: {len(treat_rows)} rows, {treat_purch} purchased")
    print(f"  control arm  : {len(ctrl_rows)} rows, {ctrl_purch} purchased")

    # =======================================================================
    # VERIFICATION — run the SAME aggregates the routers run
    # =======================================================================
    print("\n" + "=" * 70)
    print("VERIFICATION (mirrors the tRPC router queries)")
    print("=" * 70)

    def q1(sql, params=()):
        cur.execute(sql, params)
        return cur.fetchone()

    # dashboard.stats / customers.stats
    n_cust = q1('SELECT count(*) FROM customers WHERE "storeId"=%s', (STORE_ID,))[0]
    accepts = q1('SELECT count(*) FROM customers WHERE "storeId"=%s AND "acceptsMarketing"=true',
                 (STORE_ID,))[0]
    print(f"customers.stats.totalCustomers : {n_cust}  (target 4,820)")
    print(f"customers acceptsMarketing     : {accepts}  ({accepts*100//n_cust}% , target ~62%)")

    n_ord = q1('SELECT count(*) FROM orders WHERE "storeId"=%s', (STORE_ID,))[0]
    rev_total = q1('SELECT COALESCE(SUM("totalPrice"),0) FROM orders WHERE "storeId"=%s',
                   (STORE_ID,))[0]
    print(f"orders (lifetime)              : {n_ord}  (target ~13,900)")
    print(f"dashboard.stats.totalRevenue   : Rs {float(rev_total):,.0f}  (target ~2.06 Cr)")

    # 30-day revenue & orders (revenueTimeline window)
    since30 = NOW - timedelta(days=30)
    n_ord_30 = q1('SELECT count(*) FROM orders WHERE "storeId"=%s AND "createdAt">=%s',
                  (STORE_ID, since30))[0]
    rev_30 = q1('SELECT COALESCE(SUM("totalPrice"),0) FROM orders WHERE "storeId"=%s AND "createdAt">=%s',
                (STORE_ID, since30))[0]
    print(f"orders last 30d                : {n_ord_30}  (target ~1,240)")
    print(f"revenue last 30d               : Rs {float(rev_30):,.0f}  (target ~18.4 L)")
    print(f"implied AOV (lifetime)         : Rs {float(rev_total)/n_ord:,.0f}  (target ~1,485)")

    # customers.stats AOV (avg of rfm avgOrderValue)
    aov_rfm = q1('SELECT COALESCE(AVG("avgOrderValue"),0) FROM rfm_scores WHERE "storeId"=%s',
                 (STORE_ID,))[0]
    print(f"customers.stats.avgOrderValue  : Rs {float(aov_rfm):,.0f}")

    # segments.distribution (rfm groupBy segment)
    print("\nsegments.distribution (rfm_scores grouped by segment):")
    cur.execute(
        '''SELECT segment, count(*), COALESCE(SUM("totalSpent"),0)
           FROM rfm_scores WHERE "storeId"=%s GROUP BY segment ORDER BY count(*) DESC''',
        (STORE_ID,))
    total_seg = 0
    for seg, cnt, rev in cur.fetchall():
        total_seg += cnt
        print(f"   {seg:<22} {cnt:>5}   Rs {float(rev):>14,.0f}")
    print(f"   {'TOTAL':<22} {total_seg:>5}  (target 4,820)")

    # at-risk (segments) and at-risk (CustomerState churnRisk>=0.7 used by churnInterventions)
    at_risk_seg = q1(
        'SELECT count(*) FROM rfm_scores WHERE "storeId"=%s AND segment=%s',
        (STORE_ID, "At Risk"))[0]
    at_risk_state = q1(
        'SELECT count(*) FROM customer_states WHERE "storeId"=%s AND "churnRisk">=0.7',
        (STORE_ID,))[0]
    print(f"\nAt Risk (segment)              : {at_risk_seg}  (target 632)")
    print(f"At Risk (CustomerState>=0.7)   : {at_risk_state}  (target 632)")

    # analytics.roi
    cur.execute(
        '''SELECT model, SUM("inputTokens"), SUM("outputTokens") FROM token_usages
           WHERE "workspaceId"=%s AND "createdAt">=%s GROUP BY model''',
        (WORKSPACE_ID, since30))
    ai_cost = 0.0
    rates = {"claude-sonnet-4-6": (3, 15)}
    for model, intok, outtok in cur.fetchall():
        ri, ro = rates.get(model, (0, 0))
        ai_cost += (intok / 1e6) * ri + (outtok / 1e6) * ro
    ai_rev = q1(
        '''SELECT COALESCE(SUM(revenue),0) FROM order_attributions
           WHERE "storeId"=%s AND "automationId" IS NOT NULL AND "attributedAt">=%s''',
        (STORE_ID, since30))[0]
    autos_sent = q1(
        '''SELECT count(*) FROM message_logs WHERE "storeId"=%s AND "automationId" IS NOT NULL
           AND "createdAt">=%s''', (STORE_ID, since30))[0]
    roi = round(((float(ai_rev) - ai_cost) / ai_cost), 2) if ai_cost > 0 else 0
    print(f"\nanalytics.roi.aiTokenCost      : ${round(ai_cost,4)}  (target ~$8)")
    print(f"analytics.roi.aiAttributedRev  : Rs {float(ai_rev):,.0f}  (target ~4.10 L)")
    print(f"analytics.roi.automationsSent  : {autos_sent}")
    print(f"analytics.roi.roi (rev/cost)   : {roi}x  (POSITIVE, non-zero)")

    # autonomy.listActions pending
    n_pending = q1(
        'SELECT count(*) FROM action_queue WHERE "storeId"=%s AND status=%s',
        (STORE_ID, "pending"))[0]
    print(f"\nautonomy.listActions pending   : {n_pending}  (target 4)")

    # analytics.controlLift (Track B moat) — mirrors the tRPC query exactly.
    print("\nanalytics.controlLift (control-group experiment):")
    cur.execute(
        '''SELECT "treatmentArm",
                  COUNT(*) AS n,
                  COUNT(COALESCE("outcomeMargin","outcomeRevenue")) AS with_outcome,
                  COALESCE(AVG(COALESCE("outcomeMargin","outcomeRevenue")),0) AS mean
           FROM message_logs
           WHERE "storeId"=%s AND "treatmentArm" IS NOT NULL
             AND "createdAt">=%s
           GROUP BY "treatmentArm"''',
        (STORE_ID, NOW - timedelta(days=90)))
    arms = {a: (int(n), int(wo), float(m)) for a, n, wo, m in cur.fetchall()}
    cn, cwo, cmean = arms.get("CONTROL", (0, 0, 0.0))
    tn, two_, tmean = arms.get("TREATMENT", (0, 0, 0.0))
    lift = tmean - cmean
    incr = lift * tn
    contrib = q1('SELECT COALESCE("defaultContributionMargin",0.6) FROM stores WHERE id=%s',
                 (STORE_ID,))[0]
    incr_margin = incr * float(contrib)
    perf = max(0.0, incr_margin) * 0.15
    total_fee = 24000 + perf
    print(f"   control      : n={cn}  with_outcome={cwo}  mean=Rs {cmean:,.0f}  (target ~1,690)")
    print(f"   treatment    : n={tn}  with_outcome={two_}  mean=Rs {tmean:,.0f}  (target ~2,140)")
    print(f"   lift/customer: Rs {lift:,.0f}  ({(lift/cmean*100 if cmean else 0):.0f}%)")
    print(f"   incremental  : Rs {incr:,.0f}  (lift x {tn} treated)")
    print(f"   incr margin  : Rs {incr_margin:,.0f}  (x {float(contrib)} contribution margin)")
    print(f"   perf fee 15% : Rs {perf:,.0f}  · total fee Rs {total_fee:,.0f}")
    print(f"   hasRealData  : {cwo >= 30}  (control with outcome >= 30)")

    # store name / brand
    sname = q1('SELECT "storeName" FROM stores WHERE id=%s', (STORE_ID,))[0]
    bname = q1('SELECT "brandName" FROM brand_profiles WHERE "storeId"=%s', (STORE_ID,))[0]
    print(f"\nstores.storeName               : {sname}")
    print(f"brand_profiles.brandName       : {bname}")
    print("=" * 70)
    print("DONE.")

    conn.close()


if __name__ == "__main__":
    main()
