const LEVEL_SCORE = { green: 1, orange: 2, red: 3 };
const SCORE_LEVEL = { 1: "green", 2: "orange", 3: "red" };
const EMERGENCY_DEPARTMENT_TERMS = {
  en: "Emergency Department",
  "zh-CN": "急诊科",
  el: "Τμήμα Επειγόντων Περιστατικών",
  ar: "قسم الطوارئ",
  mk: "Одделот за итни случаи",
  ko: "응급실",
  vi: "Khoa Cấp cứu",
  ne: "आपतकालीन विभागमा"
};

const state = {
  registry: null,
  content: null,
  englishContent: null,
  lang: localStorage.getItem("symptomNavigatorLang") || null,
  route: "language",
  pageNotice: "",
  selectedConcerns: new Set(),
  selectedTreatments: new Set(),
  selectedStomach: new Set(),
  activeSections: [],
  sectionIndex: 0,
  answers: {},
  unsureTriggered: false
};

const app = document.querySelector("#app");
const header = document.querySelector("#siteHeader");
const title = document.querySelector("#site-title");
const skipLink = document.querySelector("#skipLink");
const backButton = document.querySelector("#backButton");
const languageButton = document.querySelector("#languageButton");

init();

async function init() {
  state.registry = await fetchJson("content/languages.json");
  state.englishContent = await fetchJson("content/en/site-content.json");
  state.content = state.englishContent;
  state.route = "language";
  backButton.addEventListener("click", goBack);
  languageButton.addEventListener("click", () => {
    state.route = "language";
    render();
  });
  render();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url);
  return response.json();
}

async function loadLanguage(lang) {
  state.lang = lang;
  localStorage.setItem("symptomNavigatorLang", lang);
  state.pageNotice = "";
  try {
    state.content = await fetchJson(`content/${lang}/site-content.json`);
  } catch {
    state.content = state.englishContent;
    state.pageNotice = state.registry.notices.pageEnglishOnly;
  }
}

function ui(key) {
  return state.content?.ui?.[key] || state.registry?.notices?.sectionEnglishOnly || "";
}

function registryUi(key) {
  return state.registry?.ui?.[key] || "";
}

function currentLanguage() {
  return state.registry.languages.find((language) => language.id === state.lang) || state.registry.languages[0];
}

function textValue(value) {
  return typeof value === "string" && value.trim() ? value : ui("sectionEnglishOnly");
}

function render() {
  const language = currentLanguage();
  document.documentElement.lang = language.htmlLang;
  document.documentElement.dir = language.dir;
  document.title = ui("siteTitle");
  skipLink.textContent = ui("skipContent");
  title.textContent = ui("siteTitle");
  backButton.textContent = ui("back");
  languageButton.textContent = language.shortName;
  header.hidden = state.route === "language" || state.route === "welcome";

  const views = {
    language: renderLanguage,
    welcome: renderWelcome,
    concerns: renderConcerns,
    treatments: renderTreatments,
    stomach: renderStomach,
    checklist: renderChecklist,
    contact: renderContact,
    result: renderResult
  };

  app.innerHTML = (views[state.route] || renderLanguage)();
  bindActions();
  updateContinueState();
  app.focus({ preventScroll: true });
}

function bindActions() {
  app.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", async () => {
      await loadLanguage(button.dataset.language);
      resetFlow(false);
      state.route = "welcome";
      render();
    });
  });

  app.querySelectorAll("[data-next]").forEach((button) => {
    button.addEventListener("click", () => next(button.dataset.next));
  });

  app.querySelectorAll("[data-toggle-concern]").forEach((button) => {
    button.addEventListener("click", () => toggleSet(state.selectedConcerns, button.dataset.toggleConcern, button));
  });

  app.querySelectorAll("[data-toggle-treatment]").forEach((button) => {
    button.addEventListener("click", () => toggleSet(state.selectedTreatments, button.dataset.toggleTreatment, button));
  });

  app.querySelectorAll("[data-toggle-stomach]").forEach((button) => {
    button.addEventListener("click", () => toggleSet(state.selectedStomach, button.dataset.toggleStomach, button));
  });

  app.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.question;
      const answer = button.dataset.answer;
      state.answers[key] = answer;
      app.querySelectorAll(`[data-question="${key}"]`).forEach((item) => {
        item.setAttribute("aria-pressed", item.dataset.answer === answer ? "true" : "false");
      });
      updateContinueState();
    });
  });
}

