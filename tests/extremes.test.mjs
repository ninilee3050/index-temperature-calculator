import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function runScenario(scenario) {
  const context = {
    console,
    structuredClone,
    URLSearchParams,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    document: {
      addEventListener: () => {},
    },
  };
  vm.createContext(context);
  vm.runInContext(`${appSource}\n;globalThis.__result = (${scenario})();`, context);
  return structuredClone(context.__result);
}

test("rise thermometer uses ten-percent intervals", () => {
  const rates = runScenario(`() => rangeGroups
    .filter((group) => group.kind === "rise")
    .flatMap((group) => group.rows)
    .filter((row) => (row.kind || "rise") === "rise")
    .map((row) => row.rate)`);

  assert.equal(rates.length, 40);
  assert.equal(rates[0], 4);
  assert.equal(rates.at(-1), 0.1);
  for (let index = 1; index < rates.length; index += 1) {
    assert.ok(Math.abs(rates[index - 1] - rates[index] - 0.1) < Number.EPSILON * 2);
  }
});

test("switching from NASDAQ resets only the saved US market to S&P 500", () => {
  const loaded = runScenario(`() => {
    localStorage.getItem = () => JSON.stringify({
      markets: {
        korea: { currentValue: 4321.09 },
        us: {
          currentValue: 20177.66,
          lowDate: "2022-10-13",
          lowValue: 10088.83,
          highDate: "2021-11-22",
          highValue: 16212.23,
        },
      },
    });
    return loadState();
  }`);

  assert.equal(loaded.markets.korea.currentValue, 4321.09);
  assert.equal(loaded.markets.us.symbol, "^GSPC");
  assert.equal(loaded.markets.us.currentValue, 7392.49);
  assert.equal(loaded.markets.us.highDate, "2020-02-19");
  assert.equal(loaded.markets.us.lowDate, "2020-03-23");
});

test("market header shows the exact index point without crowding the needle", () => {
  const result = runScenario(`() => {
    state.asOfDate = "2026-07-28";
    const market = {
      currentValue: 6023.66,
      lowDate: "2022-09-30",
      lowValue: 2134.77,
      highDate: "2021-06-25",
      highValue: 3316.08,
      risePeakValue: 9385.59,
      fallPeakValue: 5900,
      risePeakDate: "2026-06-19",
      fallPeakDate: "2026-07-24",
    };
    state.markets.korea = market;
    const rows = buildThermometerRows(
      market,
      getRiseNeedle(market).key,
      getFallNeedle(market).key,
      getRisePeakNeedle(market).key,
      getFallPeakNeedle(market).key,
    );
    return {
      card: renderMarketThermometer(marketMeta[0]),
      rows,
      drawdown: calcHighReturn(market),
      minusThirtyPoint: calculateRangeCell({ rate: -0.3 }, "fall", market).target,
    };
  }`);

  assert.match(result.card, /class="market-current-point"/);
  assert.match(result.card, /<strong>6,023\.66<\/strong>/);
  assert.doesNotMatch(result.rows, />현재 6,023\.66</);
  assert.match(result.rows, /45개월 · 182%/);
  assert.match(result.rows, /1개월 · -35%/);
  assert.match(result.rows, /최근 최고점/);
  assert.match(result.rows, /data-action="show-needle-info"/);
  assert.match(
    result.rows,
    /상승 기준 · 전저점 2,134\.77 \(2022-09-30\) → 현재 6,023\.66 \(2026-07-28\) · 45개월 28일 · 182\.17%/,
  );
  assert.match(
    result.rows,
    /하락 기준 · 최근 최고점 9,385\.59 \(2026-06-19\) → 현재 6,023\.66 \(2026-07-28\) · 1개월 9일 · -35\.82%/,
  );
  assert.ok(Math.abs(result.drawdown - (6023.66 / 9385.59 - 1)) < 1e-12);
  assert.ok(Math.abs(result.minusThirtyPoint - 6569.913) < 1e-9);
  assert.match(result.rows, /data-action="show-peak-info"/);
  assert.match(result.rows, /최고 9,385\.59 · 2026-06-19 · 1개월 9일 전/);
});

test("changing a basis keeps the recorded peak point and date", () => {
  const result = runScenario(`() => {
    const market = {
      currentValue: 120,
      lowValue: 100,
      highValue: 150,
      risePeakValue: 140,
      risePeakReturn: 0.4,
      risePeakDate: "2026-01-02",
      fallPeakValue: 110,
      fallPeakReturn: -0.2666666667,
      fallPeakDate: "2026-01-03",
    };
    ensureMarketExtremeValues(market, "2026-07-28");
    market.lowValue = 80;
    market.highValue = 160;
    syncMarketExtremeReturns(market);
    return market;
  }`);

  assert.equal(result.risePeakValue, 140);
  assert.equal(result.risePeakDate, "2026-01-02");
  assert.equal(result.risePeakReturn, 0.75);
  assert.equal(result.fallPeakValue, 110);
  assert.equal(result.fallPeakDate, "2026-01-03");
  assert.equal(result.fallPeakReturn, -0.3125);
});

