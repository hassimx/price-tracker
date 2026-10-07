import argparse
import logging
import re
import sys
import time
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

import db

START_URL = "https://books.toscrape.com/catalogue/page-1.html"
HEADERS = {"User-Agent": "price-tracker/1.0 (student project)"}

log = logging.getLogger("scraper")


def fetch(session, url, retries=3):
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, timeout=10)
            resp.raise_for_status()
            # the site sends no charset, so the pound sign comes out broken without this
            resp.encoding = "utf-8"
            return resp.text
        except requests.RequestException as err:
            log.warning("%s failed (try %d of %d): %s", url, attempt, retries, err)
            status = getattr(err.response, "status_code", None)
            if status and 400 <= status < 500 and status != 429:
                break  # retrying a 404 won't help
            time.sleep(2 * attempt)
    return None


def parse_price(text):
    match = re.search(r"\d+(?:\.\d+)?", text)
    return float(match.group()) if match else None


def parse_page(html, page_url):
    soup = BeautifulSoup(html, "html.parser")
    products = []
    for item in soup.select("article.product_pod"):
        link = item.select_one("h3 a")
        price_tag = item.select_one("p.price_color")
        price = parse_price(price_tag.get_text()) if price_tag else None
        if link is None or price is None:
            log.warning("skipped a product with no link or price on %s", page_url)
            continue
        products.append({
            # the visible link text is cut off, the title attribute has the full name
            "title": link.get("title") or link.get_text(strip=True),
            "url": urljoin(page_url, link["href"]),
            "price": price,
        })
    next_link = soup.select_one("li.next a")
    next_url = urljoin(page_url, next_link["href"]) if next_link else None
    return products, next_url


def scrape(max_pages=None, delay=1.0):
    db.init_db()
    scraped_at = db.now_str()
    session = requests.Session()
    session.headers.update(HEADERS)

    url = START_URL
    pages = 0
    saved = 0
    while url and (max_pages is None or pages < max_pages):
        html = fetch(session, url)
        if html is None:
            log.error("giving up on %s", url)
            return saved, False

        products, url = parse_page(html, url)
        if not products:
            log.warning("no products found, did the page layout change?")
        with db.connect() as conn:
            for product in products:
                db.save_product(conn, product["title"], product["url"], product["price"], scraped_at)

        pages += 1
        saved += len(products)
        log.info("page %d: %d products", pages, len(products))
        if url:
            time.sleep(delay)
    return saved, True


def main():
    parser = argparse.ArgumentParser(description="Scrape book prices from books.toscrape.com")
    parser.add_argument("--pages", type=int, help="stop after this many pages (default: all)")
    parser.add_argument("--delay", type=float, default=1.0, help="seconds between requests")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    saved, ok = scrape(args.pages, args.delay)
    log.info("done, %d products saved", saved)
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
