import { hashes } from "./hashes.js?v=00000000";
import { getItem, setItem } from "./storage.js?v=00ea94bd";

class Option {
  constructor(
    name,
    {
      type = null,
      slug = null,
      slugModifier = null,
      children = null,
      onChange = null,
      defaultValue = null,
    } = {},
  ) {
    this.name = name;
    this.type = type || this.constructor;
    this.slug = slug || getSlug(this.name, slugModifier);
    this.id = `${this.type.slug}--${this.slug}`;
    this.children = children;
    this._onChange = onChange;
    this.defaultValue = defaultValue;
  }

  get checked() {
    if (this._checked === undefined) {
      if (this.children) {
        this._checked = this.children.every((child) => child.checked);
      } else {
        const storedValue = getItem(this.id);
        this._checked = storedValue === null ? this.defaultValue : storedValue;
      }
    }
    return this._checked;
  }

  set checked(value) {
    this.setChecked(value, true, true);
  }

  get children() {
    return this._children;
  }

  set children(value) {
    this._children = value;
    value?.forEach((child) => (child.parent = this));
  }

  get anyDescendantChecked() {
    if (!this.children) {
      return false;
    }
    return this.children.some(
      (child) => child.checked || child.anyDescendantChecked,
    );
  }

  appendTo(element, ...classes) {
    const label = document.createElement("label");
    label.htmlFor = this.id;
    label.classList.add("option");
    classes.forEach((className) => label.classList.add(className));

    const input = document.createElement("input");
    input.id = this.id;
    input.type = "checkbox";
    input.checked = this.checked;
    this.onChange(this.checked);

    const checkmark = document.createElement("div");
    checkmark.classList.add("checkmark");

    label.appendChild(input);
    label.appendChild(checkmark);

    const textWrapperDiv = document.createElement("div");

    const nameDiv = document.createElement("div");
    nameDiv.innerText = this.name;
    textWrapperDiv.append(nameDiv);

    if (this.subname) {
      const subnameDiv = document.createElement("div");
      subnameDiv.innerText = this.subname;
      subnameDiv.classList.add("subname");
      textWrapperDiv.append(subnameDiv);
    }

    label.append(textWrapperDiv);

    input.addEventListener("click", (event) => {
      this.checked = event.target.checked;
    });

    this.checkbox = input;
    element.appendChild(label);

    this.updateIndeterminateState();
  }

  onChange(checked) {
    if (this._onChange) {
      this._onChange(checked);
    }
  }

  setChecked(value, cascadeUp, cascadeDown) {
    this._checked = value;
    this.onChange(value);
    if (!this.children) {
      setItem(this.id, value);
    }
    if (this.checkbox) {
      this.checkbox.checked = value;
    }
    if (this.children && cascadeDown) {
      this.children.forEach((child) => child.setChecked(value, false, true));
    }
    if (this.parent && cascadeUp) {
      const siblings = this.parent.children;
      const allSiblingsChecked = siblings.every((child) => child.checked);
      this.parent.setChecked(allSiblingsChecked, true, false);
    }
    this.updateIndeterminateState();
  }

  updateIndeterminateState() {
    this.checkbox.indeterminate = !this.checked && this.anyDescendantChecked;
  }
}

class Setting extends Option {
  constructor(slug, label, { onChange = null, defaultValue = null } = {}) {
    super(label, { slug, onChange, defaultValue });
  }

  static get slug() {
    return "setting";
  }
}

class All extends Option {
  constructor(section) {
    const name = `All ${section.type.namePlural}`;
    const type = section.type;
    const children = section.cardsOrSets;
    super(name, { type, children });
  }

  appendTo(element) {
    super.appendTo(element, "all");
  }
}

class CardSet extends Option {
  constructor(name, cards, isCampaign) {
    const type = cards[0].constructor;
    const slugModifier = "set";
    const children = cards;
    super(name, { type, slugModifier, children });
    this.isCampaign = isCampaign;
  }

  appendTo(element) {
    super.appendTo(element, "set");
    this.children.forEach((card) => card.appendTo(element, "set-member"));
  }
}