function toggleSet(set, value, button) {
  if (set.has(value)) {
    set.delete(value);
    button.setAttribute("aria-pressed", "false");
  } else {
    set.add(value);
    button.setAttribute("aria-pressed", "true");
  }
  updateContinueState();
}

function updateContinueState() {
  const continueButton = app.querySelector("[data-continue]");
  if (!continueButton) return;
  if (state.route === "concerns") continueButton.disabled = state.selectedConcerns.size === 0;
  if (state.route === "treatments") continueButton.disabled = state.selectedTreatments.size === 0;
  if (state.route === "stomach") continueButton.disabled = state.selectedStomach.size === 0;
  if (state.route === "checklist") continueButton.disabled = !currentSectionAnswered();
}

function next(target) {
  if (target === "concerns") {
    state.route = "concerns";
  } else if (target === "treatments") {
    state.route = "treatments";
  } else if (target === "after-treatments") {
    if (state.selectedTreatments.has("unsure")) state.unsureTriggered = true;
    if (state.selectedConcerns.has("stomach")) {
      state.route = "stomach";
    } else {
      prepareSections();
      state.route = state.activeSections.length ? "checklist" : "result";
    }
  } else if (target === "after-stomach") {
    prepareSections();
    state.route = state.activeSections.length ? "checklist" : "result";
  } else if (target === "next-section") {
    captureSectionRisk();
    if (state.sectionIndex < state.activeSections.length - 1) {
      state.sectionIndex += 1;
      state.route = "checklist";
    } else {
      state.route = "result";
    }
  } else if (target === "restart") {
    resetFlow(true);
  }
  render();
}

function goBack() {
  if (state.route === "welcome") {
    state.route = "language";
  } else if (state.route === "concerns") {
    state.route = "welcome";
  } else if (state.route === "treatments") {
    state.route = "concerns";
  } else if (state.route === "stomach") {
    state.route = "treatments";
  } else if (state.route === "checklist") {
    if (state.sectionIndex > 0) {
      state.sectionIndex -= 1;
    } else if (state.selectedConcerns.has("stomach")) {
      state.route = "stomach";
    } else {
      state.route = "treatments";
    }
  } else if (state.route === "result") {
    state.route = state.activeSections.length ? "checklist" : "treatments";
  } else if (state.route === "contact") {
    state.route = "treatments";
  } else {
    state.route = "welcome";
  }
  render();
}

function resetFlow(keepLanguage = true) {
  state.selectedConcerns = new Set();
  state.selectedTreatments = new Set();
  state.selectedStomach = new Set();
  state.activeSections = [];
  state.sectionIndex = 0;
  state.answers = {};
  state.unsureTriggered = false;
  state.route = keepLanguage ? "welcome" : state.route;
}

function prepareSections() {
  const sections = [];
  state.answers = {};
  state.sectionIndex = 0;
  state.selectedConcerns.forEach((id) => {
    if (id === "unsure") {
      state.unsureTriggered = true;
      return;
    }
    if (id === "contact" || id === "stomach") return;
    sections.push(id);
  });
  state.selectedStomach.forEach((id) => {
    if (id === "stomach-unsure") state.unsureTriggered = true;
    sections.push(id);
  });
  state.activeSections = sections.filter((id) => state.content.sections?.[id]);
}

function currentSection() {
  return state.content.sections[state.activeSections[state.sectionIndex]];
}

function currentSectionAnswered() {
  const sectionId = state.activeSections[state.sectionIndex];
  const section = state.content.sections[sectionId];
  if (!section || sectionIsMissing(section)) return true;
  return section.questions.every((question) => state.answers[answerKey(sectionId, question.id)]);
}

function captureSectionRisk() {
  const sectionId = state.activeSections[state.sectionIndex];
  const section = state.content.sections[sectionId];
  if (!section || sectionIsMissing(section)) {
    state.unsureTriggered = true;
    return;
  }
  section.questions.forEach((question) => {
    const answer = state.answers[answerKey(sectionId, question.id)];
    if (answer === "unsure") state.unsureTriggered = true;
  });
}

function sectionIsMissing(section) {
  return !section?.title || !Array.isArray(section.questions) || section.questions.some((question) => !question.text);
}

function answerKey(sectionId, questionId) {
  return `${sectionId}:${questionId}`;
}

