import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = os.environ.get("PRICE_DB", os.path.join(os.path.dirname(os.path.abspath(__file__)), "prices.db"))

SORTS = {
    "title": "title COLLATE NOCASE",
    "price": "price",
    "change": "change_pct",
}

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
    # url is unique,so a second run only updates the title
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


def build_filter(q, show):
    where = []
    params = []
    if q:
        where.append("title LIKE ?")
        params.append("%" + q + "%")
    if show == "drops":
        where.append("change_pct < 0")
    elif show == "rises":
        where.append("change_pct > 0")
    sql = " WHERE " + " AND ".join(where) if where else ""
    return sql, params


def count_products(q="", show="all"):
    where, params = build_filter(q, show)
    with connect() as conn:
        return conn.execute(f"SELECT COUNT(*) FROM ({PRODUCTS_SQL}){where}", params).fetchone()[0]


def list_products(q="", show="all", sort="title", direction="asc", limit=None, offset=0):
    where, params = build_filter(q, show)
    column = SORTS.get(sort, SORTS["title"])
    direction = "DESC" if direction == "desc" else "ASC"
    # -1 means no limit in sqlite
    params = params + [-1 if limit is None else limit, offset]
    with connect() as conn:
        return conn.execute(
            f"SELECT * FROM ({PRODUCTS_SQL}){where} "
            f"ORDER BY {column} IS NULL, {column} {direction}, id LIMIT ? OFFSET ?",
            params,
        ).fetchall()


def get_stats():
    with connect() as conn:
        row = conn.execute(f"""
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(change_pct < 0), 0) AS drops,
                   COALESCE(SUM(change_pct > 0), 0) AS rises
            FROM ({PRODUCTS_SQL})
        """).fetchone()
        last = conn.execute("SELECT MAX(scraped_at) FROM price_history").fetchone()[0]
    return {"total": row["total"], "drops": row["drops"], "rises": row["rises"], "last_update": last}


def has_demo_data():
    with connect() as conn:
        return conn.execute("SELECT 1 FROM price_history WHERE source = 'demo' LIMIT 1").fetchone() is not None


def get_product(product_id):
    with connect() as conn:
        product = conn.execute(f"SELECT * FROM ({PRODUCTS_SQL}) WHERE id = ?", (product_id,)).fetchone()
        if product is None:
            return None
        extra = conn.execute(
            "SELECT MIN(price) AS lowest, MAX(price) AS highest, COUNT(*) AS checks "
            "FROM price_history WHERE product_id = ?",
            (product_id,),
        ).fetchone()
    return dict(product, **dict(extra))


def get_history(product_id):
    with connect() as conn:
        rows = conn.execute(
            "SELECT price, scraped_at FROM price_history WHERE product_id = ? "
            "ORDER BY scraped_at, id",
            (product_id,),
        ).fetchall()
    # one point per day, the last price of that day wins
    by_day = {}
    for row in rows:
        by_day[row["scraped_at"][:10]] = row["price"]
    return [{"date": day, "price": price} for day, price in by_day.items()]


def get_current_prices():
    with connect() as conn:
        rows = conn.execute(f"SELECT id, price FROM ({PRODUCTS_SQL}) ORDER BY id").fetchall()
    return [(row["id"], row["price"]) for row in rows]
