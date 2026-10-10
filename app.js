const STORAGE_KEY = "index-range-calculator-state-v1";
const THEME_KEY = "index-range-calculator-theme";

const marketMeta = [
  { key: "korea", title: "한국 시장", code: "KOSPI", flag: "🇰🇷" },
  { key: "us", title: "미국 시장", code: "S&P 500", flag: "🇺🇸" },
];

const defaultState = {
  asOfDate: localDateString(),
  macro: {
    usdKrw: 1471.07,
    dollarIndex: "-",
    spread10y2y: "-",
    spread10y3m: "-",
    fearGreed: "-",
  },
  macroMeta: {
    usdKrw: null,
    dollarIndex: null,
    spread10y2y: null,
    spread10y3m: null,
    fearGreed: null,
  },
  liveData: {
    status: "시장 데이터 대기 중",
    updatedAt: null,
    errors: [],
  },
  markets: {
    korea: {
      autoBasis: true,
      currentValue: 6615.03,
      lowDate: "2022-09-30",
      lowValue: 2134.77,
      highDate: "2021-06-25",
      highValue: 3316.08,
      risePeakValue: null,
      risePeakReturn: null,
      risePeakDate: null,
      fallPeakValue: null,
      fallPeakReturn: null,
      fallPeakDate: null,
    },
    us: {
      symbol: "^GSPC",
      autoBasis: true,
      currentValue: 7392.49,
      lowDate: "2020-03-23",
      lowValue: 2191.86,
      highDate: "2020-02-19",
      highValue: 3393.52,
      risePeakValue: null,
      risePeakReturn: null,
      risePeakDate: null,
      fallPeakValue: null,
      fallPeakReturn: null,
      fallPeakDate: null,
    },
  },
};

const macroCharts = {
  usdKrw: { label: "달러 실시간 환율", digits: 2, suffix: "" },
  dollarIndex: { label: "달러 지수", digits: 2, suffix: "", baseline: 100 },
  spread10y2y: { label: "미국 장·단기 금리차 10Y-2Y", digits: 2, suffix: "%", baseline: 0 },
  spread10y3m: { label: "미국 장·단기 금리차 10Y-3M", digits: 2, suffix: "%", baseline: 0 },
  fearGreed: {
    label: "CNN 공포탐욕지수",
    digits: 0,
    suffix: "",
    ticks: [0, 25, 45, 55, 75, 100],
    zones: [
      { label: "극단적 공포", tone: "cold-strong" },
      { label: "공포", tone: "cold" },
      { label: "중립", tone: "neutral" },
      { label: "탐욕", tone: "hot" },
      { label: "극단적 탐욕", tone: "hot-strong" },
    ],
  },
};

let chartView = { key: null, points: [], layout: null, requestId: 0 };

const rangeGroups = [
  {
    label: "초과상승 구간",
    className: "range-overheat",
    kind: "rise",
    rows: descendingTenths(4.0, 3.1).map((rate) => ({ rate, sub: "" })),
  },
  {
    label: "과열상승 구간",
    className: "range-hot",
    kind: "rise",
    rows: descendingTenths(3.0, 2.1).map((rate) => ({ rate, sub: "" })),
  },
  {
    label: "기대상승 구간",
    className: "range-growth",
    kind: "rise",
    rows: descendingTenths(2.0, 1.1).map((rate) => ({ rate, sub: "" })),
  },
  {
    label: "상승시작 구간",
    className: "range-start",
    kind: "rise",
    rows: [
      ...descendingTenths(1.0, 0.1).map((rate) => ({ rate, sub: "" })),
      { rate: 0, sub: "전저점", kind: "riseBase" },
    ],
  },
  {
    label: "변동성 구간",
    className: "range-swing",
    kind: "fall",
    rows: [
      { rate: 0, sub: "최근 최고점", kind: "fallBase" },
      { rate: -0.1, sub: "변동" },
      { rate: -0.2, sub: "조정" },
      { rate: -0.3, sub: "폭락" },
    ],
  },
  {
    label: "허용위기 구간",
    className: "range-crisis",
    kind: "fall",
    rows: [
      { rate: -0.4, sub: "대폭락" },
      { rate: -0.5, sub: "반토막" },
      { rate: -0.6, sub: "심각" },
    ],
  },
  {
    label: "초과위기 구간",
    className: "range-deep",
    kind: "fall",
    rows: [
      { rate: -0.7, sub: "IMF 수준" },
      { rate: -0.8, sub: "국가 위기" },
      { rate: -0.9, sub: "전쟁" },
    ],
  },
];

function descendingTenths(start, end) {
  const startTenths = Math.round(start * 10);
  const endTenths = Math.round(end * 10);
  return Array.from(
    { length: startTenths - endTenths + 1 },
    (_, index) => (startTenths - index) / 10,
  );
}

let state = normalizeState(loadState());

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  setupActions();
  setupMacroChart();
  setupAutoHideTopNav();
  setupServerHeartbeat();
  renderAll();
  refreshLiveData({ quiet: true }).then((result) => {
    if (!result.ok) showToast("시장 데이터를 불러오지 못해 저장된 값을 표시합니다.", 4000);
  });
  refreshMarketBasis({ quiet: true });
});

function setupServerHeartbeat() {
  if (location.protocol === "file:") return;
  const sendHeartbeat = () =>
    fetch(`/api/heartbeat?t=${Date.now()}`, {
      method: "POST",
      cache: "no-store",
      keepalive: true,
    }).catch(() => {});
  fetch(`/api/health?t=${Date.now()}`, { cache: "no-store" })
    .then((response) => response.json())
    .then((payload) => {
      if (!payload.heartbeat) return;
      sendHeartbeat();
      setInterval(sendHeartbeat, 10000);
    })
    .catch(() => {});
}

