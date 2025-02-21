import { Setting, All } from "./options.js?v=432547fb";
import {
  scenarios,
  modulars,
  heroes,
  aspects,
  flatten,
} from "./cards.js?v=868baff9";
import {
  initializeStorage,
  clearStorage,
  createBookmarkUrl,
  getBookmarkUrl,
  clearUserId,
  setUserId,
  getItem,
  setItem,
} from "./storage.js?v=fe539d70";
import {
  clearTable,
  renderTable,
  initializeDifficultySettings,
  getTrackedDifficulties,
  isGameCompleted,
} from "./tracker.js?v=85a7a0ce";

const cardChangeDelayMs = Number(
  getComputedStyle(document.documentElement)
    .getPropertyValue("--card-change-delay")
    .slice(0, -1 * "ms".length),
);

class Toggleable {
  show() {
    this.toggleVisibility(true);
  }

  hide() {
    this.toggleVisibility(false);
  }

  toggleVisibility(value) {
    this.root.classList.toggle("hidden", !value);
    this.childSection?.toggleVisibility(value);
  }
}

class Section extends Toggleable {
  constructor(
    cardsOrSets,
    nthOfType,
    { previousSiblingSection = null, parentSection = null } = {},
  ) {
    super();
    this.cardsOrSets = cardsOrSets;
    this.nthOfType = nthOfType;
    this.previousSiblingSection = previousSiblingSection;
    this.parentSection = parentSection;

    if (this.parentSection) {
      this.parentSection.childSection = this;
    }

    this.previousSiblingSections = [];
    this.allSiblingSections = [];
    if (this.previousSiblingSection) {
      this.previousSiblingSections.push(
        this.previousSiblingSection,
        ...this.previousSiblingSection.previousSiblingSections,
      );
      this.allSiblingSections.push(
        this.previousSiblingSection,
        ...this.previousSiblingSection.allSiblingSections,
      );
      this.allSiblingSections.forEach((siblingSection) =>
        siblingSection.allSiblingSections.push(this),
      );
    }

    this.allCards = flatten(this.cardsOrSets);

    this.type = this.allCards.reduce((type, card) => {
      const cardType = card.type;
      if (type === null || type === cardType) {
        return cardType;
      }
      throw new Error("All cards for a section must be the same type.");
    }, null);

    this.id = this.type.id;
    if (this.nthOfType !== 1) {
      this.id += `-${this.nthOfType}`;
    }

    this.forcedSettingId = this.id + "--setting--forced";

    this.root = document.getElementById(this.id);
  }

  get allCheckedCards() {
    return this.allCards.filter((card) => card.checked);
  }

  get maxChildCardCount() {
    return Math.max(
      ...this.allCards.map((card) =>
        card.childCardCount(settings.maxNumberOfHeroes),
      ),
    );
  }

  get trueCard() {
    return this.maxSlots === 1 ? (this.incomingCards || this.cards)[0] : null;
  }

  get childCardCount() {
    return this.trueCard?.childCardCount(settings.numberOfHeroes) || 0;
  }

  get excludedChildCards() {
    return this.trueCard?.excludedChildCards || [];
  }

  get requiredChildCards() {
    return this.trueCard?.requiredChildCards || [];
  }

  get defaultChildCards() {
    return this.trueCard?.defaultChildCards;
  }

  get visibleSiblingSections() {
    return this.allSiblingSections.filter((section) => section.visible);
  }

  get valid() {
    const parentSection = this.parentSection;

    const actualCount = this.cards.length;
    const expectedCount = parentSection ? parentSection.childCardCount : 1;
    const uniqueCount = new Set(this.cards).size;
    if (actualCount !== expectedCount || actualCount !== uniqueCount) {
      return false;
    }

    if (this.forced) {
      return true;
    }

    const required = parentSection ? parentSection?.requiredChildCards : [];
    const exclude = parentSection
      ? parentSection.excludedChildCards
      : this.visibleSiblingSections.map((section) => section.trueCard);
    exclude.push(...required);
    const included = (cards) => cards.filter((card) => !exclude.includes(card));

    const includedChecked = included(this.allCheckedCards);
    const includedDefault = included(this.getDefaultOptions());

    return this.cards.every(function (card, i) {
      if (i < required.length) {
        return card === required[i];
      }
      if (i < required.length + includedChecked.length) {
        return includedChecked.includes(card);
      }
      return includedDefault.includes(card);
    });
  }

