import {
  SECTIONS, SECTION_LABELS, spokenText, scriptOf, voiceRequest, matchVoice, telHref, phraseKey,
} from './phrase-utils.js';

const FAV_KEY = 'tpb_favs';
const RECENTS_KEY = 'tpb_recents';
const DARK_KEY = 'tpb_dark';
const ONBOARD_KEY = 'tpb_onboarded';
const INFO_TABS = [
  ['culture', 'Culture'],
  ['money', 'Money'],
  ['food', 'Food'],
  ['safety', 'Safety'],
  ['apps', 'Apps'],
];
const ONBOARD = [
  { title: 'Phrases for 19 countries', body: 'Tap a phrase to hear it. If this phone has no voice for that language, read the pronunciation instead.' },
  { title: 'Numbers you can call', body: 'Emergency numbers are separate call buttons. Japan is 110 and 119, not one string.' },
  { title: 'Learn before you land', body: 'Quiz a category, or the whole country. Saved phrases stay on this phone.' },
];

const countries = new Map();
let catalog = [];
let current = null;
let activeSection = 'greetings';
let showingSaved = false;
let tripSelecting = false;
const tripSelected = new Set();
let quiz = null;
let historyModal = false;
let lastFocus = null;
let stlPhrase = null;
let stlFullscreen = false;
let clock = null;
let onboardIndex = 0;

const $ = (id) => document.getElementById(id);

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}
function favs() { return readJson(FAV_KEY, {}); }
function cancelSpeech() {
  try { window.speechSynthesis?.cancel(); } catch { /* absent */ }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function button(className, text) {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}
function clear(node) { node.replaceChildren(); }
function rich(parent, html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const walk = (node, target) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) target.append(document.createTextNode(child.textContent));
      else if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === 'EM' || child.tagName === 'STRONG')) {
        const next = document.createElement(child.tagName.toLowerCase());
        walk(child, next);
        target.append(next);
      } else if (child.nodeType === Node.ELEMENT_NODE) walk(child, target);
    });
  };
  walk(doc.body, parent);
}
function playIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('play-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 5v14l11-7z');
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}
function scriptClass(country, text) {
  const script = scriptOf(text);
  if (script === 'latn' && country.latinScript) return 'native script-latn';
  return `native script-${script}`;
}

function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  const toggle = $('darkToggle');
  const dark = mode === 'dark';
  toggle.textContent = dark ? 'Light' : 'Dark';
  toggle.setAttribute('aria-pressed', String(dark));
  if (current) applyHero(current);
}
function initTheme() {
  const saved = localStorage.getItem(DARK_KEY);
  const mode = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(mode);
  if (!saved) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      if (!localStorage.getItem(DARK_KEY)) applyTheme(event.matches ? 'dark' : 'light');
    });
  }
  $('darkToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(DARK_KEY, next); } catch { /* ignore */ }
    applyTheme(next);
  });
}

function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const show = () => { $('updateBanner').hidden = false; };
      if (reg.waiting && navigator.serviceWorker.controller) show();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) show();
        });
      });
    }).catch(() => {});
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  $('updateReload').addEventListener('click', () => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.waiting?.postMessage('skip-waiting');
    });
  });
}

async function loadCountry(id) {
  if (countries.has(id)) return countries.get(id);
  const response = await fetch(`/data/${id}.json`);
  if (!response.ok) throw new Error(`Could not load ${id}`);
  const country = await response.json();
  countries.set(id, country);
  return country;
}

function buildHome() {
  const mount = $('countryMount');
  clear(mount);
  let region = '';
  let grid = null;
  catalog.forEach((entry) => {
    if (entry.region !== region) {
      region = entry.region;
      mount.append(el('h2', 'region-label', region));
      grid = el('div', 'country-grid');
      mount.append(grid);
    }
    const card = button('country-card');
    card.dataset.name = entry.name.toLowerCase();
    card.dataset.lang = entry.lang.toLowerCase();
    card.setAttribute('aria-pressed', String(tripSelected.has(entry.id)));
    const flag = el('span', 'flag', entry.flag);
    flag.setAttribute('aria-hidden', 'true');
    card.append(flag, el('span', 'cname', entry.name), el('span', 'clang', entry.lang));
    card.addEventListener('click', () => {
      if (tripSelecting) toggleTrip(entry.id, card);
      else selectCountry(entry.id);
    });
    grid.append(card);
  });
  renderRecents();
  renderContinue();
}

