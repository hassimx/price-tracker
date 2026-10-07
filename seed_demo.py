import argparse
import random
import sys
from datetime import datetime, timedelta, timezone

import db

DAYS = 30


def make_moods(rng):
    # some days have more price changes than others, and lean up or down
    return [(rng.uniform(0.1, 0.5), rng.uniform(0.2, 0.8)) for _ in range(DAYS)]


def make_prices(current, rng, moods):
    # walk backwards from today's price, so the last point matches the real one
    if rng.random() < 0.15:
        return [current] * DAYS  # some books never change price

    volatility = rng.choice([0.03, 0.05, 0.08, 0.15])
    low = max(current * 0.7, 1)
    high = current * 1.3

    prices = [current]
    price = current
    for day in range(DAYS - 1, 0, -1):
        chance, chance_up = moods[day]
        if rng.random() < chance:
            size = rng.uniform(0.01, volatility)
            went_up = rng.random() < chance_up
            price = price / (1 + size) if went_up else price / (1 - size)
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
    moods = make_moods(rng)
    now = datetime.now(timezone.utc)
    rows = []
    for product_id, current in products:
        for i, price in enumerate(make_prices(current, rng, moods)):
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
