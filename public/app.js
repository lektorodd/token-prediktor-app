const promptEl = document.querySelector("#prompt");
const predictBtn = document.querySelector("#predict");
const startBtn = document.querySelector("#start");
const restartBtn = document.querySelector("#restart");
const chartEl = document.querySelector("#chart");
const emptyEl = document.querySelector("#empty");
const statusEl = document.querySelector("#status");
const tabTokenBtn = document.querySelector("#tab-token");
const tabTempBtn = document.querySelector("#tab-temp");
const viewToken = document.querySelector("#view-token");
const viewTemp = document.querySelector("#view-temp");
const topPSlider = document.querySelector("#top-p");
const topPValue = document.querySelector("#top-p-value");
const topKSlider = document.querySelector("#top-k");
const topKValue = document.querySelector("#top-k-value");
const stepTokensSlider = document.querySelector("#step-tokens");
const stepTokensValue = document.querySelector("#step-tokens-value");
const topPInfoBtn = document.querySelector("#top-p-info");
const topPPop = document.querySelector("#top-p-pop");
const topKInfoBtn = document.querySelector("#top-k-info");
const topKPop = document.querySelector("#top-k-pop");
const stepTokensInfoBtn = document.querySelector("#step-tokens-info");
const stepTokensPop = document.querySelector("#step-tokens-pop");
const langNnBtn = document.querySelector("#lang-nn");
const langEnBtn = document.querySelector("#lang-en");

const tempPromptEl = document.querySelector("#temp-prompt");
const tempStartBtn = document.querySelector("#temp-start");
const tempRestartBtn = document.querySelector("#temp-restart");
const tempNextBtn = document.querySelector("#temp-next");
const tempStatusEl = document.querySelector("#temp-status");
const tempGridEl = document.querySelector("#temp-grid");
const tempCountEl = document.querySelector("#temp-count");
const tempApplyBtn = document.querySelector("#temp-apply");

let debounceId = null;
let inflight = 0;
let tokensCache = [];
let selectedIndex = 0;
let isActive = false;
let tempActive = false;
let temperatures = [0.0, 0.4, 0.8, 1.2, 1.6];
let tempOutputs = temperatures.map(() => "");
let tempLoading = temperatures.map(() => false);
let topP = Number(topPSlider.value || 0.9);
let topK = Number(topKSlider.value || 5);
let stepTokens = Number(stepTokensSlider.value || 1);
let currentLang = localStorage.getItem("lang") || "nn";

const i18n = {
  nn: {
    title: "Tokenspå 🔮",
    subtitle:
      "Skriv inn ei setning. Trykk mellomrom for å vise sannsyn for neste token.",
    tab_token: "Token",
    tab_temp: "Temperatur",
    label_text: "Tekst",
    placeholder_text: "Skriv noko...",
    btn_start: "Start",
    btn_stop: "Stopp",
    btn_restart: "Start på nytt",
    btn_show_next: "Vis neste token",
    btn_next_token: "Neste token",
    btn_update_fields: "Oppdater felt",
    next_tokens: "Neste token",
    no_predictions: "Ingen spådomar enno.",
    field_count: "Tal på felt",
    temp_header: "Ulike temperaturar",
    temp_label: "Temperatur",
    ready: "Klar",
    thinking: "Tenkjer",
    pending: "Klar for neste token.",
    predicting: "Spår…",
    failed: "Spåing feila.",
    need_text: "Skriv inn tekst først.",
    fetching: "Hentar neste token…",
    fetch_failed: "Kunne ikkje hente token.",
    insert_token: "Set inn token",
    top_p_help:
      "top_p avgrensar val til dei mest sannsynlege tokena. Lågare = tryggare, høgare = meir tilfeldig.",
    top_k_help:
      "top_k styrer kor mange av dei mest sannsynlege tokena som blir viste.",
    step_tokens_help:
      "Styrer kor mange token som blir henta per steg i temperatur‑fana.",
    advanced_label: "Avanserte kontrollar",
    step_tokens_label: "Token per steg",
  },
  en: {
    title: "Token Predictor 🔮",
    subtitle:
      "Type a sentence. Press space to see the next-token probabilities.",
    tab_token: "Token",
    tab_temp: "Temperature",
    label_text: "Text",
    placeholder_text: "Write something...",
    btn_start: "Start",
    btn_stop: "Stop",
    btn_restart: "Restart",
    btn_show_next: "Show next token",
    btn_next_token: "Next token",
    btn_update_fields: "Update fields",
    next_tokens: "Next tokens",
    no_predictions: "No predictions yet.",
    field_count: "Number of fields",
    temp_header: "Different temperatures",
    temp_label: "Temperature",
    ready: "Ready",
    thinking: "Thinking",
    pending: "Ready for next token.",
    predicting: "Predicting…",
    failed: "Prediction failed.",
    need_text: "Please enter text first.",
    fetching: "Fetching next token…",
    fetch_failed: "Could not fetch token.",
    insert_token: "Insert token",
    top_p_help:
      "top_p limits choices to the most likely tokens. Lower = safer, higher = more random.",
    top_k_help:
      "top_k controls how many of the most likely tokens are shown.",
    step_tokens_help:
      "Controls how many tokens are fetched per step in the temperature tab.",
    advanced_label: "Advanced controls",
    step_tokens_label: "Tokens per step",
  },
};