test("legacy percentage records migrate to absolute points before a basis edit", () => {
  const result = runScenario(`() => {
    const market = {
      currentValue: 120,
      lowValue: 100,
      highValue: 150,
      risePeakValue: null,
      risePeakReturn: 0.4,
      risePeakDate: "2026-01-02",
      fallPeakValue: null,
      fallPeakReturn: -0.2,
      fallPeakDate: "2026-01-03",
    };
    ensureMarketExtremeValues(market, "2026-07-28");
    market.lowValue = 80;
    syncMarketExtremeReturns(market);
    return market;
  }`);

  assert.equal(result.risePeakValue, 140);
  assert.equal(result.risePeakReturn, 0.75);
  assert.equal(result.fallPeakValue, 120);
  assert.equal(result.fallPeakDate, "2026-01-03");
  assert.equal(result.fallPeakReturn, -0.2);
});

test("new market data automatically updates only genuine point extremes", () => {
  const result = runScenario(`() => {
    const market = {
      currentValue: 120,
      lowValue: 100,
      highValue: 150,
      risePeakValue: 140,
      risePeakReturn: 0.4,
      risePeakDate: "2026-01-02",
      fallPeakValue: 110,
      fallPeakReturn: -0.2666666667,
      fallPeakDate: "2026-01-03",
    };
    recordMarketExtremes(market, "2026-07-28");
    market.currentValue = 150;
    recordMarketExtremes(market, "2026-07-29");
    market.currentValue = 100;
    recordMarketExtremes(market, "2026-07-30");
    return market;
  }`);

  assert.equal(result.risePeakValue, 150);
  assert.equal(result.risePeakDate, "2026-07-29");
  assert.equal(result.fallPeakValue, 100);
  assert.equal(result.fallPeakDate, "2026-07-30");
});

test("state normalization uses the market date instead of the array index", () => {
  const result = runScenario(`() => {
    const normalized = normalizeState({
      asOfDate: "2026-07-28",
      macro: {},
      markets: {
        sample: {
          currentValue: 120,
          lowValue: 100,
          highValue: 150,
          risePeakValue: null,
          risePeakReturn: null,
          risePeakDate: null,
          fallPeakValue: null,
          fallPeakReturn: null,
          fallPeakDate: null,
        },
      },
    });
    return normalized.markets.sample;
  }`);

  assert.equal(result.risePeakDate, "2026-07-28");
  assert.equal(result.fallPeakDate, "2026-07-28");
});

test("automatic basis applies Yahoo historical extrema to the faint markers", () => {
  const result = runScenario(`() => {
    applyMarketBasis("korea", {
      highDate: "2021-06-25",
      highValue: 3316.08,
      lowDate: "2022-09-30",
      lowValue: 2134.77,
      risePeakDate: "2026-06-19",
      risePeakValue: 9385.59,
      fallPeakDate: "2026-07-24",
      fallPeakValue: 5900,
    });
    return state.markets.korea;
  }`);

  assert.equal(result.risePeakDate, "2026-06-19");
  assert.equal(result.risePeakValue, 9385.59);
  assert.equal(result.fallPeakDate, "2026-07-24");
  assert.equal(result.fallPeakValue, 5900);
});

test("manual basis takes only the extremes recomputed for its own low date", () => {
  const result = runScenario(`() => {
    const market = state.markets.korea;
    market.autoBasis = false;
    market.lowDate = "2020-03-19";
    market.lowValue = 1439.43;
    market.risePeakValue = 7216.62;
    market.risePeakDate = "2026-08-18";
    applyMarketBasis("korea", {
      highDate: "2026-06-19",
      highValue: 9385.59,
      lowDate: "2026-07-29",
      lowValue: 5262.77,
      risePeakDate: "2026-08-18",
      risePeakValue: 7216.62,
    });
    const afterAutomatic = { lowDate: market.lowDate, risePeakValue: market.risePeakValue };
    applyMarketBasis("korea", {
      manual: true,
      lowDate: "2019-01-01",
      risePeakDate: "2026-06-19",
      risePeakValue: 9000,
    });
    const afterStaleManual = market.risePeakValue;
    applyMarketBasis("korea", {
      manual: true,
      lowDate: "2020-03-19",
      risePeakDate: "2026-06-19",
      risePeakValue: 9385.59,
      fallPeakDate: "2026-07-29",
      fallPeakValue: 5262.77,
    });
    return { afterAutomatic, afterStaleManual, market, url: marketBasisUrl() };
  }`);

  assert.deepEqual(result.afterAutomatic, { lowDate: "2020-03-19", risePeakValue: 7216.62 });
  assert.equal(result.afterStaleManual, 7216.62);
  assert.equal(result.market.lowValue, 1439.43);
  assert.equal(result.market.risePeakValue, 9385.59);
  assert.equal(result.market.risePeakDate, "2026-06-19");
  assert.equal(result.market.fallPeakValue, 5262.77);
  assert.equal(result.url, "/api/market-basis?korea=2020-03-19");
});