function calculateResult() {
  let score = 1;
  if (state.selectedConcerns.has("unsure") || state.selectedTreatments.has("unsure") || state.selectedStomach.has("stomach-unsure")) {
    score = Math.max(score, 2);
  }
  for (const sectionId of state.activeSections) {
    const section = state.content.sections[sectionId];
    if (!section || sectionIsMissing(section)) {
      score = Math.max(score, 2);
      continue;
    }
    if (section.defaultLevel) score = Math.max(score, LEVEL_SCORE[section.defaultLevel] || 1);
    for (const question of section.questions) {
      const answer = state.answers[answerKey(sectionId, question.id)];
      let level = null;
      if (answer === "yes") level = question.yes || "green";
      if (answer === "no") level = question.no || "green";
      if (answer === "unsure") level = question.unsure || "orange";
      if (level) score = Math.max(score, LEVEL_SCORE[level]);
    }
  }
  if (state.selectedTreatments.size > 1 || state.selectedTreatments.has("multiple")) score = Math.max(score, 2);
  return { level: SCORE_LEVEL[score] };
}

function renderNotice() {
  return state.pageNotice ? `<div class="notice">${state.pageNotice}</div>` : "";
}

function renderLanguage() {
  return `
    <section class="language-page">
      <div class="language-shell">
        <div class="globe language-globe" aria-hidden="true">◎</div>
        <div class="language-copy">
          <h1 class="language-title">${registryUi("languageTitle")}</h1>
          <p class="language-subtitle">${registryUi("languageSubtitle")}</p>
          <p class="language-question">${registryUi("languagePrompt")}</p>
          <p class="language-support">${registryUi("languageSupport")}</p>
          <p class="choose-language">${registryUi("languageChoose")}</p>
        </div>
        <div class="grid language-grid">
        ${state.registry.languages.map((language) => `
          <button class="language-card" type="button" data-language="${language.id}">
            ${language.nativeName}
          </button>
        `).join("")}
        </div>
        <p class="language-footer">${registryUi("languageFooter")}</p>
      </div>
    </section>
  `;
}

function renderWelcome() {
  const welcome2 = state.content?.ui?.welcome2 || "";
  return `
    <section class="language-page welcome-page">
      <div class="language-shell welcome-shell">
        ${renderNotice()}
        <div class="welcome-hero-icon" aria-hidden="true">♡</div>
        <div class="language-copy welcome-copy">
          <h2 class="page-title welcome-title">${ui("welcomeTitle")}</h2>
          <p class="language-subtitle">${ui("welcome1")}</p>
          ${welcome2 ? `<p class="language-subtitle">${welcome2}</p>` : ""}
        </div>
        ${renderEmergencyCallout()}
        ${renderHelpLineCard("welcome")}
        <div class="welcome-support-card">
          <div class="welcome-support-icon" aria-hidden="true">♡</div>
          <div class="welcome-support-copy">
            <p class="welcome-support-title">${ui("welcomePrompt")}</p>
            <p class="language-support">${ui("welcomeSupport")}</p>
            <div class="welcome-reassure">
              <p>${ui("welcome4")}</p>
            </div>
          </div>
        </div>
        <div class="welcome-actions">
          <button class="primary-button welcome-primary" type="button" data-next="concerns">${ui("start")}</button>
        </div>
        <p class="language-footer welcome-footer">${ui("noStore")}\n${ui("footerGeneral")}</p>
      </div>
    </section>
  `;
}

function renderConcerns() {
  return `
    <section class="stack">
      ${renderNotice()}
      <div class="section-header">
        <h2 class="page-title">${ui("worryTitle")}</h2>
        <p class="lead">${ui("worryLead")}</p>
      </div>
      <div class="grid option-grid">
        ${state.content.concerns.map((concern) => renderMultiButton("concern", concern.id, textValue(concern.label), state.selectedConcerns.has(concern.id))).join("")}
      </div>
      <div class="actions">
        <button class="primary-button" type="button" data-next="treatments" data-continue disabled>${ui("continue")}</button>
      </div>
    </section>
  `;
}

