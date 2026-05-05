const STORAGE_KEY = "index-range-calculator-state-v1";
const THEME_KEY = "index-range-calculator-theme";

const marketMeta = [
  { key: "korea", title: "한국 시장", code: "KOSPI", flag: "🇰🇷" },
  { key: "us", title: "미국 시장", code: "NASDAQ", flag: "🇺🇸" },
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
  yieldCycles: {
    status: "양전 구간 대기 중",
    updatedAt: null,
    values: {},
    errors: [],
  },
  markets: {
    korea: {
      currentValue: 6615.03,
      lowDate: "2022-09-30",
      lowValue: 2134.77,
      highDate: "2021-06-25",
      highValue: 3316.08,
      risePeakReturn: null,
      risePeakDate: null,
      fallPeakReturn: null,
      fallPeakDate: null,
    },
    us: {
      currentValue: 20177.66,
      lowDate: "2022-10-13",
      lowValue: 10088.83,
      highDate: "2021-11-22",
      highValue: 16212.23,
      risePeakReturn: null,
      risePeakDate: null,
      fallPeakReturn: null,
      fallPeakDate: null,
    },
  },
};

const rangeGroups = [
  {
    label: "초과상승 구간",
    className: "range-overheat",
    kind: "rise",
    rows: [4.0, 3.8, 3.6, 3.4, 3.2].map((rate) => ({ rate, sub: "" })),
  },
  {
    label: "과열상승 구간",
    className: "range-hot",
    kind: "rise",
    rows: [3.0, 2.8, 2.6, 2.4, 2.2].map((rate) => ({ rate, sub: "" })),
  },
  {
    label: "기대상승 구간",
    className: "range-growth",
    kind: "rise",
    rows: [2.0, 1.8, 1.6, 1.4, 1.2].map((rate) => ({ rate, sub: "" })),
  },
  {
    label: "상승시작 구간",
    className: "range-start",
    kind: "rise",
    rows: [
      ...[1.0, 0.8, 0.6, 0.4, 0.2].map((rate) => ({ rate, sub: "" })),
      { rate: 0, sub: "전저점", kind: "riseBase" },
    ],
  },
  {
    label: "변동성 구간",
    className: "range-swing",
    kind: "fall",
    rows: [
      { rate: 0, sub: "전고점", kind: "fallBase" },
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

const historyRows = [
  {
    year: 1989,
    crisis: "일본 버블 붕괴",
    highDate: "1989-04-03",
    highValue: 1015.75,
    lowDate: "1992-08-21",
    lowValue: 456.59,
  },
  {
    year: 1998,
    crisis: "IMF 외환위기",
    highDate: "1994-11-09",
    highValue: 1145.66,
    lowDate: "1998-06-16",
    lowValue: 277.37,
  },
  {
    year: 2000,
    crisis: "IT 버블 붕괴",
    highDate: "2000-01-04",
    highValue: 1066.18,
    lowDate: "2001-09-21",
    lowValue: 463.54,
  },
  {
    year: 2002,
    crisis: "국제 정세 불안",
    highDate: "2002-04-22",
    highValue: 943.54,
    lowDate: "2003-03-17",
    lowValue: 512.3,
  },
  {
    year: 2008,
    crisis: "서브프라임",
    highDate: "2007-11-01",
    highValue: 2085.45,
    lowDate: "2008-10-27",
    lowValue: 892.16,
  },
  {
    year: 2019,
    crisis: "코로나19",
    highDate: "2018-01-29",
    highValue: 2607.1,
    lowDate: "2020-03-19",
    lowValue: 1439.43,
  },
  {
    year: 2022,
    crisis: "국제 정세 불안",
    highDate: "2021-06-25",
    highValue: 3316.08,
    lowDate: null,
    lowValue: null,
  },
];

const crisisTypes = [
  {
    title: "1. 외환 위기",
    example: "한국 IMF",
    body: "통화 가치 하락, 외부 부채 증가, 외국 환금 부족으로 인해 외환 시장의 급격한 불안정성이 발생하는 상황.",
  },
  {
    title: "2. 재정 위기",
    example: "그리스 파산",
    body: "지출 초과, 부채 증가, 경제 둔화 등으로 정부나 기업의 재정 상태가 악화되는 상황.",
  },
  {
    title: "3. 금융 위기",
    example: "서브프라임",
    body: "금융 시스템 불안정, 금융 기관 파산, 자금 흐름 중단 등이 경제에 큰 충격을 주는 상황.",
  },
];

let state = normalizeState(loadState());

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  setupActions();
  setupMobileTopNav();
  setupServerHeartbeat();
  renderAll();
  refreshLiveData({ quiet: true });
  refreshYieldCycles({ quiet: true });
});

function setupTabs() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      document.querySelectorAll("[data-view]").forEach((tab) => {
        tab.classList.toggle("is-active", tab === button);
      });
      document.querySelectorAll(".view").forEach((panel) => {
        panel.classList.toggle("is-active", panel.id === `${view}-view`);
      });
    });
  });
}

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
    setByPath(state, input.dataset.bind, readInput(input));
    if (isMarketBasisPath(input.dataset.bind)) {
      resetMarketExtremes(marketKeyFromPath(input.dataset.bind));
    }
    saveState();
    renderAll({ keepFocus: input.dataset.bind });
  });

  document.body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    if (button.dataset.action === "reset") {
      state = clone(defaultState);
      saveState();
      renderAll();
      showToast("초기값으로 복원했습니다.");
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

    if (button.dataset.action === "open-settings") {
      openSettingsDialog(button.dataset.market);
      return;
    }

    if (button.dataset.action === "export") {
      const payload = {
        savedAt: new Date().toISOString(),
        state,
        computed: buildComputedSnapshot(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `지수-구간-계산-${state.asOfDate || "export"}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("JSON 파일을 저장했습니다.");
    }
  });
}

async function refreshAllData() {
  await Promise.all([refreshLiveData({ quiet: true }), refreshYieldCycles({ quiet: true })]);
  showToast("데이터를 새로고침했습니다.");
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

function setupMobileTopNav() {
  const topNav = document.querySelector(".top-nav");
  if (!topNav) return;
  const mobileQuery = window.matchMedia("(max-width: 720px)");
  let lastY = window.scrollY;

  const update = () => {
    if (!mobileQuery.matches) {
      topNav.classList.remove("is-hidden");
      return;
    }
    const currentY = window.scrollY;
    const isScrollingDown = currentY > lastY + 6;
    const isNearTop = currentY < 24;
    topNav.classList.toggle("is-hidden", isScrollingDown && !isNearTop);
    lastY = currentY;
  };

  window.addEventListener("scroll", update, { passive: true });
  mobileQuery.addEventListener("change", update);
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
    renderLiveStatus();
    if (!quiet) showToast("앱 서버 주소로 열면 시장 데이터를 불러옵니다.");
    return;
  }

  state.liveData = {
    status: "시장 데이터 불러오는 중",
    updatedAt: state.liveData.updatedAt,
    errors: [],
  };
  renderLiveStatus();

  try {
    const response = await fetch(`/api/macro?t=${Date.now()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "시장 데이터 응답이 비어 있습니다.");
    }

    applyMarketPoint("korea", payload.values.kospi);
    applyMarketPoint("us", payload.values.nasdaq);
    applyAsOfDate([payload.values.kospi, payload.values.nasdaq]);
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
  } catch (error) {
    state.liveData = {
      status: "자동 불러오기 실패, 수동 입력값 사용 중",
      updatedAt: state.liveData.updatedAt,
      errors: [{ key: "network", error: String(error.message || error) }],
    };
    renderLiveStatus();
    if (!quiet) showToast("시장 데이터를 불러오지 못했습니다.");
  }
}

async function refreshYieldCycles({ quiet = false } = {}) {
  if (location.protocol === "file:") {
    state.yieldCycles = {
      status: "양전 분석은 로컬 서버 주소로 열면 작동합니다",
      updatedAt: null,
      values: state.yieldCycles.values || {},
      errors: [],
    };
    renderYieldCycles();
    return;
  }

  state.yieldCycles = {
    ...state.yieldCycles,
    status: "양전 구간 계산 중",
    errors: [],
  };
  renderYieldCycles();

  try {
    const response = await fetch(`/api/yield-cycles?t=${Date.now()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "양전 분석 응답이 비어 있습니다.");
    }
    state.yieldCycles = {
      status: payload.errors?.length ? "양전 구간 일부 계산 완료" : "양전 구간 계산 완료",
      updatedAt: payload.updatedAt,
      values: payload.values || {},
      errors: payload.errors || [],
    };
    saveState();
    renderYieldCycles();
    if (!quiet) showToast("금리차 데이터를 갱신했습니다.");
  } catch (error) {
    state.yieldCycles = {
      ...state.yieldCycles,
      status: "양전 구간 계산 실패",
      errors: [{ key: "network", error: String(error.message || error) }],
    };
    renderYieldCycles();
    if (!quiet) showToast("금리차 데이터를 갱신하지 못했습니다.");
  }
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
  recordMarketExtremes(market, point.date || state.asOfDate);
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
  renderLiveStatus();
  renderTopTimestamp();
}

function renderTopTimestamp() {
  const target = document.querySelector("[data-date-badge]");
  if (!target) return;
  const updatedAt = state.liveData?.updatedAt || state.yieldCycles?.updatedAt;
  target.textContent = updatedAt ? formatTopDateTime(updatedAt) : "갱신 대기 중";
}

function renderBoundInputs(keepFocus) {
  const active = keepFocus ? document.activeElement : null;
  document.querySelectorAll("[data-bind]").forEach((input) => {
    if (input === active) return;
    const value = getByPath(state, input.dataset.bind);
    input.value = value ?? "";
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
  const riseLabel = `${monthDiff(market.lowDate, state.asOfDate)}개월 · ${truncatePercent(lowReturn)}%`;
  const fallLabel = `${monthDiff(market.highDate, state.asOfDate)}개월 · ${truncatePercent(Math.min(highReturn, 0))}%`;
  const risePeakLabel = `최고 ${truncatePercent(risePeakReturn)}%`;
  const fallPeakLabel = `최저 ${truncatePercent(fallPeakReturn)}%`;
  const risePeakTitle = peakTitle("최고", market.risePeakDate);
  const fallPeakTitle = peakTitle("최저", market.fallPeakDate);
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
                ${isRiseNeedle ? `<span class="mercury-label rise">${riseLabel}</span>` : ""}
                ${isFallNeedle ? `<span class="mercury-label fall">${fallLabel}</span>` : ""}
                ${isRisePeakNeedle ? `<span class="peak-label rise" title="${risePeakTitle}">${risePeakLabel}</span>` : ""}
                ${isFallPeakNeedle ? `<span class="peak-label fall" title="${fallPeakTitle}">${fallPeakLabel}</span>` : ""}
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
    const target = market.highValue * (1 + row.rate);
    return { target, active: calcHighReturn(market) <= row.rate };
  }
  if (kind === "riseBase") {
    return { target: market.lowValue, text: "상승 0%" };
  }
  if (kind === "fallBase") {
    return { target: market.highValue, text: "하락 0%" };
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

function marketMeaning(riseNeedle, fallNeedle) {
  if (fallNeedle.zone === "하락 위험 없음") {
    return `저점 이후 ${riseNeedle.zone}에 위치하고, 전고점 대비 하락 압력은 낮은 상태입니다.`;
  }
  return `저점 기준으로는 ${riseNeedle.zone}, 전고점 기준으로는 ${fallNeedle.zone}에 동시에 위치합니다.`;
}

function renderMacroList() {
  const macros = [
    ["달러 실시간 환율", formatNumber(Number(state.macro.usdKrw), 2), state.macroMeta.usdKrw],
    ["달러 지수", formatMaybeNumber(state.macro.dollarIndex), state.macroMeta.dollarIndex],
    ["미국 장·단기 금리차 10Y-2Y", state.macro.spread10y2y, state.macroMeta.spread10y2y],
    ["미국 장·단기 금리차 10Y-3M", state.macro.spread10y3m, state.macroMeta.spread10y3m],
    ["CNN 공포탐욕지수", formatFearGreedValue(), state.macroMeta.fearGreed],
  ];
  document.querySelector("[data-macro-list]").innerHTML = macros
    .map(
      ([label, value, meta]) => `
      <div>
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

function renderLiveStatus() {
  renderTopTimestamp();
  const target = document.querySelector("[data-live-status]");
  if (!target) return;
  const updated = state.liveData.updatedAt
    ? ` · 마지막 갱신 ${formatDateTime(state.liveData.updatedAt)}`
    : "";
  const errors = state.liveData.errors?.length
    ? ` · 실패 ${state.liveData.errors.map((item) => item.key).join(", ")}`
    : "";
  target.innerHTML = `<strong>${state.liveData.status}</strong>${updated}${errors}`;
}

function renderYieldCycles() {
  renderTopTimestamp();
  const target = document.querySelector("[data-yield-cycles]");
  if (!target) return;
  const values = state.yieldCycles.values || {};
  const entries = ["spread10y2y", "spread10y3m"]
    .map((key) => values[key])
    .filter(Boolean);
  if (!entries.length) {
    target.innerHTML = `<article class="yield-cycle-item"><h3>${state.yieldCycles.status}</h3></article>`;
    return;
  }
  target.innerHTML = entries
    .map((item) => {
      const compare = item.comparison >= 0 ? `${item.comparison}개월 더 김` : `${Math.abs(item.comparison)}개월 더 짧음`;
      return `
        <article class="yield-cycle-item">
          <h3>${item.label}</h3>
          <dl>
            <dt>역전 시작</dt>
            <dd>${item.inversionStartDate}</dd>
            <dt>양전일</dt>
            <dd>${item.positiveTurnDate}</dd>
            ${
              item.latestCrossDate && item.latestCrossDate !== item.positiveTurnDate
                ? `<dt>마지막 재양전</dt><dd>${item.latestCrossDate}</dd>`
                : ""
            }
            <dt>역전 지속</dt>
            <dd>${item.inversionMonths}개월</dd>
            <dt>양전 후 현재</dt>
            <dd>${item.positiveMonths}개월째</dd>
            <dt>최근 값</dt>
            <dd>${formatNumber(item.latestValue, 2)}%</dd>
            <dd class="note">양전 후 기간이 역전 지속기간보다 ${compare}</dd>
          </dl>
        </article>
      `;
    })
    .join("");
}

function renderCrisisTypes() {
  document.querySelector("[data-crisis-types]").innerHTML = crisisTypes
    .map(
      (item) => `
      <article class="crisis-item">
        <h3>${item.title}</h3>
        <p>예: ${item.example}</p>
        <p>${item.body}</p>
      </article>
    `,
    )
    .join("");
}

function renderHistory() {
  const tbody = document.querySelector("[data-history]");
  const rows = historyRows.map((row, index) => {
    const previous = historyRows[index - 1];
    const next = historyRows[index + 1];
    const period = previous ? row.year - previous.year : ".";
    const fallMonths = row.lowDate ? monthDiff(row.highDate, row.lowDate) : "?";
    const fallRate = row.lowValue ? formatSignedPercent((row.lowValue - row.highValue) / row.highValue) : "?";
    const recoveryMonths = row.lowDate && next ? monthDiff(row.lowDate, next.highDate) : "?";
    const recoveryRate = row.lowValue && next ? formatSignedPercent(next.highValue / row.lowValue) : "?";
    return `
      <tr>
        <td>${period}</td>
        <td>${row.year}</td>
        <td>${row.crisis}</td>
        <td>${formatDate(row.highDate)}</td>
        <td>${formatNumber(row.highValue)}</td>
        <td>${formatDate(row.lowDate)}</td>
        <td>${formatNumber(row.lowValue)}</td>
        <td>${fallMonths}</td>
        <td>${fallRate}</td>
        <td>${recoveryMonths}</td>
        <td>${recoveryRate}</td>
      </tr>
    `;
  });
  tbody.innerHTML = rows.join("");
  renderHistorySummary();
}

function renderHistorySummary() {
  const complete = historyRows.filter((row, index) => row.lowDate && historyRows[index + 1]);
  const fallMonths = complete.map((row) => monthDiff(row.highDate, row.lowDate));
  const fallRates = complete.map((row) => (row.lowValue - row.highValue) / row.highValue);
  const recoveryMonths = complete.map((row, index) => monthDiff(row.lowDate, historyRows[index + 1].highDate));
  const recoveryRates = complete.map((row, index) => historyRows[index + 1].highValue / row.lowValue);
  document.querySelector("[data-history-summary]").innerHTML = `
    <tr>
      <td colspan="7">최대</td>
      <td>${Math.max(...fallMonths)}</td>
      <td>${formatSignedPercent(Math.min(...fallRates))}</td>
      <td>${Math.max(...recoveryMonths)}</td>
      <td>${formatSignedPercent(Math.max(...recoveryRates))}</td>
    </tr>
    <tr>
      <td colspan="7">최소</td>
      <td>${Math.min(...fallMonths)}</td>
      <td>${formatSignedPercent(Math.max(...fallRates))}</td>
      <td>${Math.min(...recoveryMonths)}</td>
      <td>${formatSignedPercent(Math.min(...recoveryRates))}</td>
    </tr>
  `;
}

function renderCurrentSituation() {
  const market = state.markets.korea;
  const items = [
    ["전 고점", `${formatDate(market.highDate)} · ${formatNumber(market.highValue)}`],
    ["오늘의 지수", `${formatDate(state.asOfDate)} · ${formatNumber(market.currentValue)}`],
    ["하락 진행도", `${monthDiff(market.highDate, state.asOfDate)}개월`],
    ["고점 대비", formatSignedPercent(calcHighReturn(market))],
  ];
  document.querySelector("[data-current-situation]").innerHTML = `
    <p class="eyebrow">Current</p>
    <h2>그래서 현재 상황은?</h2>
    <div class="current-stats">
      ${items
        .map(
          ([label, value]) => `
          <div class="current-stat">
            <span>${label}</span>
            <strong>${value}</strong>
          </div>
        `,
        )
        .join("")}
    </div>
  `;
}

function buildComputedSnapshot() {
  return {
    markets: Object.fromEntries(
      marketMeta.map((meta) => {
        const market = state.markets[meta.key];
        return [
          meta.key,
          {
            lowReturn: calcLowReturn(market),
            highReturn: calcHighReturn(market),
          },
        ];
      }),
    ),
  };
}

function calcLowReturn(market) {
  return safeDivide(market.currentValue - market.lowValue, market.lowValue);
}

function calcHighReturn(market) {
  return safeDivide(market.currentValue - market.highValue, market.highValue);
}

function getRisePeakReturn(market) {
  const value = Number(market.risePeakReturn);
  return Number.isFinite(value) ? value : Math.max(calcLowReturn(market), 0);
}

function getFallPeakReturn(market) {
  const value = Number(market.fallPeakReturn);
  return Number.isFinite(value) ? value : Math.min(calcHighReturn(market), 0);
}

function recordMarketExtremes(market, date = state.asOfDate || localDateString()) {
  const currentRise = Math.max(calcLowReturn(market), 0);
  const currentFall = Math.min(calcHighReturn(market), 0);
  if (currentRise >= getRisePeakReturn(market)) {
    market.risePeakReturn = currentRise;
    market.risePeakDate = date;
  }
  if (currentFall <= getFallPeakReturn(market)) {
    market.fallPeakReturn = currentFall;
    market.fallPeakDate = date;
  }
  market.risePeakDate ||= date;
  market.fallPeakDate ||= date;
}

function resetMarketExtremes(marketKey) {
  const market = state.markets[marketKey];
  if (!market) return;
  market.risePeakReturn = Math.max(calcLowReturn(market), 0);
  market.risePeakDate = state.asOfDate || localDateString();
  market.fallPeakReturn = Math.min(calcHighReturn(market), 0);
  market.fallPeakDate = state.asOfDate || localDateString();
}

function isMarketBasisPath(path) {
  return /^markets\.[^.]+\.(lowDate|lowValue|highDate|highValue)$/.test(path);
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

function peakTitle(label, date) {
  if (!date) return `${label} 기록일 없음`;
  const months = monthDiff(date, state.asOfDate);
  return `${date} 기록 · 현재 기준 ${months}개월 전`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  return value || "?";
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

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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
  Object.values(next.markets || {}).forEach(recordMarketExtremes);
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

function showToast(message) {
  const previous = document.querySelector(".export-toast");
  previous?.remove();
  const toast = document.createElement("div");
  toast.className = "export-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2200);
}
