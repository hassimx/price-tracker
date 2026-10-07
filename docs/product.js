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
  const index = data.products.findIndex((item) => item.id === id);
  if (index === -1) {
    showMessage("Book not found", "There is no book with this id.");
    return;
  }
  const p = data.products[index];

  await PT.setupChartDefaults();
  document.title = p.title + " - Price Tracker";
  document.getElementById("title").textContent = p.title;
  document.getElementById("source").innerHTML = `<a href="${PT.esc(p.url)}" target="_blank" rel="noopener">View this book on books.toscrape.com</a>`;
  document.getElementById("demo-note").hidden = !data.demo;

  const known = p.prices.filter((v) => v != null);
  const lowest = Math.min(...known);
  const highest = Math.max(...known);
  const average = known.reduce((sum, v) => sum + v, 0) / known.length;
  const days = data.days;

  const ranges = [7, 14, 30].filter((n) => n < days.length);
  const buttons = ranges.map((n) => `<button type="button" data-range="${n}" aria-pressed="false">${n} days</button>`);
  buttons.push(`<button type="button" data-range="all" aria-pressed="true">All</button>`);

  // books are sorted by title, so the neighbours are the previous and next titles
  const prev = data.products[index - 1];
  const next = data.products[index + 1];
  const neighbour = (book, label) =>
    book ? `<a href="product.html?id=${book.id}"><small>${label}</small>${PT.esc(book.title)}</a>` : "";

  const previousLine = p.old == null ? "Same price as on every day so far." : `Was ${PT.money(p.old)} before.`;

  content.innerHTML =
    `<div class="product">` +
    `<aside>` +
    `<div class="price-tag">${PT.money(p.price)}</div>` +
    `<p class="price-line">${PT.chip(p)} ${previousLine}</p>` +
    `<div class="box"><table class="facts"><tbody>` +
    `<tr><th>Price now</th><td>${PT.money(p.price)}</td></tr>` +
    `<tr><th>Before</th><td>${PT.money(p.old)}</td></tr>` +
    `<tr><th>Lowest</th><td>${PT.money(lowest)}</td></tr>` +
    `<tr><th>Highest</th><td>${PT.money(highest)}</td></tr>` +
    `<tr><th>Average</th><td>${PT.money(average)}</td></tr>` +
    `</tbody></table></div>` +
    `<nav class="neighbours" aria-label="Other books">${neighbour(prev, "Previous book")}${neighbour(next, "Next book")}</nav>` +
    `</aside>` +
    `<section>` +
    `<div class="chart-head"><div><h2>Price history</h2>` +
    `<p class="note">One point per day. The dashed line is the average price.</p></div>` +
    (days.length > 7 ? `<div class="tabs" id="range-seg" role="group" aria-label="Time range">${buttons.join("")}</div>` : "") +
    `</div>` +
    `<div class="chart-box tall"><canvas id="price-chart" role="img" aria-label="Line chart of the price over time"></canvas></div>` +
    `<p class="chart-note" id="chart-note"></p>` +
    `</section>` +
    `</div>`;

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

  // writes the price next to the lowest, highest and newest point, and labels the average line
  const valueLabels = {
    id: "valueLabels",
    afterDatasetsDraw(chart) {
      const values = chart.data.datasets[0].data;
      const seen = values.map((v, i) => [v, i]).filter((pair) => pair[0] != null);
      if (seen.length < 2) return;

      const lowAt = seen.reduce((a, b) => (b[0] < a[0] ? b : a));
      const highAt = seen.reduce((a, b) => (b[0] > a[0] ? b : a));
      const lastAt = seen[seen.length - 1];
      const { ctx, chartArea, scales } = chart;
      const points = chart.getDatasetMeta(0).data;

      ctx.save();
      ctx.font = "700 12px " + PT.cssVar("--body");
      const put = (text, x, y, color, align) => {
        const width = ctx.measureText(text).width;
        const left = align === "center" ? x - width / 2 : x;
        const clamped = Math.min(Math.max(left, chartArea.left), chartArea.right - width);
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.fillText(text, clamped, y);
      };

      const avg = scales.y.getPixelForValue(average);
      put("average " + PT.money(average), chartArea.left + 4, avg + 16, PT.cssVar("--muted"), "left");

      if (lowAt[0] !== highAt[0]) {
        put(PT.money(highAt[0]), points[highAt[1]].x, points[highAt[1]].y - 12, PT.cssVar("--up"), "center");
        put(PT.money(lowAt[0]), points[lowAt[1]].x, points[lowAt[1]].y + 22, PT.cssVar("--down"), "center");
      }
      if (lastAt[1] !== highAt[1] && lastAt[1] !== lowAt[1]) {
        put(PT.money(lastAt[0]), points[lastAt[1]].x, points[lastAt[1]].y - 12, PT.cssVar("--ink"), "center");
      }
      ctx.restore();
    },
  };

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
          borderWidth: 2,
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
      layout: { padding: { top: 22, bottom: 4, right: 6 } },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: {
          grace: "10%",
          grid: { color: PT.cssVar("--line") },
          ticks: { callback: (value) => "£" + value.toFixed(2), font: { family: PT.cssVar("--body"), size: 12 } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => PT.longDate(shown.days[items[0].dataIndex]),
            label: (item) => `${item.dataset.label}: £${item.parsed.y.toFixed(2)}`,
          },
        },
      },
    },
    plugins: [valueLabels],
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