function renderTreatments() {
  return `
    <section class="stack">
      ${renderNotice()}
      <div class="section-header">
        <h2 class="page-title">${ui("treatmentTitle")}</h2>
        <p class="lead">${ui("treatmentLead")}</p>
      </div>
      <div class="grid option-grid">
        ${state.content.treatments.map((treatment) => renderMultiButton("treatment", treatment.id, textValue(treatment.label), state.selectedTreatments.has(treatment.id))).join("")}
      </div>
      <p class="small">${ui("noStore")}</p>
      <div class="actions">
        <button class="primary-button" type="button" data-next="after-treatments" data-continue disabled>${ui("continue")}</button>
      </div>
    </section>
  `;
}

function renderStomach() {
  return `
    <section class="stack">
      ${renderNotice()}
      <div class="section-header">
        <h2 class="page-title">${ui("stomachTitle")}</h2>
        <p class="lead">${ui("worryLead")}</p>
      </div>
      <div class="grid option-grid">
        ${state.content.stomachOptions.map((option) => renderMultiButton("stomach", option.id, textValue(option.label), state.selectedStomach.has(option.id))).join("")}
      </div>
      <div class="actions">
        <button class="primary-button" type="button" data-next="after-stomach" data-continue disabled>${ui("continue")}</button>
      </div>
    </section>
  `;
}

function renderChecklist() {
  const section = currentSection();
  const sectionId = state.activeSections[state.sectionIndex];
  const total = state.activeSections.length;
  if (!section || sectionIsMissing(section)) {
    return `
      <section class="stack">
        ${renderNotice()}
        <p class="progress">${ui("sectionProgress")} ${state.sectionIndex + 1} / ${total}</p>
        <div class="notice">${ui("sectionEnglishOnly")}</div>
        <div class="actions">
          <button class="primary-button" type="button" data-next="next-section" data-continue>${ui("continue")}</button>
        </div>
      </section>
    `;
  }
  return `
    <section class="stack">
      ${renderNotice()}
      <p class="progress">${ui("sectionProgress")} ${state.sectionIndex + 1} / ${total}</p>
      <div class="quick-card">
        <strong>${ui("quickCheck")}</strong>
        <p>${ui("fewerQuestions")}</p>
      </div>
      <div class="panel question-card">
        <h2>${section.title}</h2>
        ${section.questions.map((question) => renderQuestion(sectionId, question)).join("")}
      </div>
      <p class="small">${ui("noStore")}</p>
      <div class="actions">
        <button class="primary-button" type="button" data-next="next-section" data-continue ${currentSectionAnswered() ? "" : "disabled"}>${ui("continue")}</button>
      </div>
    </section>
  `;
}

