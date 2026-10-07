import argparse
import random
import sys
from datetime import datetime, timedelta, timezone

import db

DAYS = 30


def make_prices(current, rng):
    # walk backwards from today's price, so the last point matches the real one
    if rng.random() < 0.15:
        return [current] * DAYS  # some books never change price

    volatility = rng.choice([0.03, 0.05, 0.08, 0.15])
    low = max(current * 0.7, 1)
    high = current * 1.3

    prices = [current]
    price = current
    for _ in range(DAYS - 1):
        if rng.random() < 0.3:
            price = price * (1 + rng.uniform(-volatility, volatility))
            price = round(min(max(price, low), high), 2)
        prices.append(price)
    return prices[::-1]


def main():
    parser = argparse.ArgumentParser(description="Fill the database with fake price history (demo data)")
    parser.add_argument("--seed", type=int, default=42, help="same seed gives the same data")
    args = parser.parse_args()

    db.init_db()
    products = db.get_current_prices()
    if not products:
        sys.exit("No products in the database yet. Run scraper.py first.")

    rng = random.Random(args.seed)
    now = datetime.now(timezone.utc)
    rows = []
    for product_id, current in products:
        for i, price in enumerate(make_prices(current, rng)):
            day = now - timedelta(days=DAYS - 1 - i)
            rows.append((product_id, price, day.strftime("%Y-%m-%d %H:%M:%S"), "demo"))

    with db.connect() as conn:
        conn.execute("DELETE FROM price_history")
        conn.executemany(
            "INSERT INTO price_history (product_id, price, scraped_at, source) VALUES (?, ?, ?, ?)",
            rows,
        )
    print(f"Added {len(rows)} demo prices for {len(products)} products (old history was replaced).")


if __name__ == "__main__":
    main()
