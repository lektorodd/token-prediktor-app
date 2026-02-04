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
const topPInfoBtn = document.querySelector("#top-p-info");
const topPPop = document.querySelector("#top-p-pop");

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
    label.textContent = "Temperatur";
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
      output.textContent = "Spår…";
    } else if (!tempOutputs[index]) {
      output.classList.add("pending");
      output.textContent = "Klar for neste token.";
    } else {
      output.textContent = tempOutputs[index];
    }

    const state = document.createElement("div");
    state.className = "temp-state";
    state.textContent = tempLoading[index] ? "Tenkjer" : "Klar";

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
      `Set inn token ${formatToken(token.token)}`
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
  setStatus("Spår…");
  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, top_p: topP }),
    });
    const data = await res.json();
    if (requestId !== inflight) return;
    if (!res.ok) {
      setStatus("Spåing feila.");
      render([]);
      return;
    }
    render(data.tokens || []);
    setStatus("");
  } catch (err) {
    if (requestId !== inflight) return;
    setStatus("Spåing feila.");
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
    setTempStatus("Skriv inn tekst først.");
    return;
  }
  setTempStatus("Hentar neste token…");
  tempLoading = temperatures.map(() => true);
  renderTempCards();
  try {
    const results = await Promise.all(
      temperatures.map(async (temp, index) => {
        const prompt = `${basePrompt}${tempOutputs[index]}`;
        const res = await fetch("/api/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, temperature: temp, top_p: topP }),
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
    setTempStatus(`Kunne ikkje hente token. ${String(err)}`);
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
    startBtn.textContent = "Stopp";
    promptEl.setAttribute("disabled", "true");
    predictBtn.setAttribute("disabled", "true");
    schedulePredict(true);
    chartEl.focus();
  } else {
    startBtn.textContent = "Start";
    promptEl.removeAttribute("disabled");
    predictBtn.removeAttribute("disabled");
    setStatus("");
  }
}

function setTempActive(nextActive) {
  tempActive = nextActive;
  if (tempActive) {
    tempStartBtn.textContent = "Stopp";
    tempPromptEl.setAttribute("disabled", "true");
    renderTempCards();
  } else {
    tempStartBtn.textContent = "Start";
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

topPInfoBtn.addEventListener("click", () => {
  const isOpen = topPPop.classList.toggle("show");
  topPPop.setAttribute("aria-hidden", String(!isOpen));
});

document.addEventListener("click", (event) => {
  if (
    event.target === topPInfoBtn ||
    topPPop.contains(event.target)
  ) {
    return;
  }
  topPPop.classList.remove("show");
  topPPop.setAttribute("aria-hidden", "true");
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

setView("token");
renderTempCards();
topPValue.textContent = topP.toFixed(2);