function setupActions() {
  document.body.addEventListener("input", (event) => {
    const input = event.target.closest("[data-bind]");
    if (!input) return;
    const marketKey = isMarketBasisPath(input.dataset.bind) ? marketKeyFromPath(input.dataset.bind) : null;
    if (marketKey) {
      ensureMarketExtremeValues(state.markets[marketKey]);
    }
    setByPath(state, input.dataset.bind, readInput(input));
    if (marketKey) {
      state.markets[marketKey].autoBasis = false;
      syncMarketExtremeReturns(state.markets[marketKey]);
    }
    saveState();
    renderAll({ keepFocus: input.dataset.bind });
    if (
      (isMarketAutoBasisPath(input.dataset.bind) && input.checked) ||
      isMarketLowDatePath(input.dataset.bind)
    ) {
      refreshMarketBasis({ quiet: true });
    }
  });

  document.body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    if (button.dataset.action === "show-peak-info" || button.dataset.action === "show-needle-info") {
      showToast(button.dataset.message, 4000);
      return;
    }

    if (button.dataset.action === "refresh-data") {
      refreshAllData();
      return;
    }

    if (button.dataset.action === "toggle-theme") {
      toggleTheme();
      return;
    }

    if (button.dataset.action === "show-macro-chart") {
      openMacroChart(button.dataset.key);
      return;
    }

    if (button.dataset.action === "open-settings") {
      openSettingsDialog(button.dataset.market);
    }
  });
}

async function refreshAllData() {
  const [live, basis] = await Promise.all([
    refreshLiveData({ quiet: true }),
    refreshMarketBasis({ quiet: true }),
  ]);
  if (!live.ok) {
    showToast("시장 데이터를 불러오지 못해 저장된 값을 표시합니다.", 4000);
  } else if (live.failedKeys.length || !basis.ok) {
    const failed = [...live.failedKeys.map(macroLabel), ...(basis.ok ? [] : ["자동 기준"])];
    showToast(`일부 데이터를 불러오지 못했습니다: ${failed.join(", ")}`, 4000);
  } else {
    showToast("데이터를 새로고침했습니다.");
  }
}

function setupTheme() {
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const applySystemTheme = () => {
    if (hasSavedTheme()) return;
    document.documentElement.dataset.theme = systemTheme.matches ? "dark" : "light";
    updateThemeButton();
  };
  const savedTheme = localStorage.getItem(THEME_KEY);
  document.documentElement.dataset.theme = hasSavedTheme() ? savedTheme : systemTheme.matches ? "dark" : "light";
  updateThemeButton();
  systemTheme.addEventListener("change", applySystemTheme);
}

function setupAutoHideTopNav() {
  const topNav = document.querySelector(".top-nav");
  if (!topNav) return;

  const update = () => {
    topNav.classList.toggle("is-hidden", window.scrollY > 32);
  };

  window.addEventListener("scroll", update, { passive: true });
  update();
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem(THEME_KEY, nextTheme);
  updateThemeButton();
}

function updateThemeButton() {
  const button = document.querySelector("[data-theme-toggle]");
  if (!button) return;
  const isLight = document.documentElement.dataset.theme !== "dark";
  button.classList.toggle("is-on", isLight);
  button.setAttribute("aria-pressed", String(isLight));
  button.setAttribute("aria-label", isLight ? "전등 끄기" : "전등 켜기");
  const label = button.querySelector(".theme-label");
  if (label) label.textContent = isLight ? "켜짐" : "꺼짐";
}

function hasSavedTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  return savedTheme === "dark" || savedTheme === "light";
}

function openSettingsDialog(marketKey) {
  const dialog = document.querySelector("[data-settings-dialog]");
  const market = marketMeta.find((item) => item.key === marketKey);
  document.querySelector("[data-settings-title]").textContent = market
    ? `${market.title} ${market.code} 기준 설정`
    : "기준 설정";
  document.querySelectorAll("[data-settings-market]").forEach((panel) => {
    panel.hidden = Boolean(marketKey) && panel.dataset.settingsMarket !== marketKey;
  });
  renderBoundInputs();
  dialog.showModal();
}

async function refreshLiveData({ quiet = false } = {}) {
  if (location.protocol === "file:") {
    state.liveData = {
      status: "자동 불러오기는 로컬 서버 주소로 열면 작동합니다",
      updatedAt: null,
      errors: [],
    };
    renderTopTimestamp();
    if (!quiet) showToast("앱 서버 주소로 열면 시장 데이터를 불러옵니다.");
    return { ok: true, failedKeys: [] };
  }

  state.liveData = {
    status: "시장 데이터 불러오는 중",
    updatedAt: state.liveData.updatedAt,
    errors: [],
  };
  renderTopTimestamp();

  try {
    const response = await fetch("/api/macro", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "시장 데이터 응답이 비어 있습니다.");
    }

    applyMarketPoint("korea", payload.values.kospi);
    applyMarketPoint("us", payload.values.sp500);
    applyAsOfDate([payload.values.kospi, payload.values.sp500]);
    applyLivePoint("usdKrw", payload.values.usdKrw, (value) => Number(value.toFixed(2)));
    applyLivePoint("dollarIndex", payload.values.dollarIndex, (value) => Number(value.toFixed(2)));
    applyLivePoint("spread10y2y", payload.values.spread10y2y, (value) => `${formatNumber(value, 2)}%`);
    applyLivePoint("spread10y3m", payload.values.spread10y3m, (value) => `${formatNumber(value, 2)}%`);
    applyFearGreed(payload.values.fearGreed);

    state.liveData = {
      status: payload.errors?.length ? "시장 데이터 일부 갱신 완료" : "시장 데이터 갱신 완료",
      updatedAt: payload.updatedAt,
      errors: payload.errors || [],
    };
    saveState();
    renderAll();
    if (!quiet) showToast("시장 데이터를 갱신했습니다.");
    return { ok: true, failedKeys: state.liveData.errors.map((item) => item.key) };
  } catch (error) {
    state.liveData = {
      status: "자동 불러오기 실패, 수동 입력값 사용 중",
      updatedAt: state.liveData.updatedAt,
      failed: true,
      errors: [{ key: "network", error: String(error.message || error) }],
    };
    renderTopTimestamp();
    if (!quiet) showToast("시장 데이터를 불러오지 못했습니다.");
    return { ok: false, failedKeys: [] };
  }
}