  get visible() {
    return !this.root.classList.contains("hidden");
  }

  get disabled() {
    return this.button.disabled;
  }

  set disabled(value) {
    this.button.disabled = value;
    setGlobalButtonsAvailability();
  }

  get forced() {
    return getItem(this.forcedSettingId);
  }

  set forced(value) {
    setItem(this.forcedSettingId, value);
  }

  get cards() {
    return this._cards || [];
  }

  set cards(value) {
    this.setCards(value);
  }

  setCards(value) {
    this._cards = value;
    this.saveCards(value);

    this.name.innerText =
      value.length === 1 ? this.type.name : this.type.namePlural;

    const slotCards =
      value.length === 0 && this.type.placeholder
        ? [this.type.placeholder]
        : value;

    const { style } = this.root;
    const landscapeCount = slotCards.filter((card) => card.isLandscape).length;
    const portraitCount = slotCards.length - landscapeCount;
    style.setProperty("--landscape-cards-in-section", landscapeCount);
    style.setProperty("--portrait-cards-in-section", portraitCount);

    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].card = slotCards[i];
    }

    updateTrackingTable();
  }

  initialize() {
    this.initializeLayout();
    this.initializeOptions();
    this.initializeShuffling();
    this.initializeCards();
  }

  initializeLayout() {
    this.maxSlots = this.parentSection?.maxChildCardCount || 1;

    const sectionTemplate = document.getElementById("section");
    const element = sectionTemplate.content.cloneNode(true);
    this.root.appendChild(element);

    this.name = this.root.querySelector(".type-name");
    this.name.innerText = this.type.name;
    const selectText = `Select ${this.type.namePlural}`;
    this.root.querySelector(".select").innerText = selectText;

    const slotsContainer = this.root.querySelector(".slots");
    const slotTemplate = document.getElementById("slot");
    for (let i = 0; i < this.maxSlots; i++) {
      const element = slotTemplate.content.firstElementChild.cloneNode(true);
      slotsContainer.appendChild(element);
    }

    this.slots = Array.from(this.root.querySelectorAll(".slot")).map(
      (element) => new Slot(element),
    );
  }

  initializeOptions() {
    if (this.nthOfType !== 1) {
      return;
    }

    const options = this.root.querySelector(".options");

    const optionsHint = document.createElement("p");
    const noOrTooFew =
      this.maxSlots === 1 && this.allSiblingSections.length === 0
        ? "no"
        : "too few";
    optionsHint.classList.add("options-hint");
    optionsHint.innerText = `If ${noOrTooFew} ${this.type.namePlural} are selected, `;
    optionsHint.innerText += this.parentSection
      ? `${this.parentSection.type.name} default(s) will be used`
      : `Core Set ${this.type.namePlural} will be used`;
    options.appendChild(optionsHint);

    const all = new All(this);
    all.appendTo(options);
    this.cardsOrSets.forEach((cardOrSet) => cardOrSet.appendTo(options));
    options.addEventListener("submit", (event) => {
      event.preventDefault();
      toggleSettings();
    });

    if (getItem(this.id) === null) {
      this.cardsOrSets[0].checked = true;
    }
  }

  initializeShuffling() {
    this.button = this.root.querySelector("button");
    this.button.addEventListener("click", () => this.shuffle());
    this.root.addEventListener("transitionend", (event) =>
      this.onTransitionEnd(event),
    );
  }

  initializeCards() {
    this.cards = this.loadCards();
    this.shuffleIfInvalid({ animate: false });
  }

  shuffleIfInvalid({ animate = true } = {}) {
    if (!this.valid && !this.disabled) {
      this.shuffle({ animate });
      return true;
    }
    return false;
  }

  shuffle({ animate = true, isShuffleAll = false, forcedCards = null } = {}) {
    const parentSection = this.parentSection;

    const exclusiveSiblingSections = isShuffleAll
      ? this.previousSiblingSections
      : this.visibleSiblingSections;

    this.forced = forcedCards !== null;
    const required = forcedCards || parentSection?.requiredChildCards || [];

    const exclude = parentSection
      ? parentSection.excludedChildCards.slice()
      : exclusiveSiblingSections.flatMap((section) => section.trueCard);

    const cardCount = parentSection ? parentSection.childCardCount : 1;
    const newCards = [];

    for (let i = 0; i < cardCount; i++) {
      const oldCard = this.cards[i];
      const newCard =
        i < required.length
          ? required[i]
          : this.randomCard({ isShuffleAll, exclude });
      newCards.push(newCard);
      exclude.push(newCard);

      if (!animate || !this.visible) {
        continue;
      }

      // Preload new images.
      for (const src of ["frontSrc", "backSrc"]) {
        if (newCard[src] !== oldCard?.[src]) {
          new Image().src = newCard[src];
        }
      }
    }

    if (animate && this.visible) {
      this.disabled = true;
      document.body.classList.add("shuffling");
      this.root.classList.add("flipping");
      this.root.classList.remove("giant", "wide");
      this.incomingCards = newCards;
      setTimeout(() => (this.cards = newCards), cardChangeDelayMs);
    } else {
      this.cards = newCards;
    }
  }

  randomCard({ isShuffleAll = false, exclude = [], available = null } = {}) {
    available ||= this.allCheckedCards;
    available = available.filter((card) => !exclude.includes(card));

    if (available.length === 0) {
      available = this.getDefaultOptions();
      return this.randomCard({ exclude, available });
    }

    const prioritisedAvailable = available.flatMap((card) =>
      Array(this.getPriority(card, isShuffleAll)).fill(card),
    );
    if (prioritisedAvailable.length > 0) {
      available = prioritisedAvailable;
    }

    return chooseRandom(available);
  }

  getPriority() {
    return 1;
  }

  getDefaultOptions() {
    const parentCard = this.parentSection?.trueCard;
    if (parentCard?.defaultChildCards) {
      return parentCard.defaultChildCards;
    }

    const parentSet = this.cardsOrSets.find(
      (set) => set.name === parentCard?.parent?.name,
    );
    if (parentSet) {
      return parentSet.children;
    }

    const coreSet = this.cardsOrSets[0];
    return coreSet.children;
  }

  onTransitionEnd(event) {
    const { propertyName, target } = event;
    if (propertyName !== "transform" || target !== this.slots[0].root) {
      return;
    }

    document.body.classList.remove("shuffling");
    this.root.classList.remove("flipping");
    this.root.classList.add("flipped");
    this.disabled = false;
    this.incomingCards = null;

    this.childSection?.shuffleIfInvalid();
    maybeReturnFocusAfterShuffle();

    requestPostAnimationFrame(() => this.root.classList.remove("flipped"));
  }

  loadCards() {
    try {
      const savedCardIds = getItem(this.id);
      return savedCardIds
        ? savedCardIds
            .map((id) => this.allCards.find((card) => card.id === id))
            .filter((card) => card !== undefined)
        : [];
    } catch {
      clearStorage();
      return [];
    }
  }

  saveCards(cards) {
    const cardIds = cards.map((card) => card.id);
    setItem(this.id, cardIds);
  }
}