function renderRecents() {
  const ids = readJson(RECENTS_KEY, []).filter((id) => catalog.some((entry) => entry.id === id));
  const section = $('recentsSection');
  const row = $('recentsRow');
  clear(row);
  section.hidden = !ids.length;
  ids.forEach((id) => {
    const entry = catalog.find((item) => item.id === id);
    const chip = button('recent-chip', `${entry.flag} ${entry.name}`);
    chip.addEventListener('click', () => selectCountry(id));
    row.append(chip);
  });
}
function renderContinue() {
  const id = readJson(RECENTS_KEY, [])[0];
  const entry = catalog.find((item) => item.id === id);
  const aside = $('continueCard');
  clear(aside);
  if (!entry) { aside.hidden = true; return; }
  aside.hidden = false;
  aside.append(el('p', 'section-kicker', 'Continue'));
  aside.append(el('h2', null, entry.name));
  aside.append(el('p', null, entry.lang));
  const open = button(null, 'Open phrasebook');
  open.addEventListener('click', () => selectCountry(entry.id));
  aside.append(open);
}
function filterCountries() {
  const query = $('countrySearch').value.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll('.country-card').forEach((card) => {
    const match = !query || card.dataset.name.includes(query) || card.dataset.lang.includes(query);
    card.hidden = !match;
    if (match) visible += 1;
  });
  document.querySelectorAll('.region-label').forEach((label) => {
    let sibling = label.nextElementSibling;
    const any = sibling && [...sibling.querySelectorAll('.country-card')].some((card) => !card.hidden);
    label.hidden = !any;
    if (sibling) sibling.hidden = !any;
  });
  $('noResults').hidden = visible !== 0;
}

function applyHero(country) {
  const tint = country.hero || '#b83228';
  const r = Number.parseInt(tint.slice(1, 3), 16);
  const g = Number.parseInt(tint.slice(3, 5), 16);
  const b = Number.parseInt(tint.slice(5, 7), 16);
  const alpha = document.documentElement.dataset.theme === 'dark' ? 0.28 : 0.14;
  $('pbHeader').style.setProperty('--hero', `rgba(${r}, ${g}, ${b}, ${alpha})`);
}

let loadToken = 0;
async function selectCountry(id, options = {}) {
  const token = ++loadToken;
  let country;
  try { country = await loadCountry(id); } catch { return; }
  if (token !== loadToken) return;
  current = country;
  activeSection = 'greetings';
  showingSaved = false;
  cancelSpeech();
  if (tripSelecting) toggleTripMode(false);
  $('pbFlag').textContent = country.flag;
  clear($('pbTitle'));
  $('pbTitle').append(document.createTextNode(`${country.name} `), Object.assign(document.createElement('em'), { textContent: 'Phrasebook' }));
  $('pbSubtitle').textContent = `${country.lang}. Tap a phrase to hear it.`;
  applyHero(country);
  renderPronGuide(country);
  renderCategories();
  renderSection();
  renderInfo();
  setMode('phrases');
  $('phraseSearch').value = '';
  $('home').hidden = true;
  $('phrasebook').hidden = false;
  $('emergencyFab').hidden = false;
  document.title = `${country.name} Phrasebook — Travel Phrasebook`;
  const recents = readJson(RECENTS_KEY, []).filter((item) => item !== id);
  recents.unshift(id);
  writeJson(RECENTS_KEY, recents.slice(0, 5));
  if (options.history !== false && location.pathname !== `/${id}`) history.pushState({ country: id }, '', `/${id}`);
  window.scrollTo(0, 0);
  if (!window.speechSynthesis) {
    $('voiceBanner').hidden = false;
    $('voiceBanner').textContent = "This browser can't speak phrases. Read the pronunciation.";
  } else $('voiceBanner').hidden = true;
}