async function refreshMarketBasis({ quiet = false } = {}) {
  if (location.protocol === "file:") return { ok: true };
  try {
    const response = await fetch(marketBasisUrl(), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "자동 기준점 응답이 비어 있습니다.");
    }
    applyMarketBasis("korea", payload.values.korea);
    applyMarketBasis("us", payload.values.us);
    saveState();
    renderAll({ keepFocus: true });
    return { ok: !payload.errors?.length };
  } catch {
    if (!quiet) showToast("자동 기준점을 불러오지 못해 저장된 기준을 사용합니다.");
    return { ok: false };
  }
}

function marketBasisUrl() {
  const params = new URLSearchParams();
  marketMeta.forEach(({ key }) => {
    const market = state.markets[key];
    if (market.autoBasis === false && market.lowDate) params.set(key, market.lowDate);
  });
  const query = params.toString();
  return query ? `/api/market-basis?${query}` : "/api/market-basis";
}

function macroLabel(key) {
  const labels = {
    kospi: "KOSPI",
    sp500: "S&P 500",
    usdKrw: "환율",
    dollarIndex: "달러 지수",
    spread10y2y: "금리차 10Y-2Y",
    spread10y3m: "금리차 10Y-3M",
    fearGreed: "공포탐욕지수",
  };
  return labels[key] || key;
}

function applyLivePoint(key, point, formatter) {
  if (!point || !Number.isFinite(Number(point.value))) return;
  state.macro[key] = formatter(Number(point.value));
  state.macroMeta[key] = {
    source: point.source || "source",
    date: point.date || "",
  };
}

function applyMarketPoint(marketKey, point) {
  if (!point || !Number.isFinite(Number(point.value))) return;
  const market = state.markets[marketKey];
  market.currentValue = Number(Number(point.value).toFixed(2));
  market.currentDate = point.date || null;
  recordMarketExtremes(market, point.date || state.asOfDate);
}

function applyMarketBasis(marketKey, basis) {
  if (!basis) return;
  const market = state.markets[marketKey];
  if (market.autoBasis === false) {
    // Manual basis: only take the extremes the server recomputed for this exact low date.
    if (!basis.manual || basis.lowDate !== market.lowDate) return;
    if (finiteNumber(basis.highValue) !== null && basis.highDate) {
      market.highDate = basis.highDate;
      market.highValue = finiteNumber(basis.highValue);
    }
  } else {
    const highValue = finiteNumber(basis.highValue);
    const lowValue = finiteNumber(basis.lowValue);
    if (basis.manual || highValue === null || lowValue === null || !basis.highDate || !basis.lowDate) return;
    ensureMarketExtremeValues(market);
    market.highDate = basis.highDate;
    market.highValue = highValue;
    market.lowDate = basis.lowDate;
    market.lowValue = lowValue;
  }
  const risePeakValue = finiteNumber(basis.risePeakValue);
  const fallPeakValue = finiteNumber(basis.fallPeakValue);
  if (risePeakValue !== null && basis.risePeakDate) {
    market.risePeakValue = risePeakValue;
    market.risePeakDate = basis.risePeakDate;
  }
  if (fallPeakValue !== null && basis.fallPeakDate) {
    market.fallPeakValue = fallPeakValue;
    market.fallPeakDate = basis.fallPeakDate;
  }
  syncMarketExtremeReturns(market);
}

function applyAsOfDate(points) {
  const dates = points
    .map((point) => point?.date)
    .filter(Boolean)
    .sort();
  state.asOfDate = dates.at(-1) || localDateString();
}

function applyFearGreed(point) {
  if (!point || !Number.isFinite(Number(point.value))) return;
  state.macro.fearGreed = point.value;
  state.macroMeta.fearGreed = {
    source: point.source || "CNN Fear & Greed",
    date: point.date || "",
    rating: point.rating || "",
    previousClose: point.previousClose,
    previousWeek: point.previousWeek,
    previousMonth: point.previousMonth,
    previousYear: point.previousYear,
  };
}

function renderAll(options = {}) {
  renderBoundInputs(options.keepFocus);
  renderMarketThermometers();
  renderMacroList();
  renderTopTimestamp();
}

function renderTopTimestamp() {
  const target = document.querySelector("[data-date-badge]");
  if (!target) return;
  const updatedAt = state.liveData?.updatedAt;
  const label = updatedAt ? formatTopDateTime(updatedAt) : "갱신 대기 중";
  target.textContent = state.liveData?.failed ? `${label} · 갱신 실패` : label;
}

function renderBoundInputs(keepFocus) {
  const active = keepFocus ? document.activeElement : null;
  document.querySelectorAll("[data-bind]").forEach((input) => {
    if (input === active) return;
    const value = getByPath(state, input.dataset.bind);
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
    } else {
      input.value = value ?? "";
    }
  });
}

function renderMarketThermometers() {
  const target = document.querySelector("[data-market-thermometers]");
  if (!target) return;
  target.innerHTML = marketMeta.map((meta) => renderMarketThermometer(meta)).join("");
}

