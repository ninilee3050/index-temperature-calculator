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

test("historical faint markers use the highest point after the V-bottom and lowest point after that high", () => {
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

test("breaking a confirmed V-bottom cancels it and keeps tracking the same crash", () => {
  const rows = [
    row("2019-12-31", 100, 95, 98),
    row("2020-01-31", 100, 60, 65),
    row("2020-02-28", 85, 64, 80),
    row("2020-03-31", 90, 78, 88),
    row("2021-01-29", 200, 150, 190),
    row("2021-02-26", 190, 110, 120),
    row("2021-03-31", 150, 118, 145),
    row("2021-04-30", 160, 140, 150),
    row("2021-05-31", 150, 105, 108),
  ];

  const confirmed = detectMajorVBottom(rows.slice(0, 8), { asOfDate: "2021-05-15" });
  assert.equal(confirmed.highValue, 200);
  assert.equal(confirmed.lowValue, 110);

  const broken = detectMajorVBottom(rows, { asOfDate: "2021-06-15" });
  assert.equal(broken.highValue, 100);
  assert.equal(broken.lowValue, 60);

  const reconfirmed = detectMajorVBottom(
    [...rows, row("2021-06-30", 125, 104, 122), row("2021-07-30", 135, 120, 130), row("2021-08-31", 140, 125, 135)],
    { asOfDate: "2021-09-15" },
  );
  assert.equal(reconfirmed.highDate, "2021-01-29");
  assert.equal(reconfirmed.highValue, 200);
  assert.equal(reconfirmed.lowDate, "2021-06-30");
  assert.equal(reconfirmed.lowValue, 104);
});

test("a dip that holds above the confirmed V-bottom keeps the basis", () => {
  const result = detectMajorVBottom(
    [
      row("2021-01-29", 200, 150, 190),
      row("2021-02-26", 190, 110, 120),
      row("2021-03-31", 150, 118, 145),
      row("2021-04-30", 160, 140, 150),
      row("2021-05-31", 150, 111, 120),
    ],
    { asOfDate: "2021-06-15" },
  );

  assert.equal(result.highValue, 200);
  assert.equal(result.lowValue, 110);
});