function showHome(options = {}) {
  cancelSpeech();
  clearInterval(clock);
  current = null;
  $('phrasebook').hidden = true;
  $('home').hidden = false;
  $('emergencyFab').hidden = true;
  document.title = 'Travel Phrasebook';
  renderRecents();
  renderContinue();
  if (options.history !== false && location.pathname !== '/') history.pushState({}, '', '/');
  window.scrollTo(0, 0);
}

function renderPronGuide(country) {
  const guide = $('pronGuide');
  if (!country.pronGuide) { guide.hidden = true; return; }
  guide.hidden = false;
  guide.open = false;
  $('pronGuideTitle').textContent = country.pronGuide.title;
  const tips = $('pronGuideTips');
  clear(tips);
  country.pronGuide.tips.forEach((tip) => tips.append(el('p', null, tip)));
}

function renderCategories() {
  const index = $('catIndex');
  clear(index);
  SECTIONS.forEach((section) => {
    const count = current.phrases[section]?.length || 0;
    const tab = button(null, '');
    tab.append(document.createTextNode(SECTION_LABELS[section]), el('span', 'count', ` ${count}`));
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(section === activeSection && !showingSaved));
    tab.addEventListener('click', () => {
      showingSaved = false;
      activeSection = section;
      renderCategories();
      renderSection();
    });
    index.append(tab);
  });
  const saved = Object.keys(favs()).some((key) => key.startsWith(`${current.id}:`));
  const savedBtn = $('savedBtn');
  savedBtn.hidden = !saved;
  savedBtn.setAttribute('aria-pressed', String(showingSaved));
}

function phraseCard(phrase, section) {
  const card = el('article', 'phrase-card');
  const main = el('div', 'phrase-main');
  const play = button('play-btn');
  play.append(playIcon());
  play.setAttribute('aria-label', `Play ${spokenText(phrase)}`);
  const hit = button('phrase-hit');
  hit.append(el('span', scriptClass(current, phrase.native), phrase.native));
  hit.append(el('span', 'pronunciation', phrase.pron));
  hit.append(el('span', 'english', phrase.en));
  const warn = el('span', 'voice-warn');
  warn.hidden = true;
  const status = el('span', 'play-status');
  hit.append(warn, status);
  main.append(play, hit);
  const actions = el('div', 'card-btns');
  const slow = button(null, 'Slower');
  slow.setAttribute('aria-pressed', 'false');
  const show = button(null, 'Show');
  const share = button(null, 'Share');
  const key = phraseKey(current.id, section, phrase);
  const save = button(null, favs()[key] ? 'Saved' : 'Save');
  save.setAttribute('aria-pressed', String(!!favs()[key]));
  actions.append(slow, show, share, save);
  card.append(main, actions);
  const playNow = () => speakPhrase(phrase, current, card);
  play.addEventListener('click', playNow);
  hit.addEventListener('click', playNow);
  slow.addEventListener('click', () => {
    const on = card.dataset.slow !== '1';
    card.dataset.slow = on ? '1' : '0';
    slow.setAttribute('aria-pressed', String(on));
    slow.textContent = on ? 'Normal speed' : 'Slower';
    if (card.classList.contains('speaking')) playNow();
  });
  show.addEventListener('click', () => openShow(phrase));
  share.addEventListener('click', () => sharePhrase(phrase, share));
  save.addEventListener('click', () => toggleFav(key, save));
  return card;
}