class ScenarioSection extends Section {
  get nextScenario() {
    const cardSet = this.trueCard?.parent;
    if (!cardSet?.isCampaign) {
      return null;
    }

    const scenarioIndex = cardSet.children.indexOf(this.trueCard);
    if (scenarioIndex === cardSet.children.length - 1) {
      return null;
    }

    return cardSet.children[scenarioIndex + 1];
  }

  setCards(value) {
    super.setCards(value);
    const nextScenario = this.nextScenario;
    this.campaignImage.src = nextScenario?.campaignImageSrc || "";
    document.body.classList.toggle("has-next-scenario", !!nextScenario);
  }

  initializeLayout() {
    super.initializeLayout();
    const buttonTemplate = document.getElementById("next-scenario-button");
    const element = buttonTemplate.content.cloneNode(true);
    this.root.appendChild(element);

    const button = this.root.querySelector(".next-scenario-button");
    button.addEventListener("click", () => this.goToNextScenario());

    this.campaignImage = this.root.querySelector(".campaign-image");
  }

  goToNextScenario() {
    this.shuffle({ forcedCards: this.nextScenario ? [this.nextScenario] : [] });
  }

  getPriority(scenario, isShuffleAll) {
    if (!settings.avoidCompleted) {
      return 1;
    }
    const heroes = isShuffleAll
      ? heroSection1.allCheckedCards
      : heroSections
          .filter((section) => section.visible)
          .map((section) => section.trueCard);
    return getNumberOfIncompleteGames([scenario], heroes);
  }
}

