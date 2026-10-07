(async function () {
  const content = document.getElementById("content");

  function showMessage(title, text) {
    document.getElementById("title").textContent = title;
    content.innerHTML = `<p class="notice">${PT.esc(text)} <a href="./">Back to all books</a></p>`;
  }

  let data;
  try {
    data = await PT.loadData();
  } catch (err) {
    showMessage("Something went wrong", "Could not load the price data.");
    return;
  }

  const id = parseInt(new URLSearchParams(location.search).get("id"), 10);
  const p = data.products.find((item) => item.id === id);
  if (!p) {
    showMessage("Book not found", "There is no book with this id.");
    return;
  }

  PT.setupChartDefaults();
  document.title = p.title + " - Price Tracker";
  document.getElementById("title").textContent = p.title;
  document.getElementById("source").innerHTML = `<a href="${PT.esc(p.url)}" target="_blank" rel="noopener">View on books.toscrape.com</a>`;
  document.getElementById("demo-note").hidden = !data.demo;

  const known = p.prices.filter((v) => v != null);
  const lowest = Math.min(...known);
  const highest = Math.max(...known);
  const average = known.reduce((sum, v) => sum + v, 0) / known.length;
  const days = data.days;

  const ranges = [7, 14, 30].filter((n) => n < days.length);
  const buttons = ranges.map((n) => `<button type="button" data-range="${n}" aria-pressed="false">${n} days</button>`);
  buttons.push(`<button type="button" data-range="all" aria-pressed="true">All</button>`);

  content.innerHTML =
    `<dl class="ledger">` +
    `<div><dt>Current price</dt><dd>${PT.money(p.price)}</dd></div>` +
    `<div><dt>Previous price</dt><dd>${PT.money(p.old)}</dd></div>` +
    `<div><dt>Change</dt><dd>${PT.chip(p)}</dd></div>` +
    `<div><dt>Lowest</dt><dd>${PT.money(lowest)}</dd></div>` +
    `<div><dt>Highest</dt><dd>${PT.money(highest)}</dd></div>` +
    `</dl>` +
    `<section class="panel">` +
    `<div class="chart-head"><div><h2>Price history</h2>` +
    `<p class="sub">One point per day. The big dots are the lowest and highest price in view.</p></div>` +
    (days.length > 7 ? `<div class="seg" id="range-seg" role="group" aria-label="Time range">${buttons.join("")}</div>` : "") +
    `</div>` +
    `<div class="chart-box tall"><canvas id="price-chart" role="img" aria-label="Line chart of the price over time"></canvas></div>` +
    `<p class="chart-note" id="chart-note"></p>` +
    `</section>`;

  if (known.length < 2 || days.length < 2) {
    document.getElementById("chart-note").textContent = "Only one price recorded so far. Run the scraper again later, or load the demo data.";
  }

  function view(range) {
    const from = range === "all" ? 0 : Math.max(0, days.length - range);
    return { days: days.slice(from), values: p.prices.slice(from) };
  }

  function styling(values) {
    const seen = values.filter((v) => v != null);
    const min = Math.min(...seen);
    const max = Math.max(...seen);
    const minAt = values.indexOf(min);
    const maxAt = values.indexOf(max);
    const plain = values.length > 45 ? 0 : 3;
    const mark = min !== max;
    return {
      radius: values.map((v, i) => (mark && (i === minAt || i === maxAt) ? 6 : plain)),
      color: values.map((v, i) => (mark && i === minAt ? PT.cssVar("--down") : mark && i === maxAt ? PT.cssVar("--up") : PT.cssVar("--series"))),
    };
  }

  const first = view("all");
  const look = styling(first.values);
  let shown = first;

  const chart = new Chart(document.getElementById("price-chart"), {
    type: "line",
    data: {
      labels: first.days.map(PT.shortDate),
      datasets: [
        {
          label: "Price",
          data: first.values,
          borderColor: PT.cssVar("--series"),
          backgroundColor: PT.cssVar("--series"),
          borderWidth: 2.5,
          stepped: true, // a price stays the same until it changes
          pointRadius: look.radius,
          pointBackgroundColor: look.color,
          pointHoverRadius: 7,
        },
        {
          label: "Average",
          data: first.values.map(() => average),
          borderColor: PT.cssVar("--muted"),
          borderWidth: 1.5,
          borderDash: [6, 5],
          pointRadius: 0,
          pointHoverRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: { grid: { color: PT.cssVar("--line") }, ticks: { callback: (value) => "£" + value.toFixed(2) } },
      },
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          callbacks: {
            title: (items) => PT.longDate(shown.days[items[0].dataIndex]),
            label: (item) => `${item.dataset.label}: £${item.parsed.y.toFixed(2)}`,
          },
        },
      },
    },
  });

  const rangeSeg = document.getElementById("range-seg");
  if (rangeSeg) {
    rangeSeg.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      rangeSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));

      shown = view(button.dataset.range === "all" ? "all" : Number(button.dataset.range));
      const style = styling(shown.values);
      chart.data.labels = shown.days.map(PT.shortDate);
      chart.data.datasets[0].data = shown.values;
      chart.data.datasets[0].pointRadius = style.radius;
      chart.data.datasets[0].pointBackgroundColor = style.color;
      chart.data.datasets[1].data = shown.values.map(() => average);
      chart.update();
    });
  }
})();
