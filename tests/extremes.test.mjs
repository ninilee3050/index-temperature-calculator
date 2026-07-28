import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function runScenario(scenario) {
  const context = {
    console,
    structuredClone,
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
      fallPeakDate: "2022-09-30",
      fallPeakValue: 2134.77,
    });
    return state.markets.korea;
  }`);

  assert.equal(result.risePeakDate, "2026-06-19");
  assert.equal(result.risePeakValue, 9385.59);
  assert.equal(result.fallPeakDate, "2022-09-30");
  assert.equal(result.fallPeakValue, 2134.77);
});
