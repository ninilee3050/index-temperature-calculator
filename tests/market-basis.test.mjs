import assert from "node:assert/strict";
import test from "node:test";

import { detectCycleBasis, findBasisExtremes } from "../lib/market-data.mjs";

function row(date, high, low, close = high) {
  return { date, high, low, close };
}

// 24 flat months at 100 so the 20-month average exists and sits at 100.
function flatHistory() {
  const rows = [];
  for (let index = 0; index < 24; index += 1) {
    const year = 2018 + Math.floor(index / 12);
    const month = String((index % 12) + 1).padStart(2, "0");
    rows.push(row(`${year}-${month}-15`, 100, 95, 100));
  }
  return rows;
}

test("a 30 percent fall under the 20-month average sets the basis right away", () => {
  const result = detectCycleBasis([
    ...flatHistory(),
    row("2020-01-15", 120, 110, 118),
    row("2020-02-14", 115, 80, 82),
  ]);

  assert.deepEqual(result, {
    highDate: "2020-01-15",
    highValue: 120,
    lowDate: "2020-02-14",
    lowValue: 80,
    source: "automatic-cycle",
  });
});

test("the low keeps following the price down once it qualifies", () => {
  const result = detectCycleBasis([
    ...flatHistory(),
    row("2020-01-15", 120, 110, 118),
    row("2020-02-14", 115, 80, 82),
    row("2020-03-13", 90, 70, 75),
    row("2020-04-15", 95, 72, 90),
  ]);

  assert.equal(result.highValue, 120);
  assert.equal(result.lowDate, "2020-03-13");
  assert.equal(result.lowValue, 70);
});

test("a 30 percent fall that stays above the 20-month average is ignored", () => {
  const rows = [
    ...flatHistory(),
    row("2020-01-15", 120, 110, 118),
    row("2020-02-14", 115, 80, 82),
    row("2020-06-15", 130, 100, 128),
    row("2020-09-15", 300, 200, 290),
    row("2020-10-15", 280, 205, 220),
  ];

  const result = detectCycleBasis(rows);
  assert.equal(result.highDate, "2020-01-15");
  assert.equal(result.lowValue, 80);
});

test("a dip under the 20-month average that falls less than 30 percent is ignored", () => {
  const result = detectCycleBasis([
    ...flatHistory(),
    row("2020-01-15", 120, 110, 118),
    row("2020-02-14", 115, 80, 82),
    row("2020-06-15", 130, 100, 128),
    row("2020-07-15", 125, 95, 96),
  ]);

  assert.equal(result.highValue, 120);
  assert.equal(result.lowValue, 80);
});

test("a rebound below the previous high never starts a new cycle", () => {
  const result = detectCycleBasis([
    ...flatHistory(),
    row("2020-01-15", 120, 110, 118),
    row("2020-02-14", 115, 80, 82),
    row("2020-05-15", 110, 85, 108),
    row("2020-06-15", 105, 60, 62),
  ]);

  assert.equal(result.highDate, "2020-01-15");
  assert.equal(result.highValue, 120);
  assert.equal(result.lowDate, "2020-06-15");
  assert.equal(result.lowValue, 60);
});

test("the low is never taken from before the high", () => {
  const result = detectCycleBasis([
    ...flatHistory(),
    row("2020-01-06", 100, 50, 95),
    row("2020-01-20", 120, 110, 118),
    row("2020-02-14", 115, 80, 82),
  ]);

  assert.equal(result.lowDate, "2020-02-14");
  assert.ok(result.lowDate > result.highDate);
});

test("no basis without a qualifying fall", () => {
  assert.equal(detectCycleBasis([...flatHistory(), row("2020-01-15", 120, 110, 118)]), null);
});

test("faint markers use the highest point after the low and the lowest point after that high", () => {
  const rows = [
    row("2021-01-29", 90, 80, 85),
    row("2021-02-26", 120, 110, 115),
    row("2021-03-31", 100, 70, 75),
    row("2021-04-30", 95, 72, 90),
    row("2021-05-31", 150, 100, 145),
    row("2021-06-15", 140, 90, 120),
    row("2021-06-30", 0, 0, 0),
  ];

  assert.deepEqual(
    findBasisExtremes(rows, {
      highDate: "2021-02-26",
      highValue: 120,
      lowDate: "2021-03-31",
      lowValue: 70,
    }),
    {
      risePeakDate: "2021-05-31",
      risePeakValue: 150,
      fallPeakDate: "2021-06-15",
      fallPeakValue: 90,
    },
  );
});

test("while the rebound is below the previous high, the lowest record counts from that high", () => {
  const rows = [
    row("2021-02-26", 120, 110, 115),
    row("2021-03-31", 100, 70, 75),
    row("2021-04-30", 95, 72, 90),
    row("2021-05-31", 105, 88, 100),
  ];

  assert.deepEqual(
    findBasisExtremes(rows, {
      highDate: "2021-02-26",
      highValue: 120,
      lowDate: "2021-03-31",
      lowValue: 70,
    }),
    {
      risePeakDate: "2021-05-31",
      risePeakValue: 105,
      fallPeakDate: "2021-03-31",
      fallPeakValue: 70,
    },
  );
});