function renderSection() {
  $('searchResults').hidden = true;
  $('phraseBrowser').hidden = false;
  const list = $('phraseList');
  clear(list);
  const tip = $('sectionTip');
  clear(tip);
  if (showingSaved) {
    $('sectionTitle').textContent = 'Saved';
    let count = 0;
    SECTIONS.forEach((section) => {
      (current.phrases[section] || []).forEach((phrase) => {
        if (favs()[phraseKey(current.id, section, phrase)]) {
          list.append(phraseCard(phrase, section));
          count += 1;
        }
      });
    });
    tip.hidden = true;
    if (!count) list.append(el('p', 'empty', 'Save a phrase and it will stay on this phone.'));
    return;
  }
  $('sectionTitle').textContent = SECTION_LABELS[activeSection];
  (current.phrases[activeSection] || []).forEach((phrase) => list.append(phraseCard(phrase, activeSection)));
  if (current.tips?.[activeSection]) {
    tip.hidden = false;
    rich(tip, current.tips[activeSection]);
  } else tip.hidden = true;
}

function searchPhrases() {
  const query = $('phraseSearch').value.trim().toLowerCase();
  const results = $('searchResults');
  if (!query) {
    results.hidden = true;
    $('phraseBrowser').hidden = false;
    return;
  }
  $('phraseBrowser').hidden = true;
  results.hidden = false;
  clear(results);
  let total = 0;
  SECTIONS.forEach((section) => {
    const matches = (current.phrases[section] || []).filter((phrase) =>
      phrase.native.toLowerCase().includes(query) || phrase.pron.toLowerCase().includes(query) || phrase.en.toLowerCase().includes(query));
    if (!matches.length) return;
    results.append(el('h2', 'section-kicker', SECTION_LABELS[section]));
    const group = el('div', 'phrases');
    matches.forEach((phrase) => { group.append(phraseCard(phrase, section)); total += 1; });
    results.append(group);
  });
  if (!total) results.append(el('p', 'empty', 'No phrases match that search.'));
}

function toggleFav(key, buttonNode) {
  const all = favs();
  if (all[key]) delete all[key];
  else all[key] = true;
  writeJson(FAV_KEY, all);
  const on = !!all[key];
  buttonNode.textContent = on ? 'Saved' : 'Save';
  buttonNode.setAttribute('aria-pressed', String(on));
  renderCategories();
  if (showingSaved) renderSection();
}

async function sharePhrase(phrase, buttonNode) {
  const text = `${phrase.native}\n${phrase.en}\n— Travel Phrasebook`;
  try {
    if (navigator.share) await navigator.share({ text });
    else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      const previous = buttonNode.textContent;
      buttonNode.textContent = 'Copied';
      setTimeout(() => { buttonNode.textContent = previous; }, 1200);
    }
  } catch { /* dismissed */ }
}

function loadVoices() {
  if (!window.speechSynthesis) return Promise.resolve([]);
  const existing = speechSynthesis.getVoices();
  if (existing.length) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const finish = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
    window.setTimeout(finish, 800);
  });
}

async function speakPhrase(phrase, country, card) {
  const request = voiceRequest(country, phrase);
  const warn = card.querySelector('.voice-warn');
  const status = card.querySelector('.play-status');
  const fail = (label) => {
    card.classList.remove('speaking');
    if (status) status.textContent = '';
    const message = `No ${label} voice on this phone — read the pronunciation.`;
    if (warn) {
      warn.hidden = false;
      warn.textContent = message;
    }
    const banner = $('voiceBanner');
    if (banner) {
      banner.hidden = false;
      banner.textContent = message;
    }
  };
  if (!window.speechSynthesis || !request.lang) return fail(request.label);
  const voice = matchVoice(await loadVoices(), request.lang);
  if (!voice) return fail(request.label);
  if (warn) warn.hidden = true;
  const banner = $('voiceBanner');
  if (banner && window.speechSynthesis) banner.hidden = true;
  cancelSpeech();
  document.querySelectorAll('.phrase-card.speaking').forEach((node) => node.classList.remove('speaking'));
  const utter = new SpeechSynthesisUtterance(spokenText(phrase));
  utter.lang = voice.lang;
  utter.voice = voice;
  utter.rate = card.dataset.slow === '1' ? 0.65 : 0.85;
  card.classList.add('speaking');
  status.textContent = 'Playing';
  const done = () => { card.classList.remove('speaking'); status.textContent = ''; };
  utter.onend = done;
  utter.onerror = done;
  speechSynthesis.speak(utter);
}