function renderMarketThermometer(meta) {
  const market = state.markets[meta.key];
  const riseNeedle = getRiseNeedle(market);
  const fallNeedle = getFallNeedle(market);
  const risePeakNeedle = getRisePeakNeedle(market);
  const fallPeakNeedle = getFallPeakNeedle(market);
  const rows = buildThermometerRows(market, riseNeedle.key, fallNeedle.key, risePeakNeedle.key, fallPeakNeedle.key);
  return `
    <article class="thermo-card">
      <div class="thermo-card-head">
        <div class="market-title-block">
          <p class="eyebrow">${meta.title}</p>
          <div class="market-title-row">
            <span class="market-flag" aria-hidden="true">${meta.flag}</span>
            <h3>${meta.code}</h3>
          </div>
          <div class="market-current-point">
            <span>현재 지수</span>
            <strong>${formatNumber(market.currentValue)}</strong>
            <small>${market.currentDate ? `${market.currentDate} 기준` : "갱신 전 기본값"}</small>
          </div>
        </div>
        <div class="market-header-actions">
          <button class="market-settings-button" type="button" data-action="open-settings" data-market="${meta.key}">
            기준 설정
          </button>
        </div>
      </div>
      <div class="thermo-device" aria-label="${meta.title} 통합 지수온도계">
        <div class="thermo-scale">
          <div class="thermo-device-head">
            <span>구간</span>
            <span>명칭</span>
            <span>온도</span>
            <span>지수 포인트</span>
            <span>표시</span>
          </div>
          ${rows}
        </div>
      </div>
    </article>
  `;
}

