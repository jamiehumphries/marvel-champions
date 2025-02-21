import { Setting } from "./options.js?v=432547fb";
import { getItem, setItem } from "./storage.js?v=fe539d70";

const WIN = "✓";
const LOSS = "✗";
const UNPLAYED = "?";

const allDifficulties = [
  { id: "standard", label: "Standard", defaultValue: true },
  { id: "standard-ii", label: "Standard II" },
  { id: "standard-iii", label: "Standard III" },
  { id: "expert", label: "Expert" },
  { id: "expert-ii", label: "Expert II" },
];

const table = document.getElementById("tracker");

let totalPercentageSpan;
let totalFractionSpan;

function renderTable(scenarios, heroes) {
  const difficulties = getTrackedDifficulties();
  document.documentElement.style.setProperty(
    "--number-of-difficulties",
    difficulties.length,
  );

  clearTable();
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  table.appendChild(thead);
  table.appendChild(tbody);
  appendHeaderRows(thead, scenarios, difficulties);
  appendBodyRows(tbody, scenarios, heroes, difficulties);

  setUpIndeterminateCheckboxes();
  updateProgress();
}

function clearTable() {
  table.innerHTML = "";
}

function initializeDifficultySettings() {
  for (const difficulty of allDifficulties) {
    const id = `track-difficulty-${difficulty.id}`;
    const label = `Track ${difficulty.label}`;
    const { defaultValue } = difficulty;
    difficulty.setting = new Setting(id, label, { defaultValue });
  }
  return allDifficulties.map((difficulty) => difficulty.setting);
}

function getTrackedDifficulties() {
  if (allDifficulties.some((difficulty) => !difficulty.setting)) {
    initializeDifficultySettings();
  }
  const trackedDifficulties = allDifficulties.filter(
    (difficulty) => difficulty.setting.checked,
  );
  return trackedDifficulties.length > 0
    ? trackedDifficulties
    : allDifficulties.filter((difficulty) => difficulty.defaultValue);
}

function appendHeaderRows(thead, scenarios, difficulties) {
  const firstRow = createRow();
  const secondRow = createRow();

  appendProgressCells(firstRow, secondRow, difficulties);

  for (const set of scenarios) {
    for (let i = 0; i < set.children.length; i++) {
      const scenario = set.children[i];

      const { name: text, color } = scenario;
      const colbreak = i === 0;
      const header = true;

      const scenarioCell = createCell({
        text,
        color,
        colspan: difficulties.length,
        colbreak,
        header,
      });
      firstRow.appendChild(scenarioCell);

      for (let j = 0; j < difficulties.length; j++) {
        const { label } = difficulties[j];
        const cell = createCell({
          text: label,
          colbreak: colbreak && j == 0,
          blockEnd: j === difficulties.length - 1,
          color,
          header,
        });
        secondRow.appendChild(cell);
      }
    }
  }

  thead.appendChild(firstRow);
  thead.appendChild(secondRow);
}

function appendProgressCells(firstRow, secondRow, difficulties) {
  const contentDiv = document.createElement("div");

  const progressDiv = (span, id) => {
    const div = document.createElement("div");
    div.id = id;
    div.class = "progress-cell";
    div.appendChild(span);
    return div;
  };

  totalPercentageSpan = document.createElement("span");
  contentDiv.appendChild(progressDiv(totalPercentageSpan, "total-percentage"));

  totalFractionSpan = document.createElement("span");
  contentDiv.appendChild(progressDiv(totalFractionSpan, "total-fraction"));

  const progressTotalCell = createCell({
    contentDiv,
    colspan: difficulties.length,
    header: true,
    progress: true,
  });
  firstRow.appendChild(progressTotalCell);

  for (let i = 0; i < difficulties.length; i++) {
    const difficulty = difficulties[i];

    difficulty.span = document.createElement("span");
    const { id, span } = difficulty;

    const cell = createCell({
      contentDiv: progressDiv(span, `${id}-percentage`),
      header: true,
      blockIndex: i,
      blockEnd: i === difficulties.length - 1,
      progress: true,
      difficulty: true,
    });

    secondRow.appendChild(cell);
  }
}

function appendBodyRows(tbody, scenarios, heroes, difficulties) {
  for (let i = 0; i < heroes.length; i++) {
    const cardOrSet = heroes[i];
    if (cardOrSet.children) {
      const setHeroes = cardOrSet.children;
      for (let j = 0; j < setHeroes.length; j++) {
        const hero = setHeroes[j];
        const rowbreak = j === 0;
        appendHeroRow(tbody, scenarios, hero, difficulties, { rowbreak });
      }
    } else {
      const hero = cardOrSet;
      const rowbreak = i === 1; // Special case for first wave after core set.
      appendHeroRow(tbody, scenarios, hero, difficulties, { rowbreak });
    }
  }
}