class Card extends Option {
  constructor(
    name,
    {
      subname = null,
      color = null,
      isLandscape = false,
      baseChildCardCount = 0,
      excludedChildCards = [],
      requiredChildCards = [],
      defaultChildCards = null,
      additionalChildCardsPerHero = 0,
      hasBack = false,
      hasGiantForm = false,
      hasWideForm = false,
      traits = [],
    } = {},
  ) {
    const slugModifier = subname;
    super(name, { slugModifier });

    this.subname = subname;
    this.color = color;
    this.isLandscape = isLandscape;
    this.baseChildCardCount = baseChildCardCount;
    this.excludedChildCards = excludedChildCards;
    this.requiredChildCards = requiredChildCards;
    this.defaultChildCards = defaultChildCards;
    this.additionalChildCardsPerHero = additionalChildCardsPerHero;
    this.traits = traits;
    this.hasGiantForm = hasGiantForm;
    this.hasWideForm = hasWideForm;

    this.frontSrc = this.image(this.slug, "front.png");
    this.backSrc = hasBack
      ? this.image(this.slug, "back.png")
      : this.image("back.png");

    const hasInnerForm = hasGiantForm || hasWideForm;
    [this.frontInnerSrc, this.backInnerSrc] = hasInnerForm
      ? [
          this.image(this.slug, "front-inner.png"),
          this.image(this.slug, "back-inner.png"),
        ]
      : [null, null];
  }

  static get id() {
    return this.slug;
  }

  static get slug() {
    return (this._slug ||= getSlug(this.name));
  }

  static get namePlural() {
    return (this._namePlural ||= `${this.name}s`);
  }

  childCardCount(numberOfHeroes) {
    return (
      this.requiredChildCards.length +
      this.baseChildCardCount +
      this.additionalChildCardsPerHero * numberOfHeroes
    );
  }

  image(...pathParts) {
    return image(this.type, ...pathParts);
  }
}

class Scenario extends Card {
  constructor(
    name,
    modularsOrNumber,
    color,
    {
      exclude = [],
      required = [],
      hasBack = false,
      hasGiantForm = false,
      additionalModularsPerHero = 0,
    } = {},
  ) {
    const [baseChildCardCount, defaultChildCards] = Array.isArray(
      modularsOrNumber,
    )
      ? [modularsOrNumber.length, modularsOrNumber]
      : [modularsOrNumber, null];
    const excludedChildCards = exclude;
    const requiredChildCards = required;
    const additionalChildCardsPerHero = additionalModularsPerHero;
    super(name, {
      color,
      hasBack,
      hasGiantForm,
      baseChildCardCount,
      defaultChildCards,
      excludedChildCards,
      requiredChildCards,
      additionalChildCardsPerHero,
    });
  }

  get campaignImageSrc() {
    const cardSet = this.parent;
    if (!cardSet.isCampaign) {
      return "";
    }
    const campaignSlug = cardSet.slug.slice(0, -"-set".length);
    return `/images/campaign/${campaignSlug}.png`;
  }
}

class Modular extends Card {
  constructor(
    name,
    { isLandscape = false, hasBack = false, traits = [] } = {},
  ) {
    super(name, { isLandscape, hasBack, traits });
  }

  static get placeholder() {
    if (!this._placeholder) {
      const card = new this("No modulars needed");
      card.frontSrc = card.backSrc = image(this, "back.png");
      this._placeholder = card;
    }
    return this._placeholder;
  }
}

class Hero extends Card {
  constructor(
    name,
    aspects,
    color,
    { alterEgo = null, hasGiantForm = false, hasWideForm = false } = {},
  ) {
    const subname = alterEgo;
    const hasBack = true;
    const baseChildCardCount = aspects.length;
    const defaultChildCards = aspects;
    super(name, {
      subname,
      color,
      hasBack,
      hasGiantForm,
      hasWideForm,
      baseChildCardCount,
      defaultChildCards,
    });
  }

  static get namePlural() {
    return "Heroes";
  }
}

class Aspect extends Card {
  constructor(name) {
    super(name);
  }
}

function getSlug(...names) {
  return names
    .join()
    .toLowerCase()
    .replaceAll(/[’\.]/g, "") // Remove apostrophes and full stops.
    .replaceAll(/[^a-zA-Z0-9]+/g, "-") // Replace all non-word characters with "-".
    .replaceAll(/(^\-+|\-+$)/g, ""); // Strip any leading and trailing "-".
}

function image(type, ...pathParts) {
  const path = ["/images", type.slug, ...pathParts].join("/");
  const hash = hashes[path];
  return hash ? `${path}?v=${hash}` : path;
}

export { Setting, All, CardSet, Scenario, Modular, Hero, Aspect };