function setMode(mode) {
  $('phrasesPanel').hidden = mode !== 'phrases';
  $('quizPanel').hidden = mode !== 'quiz';
  $('infoPanel').hidden = mode !== 'info';
  $('modePhrases').setAttribute('aria-selected', String(mode === 'phrases'));
  $('modeQuiz').setAttribute('aria-selected', String(mode === 'quiz'));
  $('modeInfo').setAttribute('aria-selected', String(mode === 'info'));
  if (mode !== 'phrases') cancelSpeech();
  if (mode === 'quiz') startQuiz($('quizAll').getAttribute('aria-pressed') === 'true' ? 'all' : 'category', true);
  if (mode === 'info') startClock();
  else clearInterval(clock);
}

function quizStorageKey() { return `tpb_quiz_${current.id}`; }
function startQuiz(scope, restore) {
  const saved = readJson(quizStorageKey(), null);
  if (restore && saved && saved.scope === scope && saved.queue?.length) {
    quiz = saved;
  } else {
    const sections = scope === 'all' ? SECTIONS : [activeSection];
    const queue = [];
    sections.forEach((section) => (current.phrases[section] || []).forEach((phrase) => queue.push({ ...phrase, section })));
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    quiz = { scope, queue, index: 0, learned: [], streak: 0 };
  }
  $('quizCategory').setAttribute('aria-pressed', String(scope === 'category'));
  $('quizAll').setAttribute('aria-pressed', String(scope === 'all'));
  $('quizDone').hidden = true;
  $('quizCard').hidden = false;
  showQuiz();
}
function showQuiz() {
  if (!quiz || quiz.index >= quiz.queue.length) {
    $('quizCard').hidden = true;
    $('quizActions').hidden = true;
    $('quizCounter').textContent = '';
    $('quizFill').style.width = '100%';
    $('quizDoneMsg').textContent = `You learned ${quiz?.learned.length || 0} phrases.`;
    $('quizDone').hidden = false;
    try { localStorage.removeItem(quizStorageKey()); } catch { /* ignore */ }
    return;
  }
  const phrase = quiz.queue[quiz.index];
  const card = $('quizCard');
  clear(card);
  const face = button('quiz-face');
  face.append(el('div', 'quiz-kicker', SECTION_LABELS[phrase.section] || phrase.section));
  if (!quiz.flipped) {
    face.append(el('div', 'quiz-line', phrase.en));
    face.append(el('div', 'english', 'Tap to reveal'));
  } else {
    face.append(el('div', `quiz-line ${scriptClass(current, phrase.native)}`, phrase.native));
    face.append(el('div', 'pronunciation', phrase.pron));
  }
  const warn = el('span', 'voice-warn');
  warn.hidden = true;
  face.append(warn, el('span', 'play-status'));
  face.addEventListener('click', () => {
    if (quiz.flipped) return;
    quiz.flipped = true;
    showQuiz();
    speakPhrase(phrase, current, $('quizCard'));
  });
  card.append(face);
  if (quiz.flipped) {
    const replay = button(null, 'Play answer');
    replay.addEventListener('click', () => speakPhrase(phrase, current, card));
    card.append(replay);
  }
  $('quizActions').hidden = !quiz.flipped;
  const total = quiz.queue.length;
  $('quizFill').style.width = `${Math.round((quiz.index / total) * 100)}%`;
  $('quizCounter').textContent = `${quiz.index + 1} of ${total}`;
  const streak = $('quizStreak');
  streak.hidden = !quiz.learned.length;
  streak.textContent = `${quiz.streak} in a row · ${quiz.learned.length} learned`;
  writeJson(quizStorageKey(), quiz);
}
function answerQuiz(got) {
  const phrase = quiz.queue[quiz.index];
  const key = phraseKey(current.id, phrase.section, phrase);
  if (got) {
    if (!quiz.learned.includes(key)) quiz.learned.push(key);
    quiz.streak += 1;
  } else {
    quiz.streak = 0;
    quiz.queue.push(phrase);
  }
  quiz.index += 1;
  quiz.flipped = false;
  showQuiz();
}