test("each market header shows its own quote date", () => {
  const cards = runScenario(`() => {
    state.asOfDate = "2026-10-09";
    state.markets.korea.currentDate = "2026-10-08";
    state.markets.us.currentDate = "2026-10-09";
    return marketMeta.map((meta) => renderMarketThermometer(meta));
  }`);

  assert.match(cards[0], /<small>2026-10-08 기준<\/small>/);
  assert.match(cards[1], /<small>2026-10-09 기준<\/small>/);
});

test("elapsed time counts leftover days and switches to days under a month", () => {
  const result = runScenario(`() => ({
    days: elapsedSince("2026-10-06", "2026-10-09"),
    sameDay: elapsedSince("2026-10-09", "2026-10-09"),
    exact: elapsedSince("2026-07-09", "2026-10-09"),
    mixed: elapsedSince("2026-06-19", "2026-10-08"),
    monthEnd: elapsedSince("2026-01-31", "2026-03-01"),
  })`);

  assert.deepEqual(result.days, { short: "3일", full: "3일" });
  assert.deepEqual(result.sameDay, { short: "0일", full: "0일" });
  assert.deepEqual(result.exact, { short: "3개월", full: "3개월" });
  assert.deepEqual(result.mixed, { short: "3개월", full: "3개월 19일" });
  assert.deepEqual(result.monthEnd, { short: "1개월", full: "1개월 1일" });
});

test("macro chart draws one line with a grid line and label for every month", () => {
  const result = runScenario(`() => {
    const points = [
      { date: "2025-12-30", value: 1380.5 },
      { date: "2026-01-02", value: 1362.1 },
      { date: "2026-01-30", value: 1358.0 },
      { date: "2026-02-02", value: 1351.4 },
      { date: "2026-03-02", value: 1340.9 },
    ];
    const { svg, layout } = buildChartSvg(points, macroCharts.usdKrw, 600, 300);
    return { svg, xs: layout.xs, ys: layout.ys, right: 600 - 18, ticks: niceTicks(1340.9, 1380.5) };
  }`);

  assert.equal(result.xs.length, 5);
  assert.equal(result.xs.at(-1), result.right);
  assert.ok(result.ys[0] < result.ys.at(-1));
  assert.deepEqual(result.ticks, [1340, 1350, 1360, 1370, 1380, 1390]);
  assert.match(result.svg, /class="chart-line" d="M54\.0 /);
  assert.equal(result.svg.match(/chart-grid is-month/g).length, 3);
  assert.match(result.svg, />1월</);
  assert.match(result.svg, />2025년</);
  assert.match(result.svg, />2026년</);
  assert.match(result.svg, />2월</);
  assert.doesNotMatch(result.svg, /is-baseline/);
});

test("dollar index and spreads get a reference line even when the data stays on one side", () => {
  const result = runScenario(`() => ({
    dollar: buildChartSvg(
      [{ date: "2026-09-01", value: 102.9 }, { date: "2026-10-09", value: 104.2 }],
      macroCharts.dollarIndex, 600, 300,
    ).svg,
    spread: buildChartSvg(
      [{ date: "2026-09-01", value: 0.31 }, { date: "2026-10-09", value: 0.44 }],
      macroCharts.spread10y2y, 600, 300,
    ).svg,
  })`);

  assert.match(result.dollar, /class="chart-grid is-baseline"/);
  assert.match(result.dollar, /class="chart-axis-text is-baseline"[^>]*>100</);
  assert.match(result.spread, /class="chart-axis-text is-baseline"[^>]*>0\.0%</);
});

test("fear and greed chart draws the zone boundaries and names each zone", () => {
  const svg = runScenario(`() => buildChartSvg(
    [{ date: "2026-10-08", value: 38 }, { date: "2026-10-09", value: 45 }],
    macroCharts.fearGreed, 600, 300,
  ).svg`);

  for (const boundary of [0, 25, 45, 55, 75, 100]) {
    assert.match(svg, new RegExp(`dominant-baseline="middle">${boundary}<`));
  }
  assert.equal(svg.match(/class="chart-grid is-zone"/g).length, 6);
  assert.deepEqual(
    [...svg.matchAll(/class="chart-zone is-([a-z-]+)"/g)].map((match) => match[1]),
    ["cold-strong", "cold", "neutral", "hot", "hot-strong"],
  );
  for (const zone of ["극단적 공포", "공포", "중립", "탐욕", "극단적 탐욕"]) {
    assert.match(svg, new RegExp(`>${zone}<`));
  }
});