function renderQuestion(sectionId, question) {
  const key = answerKey(sectionId, question.id);
  const answer = state.answers[key];
  return `
    <div class="question-card">
      <h3>${textValue(question.text)}</h3>
      <div class="answer-row" role="group">
        ${["yes", "no", "unsure"].map((value) => `
          <button class="answer-button" type="button" data-question="${key}" data-answer="${value}" aria-pressed="${answer === value ? "true" : "false"}">
            ${value === "unsure" ? ui("notSure") : ui(value)}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderMultiButton(type, id, label, selected) {
  const source =
    type === "concern"
      ? state.content.concerns.find((item) => item.id === id)
      : type === "treatment"
        ? state.content.treatments.find((item) => item.id === id)
        : state.content.stomachOptions.find((item) => item.id === id);
  const icon = source?.emoji ? `<span class="item-emoji" aria-hidden="true">${source.emoji}</span>` : "";
  return `
    <button class="choice-button" type="button" data-toggle-${type}="${id}" aria-pressed="${selected ? "true" : "false"}">
      <span class="checkmark" aria-hidden="true">✓</span>
      <span class="choice-content">${icon}<span>${label}</span></span>
    </button>
  `;
}

function renderResult() {
  captureSectionRisk();
  const result = calculateResult();
  const level = state.unsureTriggered && result.level === "green" ? "orange" : result.level;
  const isUnsure = state.unsureTriggered && level !== "red";
  const heading = isUnsure ? ui("unsureTitle") : ui(`${level}Title`);
  const advice = isUnsure ? ui("unsureAdvice") : ui(`${level}Advice`);
  return `
    <section class="stack">
      ${renderNotice()}
      <div class="section-header">
        <h2 class="page-title">${ui("finalTitle")}</h2>
      </div>
      ${level === "orange" || isUnsure ? renderCallAdviceCard() : `
        <div class="action-card ${level}">
          <h3>${heading}</h3>
          <p>${advice}</p>
        </div>
      `}
      ${level !== "red" ? renderHelpLineCard() : ""}
      ${state.lang !== "en" && (state.selectedConcerns.has("contact") || level !== "green") ? renderInterpreterCard() : ""}
      ${renderResources()}
      <p class="small">${ui("noStore")}</p>
      <p class="small">${ui("translationNote")}</p>
      <button class="primary-button" type="button" data-next="restart">${ui("startAgain")}</button>
    </section>
  `;
}

function renderCallAdviceCard() {
  return `
    <div class="action-card orange detailed-call-card">
      <div class="call-card-row call-card-title">
        <span class="call-card-mark" aria-hidden="true">☎</span>
        <h3>${ui("callAdviceTitle")}</h3>
      </div>
      <p class="call-card-intro">${ui("callAdviceIntro")}</p>
      <div class="call-card-row call-card-reassure">
        <span class="call-card-mark soft" aria-hidden="true">♡</span>
        <p>${ui("welcome4")}</p>
      </div>
      <div class="call-card-divider" aria-hidden="true"></div>
      <div class="call-card-row call-card-warning">
        <span class="call-card-mark warning" aria-hidden="true">!</span>
        <p>${formatCallAdviceEscalation()}</p>
      </div>
    </div>
  `;
}

function formatCallAdviceEscalation() {
  let text = ui("callAdviceEscalation");
  text = text.replace(/000/g, "<strong>000</strong>");
  const departmentTerm = EMERGENCY_DEPARTMENT_TERMS[state.lang];
  if (departmentTerm) {
    text = text.replace(departmentTerm, `<strong>${departmentTerm}</strong>`);
  }
  return text;
}

function renderContact() {
  return `
    <section class="stack">
      ${renderNotice()}
      <div class="section-header">
        <h2 class="page-title">${ui("contacts")}</h2>
      </div>
      ${renderHelpLineCard()}
      ${state.lang !== "en" ? renderInterpreterCard() : ""}
      ${renderResources()}
      <p class="small">${ui("noStore")}</p>
      <button class="primary-button" type="button" data-next="restart">${ui("startAgain")}</button>
    </section>
  `;
}

function renderInterpreterCard() {
  return `
    <div class="contact-card interpreter-card">
      <strong>${ui("interpreterPromptTitle")}</strong>
      <p>${ui("interpreterSectionText")}</p>
    </div>
  `;
}

function renderHelpLineCard(mode = false) {
  const compact = mode === true || mode === "compact";
  const welcome = mode === "welcome";
  return `
    <div class="helpline-card ${compact ? "compact" : ""} ${welcome ? "welcome" : ""}">
      <div class="helpline-icon" aria-hidden="true">☎</div>
      <div class="helpline-copy">
        <strong>${ui("helpLineTitle")}</strong>
        <a class="helpline-number" href="tel:0291133909">${ui("helpLineNumber")}</a>
        <p>${ui("helpLineHours")}</p>
        ${welcome ? "" : `<p class="small">${ui("callEarlyTitle")} ${ui("callEarlyText")}</p>`}
      </div>
    </div>
  `;
}

function renderEmergencyCallout() {
  const text = ui("notEverythingEmergency");
  const parts = text.split("\n");
  const heading = parts.shift() || "";
  const body = parts.join(" ").trim();
  return `
    <section class="emergency-callout" aria-label="${heading}">
      <div class="emergency-callout-icon" aria-hidden="true">!</div>
      <div class="emergency-callout-copy">
        <h2>${heading}</h2>
        <p>${body}</p>
      </div>
    </section>
  `;
}

function renderResources() {
  const groups = state.content.resourceGroups || [];
  const visibleGroups = state.lang === "en" ? groups.slice(0, 1) : groups.slice(1);
  return `
    <section class="stack">
      ${visibleGroups.map((group) => `
        <div class="resource-card resource-group">
          <strong>${textValue(group.title)}</strong>
          <div class="resource-links">
            ${group.links.map((resource) => `
              <a class="resource-link" href="${resource.url}" target="_blank" rel="noreferrer">
                <span class="resource-link-title">${textValue(resource.title)}</span>
                <span class="resource-link-copy">${textValue(resource.description)}</span>
              </a>
            `).join("")}
          </div>
        </div>
      `).join("")}
    </section>
  `;
}