function t(key) {
  return i18n[currentLang]?.[key] || i18n.nn[key] || key;
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", t(key));
  });
  topPPop.textContent = t("top_p_help");
  topKPop.textContent = t("top_k_help");
  stepTokensPop.textContent = t("step_tokens_help");
  langNnBtn.classList.toggle("active", currentLang === "nn");
  langEnBtn.classList.toggle("active", currentLang === "en");
}

chartEl.tabIndex = 0;

function formatToken(token) {
  if (token === "\n") return "⏎";
  if (token === " ") return "␠";
  if (token.startsWith(" ")) return `␠${token.slice(1)}`;
  return token;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setTempStatus(text) {
  tempStatusEl.textContent = text;
}

function renderTempCards() {
  tempGridEl.innerHTML = "";
  temperatures.forEach((temp, index) => {
    const row = document.createElement("div");
    row.className = "temp-row";
    if (temp >= 1.2) row.classList.add("hot");

    const left = document.createElement("div");
    const label = document.createElement("div");
    label.className = "temp-label";
    label.textContent = t("temp_label");
    const value = document.createElement("input");
    value.className = "temp-value";
    value.type = "number";
    value.min = "0";
    value.max = "2";
    value.step = "0.1";
    value.value = Number(temp).toFixed(1);
    value.addEventListener("change", () => {
      const next = Math.max(0, Math.min(2, Number(value.value || 0)));
      temperatures[index] = Number(next.toFixed(2));
      renderTempCards();
    });
    left.appendChild(label);
    left.appendChild(value);

    const output = document.createElement("div");
    output.className = "temp-output";
    if (tempLoading[index]) {
      output.classList.add("pending");
      output.textContent = t("predicting");
    } else if (!tempOutputs[index]) {
      output.classList.add("pending");
      output.textContent = t("pending");
    } else {
      output.textContent = tempOutputs[index];
    }

    const state = document.createElement("div");
    state.className = "temp-state";
    state.textContent = tempLoading[index] ? t("thinking") : t("ready");

    row.appendChild(left);
    row.appendChild(output);
    row.appendChild(state);
    tempGridEl.appendChild(row);
  });
}

function render(tokens) {
  chartEl.innerHTML = "";
  if (!tokens.length) {
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";
  tokensCache = tokens;
  selectedIndex = 0;
  tokens.forEach((token, index) => {
    const percent = Math.round(token.prob * 1000) / 10;
    const row = document.createElement("div");
    row.className = "row";
    row.tabIndex = 0;
    row.title = `Token: ${JSON.stringify(token.token)}`;
    row.setAttribute("role", "button");
    row.setAttribute(
      "aria-label",
      `${t("insert_token")} ${formatToken(token.token)}`
    );

    const label = document.createElement("div");
    label.className = "token";
    label.textContent = formatToken(token.token);

    const barWrap = document.createElement("div");
    barWrap.className = "bar-wrap";

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.width = `${Math.max(percent, 2)}%`;

    barWrap.appendChild(bar);

    const pct = document.createElement("div");
    pct.className = "percent";
    pct.textContent = `${percent}%`;

    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(pct);
    chartEl.appendChild(row);

    row.addEventListener("click", () => {
      promptEl.value += token.token;
      promptEl.focus();
      schedulePredict(true);
    });

    row.addEventListener("mouseenter", () => {
      selectedIndex = index;
      updateSelection();
    });

    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        promptEl.value += token.token;
        promptEl.focus();
        schedulePredict(true);
      }
    });
  });
  updateSelection();
}

