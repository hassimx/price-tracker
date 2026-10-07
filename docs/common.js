const PT = (function () {
  function money(n) {
    return n == null ? "–" : "£" + n.toFixed(2);
  }

  function percent(n) {
    if (n == null) return "–";
    return (n > 0 ? "+" : "") + n.toFixed(1) + "%";
  }

  function trend(p) {
    if (p.change == null) return "flat";
    return p.change < 0 ? "down" : "up";
  }

  function chip(p) {
    const kind = trend(p);
    const arrow = kind === "down" ? "▼ " : kind === "up" ? "▲ " : "";
    return `<span class="chip ${kind}">${arrow}${percent(p.change)}</span>`;
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function shortDate(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  function longDate(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  async function loadData() {
    const res = await fetch("data.json");
    if (!res.ok) throw new Error("data.json returned " + res.status);
    return res.json();
  }

  // small inline line chart for a table row, the dot marks today's price
  function sparkline(prices, kind) {
    const width = 124;
    const height = 32;
    const pad = 4;
    const points = [];
    prices.forEach((v, i) => {
      if (v != null) points.push([i, v]);
    });
    if (points.length < 2) return "";

    const values = points.map((pt) => pt[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const x = (i) => pad + (i / (prices.length - 1)) * (width - pad * 2);
    const y = (v) => (max === min ? height / 2 : height - pad - ((v - min) / (max - min)) * (height - pad * 2));

    const line = points.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const [lastIndex, lastValue] = points[points.length - 1];
    return (
      `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">` +
      `<polyline points="${line}"/>` +
      `<circle class="${kind}" cx="${x(lastIndex).toFixed(1)}" cy="${y(lastValue).toFixed(1)}" r="3"/>` +
      `</svg>`
    );
  }

  async function setupChartDefaults() {
    // wait for the web fonts, otherwise the chart text is measured with the fallback font
    try {
      await document.fonts.load('15px "Atkinson Hyperlegible Next"');
      await document.fonts.ready;
    } catch (err) {
      // the fallback font is fine
    }
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 13;
    Chart.defaults.color = cssVar("--muted");
  }

  return { money, percent, trend, chip, esc, shortDate, longDate, cssVar, loadData, sparkline, setupChartDefaults };
})();