function buildThermometerRows(market, riseNeedleKey, fallNeedleKey, risePeakNeedleKey, fallPeakNeedleKey) {
  const lowReturn = calcLowReturn(market);
  const highReturn = calcHighReturn(market);
  const risePeakReturn = getRisePeakReturn(market);
  const fallPeakReturn = getFallPeakReturn(market);
  const asOfDate = marketAsOfDate(market);
  const riseElapsed = elapsedSince(market.lowDate, asOfDate);
  const fallAnchorDate = getFallAnchorDate(market);
  const fallAnchorValue = getFallAnchorValue(market);
  const fallElapsed = elapsedSince(fallAnchorDate, asOfDate);
  const riseLabel = `${riseElapsed.short} · ${truncatePercent(lowReturn)}%`;
  const fallLabel = `${fallElapsed.short} · ${truncatePercent(Math.min(highReturn, 0))}%`;
  const riseTitle = `상승 기준 · 전저점 ${formatNumber(market.lowValue)} (${market.lowDate}) → 현재 ${formatNumber(market.currentValue)} (${asOfDate}) · ${riseElapsed.full} · ${formatSignedPercent(lowReturn)}`;
  const fallTitle = `하락 기준 · 최근 최고점 ${formatNumber(fallAnchorValue)} (${fallAnchorDate}) → 현재 ${formatNumber(market.currentValue)} (${asOfDate}) · ${fallElapsed.full} · ${formatSignedPercent(Math.min(highReturn, 0))}`;
  const risePeakLabel = `최고 ${truncatePercent(risePeakReturn)}%`;
  const fallPeakLabel = `최저 ${truncatePercent(fallPeakReturn)}%`;
  const risePeakTitle = peakTitle("최고", market.risePeakDate, market.risePeakValue, asOfDate);
  const fallPeakTitle = peakTitle("최저", market.fallPeakDate, market.fallPeakValue, asOfDate);
  return rangeGroups
    .map((group) => {
      const groupRows = group.rows
        .map((row) => {
          const kind = row.kind || group.kind;
          const result = calculateRangeCell(row, kind, market);
          const key = thermometerRowKey(kind, row);
          const isRiseNeedle = key === riseNeedleKey;
          const isFallNeedle = key === fallNeedleKey;
          const isRiseFill =
            (kind === "rise" && lowReturn >= row.rate) || (kind === "riseBase" && lowReturn > 0);
          const isFallFill =
            (kind === "fall" && highReturn <= row.rate) || (kind === "fallBase" && highReturn < 0);
          const isRisePeak =
            !isRiseFill &&
            ((kind === "rise" && risePeakReturn >= row.rate) || (kind === "riseBase" && risePeakReturn > 0));
          const isFallPeak =
            !isFallFill &&
            ((kind === "fall" && fallPeakReturn <= row.rate) || (kind === "fallBase" && fallPeakReturn < 0));
          const isRisePeakNeedle = isRisePeak && key === risePeakNeedleKey;
          const isFallPeakNeedle = isFallPeak && key === fallPeakNeedleKey;
          const isZero = kind === "riseBase" || kind === "fallBase";
          const baseClass = isZero ? `range-zero-${kind === "riseBase" ? "rise" : "fall"}` : "";
          return `
            <div class="thermo-row ${baseClass} ${isZero ? "is-zero-row" : ""} ${
              isRiseNeedle || isFallNeedle ? "has-needle" : ""
            }">
              <div class="thermo-subcategory ${row.sub ? "" : "is-empty"}">${row.sub || ""}</div>
              <div class="thermo-rate">${formatRate(row.rate)}</div>
              <div class="thermo-point">${formatNumber(result.target)}</div>
              <div class="thermo-needle-cell ${isRiseFill ? "is-rise-filled" : ""} ${
              isFallFill ? "is-fall-filled" : ""
            } ${isRisePeak ? "is-rise-peak" : ""} ${
              isFallPeak ? "is-fall-peak" : ""
            } ${isZero ? "is-zero" : ""}">
                ${
                  isRiseNeedle
                    ? `<button type="button" class="mercury-label rise" title="${riseTitle}" aria-label="${riseTitle}" data-action="show-needle-info" data-message="${riseTitle}">${riseLabel}</button>`
                    : ""
                }
                ${
                  isFallNeedle
                    ? `<button type="button" class="mercury-label fall" title="${fallTitle}" aria-label="${fallTitle}" data-action="show-needle-info" data-message="${fallTitle}">${fallLabel}</button>`
                    : ""
                }
                ${
                  isRisePeakNeedle
                    ? `<button type="button" class="peak-label rise" title="${risePeakTitle}" aria-label="${risePeakTitle}" data-action="show-peak-info" data-message="${risePeakTitle}">${risePeakLabel}</button>`
                    : ""
                }
                ${
                  isFallPeakNeedle
                    ? `<button type="button" class="peak-label fall" title="${fallPeakTitle}" aria-label="${fallPeakTitle}" data-action="show-peak-info" data-message="${fallPeakTitle}">${fallPeakLabel}</button>`
                    : ""
                }
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="thermo-group ${group.className}" style="--row-count: ${group.rows.length}">
          <div class="thermo-category">
            <span class="category-main">${group.label}</span>
          </div>
          ${groupRows}
        </div>
      `;
    })
    .join("");
}

function calculateRangeCell(row, kind, market) {
  if (kind === "rise") {
    const target = market.lowValue * (1 + row.rate);
    return { target, active: calcLowReturn(market) >= row.rate };
  }
  if (kind === "fall") {
    const target = getFallAnchorValue(market) * (1 + row.rate);
    return { target, active: calcHighReturn(market) <= row.rate };
  }
  if (kind === "riseBase") {
    return { target: market.lowValue, text: "상승 0%" };
  }
  if (kind === "fallBase") {
    return { target: getFallAnchorValue(market), text: "하락 0%" };
  }
  return { target: null, text: "0% 기준" };
}

function getRiseNeedle(market) {
  const rise = calcLowReturn(market);
  const riseGroups = rangeGroups.filter((group) => group.kind === "rise");
  const rows = riseGroups.flatMap((group) =>
    group.rows.map((row) => {
      const kind = row.kind || group.kind;
      return { group, row, key: thermometerRowKey(kind, row) };
    }),
  );
  const sorted = [...rows].sort((a, b) => a.row.rate - b.row.rate);
  const selected = sorted.findLast((item) => rise >= item.row.rate);
  if (!selected) return getBaseNeedle("riseBase", "상승 기준선");
  return {
    ...selected,
    zone: selected.group.label,
  };
}

function getFallNeedle(market) {
  const fall = calcHighReturn(market);
  if (fall >= 0) {
    return getBaseNeedle("fallBase", "하락 위험 없음");
  }
  const fallGroups = rangeGroups.filter((group) => group.kind === "fall");
  const rows = fallGroups.flatMap((group) =>
    group.rows.map((row) => {
      const kind = row.kind || group.kind;
      return { group, row, key: thermometerRowKey(kind, row) };
    }),
  );
  const sorted = [...rows].sort((a, b) => b.row.rate - a.row.rate);
  const selected = sorted.filter((item) => fall <= item.row.rate).at(-1) || sorted.at(-1);
  return {
    ...selected,
    zone: selected.group.label,
  };
}

function getRisePeakNeedle(market) {
  return getRiseNeedleByReturn(getRisePeakReturn(market));
}

function getFallPeakNeedle(market) {
  return getFallNeedleByReturn(getFallPeakReturn(market));
}

function getRiseNeedleByReturn(rise) {
  const riseGroups = rangeGroups.filter((group) => group.kind === "rise");
  const rows = riseGroups.flatMap((group) =>
    group.rows.map((row) => {
      const kind = row.kind || group.kind;
      return { group, row, key: thermometerRowKey(kind, row) };
    }),
  );
  const sorted = [...rows].sort((a, b) => a.row.rate - b.row.rate);
  const selected = sorted.findLast((item) => rise >= item.row.rate);
  if (!selected) return getBaseNeedle("riseBase", "상승 기준");
  return {
    ...selected,
    zone: selected.group.label,
  };
}

function getFallNeedleByReturn(fall) {
  if (fall >= 0) {
    return getBaseNeedle("fallBase", "하락 위험 없음");
  }
  const fallGroups = rangeGroups.filter((group) => group.kind === "fall");
  const rows = fallGroups.flatMap((group) =>
    group.rows.map((row) => {
      const kind = row.kind || group.kind;
      return { group, row, key: thermometerRowKey(kind, row) };
    }),
  );
  const sorted = [...rows].sort((a, b) => b.row.rate - a.row.rate);
  const selected = sorted.filter((item) => fall <= item.row.rate).at(-1) || sorted.at(-1);
  return {
    ...selected,
    zone: selected.group.label,
  };
}

function getBaseNeedle(kind, zone) {
  const base = rangeGroups
    .flatMap((group) => group.rows.map((row) => ({ group, row })))
    .find((item) => (item.row.kind || item.group.kind) === kind);
  const { group, row } = base;
  return {
    group,
    row,
    key: thermometerRowKey(kind, row),
    zone,
  };
}

function thermometerRowKey(kind, row) {
  return `${kind}:${row.rate}:${row.sub || ""}`;
}

function renderMacroList() {
  const values = {
    usdKrw: formatNumber(Number(state.macro.usdKrw), 2),
    dollarIndex: formatMaybeNumber(state.macro.dollarIndex),
    spread10y2y: state.macro.spread10y2y,
    spread10y3m: state.macro.spread10y3m,
    fearGreed: formatFearGreedValue(),
  };
  document.querySelector("[data-macro-list]").innerHTML = Object.entries(macroCharts)
    .map(([key, { label }]) => [key, label, values[key], state.macroMeta[key]])
    .map(
      ([key, label, value, meta]) => `
      <div role="button" tabindex="0" data-action="show-macro-chart" data-key="${key}" title="${label} 차트 보기">
        <dt>${label}</dt>
        <dd>${value || "-"}</dd>
        ${meta ? `<small>${macroMetaText(meta)}</small>` : ""}
      </div>
    `,
    )
    .join("");
}

function formatFearGreedValue() {
  const value = state.macro.fearGreed;
  if (!Number.isFinite(Number(value))) return value || "-";
  const rating = state.macroMeta.fearGreed?.rating;
  return `${Math.round(Number(value))}${rating ? ` · ${translateFearGreed(rating)}` : ""}`;
}

function macroMetaText(meta) {
  const base = `${meta.date || ""} · ${meta.source}`.trim();
  return base;
}

function translateFearGreed(rating) {
  const map = {
    "extreme fear": "극단적 공포",
    fear: "공포",
    neutral: "중립",
    greed: "탐욕",
    "extreme greed": "극단적 탐욕",
  };
  return map[String(rating).toLowerCase()] || rating;
}

function calcLowReturn(market) {
  return safeDivide(market.currentValue - market.lowValue, market.lowValue);
}

function calcHighReturn(market) {
  const highValue = getFallAnchorValue(market);
  return safeDivide(market.currentValue - highValue, highValue);
}

// The drawdown anchor is the all-time high: the previous high until the rebound exceeds it.
function highIsFallAnchor(market) {
  const highValue = finiteNumber(market.highValue);
  const risePeakValue = finiteNumber(market.risePeakValue);
  return risePeakValue === null || (highValue !== null && highValue > risePeakValue);
}

function getFallAnchorValue(market) {
  return (highIsFallAnchor(market) ? finiteNumber(market.highValue) : finiteNumber(market.risePeakValue)) ?? 0;
}

function marketAsOfDate(market) {
  return market.currentDate || state.asOfDate;
}

function getFallAnchorDate(market) {
  return highIsFallAnchor(market) ? market.highDate : market.risePeakDate || market.highDate;
}

function getRisePeakReturn(market) {
  const peakValue = finiteNumber(market.risePeakValue);
  if (peakValue !== null) {
    return Math.max(safeDivide(peakValue - market.lowValue, market.lowValue), 0);
  }
  const legacyReturn = finiteNumber(market.risePeakReturn);
  return legacyReturn ?? Math.max(calcLowReturn(market), 0);
}

function getFallPeakReturn(market) {
  const peakValue = finiteNumber(market.fallPeakValue);
  if (peakValue !== null) {
    const highValue = getFallAnchorValue(market);
    return Math.min(safeDivide(peakValue - highValue, highValue), 0);
  }
  const legacyReturn = finiteNumber(market.fallPeakReturn);
  return legacyReturn ?? Math.min(calcHighReturn(market), 0);
}

function recordMarketExtremes(market, date = state.asOfDate || localDateString()) {
  ensureMarketExtremeValues(market, date);
  const currentValue = finiteNumber(market.currentValue);
  if (currentValue === null) return;
  const isNewHigh = currentValue > getFallAnchorValue(market);
  if (currentValue > market.risePeakValue) {
    market.risePeakValue = currentValue;
    market.risePeakDate = date;
  }
  if (isNewHigh) {
    market.fallPeakValue = currentValue;
    market.fallPeakDate = date;
  } else if (currentValue < market.fallPeakValue) {
    market.fallPeakValue = currentValue;
    market.fallPeakDate = date;
  }
  syncMarketExtremeReturns(market);
}

function ensureMarketExtremeValues(market, date = state.asOfDate || localDateString()) {
  const currentValue = finiteNumber(market.currentValue);
  const risePeakReturn = finiteNumber(market.risePeakReturn);
  const fallPeakReturn = finiteNumber(market.fallPeakReturn);

  if (finiteNumber(market.risePeakValue) === null) {
    market.risePeakValue =
      risePeakReturn !== null ? market.lowValue * (1 + risePeakReturn) : currentValue;
  }
  if (finiteNumber(market.fallPeakValue) === null) {
    const highValue = getFallAnchorValue(market);
    market.fallPeakValue =
      fallPeakReturn !== null ? highValue * (1 + fallPeakReturn) : currentValue;
  }
  market.risePeakDate ||= date;
  market.fallPeakDate ||= date;
  syncMarketExtremeReturns(market);
}

function syncMarketExtremeReturns(market) {
  market.risePeakReturn = getRisePeakReturn(market);
  market.fallPeakReturn = getFallPeakReturn(market);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isMarketBasisPath(path) {
  return /^markets\.[^.]+\.(lowDate|lowValue)$/.test(path);
}

function isMarketLowDatePath(path) {
  return /^markets\.[^.]+\.lowDate$/.test(path);
}

function isMarketAutoBasisPath(path) {
  return /^markets\.[^.]+\.autoBasis$/.test(path);
}

function marketKeyFromPath(path) {
  return path.split(".")[1];
}

function safeDivide(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return a / b;
}

function monthDiff(start, end) {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return "?";
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(months, 0);
}

// Elapsed time as whole months plus leftover days: `short` for the needle, `full` for details.
function elapsedSince(start, end) {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return { short: "?개월", full: "?개월" };
  const months = monthDiff(start, end);
  const targetMonth = a.getMonth() + months;
  const lastDay = new Date(a.getFullYear(), targetMonth + 1, 0).getDate();
  const anchor = new Date(a.getFullYear(), targetMonth, Math.min(a.getDate(), lastDay));
  const days = Math.max(Math.round((b.getTime() - anchor.getTime()) / 86400000), 0);
  if (months === 0) return { short: `${days}일`, full: `${days}일` };
  return { short: `${months}개월`, full: days ? `${months}개월 ${days}일` : `${months}개월` };
}

function peakTitle(label, date, value, asOfDate = state.asOfDate) {
  if (!date) return `${label} 기록일 없음`;
  const point = Number.isFinite(Number(value)) ? `${formatNumber(value)} · ` : "";
  return `${label} ${point}${date} · ${elapsedSince(date, asOfDate).full} 전`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRate(value) {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("ko-KR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function truncatePercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value * 100);
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "?";
  if (!Number.isFinite(Number(value))) return value;
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function formatMaybeNumber(value) {
  if (Number.isFinite(Number(value))) return formatNumber(Number(value), 2);
  return value || "-";
}

function formatTopDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = date.getHours();
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `UPDATED ${year}.${month}.${day} ${period} ${displayHour}:${minute}`;
}

function readInput(input) {
  if (input.type === "checkbox") return input.checked;
  if (input.type === "number") {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : 0;
  }
  return input.value;
}

function getByPath(source, path) {
  return path.split(".").reduce((obj, key) => obj?.[key], source);
}

function setByPath(source, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  const parent = parts.reduce((obj, key) => obj[key], source);
  parent[last] = value;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.markets?.us?.symbol !== defaultState.markets.us.symbol) {
      saved.markets = { ...saved.markets, us: clone(defaultState.markets.us) };
    }
    return merge(clone(defaultState), saved);
  } catch {
    return clone(defaultState);
  }
}

function normalizeState(next) {
  ["dollarIndex", "spread10y2y", "spread10y3m"].forEach((key) => {
    if (String(next.macro[key]).toLowerCase().startsWith("loding")) {
      next.macro[key] = "-";
    }
  });
  Object.values(next.markets || {}).forEach((market) => {
    recordMarketExtremes(market, next.asOfDate || localDateString());
  });
  return next;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function merge(base, patch) {
  if (!patch || typeof patch !== "object") return base;
  Object.entries(patch).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      base[key] = merge(base[key] ?? {}, value);
    } else {
      base[key] = value;
    }
  });
  return base;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function localDateString() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function showToast(message, duration = 2200) {
  const previous = document.querySelector(".export-toast");
  previous?.remove();
  const toast = document.createElement("div");
  toast.className = "export-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), duration);
}

function setupMacroChart() {
  const plot = document.querySelector("[data-chart-plot]");
  if (!plot) return;
  plot.addEventListener("pointermove", (event) => showChartHover(plot, event.clientX));
  plot.addEventListener("pointerdown", (event) => showChartHover(plot, event.clientX));
  plot.addEventListener("pointerleave", () => hideChartHover(plot));
  window.addEventListener("resize", () => {
    if (document.querySelector("[data-chart-dialog]")?.open) renderMacroChart();
  });
  document.body.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest?.('[data-action="show-macro-chart"]');
    if (!card) return;
    event.preventDefault();
    openMacroChart(card.dataset.key);
  });
}