function appendHeroRow(
  tbody,
  scenarios,
  hero,
  difficulties,
  { rowbreak } = {},
) {
  const row = createRow({ rowbreak });

  const { name: text, subname: subname, color } = hero;
  const heroCell = createCell({
    text,
    subname,
    color,
    colspan: difficulties.length,
    header: true,
  });
  row.appendChild(heroCell);

  for (const set of scenarios) {
    for (let i = 0; i < set.children.length; i++) {
      const scenario = set.children[i];
      const colbreak = i === 0;
      for (let j = 0; j < difficulties.length; j++) {
        const difficulty = difficulties[j];
        const cell = createGameCell(scenario, hero, difficulty, {
          colbreak: colbreak && j === 0,
          blockEnd: j === difficulties.length - 1,
        });
        row.appendChild(cell);
      }
    }
  }

  tbody.appendChild(row);
}

function createRow({ rowbreak = false } = {}) {
  const row = document.createElement("tr");
  if (rowbreak) {
    row.classList.add("row-break");
  }
  return row;
}

function createGameCell(scenario, hero, difficulty, options = {}) {
  const gameId = getGameId(scenario, hero, difficulty);

  const contentDiv = document.createElement("div");
  const label = document.createElement("label");
  label.htmlFor = gameId;
  label.classList.add("icon");
  contentDiv.appendChild(label);

  options.contentDiv = contentDiv;
  const cell = createCell(options);

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = gameId;
  input.indeterminate = true;
  input.dataset.difficulty = difficulty.id;

  cell.prepend(input);
  return cell;
}

function createCell({
  contentDiv = null,
  text = null,
  subname = null,
  color = null,
  colspan = 1,
  colbreak = false,
  header = false,
  progress = false,
  difficulty = false,
  blockEnd = false,
  blockIndex = null,
} = {}) {
  const tag = header ? "th" : "td";
  const cell = document.createElement(tag);
  const div = contentDiv || document.createElement("div");
  cell.appendChild(div);

  const classMap = {
    "block-end": blockEnd,
    "col-break": colbreak,
    progress,
    difficulty,
  };

  Object.entries(classMap).map(([className, toggle]) => {
    cell.classList.toggle(className, toggle);
  });

  if (colspan != 1) {
    cell.setAttribute("colspan", colspan);
  }

  if (progress && blockIndex) {
    cell.style.setProperty("--progress-col", blockIndex);
  }

  if (text) {
    const textDiv = document.createElement("div");
    textDiv.innerText = text;
    div.appendChild(textDiv);

    if (subname) {
      const subnameDiv = document.createElement("div");
      subnameDiv.innerText = subname;
      subnameDiv.classList.add("subname");
      div.appendChild(subnameDiv);
    }
  }

  if (color) {
    div.style.backgroundColor = color;
    div.style.color = chooseTextColor(color);
  }

  return cell;
}

function chooseTextColor(backgroundColorHex) {
  // See: https://stackoverflow.com/a/3943023/1213714
  const { r, g, b } = hexToRgb(backgroundColorHex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 186 ? "#000000" : "#ffffff";
}

function hexToRgb(hex) {
  var result = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function setUpIndeterminateCheckboxes() {
  const checkboxes = table.getElementsByTagName("input");
  for (const checkbox of checkboxes) {
    const state = getItem(checkbox.id);
    applyStateToCheckbox(checkbox, state);
    checkbox.addEventListener("click", handleCheckboxClick);
  }
}

function handleCheckboxClick(event) {
  const checkbox = event.target;
  const newState = nextCheckboxState(checkbox.dataset.state);
  setItem(checkbox.id, newState);
  applyStateToCheckbox(checkbox, newState);
  updateProgress();
}

function nextCheckboxState(state) {
  const states = [UNPLAYED, WIN, LOSS];
  return states[(states.indexOf(state) + 1) % states.length];
}

function applyStateToCheckbox(checkbox, state) {
  state ||= UNPLAYED;
  checkbox.dataset.state = state;
  checkbox.indeterminate = state === UNPLAYED;
  checkbox.checked = state === WIN;
}

function updateProgress() {
  const difficulties = getTrackedDifficulties();
  const totalCombinations = table.querySelectorAll("input").length;
  const toPercentage = (decimal) => `${(decimal * 100).toFixed(2)}%`;

  let totalCleared = 0;

  const combinationsPerDifficulty = totalCombinations / difficulties.length;
  for (const { id, label, span } of difficulties) {
    const cleared = table.querySelectorAll(
      `input:checked[data-difficulty="${id}"]`,
    ).length;
    totalCleared += cleared;
    if (difficulties.length > 1) {
      const percentage = toPercentage(cleared / combinationsPerDifficulty);
      span.innerText = percentage;
    } else {
      span.innerText = label;
    }
  }

  const totalPercentage = toPercentage(totalCleared / totalCombinations);
  totalPercentageSpan.innerText = totalPercentage;
  totalFractionSpan.innerText = `${totalCleared} / ${totalCombinations}`;
}

function isGameCompleted(scenario, hero, difficulty) {
  const gameId = getGameId(scenario, hero, difficulty);
  return getItem(gameId) === WIN;
}

function getGameId(scenario, hero, difficulty) {
  return `game--${scenario.id}--${hero.id}--${difficulty.id}`;
}

export {
  clearTable,
  renderTable,
  initializeDifficultySettings,
  getTrackedDifficulties,
  isGameCompleted,
};