function updateSelection() {
  const rows = chartEl.querySelectorAll(".row");
  rows.forEach((row, i) => {
    row.classList.toggle("selected", i === selectedIndex);
    if (i === selectedIndex) {
      row.setAttribute("aria-selected", "true");
    } else {
      row.setAttribute("aria-selected", "false");
    }
  });
}

function acceptSelected() {
  if (!tokensCache.length) return;
  const token = tokensCache[selectedIndex];
  if (!token) return;
  promptEl.value += token.token;
  promptEl.focus();
  schedulePredict(true);
}

function moveSelection(delta) {
  if (!tokensCache.length) return;
  const next =
    (selectedIndex + delta + tokensCache.length) % tokensCache.length;
  selectedIndex = next;
  updateSelection();
}

async function predict() {
  const prompt = promptEl.value;
  if (!prompt.trim()) {
    render([]);
    return;
  }
  const requestId = ++inflight;
  setStatus(t("predicting"));
  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        top_p: topP,
        top_k: topK,
      }),
    });
    const data = await res.json();
    if (requestId !== inflight) return;
    if (!res.ok) {
      setStatus(t("failed"));
      render([]);
      return;
    }
    render(data.tokens || []);
    setStatus("");
  } catch (err) {
    if (requestId !== inflight) return;
    setStatus(t("failed"));
  }
}

function schedulePredict(immediate = false) {
  if (!isActive) return;
  if (debounceId) clearTimeout(debounceId);
  if (immediate) {
    predict();
    return;
  }
  debounceId = setTimeout(predict, 300);
}

async function nextTempToken() {
  if (!tempActive) {
    setTempActive(true);
  }
  const basePrompt = tempPromptEl.value;
  if (!basePrompt.trim()) {
    setTempStatus(t("need_text"));
    return;
  }
  setTempStatus(t("fetching"));
  tempLoading = temperatures.map(() => true);
  renderTempCards();
  try {
    const results = await Promise.all(
      temperatures.map(async (temp, index) => {
        const prompt = `${basePrompt}${tempOutputs[index]}`;
        const res = await fetch("/api/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            temperature: temp,
            top_p: topP,
            max_tokens: stepTokens,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const details = data?.details ? ` (${data.details})` : "";
          throw new Error(`${data?.error || "Feil frå API"}${details}`);
        }
        return data.token || "";
      })
    );
    results.forEach((token, index) => {
      tempOutputs[index] += token;
    });
    tempLoading = temperatures.map(() => false);
    renderTempCards();
    setTempStatus("");
  } catch (err) {
    tempLoading = temperatures.map(() => false);
    renderTempCards();
    setTempStatus(`${t("fetch_failed")} ${String(err)}`);
  }
}

predictBtn.addEventListener("click", () => schedulePredict(true));

promptEl.addEventListener("input", (event) => {
  const isSpace =
    event.inputType === "insertText" && event.data === " ";
  schedulePredict(isSpace);
});

promptEl.addEventListener("keydown", (event) => {
  if (event.key === " " || event.code === "Space") {
    schedulePredict(true);
  }
});

chartEl.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  }
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    acceptSelected();
  }
});

function setActive(nextActive) {
  isActive = nextActive;
  if (isActive) {
    startBtn.textContent = t("btn_stop");
    promptEl.setAttribute("disabled", "true");
    predictBtn.setAttribute("disabled", "true");
    schedulePredict(true);
    chartEl.focus();
  } else {
    startBtn.textContent = t("btn_start");
    promptEl.removeAttribute("disabled");
    predictBtn.removeAttribute("disabled");
    setStatus("");
  }
}

function setTempActive(nextActive) {
  tempActive = nextActive;
  if (tempActive) {
    tempStartBtn.textContent = t("btn_stop");
    tempPromptEl.setAttribute("disabled", "true");
    renderTempCards();
  } else {
    tempStartBtn.textContent = t("btn_start");
    tempPromptEl.removeAttribute("disabled");
    setTempStatus("");
  }
}