function openMacroChart(key) {
  if (!macroCharts[key]) return;
  chartView = { ...chartView, key, points: [], layout: null };
  document.querySelector("[data-chart-title]").textContent = macroCharts[key].label;
  const dialog = document.querySelector("[data-chart-dialog]");
  if (!dialog.open) dialog.showModal();
  loadMacroChart();
}

async function loadMacroChart() {
  const requestId = chartView.requestId + 1;
  chartView = { ...chartView, requestId, points: [], layout: null };
  setChartMessage("차트 데이터를 불러오는 중");
  try {
    const params = new URLSearchParams({ key: chartView.key, range: "1y" });
    const response = await fetch(`/api/macro-history?${params}`, { cache: "no-store" });
    const payload = await response.json();
    if (chartView.requestId !== requestId) return;
    if (!response.ok || !payload.ok || !payload.points?.length) {
      throw new Error(payload.error || "empty");
    }
    chartView.points = payload.points;
    chartView.source = payload.source;
    renderMacroChart();
  } catch {
    if (chartView.requestId === requestId) setChartMessage("차트 데이터를 불러오지 못했습니다.");
  }
}

function setChartMessage(message) {
  document.querySelector("[data-chart-summary]").textContent = "";
  document.querySelector("[data-chart-plot]").innerHTML = `<p class="chart-message">${message}</p>`;
}

