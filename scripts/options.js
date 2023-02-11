class Option {
  constructor(name, { variant = null, type = null, children = null } = {}) {
    this.name = name;
    this.type = type || this.constructor;
    this.slug = slug(this.name, variant);
    this.id = `${this.type.slug}--${this.slug}`;
    this.children = children;
  }

  get checked() {
    return (this._checked ||= localStorage.getItem(this.id) === "true");
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

  appendTo(element, ...classes) {
    const label = document.createElement("label");
    label.htmlFor = this.id;
    label.classList.add("option");
    classes.forEach((className) => label.classList.add(className));

    const input = document.createElement("input");
    input.id = this.id;
    input.type = "checkbox";
    input.checked = this.checked;

    const checkmark = document.createElement("div");
    checkmark.classList.add("checkmark");

    label.appendChild(input);
    label.appendChild(checkmark);
    label.append(this.name);

    input.addEventListener("click", (event) => {
      this.checked = event.target.checked;
    });

    this.checkbox = input;
    element.appendChild(label);
  }

  setChecked(value, cascadeUp, cascadeDown) {
    this._checked = value;
    localStorage.setItem(this.id, value);
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
  constructor(name, cards) {
    const variant = "set";
    const type = cards[0].constructor;
    const children = cards;
    super(name, { variant, type, children });
  }

  appendTo(element) {
    super.appendTo(element, "set");
    this.children.forEach((card) => card.appendTo(element, "set-member"));
  }
}

class Card extends Option {
  static get id() {
    return this.slug;
  }

  static get slug() {
    return (this._slug ||= slug(this.name));
  }

  static get namePlural() {
    return (this._name ||= `${this.name}s`);
  }

  constructor(
    name,
    { variant = null, isLandscape = false, hasBack = false } = {}
  ) {
    super(name, { variant });
    const image = (...path) => `images/${this.type.slug}/${path.join("/")}`;
    this.isLandscape = isLandscape;
    this.frontSrc = image(this.slug, "front.png");
    this.backSrc = hasBack ? image(this.slug, "back.png") : image("back.png");
  }
}

class Scenario extends Card {
  constructor(name, { hasBack = false } = {}) {
    super(name, { hasBack });
  }
}

class Module extends Card {
  constructor(name, { isLandscape = false } = {}) {
    super(name, { isLandscape });
  }
}

class Hero extends Card {
  static get namePlural() {
    return "Heroes";
  }

  constructor(name, { variant = null } = {}) {
    super(name, { variant, hasBack: true });
  }
}

class Aspect extends Card {
  constructor(name) {
    super(name);
  }
}

function slug(...names) {
  return names
    .join()
    .toLowerCase()
    .replaceAll(/’/g, "") // Remove apostrophes.
    .replaceAll(/[^a-zA-Z0-9]+/g, "-") // Replace all non-word characters with "-".
    .replaceAll(/(^\-+|\-+$)/g, ""); // Strip any leading and trailing "-".
}

export { All, CardSet, Scenario, Module, Hero, Aspect };