function renderInfo() {
  clearInterval(clock);
  const facts = $('facts');
  clear(facts);
  const list = el('dl', 'facts');
  (current.quickFacts || []).forEach((fact) => {
    if (fact.label === 'Emergency' || fact.label === 'Currency') return;
    const wrap = el('div');
    wrap.append(el('dt', null, fact.label), el('dd', null, fact.value));
    list.append(wrap);
  });
  if (current.currency) {
    const wrap = el('div');
    wrap.append(el('dt', null, 'Currency'));
    const dd = el('dd');
    dd.append(document.createTextNode(`${current.currency.code} (${current.currency.symbol}) `));
    const convert = button('text-link', 'Convert USD');
    convert.addEventListener('click', openCurrency);
    dd.append(convert);
    wrap.append(dd);
    list.append(wrap);
  }
  const emergency = el('div');
  emergency.append(el('dt', null, 'Emergency'));
  const numbers = el('dd');
  current.emergencyNumbers.forEach((number, index) => {
    if (index) numbers.append(document.createTextNode(', '));
    const link = el('a', null, number.tel);
    link.href = telHref(number.tel);
    link.append(document.createTextNode(` ${number.name}`));
    numbers.append(link);
  });
  emergency.append(numbers);
  list.append(emergency);
  const timeWrap = el('div');
  timeWrap.append(el('dt', null, 'Local time'), el('dd', null, '—'));
  timeWrap.lastElementChild.id = 'timeChip';
  list.append(timeWrap);
  facts.append(list);
  updateClock();

  const tabs = $('infoTabs');
  clear(tabs);
  INFO_TABS.forEach(([id, label], index) => {
    const tab = button(null, label);
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(index === 0));
    tab.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach((item) => item.setAttribute('aria-selected', 'false'));
      tab.setAttribute('aria-selected', 'true');
      renderInfoBody(id);
    });
    tabs.append(tab);
  });
  renderInfoBody('culture');
}
function renderInfoBody(id) {
  const body = $('infoBody');
  clear(body);
  const items = current[id] || [];
  if (id === 'apps') {
    const grid = el('div', 'apps-grid');
    items.forEach((app) => {
      const tile = el('article', 'app-tile');
      tile.append(el('p', 'section-kicker', app.cat), el('h3', null, app.name), el('p', null, app.desc));
      const links = el('div', 'store-links');
      [['App Store', app.ios], ['Google Play', app.android]].forEach(([label, href]) => {
        if (!String(href || '').startsWith('https://')) return;
        const link = el('a', null, label);
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        links.append(link);
      });
      tile.append(links);
      grid.append(tile);
    });
    body.append(grid);
    return;
  }
  items.forEach((item) => {
    const block = el('article', 'info-block');
    const title = item.rule || item.name;
    const note = item.note || [item.what, item.tip].filter(Boolean).join(' ');
    block.append(el('h3', null, title), el('p', null, note));
    body.append(block);
  });
}
function updateClock() {
  const chip = $('timeChip');
  if (!chip || !current?.timezone) return;
  try {
    chip.textContent = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: current.timezone }).format(new Date());
  } catch { chip.textContent = '—'; }
}
function startClock() {
  clearInterval(clock);
  updateClock();
  clock = setInterval(updateClock, 30000);
}

function focusables(root) {
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), summary')].filter((node) => !node.closest('[hidden]'));
}
function openModal(node) {
  lastFocus = document.activeElement;
  node.hidden = false;
  if (!historyModal) {
    history.pushState({ modal: true, country: current?.id || null }, '');
    historyModal = true;
  }
  focusables(node)[0]?.focus();
}
function hideModals() {
  ['emergencyModal', 'stlModal', 'currModal'].forEach((id) => { $(id).hidden = true; });
  leaveLandscape();
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}
function requestCloseModal() {
  if (historyModal) history.back();
  else hideModals();
}