function renderMacroChart() {
  const { key, points } = chartView;
  const config = macroCharts[key];
  if (!config || !points.length) return;
  const plot = document.querySelector("[data-chart-plot]");
  const width = Math.max(plot.clientWidth, 280);
  const height = width < 520 ? 244 : 314;
  const { svg, layout } = buildChartSvg(points, config, width, height);
  chartView.layout = layout;
  plot.innerHTML = `${svg}<div class="chart-tooltip" hidden></div>`;

  const values = points.map((point) => point.value);
  const last = points.at(-1);
  document.querySelector("[data-chart-summary]").innerHTML = `
    <strong>${formatChartValue(last.value, config)}</strong>
    <span>${last.date} · ${chartView.source || ""}</span>
    <span>최근 1년 최저 ${formatChartValue(Math.min(...values), config)} · 최고 ${formatChartValue(Math.max(...values), config)}</span>
  `;
}

// One year of one series: a grid line per month, newest point on the right edge.
function buildChartSvg(points, config, width, height) {
  const margin = { top: 14, right: config.zones ? 70 : 18, bottom: 40, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const plotRight = margin.left + plotWidth;
  const plotBottom = margin.top + plotHeight;
  const values = points.map((point) => point.value);
  const hasBaseline = Number.isFinite(config.baseline);
  const ticks =
    config.ticks ||
    niceTicks(
      Math.min(...values, ...(hasBaseline ? [config.baseline] : [])),
      Math.max(...values, ...(hasBaseline ? [config.baseline] : [])),
    );
  const [low, high] = [ticks[0], ticks.at(-1)];
  const step = ticks[1] - ticks[0];
  const tickDigits = Math.max(0, Math.min(config.digits, -Math.floor(Math.log10(step))));
  const xs = points.map((_, index) =>
    margin.left + (points.length === 1 ? plotWidth : (plotWidth * index) / (points.length - 1)),
  );
  const toY = (value) => margin.top + plotHeight * (1 - (value - low) / (high - low));
  const ys = values.map(toY);
  const path = xs.map((x, index) => `${index ? "L" : "M"}${x.toFixed(1)} ${ys[index].toFixed(1)}`).join(" ");

  const valueLines = ticks
    .map((tick) => {
      const y = toY(tick).toFixed(1);
      const isBaseline = hasBaseline && tick === config.baseline;
      const lineKind = isBaseline ? "is-baseline" : config.zones ? "is-zone" : "";
      return `<line class="chart-grid ${lineKind}" x1="${margin.left}" x2="${plotRight}" y1="${y}" y2="${y}" />
        <text class="chart-axis-text ${isBaseline ? "is-baseline" : ""}" x="${margin.left - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${formatNumber(tick, tickDigits)}${config.suffix}</text>`;
    })
    .join("");
  // Zones are bands, not lines: tint each band and name it on the band, clear of the newest data.
  const zoneBands = (config.zones || [])
    .map((zone, index) => {
      const top = toY(ticks[index + 1]);
      const bandHeight = toY(ticks[index]) - top;
      return `<rect class="chart-zone is-${zone.tone}" x="${margin.left}" y="${top.toFixed(1)}" width="${width - margin.left}" height="${bandHeight.toFixed(1)}" />`;
    })
    .join("");
  const zoneLabels = (config.zones || [])
    .map((zone, index) => {
      const y = ((toY(ticks[index]) + toY(ticks[index + 1])) / 2).toFixed(1);
      return `<text class="chart-axis-text is-zone-name" x="${plotRight + 8}" y="${y}" dominant-baseline="middle">${zone.label}</text>`;
    })
    .join("");

  // Month starts: the first point of each calendar month.
  const monthStarts = points
    .map((point, index) => ({ index, month: point.date.slice(0, 7) }))
    .filter(({ index, month }) => index > 0 && month !== points[index - 1].date.slice(0, 7));
  const monthGap = monthStarts.length > 1 ? plotWidth / monthStarts.length : plotWidth;
  const monthLabels = monthStarts.map(({ index, month }) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const text = monthGap >= 34 ? `${monthNumber}월` : String(monthNumber);
    const halfWidth = (String(monthNumber).length * 6.4 + (monthGap >= 34 ? 11 : 0)) / 2;
    // Keep the label inside the plot: slide it inward when the month starts near an edge.
    const x = Math.min(Math.max(xs[index], margin.left + halfWidth), plotRight - halfWidth);
    return { x, halfWidth, text, year, isJanuary: monthNumber === 1 };
  });
  const placedLabels = [];
  monthLabels.forEach((label) => {
    const previous = placedLabels.at(-1);
    if (!previous || label.x - previous.x >= previous.halfWidth + label.halfWidth) placedLabels.push(label);
  });
  // Years go on their own row: at the left edge and under each January.
  const yearLabels = monthLabels
    .filter((label) => label.isJanuary)
    .map((label) => ({ x: Math.min(Math.max(label.x, margin.left + 14), plotRight - 14), text: `${label.year}년` }));
  const firstYear = { x: margin.left + 14, text: `${points[0].date.slice(0, 4)}년` };
  if (!yearLabels.some((label) => label.x - firstYear.x < 40)) yearLabels.unshift(firstYear);
  const monthLines =
    monthStarts
      .map(({ index }) => {
        const x = xs[index].toFixed(1);
        return `<line class="chart-grid is-month" x1="${x}" x2="${x}" y1="${margin.top}" y2="${plotBottom}" />`;
      })
      .join("") +
    placedLabels
      .map(
        (label) =>
          `<text class="chart-axis-text" x="${label.x.toFixed(1)}" y="${plotBottom + 15}" text-anchor="middle">${label.text}</text>`,
      )
      .join("") +
    yearLabels
      .map(
        (label) =>
          `<text class="chart-axis-text is-year" x="${label.x.toFixed(1)}" y="${plotBottom + 31}" text-anchor="middle">${label.text}</text>`,
      )
      .join("");

  const svg = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${config.label} ${points[0].date}부터 ${points.at(-1).date}까지의 추이">
      ${zoneBands}
      ${monthLines}
      ${valueLines}
      ${zoneLabels}
      <path class="chart-line" d="${path}" />
      <circle class="chart-end-dot" cx="${xs.at(-1).toFixed(1)}" cy="${ys.at(-1).toFixed(1)}" r="4" />
      <g class="chart-hover" data-chart-hover hidden>
        <line class="chart-crosshair" y1="${margin.top}" y2="${plotBottom}" />
        <circle class="chart-hover-dot" r="4.5" />
      </g>
    </svg>`;
  return { svg, layout: { left: margin.left, plotWidth, width, xs, ys } };
}

function niceTicks(min, max, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) * magnitude;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let index = 0; start + step * index < max + step; index += 1) {
    ticks.push(Number((start + step * index).toFixed(10)));
  }
  return ticks.length > 1 ? ticks : [start, start + step];
}

function formatChartValue(value, config) {
  return `${formatNumber(value, config.digits)}${config.suffix}`;
}

function showChartHover(plot, clientX) {
  const { layout, points, key } = chartView;
  const hover = plot.querySelector("[data-chart-hover]");
  const tooltip = plot.querySelector(".chart-tooltip");
  if (!layout || !hover || !tooltip || !points.length) return;
  const rect = plot.getBoundingClientRect();
  const ratio = (clientX - rect.left - layout.left) / layout.plotWidth;
  const index = Math.min(Math.max(Math.round(ratio * (points.length - 1)), 0), points.length - 1);
  const x = layout.xs[index];
  const y = layout.ys[index];
  hover.removeAttribute("hidden");
  const line = hover.querySelector("line");
  line.setAttribute("x1", x);
  line.setAttribute("x2", x);
  const dot = hover.querySelector("circle");
  dot.setAttribute("cx", x);
  dot.setAttribute("cy", y);
  tooltip.hidden = false;
  tooltip.innerHTML = `<strong>${formatChartValue(points[index].value, macroCharts[key])}</strong><span>${points[index].date}</span>`;
  const onRightHalf = x > layout.width / 2;
  tooltip.style.left = onRightHalf ? "" : `${x + 12}px`;
  tooltip.style.right = onRightHalf ? `${layout.width - x + 12}px` : "";
}

function hideChartHover(plot) {
  plot.querySelector("[data-chart-hover]")?.setAttribute("hidden", "");
  const tooltip = plot.querySelector(".chart-tooltip");
  if (tooltip) tooltip.hidden = true;
}
