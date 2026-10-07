import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = os.environ.get("PRICE_DB", os.path.join(os.path.dirname(os.path.abspath(__file__)), "prices.db"))

# how many days of history go to the website
DAYS_SHOWN = 90

# latest price per product, plus the last price that was different from it
PRODUCTS_SQL = """
SELECT p.id, p.title, p.url,
       cur.price AS price,
       old.price AS old_price,
       CASE WHEN old.price IS NULL THEN NULL
            ELSE (cur.price - old.price) / old.price * 100 END AS change_pct
FROM products p
JOIN price_history cur ON cur.id = (
    SELECT id FROM price_history WHERE product_id = p.id
    ORDER BY scraped_at DESC, id DESC LIMIT 1)
LEFT JOIN price_history old ON old.id = (
    SELECT id FROM price_history
    WHERE product_id = p.id AND ABS(price - cur.price) > 0.001
    ORDER BY scraped_at DESC, id DESC LIMIT 1)
"""


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def now_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def init_db():
    with connect() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                url TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                price REAL NOT NULL,
                scraped_at TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'scraper'
            );
            CREATE INDEX IF NOT EXISTS idx_history_product
                ON price_history (product_id, scraped_at);
        """)


def save_product(conn, title, url, price, scraped_at):
    # url is unique, so a second run only updates the title
    conn.execute(
        "INSERT INTO products (title, url, created_at) VALUES (?, ?, ?) "
        "ON CONFLICT(url) DO UPDATE SET title = excluded.title",
        (title, url, scraped_at),
    )
    row = conn.execute("SELECT id FROM products WHERE url = ?", (url,)).fetchone()
    conn.execute(
        "INSERT INTO price_history (product_id, price, scraped_at) VALUES (?, ?, ?)",
        (row["id"], price, scraped_at),
    )
    return row["id"]


def get_current_prices():
    with connect() as conn:
        rows = conn.execute(f"SELECT id, price FROM ({PRODUCTS_SQL}) ORDER BY id").fetchall()
    return [(row["id"], row["price"]) for row in rows]


def export_data():
    # everything the website needs, in one dict
    with connect() as conn:
        products = conn.execute(f"SELECT * FROM ({PRODUCTS_SQL}) ORDER BY title COLLATE NOCASE, id").fetchall()
        history = conn.execute("SELECT product_id, price, scraped_at FROM price_history ORDER BY scraped_at, id").fetchall()
        demo = conn.execute("SELECT 1 FROM price_history WHERE source = 'demo' LIMIT 1").fetchone() is not None
        updated = conn.execute("SELECT MAX(scraped_at) FROM price_history").fetchone()[0]

    # one price per product per day, the last one of the day wins
    daily = {}
    days = set()
    for row in history:
        day = row["scraped_at"][:10]
        days.add(day)
        daily.setdefault(row["product_id"], {})[day] = row["price"]
    days = sorted(days)

    items = []
    for p in products:
        prices = []
        last = None
        for day in days:
            # a price stays the same until it changes
            last = daily[p["id"]].get(day, last)
            prices.append(last)
        items.append({
            "id": p["id"],
            "title": p["title"],
            "url": p["url"],
            "price": p["price"],
            "old": p["old_price"],
            "change": None if p["change_pct"] is None else round(p["change_pct"], 2),
            "prices": prices[-DAYS_SHOWN:],
        })

    return {"updated": updated, "demo": demo, "days": days[-DAYS_SHOWN:], "products": items}