function openEmergency() {
  if (!current) return;
  $('emFlag').textContent = current.flag;
  const numbers = $('emNumbers');
  clear(numbers);
  current.emergencyNumbers.forEach((number) => {
    const link = el('a', 'em-link');
    link.href = telHref(number.tel);
    link.append(el('span', null, number.name), el('strong', null, number.tel));
    numbers.append(link);
  });
  const phrases = $('emPhrases');
  clear(phrases);
  (current.phrases.emergency || []).slice(0, 5).forEach((phrase) => phrases.append(phraseCard(phrase, 'emergency')));
  openModal($('emergencyModal'));
}

function openShow(phrase) {
  stlPhrase = phrase;
  const native = $('stlNative');
  native.textContent = phrase.native;
  native.className = `stl-native ${scriptClass(current, phrase.native)}`;
  const extra = $('stlExtra');
  extra.hidden = true;
  extra.textContent = `${phrase.pron}. ${phrase.en}`;
  $('stlEnglish').setAttribute('aria-pressed', 'false');
  $('stlEnglish').textContent = 'Also show English';
  openModal($('stlModal'));
  tryLandscape();
}
async function tryLandscape() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
      stlFullscreen = true;
    }
  } catch { stlFullscreen = false; }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* not allowed */ }
}
async function leaveLandscape() {
  try { screen.orientation?.unlock?.(); } catch { /* ignore */ }
  try { if (stlFullscreen && document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignore */ }
  stlFullscreen = false;
}

function openCurrency() {
  if (!current?.currency) return;
  $('currTitle').textContent = `${current.currency.code} calculator`;
  $('currRate').textContent = `${current.currency.label}. Snapshot ${current.currency.asOf}, not a live rate.`;
  $('currLocalLabel').textContent = `${current.currency.code} ${current.currency.symbol}`;
  $('currUSD').value = '';
  $('currLocal').value = '';
  openModal($('currModal'));
}
function calcCurrency(source) {
  const rate = Number(current?.currency?.rate);
  if (!rate) return;
  const usd = $('currUSD');
  const local = $('currLocal');
  if (source === 'usd') {
    const value = Number.parseFloat(usd.value);
    local.value = Number.isNaN(value) ? '' : (value * rate).toFixed(rate >= 100 ? 0 : 2);
  } else {
    const value = Number.parseFloat(local.value);
    usd.value = Number.isNaN(value) ? '' : (value / rate).toFixed(2);
  }
}

function toggleTripMode(on) {
  tripSelecting = on;
  if (!on) tripSelected.clear();
  $('tripToggle').textContent = on ? 'Cancel trip planning' : 'Plan a multi-country trip';
  $('tripBar').hidden = !on;
  $('tripPlan').hidden = true;
  document.querySelectorAll('.country-card').forEach((card) => card.setAttribute('aria-pressed', 'false'));
  $('tripBarLabel').textContent = 'Select countries';
}
function toggleTrip(id, card) {
  if (tripSelected.has(id)) tripSelected.delete(id);
  else tripSelected.add(id);
  card.setAttribute('aria-pressed', String(tripSelected.has(id)));
  const count = tripSelected.size;
  $('tripBarLabel').textContent = count ? `${count} selected` : 'Select countries';
}
async function showTrip() {
  if (!tripSelected.size) return;
  const plan = $('tripPlan');
  clear(plan);
  plan.hidden = false;
  for (const id of tripSelected) {
    const country = await loadCountry(id);
    const entry = el('article', 'trip-entry');
    entry.append(el('h3', null, `${country.flag} ${country.name}`));
    const numbers = el('p');
    country.emergencyNumbers.forEach((number, index) => {
      if (index) numbers.append(document.createTextNode(' · '));
      const link = el('a', null, number.tel);
      link.href = telHref(number.tel);
      numbers.append(link, document.createTextNode(` ${number.name}`));
    });
    entry.append(numbers);
    if (country.currency) entry.append(el('p', null, `${country.currency.label}. Snapshot ${country.currency.asOf}.`));
    const apps = (country.apps || []).slice(0, 3).map((app) => app.name).join(', ');
    if (apps) entry.append(el('p', null, `Apps: ${apps}`));
    plan.append(entry);
  }
  plan.scrollIntoView({ block: 'nearest' });
  toggleTripMode(false);
}

function showOnboardSlide(index) {
  onboardIndex = index;
  $('obTitle').textContent = ONBOARD[index].title;
  $('obBody').textContent = ONBOARD[index].body;
  $('obNext').textContent = index < ONBOARD.length - 1 ? 'Next' : 'Get started';
}
function closeOnboard() {
  $('onboardModal').hidden = true;
  try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* ignore */ }
}

