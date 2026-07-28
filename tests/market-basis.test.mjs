import assert from "node:assert/strict";
import test from "node:test";

import { detectMajorVBottom, findBasisExtremes } from "../lib/market-data.mjs";

function row(date, high, low, close = high) {
  return { date, high, low, close };
}

test("ordinary pullbacks never replace the crisis basis", () => {
  const result = detectMajorVBottom(
    [
      row("2021-01-29", 100, 95, 98),
      row("2021-02-26", 120, 105, 115),
      row("2021-03-31", 118, 92, 100),
      row("2021-04-30", 115, 96, 110),
    ],
    { asOfDate: "2021-06-01" },
  );

  assert.equal(result, null);
});

test("a 30 percent crash plus a confirmed monthly V produces a locked basis", () => {
  const result = detectMajorVBottom(
    [
      row("2021-01-29", 100, 95, 98),
      row("2021-02-26", 120, 110, 115),
      row("2021-03-31", 100, 82, 85),
      row("2021-04-30", 88, 70, 75),
      row("2021-05-31", 82, 74, 80),
      row("2021-06-30", 92, 76, 88),
    ],
    { asOfDate: "2021-07-01" },
  );

  assert.deepEqual(result, {
    highDate: "2021-02-26",
    highValue: 120,
    lowDate: "2021-04-30",
    lowValue: 70,
    source: "automatic-major-v",
    confirmedDate: "2021-06-30",
  });
});

test("an unfinished new crash does not replace the last confirmed V-bottom", () => {
  const result = detectMajorVBottom(
    [
      row("2020-01-31", 100, 95, 98),
      row("2020-02-28", 120, 110, 115),
      row("2020-03-31", 90, 70, 75),
      row("2020-04-30", 84, 74, 82),
      row("2020-05-29", 92, 76, 88),
      row("2021-01-29", 150, 140, 148),
      row("2021-02-26", 145, 100, 105),
    ],
    { asOfDate: "2021-04-01" },
  );

  assert.equal(result.highDate, "2020-02-28");
  assert.equal(result.lowDate, "2020-03-31");
});

test("historical faint markers use the lowest point after the high and highest point after the low", () => {
  const rows = [
    row("2021-01-29", 90, 80, 85),
    row("2021-02-26", 120, 110, 115),
    row("2021-03-31", 100, 70, 75),
    row("2021-04-30", 95, 72, 90),
    row("2021-05-31", 150, 100, 145),
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
      fallPeakDate: "2021-03-31",
      fallPeakValue: 70,
    },
  );
});
