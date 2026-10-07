# Price Tracker

A small tool that collects book prices from [books.toscrape.com](https://books.toscrape.com), a practice site for scrapers. It saves every price in SQLite and shows the results in a Flask dashboard. You get a table with the current price, the previous price and the change in percent, a price chart for each book, and a CSV download.

## Screenshot

<!-- Put a screenshot in docs/screenshot.png and uncomment the next line -->
<!-- ![Dashboard](docs/screenshot.png) -->

## Install and run

You need Python 3.9 or newer (I tested it on 3.14).

```bash
git clone https://github.com/hassimx/price-tracker.git
cd price-tracker
python -m venv .venv
```

Activate the virtual environment.

```bash
# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

On Windows PowerShell you may see "running scripts is disabled on this system". You can skip the activation. Just start every command with `.venv\Scripts\python`, for example `.venv\Scripts\python -m pip install -r requirements.txt` and `.venv\Scripts\python scraper.py`.

Install the packages, collect the prices and start the site.

```bash
pip install -r requirements.txt
python scraper.py
python app.py
```

Open http://127.0.0.1:5000 in your browser.

The scraper reads all 50 catalog pages (1000 books) and waits one second between requests, so it takes about two minutes. For a quick try use `python scraper.py --pages 3`. Run it again any time. Books are not duplicated, each run only adds a new price to the history.

## Demo data

The real prices on books.toscrape.com never change, so every chart would be a flat line. `seed_demo.py` fills the database with made-up price history for the last 30 days.

```bash
python seed_demo.py
```

This is fake data. The newest price of each book is the real one from the scraper, everything before it is random. The script replaces the price history in your local database, and the page footer says when demo data is present. To go back to real data only, delete `prices.db` and run the scraper again.

## What I learned

The tricky part was the previous price. The scraper saves a row on every run, even when nothing changed, so the previous price has to be the last price that was different from the current one. I also had to set the response encoding to UTF-8 by hand, because the site sends no charset and the pound sign came out broken.