class ModularSection extends Section {
  setCards(value) {
    super.setCards(value);
    this.updateRequiredLabels();
  }

  shuffleIfInvalid(options) {
    const shuffled = super.shuffleIfInvalid(options);
    if (!shuffled) {
      this.updateRequiredLabels();
    }
    return shuffled;
  }

  updateRequiredLabels() {
    const required = this.parentSection.trueCard.requiredChildCards;
    const slots = this.slots || [];
    for (const slot of slots) {
      const { root, card } = slot;
      const isRequired = required.includes(card);
      root.classList.toggle("is-required", isRequired);
    }
  }
}

class HeroSection extends Section {
  getPriority(hero) {
    if (!settings.avoidCompleted) {
      return 1;
    }
    const scenario = scenarioSection.trueCard;
    return getNumberOfIncompleteGames([scenario], [hero]);
  }
}

class AspectSection extends Section {}

class Slot extends Toggleable {
  constructor(root) {
    super();
    this.root = root;
    this.header = root.querySelector(".header");
    this.name = root.querySelector(".name");
    this.subname = root.querySelector(".subname");
    this.cardFront = root.querySelector(".front img.front");
    this.cardFrontInner = root.querySelector(".front img.back");
    this.cardBack = root.querySelector(".back img.front");
    this.cardBackInner = root.querySelector(".back img.back");
  }

  get card() {
    return this._card;
  }

  set card(value) {
    const oldCard = this._card;
    const newCard = value;
    this._card = newCard;

    if (!newCard) {
      this.hide();
      return;
    }

    this.show();
    this.root.classList.toggle("landscape", newCard.isLandscape);
    this.root.classList.toggle("has-giant-form", newCard.hasGiantForm);
    this.root.classList.toggle("has-wide-form", newCard.hasWideForm);

    this.cardFront.src = newCard.frontSrc;
    if (newCard.backSrc !== oldCard?.backSrc) {
      this.cardBack.src = newCard.backSrc;
    }
    this.cardFrontInner.src = newCard.frontInnerSrc || "";
    this.cardBackInner.src = newCard.backInnerSrc || "";

    // Replacing the name element entirely fixes some animation bugs
    // which were happening when just replacing the text.

    this.name.remove();
    this.name = this.name.cloneNode(true);
    this.name.innerText = newCard.name;

    this.subname.remove();
    this.subname = this.subname.cloneNode(true);
    this.subname.innerText = newCard.subname;

    requestPostAnimationFrame(() =>
      this.header.prepend(this.name, this.subname),
    );
  }
}

class Settings {
  get avoidCompleted() {
    return this.showTracker && this._avoidCompletedSetting.checked;
  }

  get showTracker() {
    return this._showTrackerSetting.checked;
  }

  get anyDifficultiesTracked() {
    return this._difficultSettings.some((setting) => setting.checked);
  }

  initialize() {
    this.initializeNumberOfHeroes();
    this.initializeTrackerSettings();
  }

  initializeNumberOfHeroes() {
    const id = "setting--number-of-heroes";

    this.maxNumberOfHeroes = 4;
    const allowedValues = Array.from(
      { length: this.maxNumberOfHeroes },
      (_, i) => i + 1,
    );

    this.numberOfHeroes = getItem(id);
    if (!allowedValues.includes(this.numberOfHeroes)) {
      this.numberOfHeroes = allowedValues[0];
    }

    const fieldset = document.getElementById(id);

    const toggleHeroSectionVisibility = () => {
      for (let i = 0; i < heroSections.length; i++) {
        const heroSection = heroSections[i];
        heroSection.toggleVisibility(i < this.numberOfHeroes);
      }
    };

    const onChange = (event) => {
      const value = Number(event.target.value);
      this.numberOfHeroes = value;
      setItem(id, value);
      toggleHeroSectionVisibility();
    };

    for (let i = 1; i <= this.maxNumberOfHeroes; i++) {
      const inputId = `number-of-heroes-${i}`;

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.id = inputId;
      radio.name = "number-of-heroes";
      radio.value = i;
      radio.checked = i === this.numberOfHeroes;
      fieldset.appendChild(radio);

      const label = document.createElement("label");
      label.htmlFor = inputId;
      label.innerText = i;
      fieldset.appendChild(label);

      radio.addEventListener("change", onChange);
    }

    toggleHeroSectionVisibility();
  }