function idFromPath() {
  const slug = location.pathname.replace(/^\//, '');
  if (!slug || slug.includes('/')) return null;
  return catalog.some((entry) => entry.id === slug) ? slug : null;
}
function applyRoute() {
  const id = idFromPath();
  if (id) selectCountry(id, { history: false });
  else showHome({ history: false });
}

function initOnboarding() {
  if (localStorage.getItem(ONBOARD_KEY)) return;
  showOnboardSlide(0);
  $('onboardModal').hidden = false;
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!$('onboardModal').hidden) { closeOnboard(); return; }
    if (historyModal || !$('emergencyModal').hidden || !$('stlModal').hidden || !$('currModal').hidden) requestCloseModal();
    return;
  }
  if (event.key !== 'Tab') return;
  const open = ['emergencyModal', 'stlModal', 'currModal', 'onboardModal'].map($).find((node) => !node.hidden);
  if (!open) return;
  const nodes = focusables(open);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

$('backBtn').addEventListener('click', () => showHome());
$('modePhrases').addEventListener('click', () => setMode('phrases'));
$('modeQuiz').addEventListener('click', () => setMode('quiz'));
$('modeInfo').addEventListener('click', () => setMode('info'));
$('savedBtn').addEventListener('click', () => { showingSaved = true; renderCategories(); renderSection(); });
$('phraseSearch').addEventListener('input', searchPhrases);
$('countrySearch').addEventListener('input', filterCountries);
$('emergencyFab').addEventListener('click', openEmergency);
$('quizCategory').addEventListener('click', () => startQuiz('category', false));
$('quizAll').addEventListener('click', () => startQuiz('all', false));
$('quizAgain').addEventListener('click', () => answerQuiz(false));
$('quizGot').addEventListener('click', () => answerQuiz(true));
$('quizRestart').addEventListener('click', () => startQuiz(quiz?.scope || 'category', false));
$('stlPlay').addEventListener('click', () => {
  if (!stlPhrase) return;
  const fake = el('div', 'phrase-card');
  fake.append(el('span', 'voice-warn'), el('span', 'play-status'));
  speakPhrase(stlPhrase, current, fake);
});
$('stlEnglish').addEventListener('click', () => {
  const extra = $('stlExtra');
  const show = extra.hidden;
  extra.hidden = !show;
  $('stlEnglish').setAttribute('aria-pressed', String(show));
});
$('currUSD').addEventListener('input', () => calcCurrency('usd'));
$('currLocal').addEventListener('input', () => calcCurrency('local'));
$('currModal').addEventListener('click', (event) => { if (event.target === $('currModal')) requestCloseModal(); });
document.querySelectorAll('[data-close]').forEach((node) => node.addEventListener('click', requestCloseModal));
$('tripToggle').addEventListener('click', () => toggleTripMode(!tripSelecting));
$('tripView').addEventListener('click', showTrip);
$('obNext').addEventListener('click', () => {
  if (onboardIndex < ONBOARD.length - 1) showOnboardSlide(onboardIndex + 1);
  else closeOnboard();
});
$('obSkip').addEventListener('click', closeOnboard);
window.addEventListener('popstate', () => {
  if (historyModal) {
    historyModal = false;
    hideModals();
    return;
  }
  applyRoute();
});

initTheme();
registerWorker();
initOnboarding();
fetch('/data/index.json').then((response) => response.json()).then((data) => {
  catalog = data.countries;
  buildHome();
  applyRoute();
}).catch(() => {
  $('countryMount').append(el('p', 'empty', 'Phrase data could not be loaded.'));
});
