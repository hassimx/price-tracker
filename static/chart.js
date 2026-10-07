const canvas = document.getElementById("price-chart");
const note = document.getElementById("chart-note");

function shortDate(iso) {
  const date = new Date(iso + "T00:00:00");
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function drawChart(points) {
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim();
  const border = styles.getPropertyValue("--border").trim();
  const muted = styles.getPropertyValue("--muted").trim();

  new Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((p) => shortDate(p.date)),
      datasets: [{
        data: points.map((p) => p.price),
        borderColor: accent,
        backgroundColor: accent,
        borderWidth: 2,
        stepped: true, // a price stays the same until it changes
        pointRadius: points.length > 45 ? 0 : 3,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => points[items[0].dataIndex].date,
            label: (item) => "£" + item.parsed.y.toFixed(2),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: muted, maxTicksLimit: 8 } },
        y: {
          grid: { color: border },
          ticks: { color: muted, callback: (value) => "£" + value.toFixed(2) },
        },
      },
    },
  });
}

fetch(canvas.dataset.src)
  .then((res) => {
    if (!res.ok) throw new Error("request failed: " + res.status);
    return res.json();
  })
  .then((points) => {
    drawChart(points);
    if (points.length < 2) {
      note.textContent = "Only one price recorded so far. Run the scraper again later, or load the demo data.";
    }
  })
  .catch(() => {
    note.textContent = "Could not load the price history.";
  });