  initializeTrackerSettings() {
    const preferencesElement = document.getElementById("preferences");

    this._showTrackerSetting = new Setting(
      "show-tracker",
      "Show game tracker under shuffle",
      {
        onChange: (checked) =>
          document.body.classList.toggle("show-tracker", checked),
      },
    );

    this._difficultSettings = initializeDifficultySettings();

    this._avoidCompletedSetting = new Setting(
      "avoid-completed",
      "Avoid completed games when shuffling",
    );

    const settings = [
      this._showTrackerSetting,
      ...this._difficultSettings,
      this._avoidCompletedSetting,
    ];

    settings.forEach((setting) => setting.appendTo(preferencesElement));
  }
}

const settingsButton = document.getElementById("settings");
const shuffleAllButton = document.getElementById("shuffle-all");
const createBookmarkUrlButton = document.getElementById("create-bookmark-url");
const useBookmarkUrlButton = document.getElementById("use-bookmark-url");
const copyBookmarkUrlButton = document.getElementById("copy-bookmark-url");
const clearBookmarkUrlButton = document.getElementById("clear-bookmark-url");
const bookmarkUrlElement = document.getElementById("bookmark-url");

let lastClickedButton = null;

const settings = new Settings();

const scenarioSection = new ScenarioSection(scenarios, 1);
const modularSection = new ModularSection(modulars, 1, {
  parentSection: scenarioSection,
});
const heroSection1 = new HeroSection(heroes, 1);
const aspectSection1 = new AspectSection(aspects, 1, {
  parentSection: heroSection1,
});
const heroSection2 = new HeroSection(heroes, 2, {
  previousSiblingSection: heroSection1,
});
const aspectSection2 = new AspectSection(aspects, 2, {
  parentSection: heroSection2,
});
const heroSection3 = new HeroSection(heroes, 3, {
  previousSiblingSection: heroSection2,
});
const aspectSection3 = new AspectSection(aspects, 3, {
  parentSection: heroSection3,
});
const heroSection4 = new HeroSection(heroes, 4, {
  previousSiblingSection: heroSection3,
});
const aspectSection4 = new AspectSection(aspects, 4, {
  parentSection: heroSection4,
});

const sections = [
  scenarioSection,
  modularSection,
  heroSection1,
  aspectSection1,
  heroSection2,
  aspectSection2,
  heroSection3,
  aspectSection3,
  heroSection4,
  aspectSection4,
];

const heroSections = sectionsOfType(HeroSection);
const aspectSections = sectionsOfType(AspectSection);

function sectionsOfType(type) {
  return sections.filter((section) => section.constructor === type);
}

function shuffleAll() {
  for (const section of sections) {
    section.shuffle({ isShuffleAll: true });
  }
}

function toggleSettings() {
  const settingsVisible = document.body.classList.toggle("show-settings");
  shuffleAllButton.disabled = settingsVisible;
  sections.forEach((section) => (section.button.disabled = settingsVisible));
  if (settingsVisible) {
    settings.previousNumberOfHeroes = settings.numberOfHeroes;
  } else {
    const newHeroAndAspectSections = [
      ...heroSections.slice(
        settings.previousNumberOfHeroes,
        settings.numberOfHeroes,
      ),
      ...aspectSections.slice(
        settings.previousNumberOfHeroes,
        settings.numberOfHeroes,
      ),
    ];
    newHeroAndAspectSections.forEach((section) =>
      section.shuffle({ isShuffleAll: true, animate: false }),
    );
    requestPostAnimationFrame(() => {
      sections.forEach((section) => section.shuffleIfInvalid());
    });
    updateTrackingTable();
  }
}