function setView(view) {
  const isToken = view === "token";
  viewToken.classList.toggle("hidden", !isToken);
  viewTemp.classList.toggle("hidden", isToken);
  tabTokenBtn.classList.toggle("active", isToken);
  tabTempBtn.classList.toggle("active", !isToken);
  setActive(false);
  setTempActive(false);
}

startBtn.addEventListener("click", () => {
  setActive(!isActive);
});

restartBtn.addEventListener("click", () => {
  setActive(false);
  promptEl.value = "";
  tokensCache = [];
  selectedIndex = 0;
  render([]);
});

tempStartBtn.addEventListener("click", () => {
  setTempActive(!tempActive);
});

tempRestartBtn.addEventListener("click", () => {
  setTempActive(false);
  tempPromptEl.value = "";
  tempOutputs = temperatures.map(() => "");
  tempLoading = temperatures.map(() => false);
  renderTempCards();
});

tempNextBtn.addEventListener("click", () => {
  nextTempToken();
});

tempApplyBtn.addEventListener("click", () => {
  const count = Math.max(2, Math.min(8, Number(tempCountEl.value || 5)));
  temperatures = Array.from({ length: count }, () => 1.0);
  tempOutputs = temperatures.map(() => "");
  tempLoading = temperatures.map(() => false);
  renderTempCards();
});

tabTokenBtn.addEventListener("click", () => setView("token"));
tabTempBtn.addEventListener("click", () => setView("temp"));

topPSlider.addEventListener("input", () => {
  topP = Number(topPSlider.value);
  topPValue.textContent = topP.toFixed(2);
});

topKSlider.addEventListener("input", () => {
  topK = Number(topKSlider.value);
  topKValue.textContent = String(topK);
});

stepTokensSlider.addEventListener("input", () => {
  stepTokens = Number(stepTokensSlider.value);
  stepTokensValue.textContent = String(stepTokens);
});

langNnBtn.addEventListener("click", () => {
  currentLang = "nn";
  localStorage.setItem("lang", currentLang);
  applyI18n();
  renderTempCards();
  if (tokensCache.length) render(tokensCache);
});

langEnBtn.addEventListener("click", () => {
  currentLang = "en";
  localStorage.setItem("lang", currentLang);
  applyI18n();
  renderTempCards();
  if (tokensCache.length) render(tokensCache);
});

topPInfoBtn.addEventListener("click", () => {
  [topKPop, stepTokensPop].forEach((pop) => {
    pop.classList.remove("show");
    pop.setAttribute("aria-hidden", "true");
  });
  const isOpen = topPPop.classList.toggle("show");
  topPPop.setAttribute("aria-hidden", String(!isOpen));
});

topKInfoBtn.addEventListener("click", () => {
  [topPPop, stepTokensPop].forEach((pop) => {
    pop.classList.remove("show");
    pop.setAttribute("aria-hidden", "true");
  });
  const isOpen = topKPop.classList.toggle("show");
  topKPop.setAttribute("aria-hidden", String(!isOpen));
});

stepTokensInfoBtn.addEventListener("click", () => {
  [topPPop, topKPop].forEach((pop) => {
    pop.classList.remove("show");
    pop.setAttribute("aria-hidden", "true");
  });
  const isOpen = stepTokensPop.classList.toggle("show");
  stepTokensPop.setAttribute("aria-hidden", String(!isOpen));
});

document.addEventListener("click", (event) => {
  const isInfoTarget =
    event.target === topPInfoBtn ||
    event.target === topKInfoBtn ||
    event.target === stepTokensInfoBtn;
  const isInsidePop =
    topPPop.contains(event.target) ||
    topKPop.contains(event.target) ||
    stepTokensPop.contains(event.target);
  if (isInfoTarget || isInsidePop) return;
  [topPPop, topKPop, stepTokensPop].forEach((pop) => {
    pop.classList.remove("show");
    pop.setAttribute("aria-hidden", "true");
  });
});

document.addEventListener("keydown", (event) => {
  if (isActive) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      acceptSelected();
    }
  }

  if (tempActive) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      nextTempToken();
    }
  }
});

applyI18n();
setView("token");
renderTempCards();
topPValue.textContent = topP.toFixed(2);
topKValue.textContent = String(topK);
stepTokensValue.textContent = String(stepTokens);
