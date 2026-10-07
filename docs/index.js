(async function () {
  const PAGE_SIZE = 25;
  const KIND = { drops: "down", rises: "up", flat: "flat" };
  const $ = (selector) => document.querySelector(selector);

  const state = { q: "", show: "all", sort: "title", dir: "asc", page: 1 };
  let products = [];
  let visible = [];

  function readUrl() {
    const params = new URLSearchParams(location.search);
    state.q = params.get("q") || "";
    if (KIND[params.get("show")]) state.show = params.get("show");
    if (["title", "price", "change"].includes(params.get("sort"))) state.sort = params.get("sort");
    state.dir = params.get("dir") === "desc" ? "desc" : "asc";
    state.page = Math.max(1, parseInt(params.get("page"), 10) || 1);
  }

  function writeUrl() {
    const params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.show !== "all") params.set("show", state.show);
    if (state.sort !== "title" || state.dir !== "asc") {
      params.set("sort", state.sort);
      params.set("dir", state.dir);
    }
    if (state.page > 1) params.set("page", state.page);
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? "?" + query : ""));
  }

  function comparator() {
    const sign = state.dir === "desc" ? -1 : 1;
    if (state.sort === "title") {
      return (a, b) => sign * a.title.localeCompare(b.title, "en", { sensitivity: "base" });
    }
    const key = state.sort === "price" ? "price" : "change";
    return (a, b) => {
      const x = a[key];
      const y = b[key];
      if (x == null && y == null) return 0;
      if (x == null) return 1; // books without a value always go last
      if (y == null) return -1;
      return sign * (x - y);
    };
  }

  function rowHtml(p) {
    const kind = PT.trend(p);
    return (
      `<tr class="${kind}">` +
      `<td class="c-title" data-label="Book"><a href="product.html?id=${p.id}">${PT.esc(p.title)}</a></td>` +
      `<td class="c-trend" data-label="Trend">${PT.sparkline(p.prices, kind)}</td>` +
      `<td class="num" data-label="Current price">${PT.money(p.price)}</td>` +
      `<td class="num" data-label="Previous price">${PT.money(p.old)}</td>` +
      `<td class="num" data-label="Change">${PT.chip(p)}</td>` +
      `</tr>`
    );
  }

  function render() {
    const q = state.q.trim().toLowerCase();
    const searched = q ? products.filter((p) => p.title.toLowerCase().includes(q)) : products;

    const counts = { all: searched.length, down: 0, up: 0, flat: 0 };
    searched.forEach((p) => counts[PT.trend(p)]++);
    document.querySelectorAll("#show-seg button").forEach((button) => {
      const show = button.dataset.show;
      button.setAttribute("aria-pressed", String(show === state.show));
      button.querySelector(".count").textContent = counts[show === "all" ? "all" : KIND[show]];
    });

    visible = searched.filter((p) => state.show === "all" || PT.trend(p) === KIND[state.show]);
    visible.sort(comparator());

    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * PAGE_SIZE;
    $("#rows").innerHTML = visible.slice(start, start + PAGE_SIZE).map(rowHtml).join("");

    $("#empty").hidden = visible.length > 0;
    $("#range").textContent = visible.length
      ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, visible.length)} of ${visible.length}`
      : "";
    $("#page-info").textContent = `Page ${state.page} of ${pages}`;
    $("#prev").disabled = state.page <= 1;
    $("#next").disabled = state.page >= pages;

    document.querySelectorAll(".books th[data-sort]").forEach((th) => {
      const active = th.dataset.sort === state.sort;
      if (active) th.setAttribute("aria-sort", state.dir === "asc" ? "ascending" : "descending");
      else th.removeAttribute("aria-sort");
      const button = th.querySelector("button");
      button.textContent = button.textContent.replace(/ [↑↓]$/, "") + (active ? (state.dir === "asc" ? " ↑" : " ↓") : "");
    });

    writeUrl();
  }

  function csvCell(value) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function downloadCsv() {
    const rows = [["title", "url", "price", "previous_price", "change_percent"]];
    visible.forEach((p) => {
      // a leading = + - @ would be run as a formula by excel
      const title = /^[=+\-@]/.test(p.title) ? "'" + p.title : p.title;
      rows.push([title, p.url, p.price.toFixed(2), p.old == null ? "" : p.old.toFixed(2), p.change == null ? "" : p.change.toFixed(2)]);
    });
    // the BOM makes excel read the file as utf-8
    const csv = "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "prices-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function moversHtml(list) {
    return list
      .map(
        (p) =>
          `<li><a href="product.html?id=${p.id}"><span class="m-title">${PT.esc(p.title)}</span><span class="m-lead"></span>` +
          `<span class="m-price">${PT.money(p.price)}</span>${PT.chip(p)}</a></li>`
      )
      .join("");
  }

  function drawMovesChart(days) {
    const rises = [];
    const drops = [];
    for (let i = 1; i < days.length; i++) {
      let up = 0;
      let down = 0;
      products.forEach((p) => {
        const before = p.prices[i - 1];
        const now = p.prices[i];
        if (before == null || now == null || Math.abs(now - before) < 0.001) return;
        if (now > before) up++;
        else down++;
      });
      rises.push(up);
      drops.push(-down);
    }

    const total = rises.reduce((sum, n) => sum + n, 0) - drops.reduce((sum, n) => sum + n, 0);
    if (days.length < 2 || total === 0) {
      $("#moves-note").textContent = "No price moves recorded yet. Run the scraper on a few different days, or load the demo data.";
    }
    if (days.length < 2) return;

    new Chart($("#moves-chart"), {
      type: "bar",
      data: {
        labels: days.slice(1).map(PT.shortDate),
        datasets: [
          {
            label: "More expensive",
            data: rises,
            backgroundColor: PT.cssVar("--up"),
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: false,
          },
          {
            label: "Cheaper",
            data: drops,
            backgroundColor: PT.cssVar("--down"),
            borderRadius: { bottomLeft: 4, bottomRight: 4 },
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        datasets: { bar: { categoryPercentage: 0.9, barPercentage: 0.85 } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: {
            stacked: true,
            grid: { color: PT.cssVar("--line") },
            ticks: { callback: (value) => Math.abs(value), font: { family: PT.cssVar("--body"), size: 12 } },
          },
        },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${Math.abs(item.parsed.y)} books` } },
        },
      },
    });
  }

  let data;
  try {
    data = await PT.loadData();
  } catch (err) {
    $("#error").hidden = false;
    return;
  }
  products = data.products;
  await PT.setupChartDefaults();

  const drops = products.filter((p) => PT.trend(p) === "down").length;
  const rises = products.filter((p) => PT.trend(p) === "up").length;
  const flat = products.length - drops - rises;
  const total = products.length.toLocaleString("en-GB");
  const updated = data.updated ? PT.longDate(data.updated.slice(0, 10)) : null;
  $("#title").textContent = `Prices of ${total} books`;
  $("#r-total").textContent = total;
  $("#r-drops").textContent = drops.toLocaleString("en-GB");
  $("#r-rises").textContent = rises.toLocaleString("en-GB");
  $("#r-flat").textContent = flat.toLocaleString("en-GB");
  $("#r-updated").textContent = updated ? "Updated " + updated : "No prices yet";
  $("#demo-note").hidden = !data.demo;

  const changed = products.filter((p) => p.change != null);
  $("#drops").innerHTML = moversHtml(changed.filter((p) => p.change < 0).sort((a, b) => a.change - b.change).slice(0, 4));
  $("#rises").innerHTML = moversHtml(changed.filter((p) => p.change > 0).sort((a, b) => b.change - a.change).slice(0, 4));

  drawMovesChart(data.days);

  readUrl();
  $("#q").value = state.q;
  render();

  let timer;
  $("#q").addEventListener("input", (event) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = event.target.value;
      state.page = 1;
      render();
    }, 120);
  });

  $("#show-seg").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    state.show = button.dataset.show;
    state.page = 1;
    render();
  });

  document.querySelector(".books thead").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sort]");
    if (!button) return;
    const key = button.dataset.sort;
    state.dir = state.sort === key && state.dir === "asc" ? "desc" : "asc";
    state.sort = key;
    state.page = 1;
    render();
  });

  $("#prev").addEventListener("click", () => {
    state.page--;
    render();
  });
  $("#next").addEventListener("click", () => {
    state.page++;
    render();
  });
  $("#csv").addEventListener("click", downloadCsv);

  // press / to jump to the search box
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      event.preventDefault();
      $("#q").focus();
    }
  });
})();