function setGlobalButtonsAvailability() {
  const disabled = sections.some((section) => section.disabled);
  shuffleAllButton.disabled = disabled;
  settingsButton.disabled = disabled;
}

function maybeReturnFocusAfterShuffle() {
  if (lastClickedButton && !lastClickedButton.disabled) {
    lastClickedButton.focus();
  }
}

function getNumberOfIncompleteGames(scenarios, heroes) {
  const difficulties = getTrackedDifficulties();

  let incompleteCount = 0;
  for (const scenario of scenarios) {
    for (const hero of heroes) {
      for (const difficulty of difficulties) {
        if (!isGameCompleted(scenario, hero, difficulty)) {
          incompleteCount++;
        }
      }
    }
  }

  return incompleteCount;
}

function updateTrackingTable() {
  const scenariosReady = scenarioSection.cards.length > 0;

  const visibleHeroSections = heroSections.filter((section) => section.visible);
  const heroesReady = visibleHeroSections.every(
    (section) => section.cards.length > 0,
  );

  if (!scenariosReady || !heroesReady) {
    return;
  }

  if (settings.anyDifficultiesTracked) {
    const scenarioSet = { children: scenarioSection.cards };
    const heroSet = {
      children: visibleHeroSections.flatMap((section) => section.cards),
    };
    renderTable([scenarioSet], [heroSet]);
  } else {
    clearTable();
  }
}

function requestPostAnimationFrame(callback) {
  requestAnimationFrame(() => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = callback;
    port2.postMessage(undefined);
  });
}

function chooseRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function tryUseBookmarkUrl(url) {
  try {
    const userId = new URL(url).searchParams.get("id");
    if (!userId) {
      return false;
    }
    setUserId(userId.toString());
    location.href = location.origin + location.pathname; // Reload page without id override.
    return true;
  } catch {
    return false;
  }
}

async function initialize() {
  if (tryUseBookmarkUrl(location.href)) {
    return;
  }

  window.addEventListener("keydown", () => {
    lastClickedButton = null;
  });

  window.addEventListener("mousedown", () => {
    lastClickedButton = null;
  });

  window.addEventListener("click", (event) => {
    lastClickedButton = event.target.tagName === "BUTTON" ? event.target : null;
  });

  shuffleAllButton.addEventListener("click", () => shuffleAll());
  settingsButton.addEventListener("click", () => toggleSettings());

  createBookmarkUrlButton.addEventListener("click", async () => {
    const url = await createBookmarkUrl();
    bookmarkUrlElement.innerText = url;
  });

  useBookmarkUrlButton.addEventListener("click", () => {
    const url = prompt("Paste your bookmark URL here. The page will reload.");
    const success = tryUseBookmarkUrl(url);
    if (!success) {
      alert("Invalid bookmark URL.");
    }
  });

  copyBookmarkUrlButton.addEventListener("click", async () => {
    const url = await getBookmarkUrl();
    await navigator.clipboard.writeText(url);
    alert("Your bookmark URL has been copied to the clipboard.");
  });

  clearBookmarkUrlButton.addEventListener("click", () => {
    const confirmed = confirm(
      "Your bookmark URL will be cleared from this browser. Click OK to confirm.",
    );
    if (confirmed) {
      clearUserId();
    }
  });

  await initializeStorage();
  const bookmarkUrl = await getBookmarkUrl();
  bookmarkUrlElement.innerText = bookmarkUrl;

  settings.initialize();

  for (const section of sections) {
    section.initialize();
  }

  for (const section of [scenarioSection, ...heroSections]) {
    const slot = section.slots[0];
    const sectionClassList = section.root.classList;
    const slotClassList = slot.root.classList;
    slot.root.addEventListener("click", () => {
      if (sectionClassList.contains("flipping")) {
        return;
      }
      if (slotClassList.contains("has-giant-form")) {
        sectionClassList.toggle("giant");
      } else if (slotClassList.contains("has-wide-form")) {
        sectionClassList.toggle("wide");
      }
    });
  }
}

await initialize();
setTimeout(() => document.body.classList.remove("init"), 100);
