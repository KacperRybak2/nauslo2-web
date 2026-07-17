'use strict';

const STORAGE_KEY = 'nauslo-data-v1';
const ACTIVE_KEY = 'nauslo-active-session-v1';
const RESULT_KEY = 'nauslo-last-result-v1';
const APP_VERSION = 1;

const app = document.getElementById('app');
const toastElement = document.getElementById('toast');
const fileInput = document.getElementById('file-input');

let state = loadState();
let toastTimer = null;

function updateToastViewportPosition() {
  const viewport = window.visualViewport;
  const offsetTop = viewport ? viewport.offsetTop : 0;

  // Na iOS klawiatura jest warstwą systemową i zawsze zasłania treść strony.
  // Ustawiamy toast względem górnej krawędzi aktualnie widocznego obszaru,
  // także gdy Safari przesunie visual viewport po otwarciu klawiatury.
  document.documentElement.style.setProperty(
    '--toast-viewport-top',
    `${Math.max(10, Math.round(offsetTop) + 10)}px`
  );
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', updateToastViewportPosition);
  window.visualViewport.addEventListener('scroll', updateToastViewportPosition);
}
window.addEventListener('resize', updateToastViewportPosition);
window.addEventListener('orientationchange', updateToastViewportPosition);
document.addEventListener('focusin', () => requestAnimationFrame(updateToastViewportPosition));
document.addEventListener('focusout', () => requestAnimationFrame(updateToastViewportPosition));
updateToastViewportPosition();

function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultState() {
  return {
    version: APP_VERSION,
    sets: [],
    stage: 0,
    strategy: [0, 1, 2, 4],
    settings: { ignoreCase: false }
  };
}

function normalizeState(value) {
  const fallback = defaultState();
  if (!value || typeof value !== 'object') return fallback;

  const sets = Array.isArray(value.sets) ? value.sets.map((set, setIndex) => ({
    id: typeof set.id === 'string' ? set.id : uid(`set${setIndex}`),
    name: typeof set.name === 'string' && set.name.trim() ? set.name.trim() : `Zestaw ${setIndex + 1}`,
    words: Array.isArray(set.words) ? set.words.map((word, wordIndex) => ({
      id: typeof word.id === 'string' ? word.id : uid(`word${wordIndex}`),
      pl: String(word.pl ?? word.PL ?? '').trim(),
      en: String(word.en ?? word.ENG ?? '').trim()
    })).filter(word => word.pl || word.en) : []
  })) : [];

  const strategy = Array.isArray(value.strategy)
    ? [...new Set(value.strategy.map(Number).filter(number => Number.isInteger(number) && number >= 0))]
    : fallback.strategy;

  return {
    version: APP_VERSION,
    sets,
    stage: Math.max(0, Number.isInteger(Number(value.stage)) ? Number(value.stage) : 0),
    strategy: strategy.length ? strategy : fallback.strategy,
    settings: { ignoreCase: Boolean(value.settings?.ignoreCase) }
  };
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (error) {
    console.warn('Nie udało się odczytać danych.', error);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_KEY));
    return parsed && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(ACTIVE_KEY);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function shuffle(array) {
  const result = [...array];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function allWords() {
  return state.sets.flatMap((set, setIndex) => set.words.map((word, wordIndex) => ({
    id: `${set.id}:${word.id}`,
    setId: set.id,
    setName: set.name,
    setIndex,
    wordIndex,
    pl: word.pl,
    en: word.en
  }))).filter(word => word.pl && word.en);
}

function getSet(setId) {
  return state.sets.find(set => set.id === setId);
}

function getWord(setId, wordId) {
  return getSet(setId)?.words.find(word => word.id === wordId);
}

function navigate(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (location.hash === `#${normalized}`) render();
  else location.hash = normalized;
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw ? raw.split('/').map(decodeURIComponent) : ['home'];
  return { name: parts[0] || 'home', params: parts.slice(1) };
}

function topbar(title, backPath = '/home', right = '') {
  return `
    <header class="topbar">
      <button class="icon-btn" data-action="go" data-route="${escapeHtml(backPath)}" aria-label="Wróć">←</button>
      <h1>${escapeHtml(title)}</h1>
      <div class="spacer"></div>
      ${right}
    </header>`;
}

function shell(content) {
  return `<main class="shell">${content}</main>`;
}

function showToast(message, type = '') {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.className = `toast show ${type}`.trim();
  toastTimer = setTimeout(() => {
    toastElement.className = 'toast';
  }, 1900);
}

function formatMode(mode) {
  return {
    stage: 'Nauka etapami',
    randomSets: 'Losowe 4 zestawy',
    randomWords40: 'Losowe 40 słówek',
    adaptive30: 'Sesja adaptacyjna',
    allRandom: 'Wszystko losowo'
  }[mode] || 'Nauka';
}

function homeView() {
  const wordCount = allWords().length;
  const active = loadSession();
  const currentSet = state.sets[state.stage];
  const hasWords = wordCount > 0;

  return shell(`
    <header class="topbar">
      <a class="brand" href="#/home" aria-label="NauSlo — strona główna">
        <span class="brand-mark">NS</span>
        <h1>NauSlo</h1>
      </a>
      <div class="spacer"></div>
      <button class="icon-btn" data-action="go" data-route="/data" aria-label="Dane i kopie zapasowe">⋯</button>
    </header>

    <section class="hero">
      <h2>Ucz się słówek bez rozpraszaczy.</h2>
      <p>${currentSet ? `Aktualny etap: ${state.stage + 1}, zestaw „${escapeHtml(currentSet.name)}”.` : state.sets.length ? 'Wszystkie podstawowe etapy są ukończone.' : 'Dodaj pierwszy zestaw albo zaimportuj słówka z Androida.'}</p>
      <div class="hero-actions">
        ${active ? `<button class="btn btn-light" data-action="continue-session">Wznów: ${escapeHtml(formatMode(active.mode))}</button>` : ''}
        <button class="btn btn-primary" data-action="start-mode" data-mode="stage" ${!hasWords ? 'disabled' : ''}>Start etapu</button>
      </div>
    </section>

    <section class="grid stats" aria-label="Statystyki">
      <div class="stat"><strong>${state.sets.length}</strong><span>Zestawy</span></div>
      <div class="stat"><strong>${wordCount}</strong><span>Słówka</span></div>
      <div class="stat"><strong>${state.stage + 1}</strong><span>Numer etapu</span></div>
      <div class="stat"><strong>${state.strategy.join(', ')}</strong><span>Powtórki etapów</span></div>
    </section>

    <h2 class="section-title">Zarządzanie</h2>
    <section class="card-list">
      ${actionCard('▤', 'Zestawy i słówka', 'Dodawaj, poprawiaj i usuwaj własne słówka.', '/sets')}
      ${actionCard('↻', 'Sposób nauki', 'Ustal, które wcześniejsze zestawy wracają w aktualnym etapie.', '/strategy')}
      ${actionCard('⇅', 'Import i eksport', 'Przenieś dane z Androida lub utwórz kopię zapasową.', '/data')}
    </section>

    <h2 class="section-title">Tryby nauki</h2>
    <section class="card-list">
      ${modeCard('▦', 'Losowe 4 zestawy', 'Każde słówko trzeba podać poprawnie 3 razy.', 'randomSets', hasWords)}
      ${modeCard('40', 'Losowe 40 słówek', 'Losowa próbka ze wszystkich zestawów, po 3 poprawne odpowiedzi.', 'randomWords40', hasWords)}
      ${modeCard('↯', 'Sesja adaptacyjna', '30 słówek w obiegu; łatwe szybko wypadają, błędne wracają.', 'adaptive30', hasWords)}
      ${modeCard('∞', 'Wszystko losowo', 'Niekończąca się nauka ze wszystkich słówek.', 'allRandom', hasWords)}
    </section>

    <p class="footer-note">Dane są zapisywane lokalnie w tej przeglądarce. Regularnie eksportuj kopię JSON.</p>
  `);
}

function actionCard(icon, title, description, route) {
  return `<button class="card action-card" data-action="go" data-route="${route}">
    <span class="card-icon">${icon}</span>
    <span class="card-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></span>
    <span class="chevron">›</span>
  </button>`;
}

function modeCard(icon, title, description, mode, enabled) {
  return `<button class="card action-card" data-action="start-mode" data-mode="${mode}" ${enabled ? '' : 'disabled'}>
    <span class="card-icon">${icon}</span>
    <span class="card-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></span>
    <span class="chevron">›</span>
  </button>`;
}

function setsView() {
  const rows = state.sets.map((set, index) => `
    <div class="list-row">
      <div class="list-main" data-action="open-set" data-set-id="${escapeHtml(set.id)}" role="button" tabindex="0">
        <strong>${index + 1}. ${escapeHtml(set.name)}</strong>
        <span>${set.words.length} ${plural(set.words.length, 'słówko', 'słówka', 'słówek')}</span>
      </div>
      <div class="row-actions">
        <button class="mini-btn" data-action="rename-set" data-set-id="${escapeHtml(set.id)}" aria-label="Zmień nazwę">✎</button>
        <button class="mini-btn" data-action="delete-set" data-set-id="${escapeHtml(set.id)}" aria-label="Usuń">⌫</button>
      </div>
    </div>`).join('');

  return shell(`
    ${topbar('Zestawy')}
    <form class="form-card" data-form="add-set">
      <div class="form-row two">
        <label>Nazwa nowego zestawu
          <input name="name" maxlength="80" autocomplete="off" placeholder="np. Zestaw 1" required>
        </label>
        <button class="btn btn-primary" type="submit">Dodaj zestaw</button>
      </div>
    </form>
    ${rows || `<div class="empty"><strong>Brak zestawów</strong>Dodaj zestaw powyżej lub przejdź do importu danych.</div>`}
  `);
}

function setView(setId) {
  const set = getSet(setId);
  if (!set) return notFoundView('Nie znaleziono zestawu.', '/sets');

  const rows = set.words.map((word, index) => `
    <div class="list-row">
      <div class="list-main word-pair" data-action="edit-word" data-set-id="${escapeHtml(set.id)}" data-word-id="${escapeHtml(word.id)}" role="button" tabindex="0">
        <div class="word-cell"><small>Polski</small><span>${escapeHtml(word.pl)}</span></div>
        <div class="word-cell"><small>Angielski</small><span>${escapeHtml(word.en)}</span></div>
      </div>
      <span class="chevron">›</span>
    </div>`).join('');

  return shell(`
    ${topbar(set.name, '/sets')}
    <form class="form-card" data-form="add-word" data-set-id="${escapeHtml(set.id)}">
      <div class="form-row two">
        <label>Polski
          <input name="pl" maxlength="180" autocomplete="off" autocapitalize="sentences" required>
        </label>
        <label>Angielski
          <input name="en" maxlength="180" autocomplete="off" autocapitalize="none" required>
        </label>
      </div>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:10px">Dodaj słówko</button>
    </form>
    <p class="helper">${set.words.length} ${plural(set.words.length, 'słówko', 'słówka', 'słówek')} w zestawie.</p>
    ${rows || `<div class="empty"><strong>Zestaw jest pusty</strong>Dodaj pierwszą parę słów powyżej.</div>`}
  `);
}

function wordView(setId, wordId) {
  const set = getSet(setId);
  const word = getWord(setId, wordId);
  if (!set || !word) return notFoundView('Nie znaleziono słówka.', `/set/${encodeURIComponent(setId)}`);

  return shell(`
    ${topbar('Edytuj słówko', `/set/${encodeURIComponent(setId)}`)}
    <form class="form-card" data-form="edit-word" data-set-id="${escapeHtml(set.id)}" data-word-id="${escapeHtml(word.id)}">
      <div class="form-row">
        <label>Polski
          <input name="pl" value="${escapeHtml(word.pl)}" maxlength="180" autocomplete="off" required>
        </label>
        <label>Angielski
          <input name="en" value="${escapeHtml(word.en)}" maxlength="180" autocomplete="off" autocapitalize="none" required>
        </label>
        <button class="btn btn-primary btn-block" type="submit">Zapisz zmiany</button>
        <button class="btn btn-danger btn-block" type="button" data-action="delete-word" data-set-id="${escapeHtml(set.id)}" data-word-id="${escapeHtml(word.id)}">Usuń słówko</button>
      </div>
    </form>
  `);
}

function strategyView() {
  const current = state.sets[state.stage];
  const selected = state.strategy
    .map(offset => ({ offset, index: state.stage - offset }))
    .filter(item => item.index >= 0 && item.index < state.sets.length)
    .map(item => state.sets[item.index]?.name)
    .filter(Boolean);

  return shell(`
    ${topbar('Sposób nauki')}
    <section class="form-card">
      <h2 style="margin-top:0">Powtórki etapów</h2>
      <p class="helper">Wpisz przesunięcia względem aktualnego etapu. <strong>0</strong> oznacza bieżący zestaw, <strong>1</strong> poprzedni, a <strong>4</strong> zestaw sprzed czterech etapów.</p>
      <form data-form="strategy">
        <label>Przesunięcia
          <input name="strategy" inputmode="numeric" value="${escapeHtml(state.strategy.join(' '))}" placeholder="0 1 2 4" required>
        </label>
        <div class="strategy-chips" aria-label="Gotowe ustawienia">
          <button class="btn btn-ghost" type="button" data-action="strategy-preset" data-value="0">Tylko nowy</button>
          <button class="btn btn-ghost" type="button" data-action="strategy-preset" data-value="0 1 2 4">Jak w aplikacji</button>
          <button class="btn btn-ghost" type="button" data-action="strategy-preset" data-value="0 1 2 3 4 5">Ostatnie 6</button>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Zapisz sposób nauki</button>
      </form>
    </section>

    <section class="card">
      <strong>Aktualny etap: ${state.stage + 1}${current ? ` — ${escapeHtml(current.name)}` : ''}</strong>
      <p class="helper">Przy obecnych ustawieniach do sesji trafią: ${selected.length ? selected.map(escapeHtml).join(', ') : 'żadne zestawy'}.</p>
      <button class="btn btn-danger" data-action="reset-stage">Wyzeruj etap</button>
    </section>
  `);
}

function dataView() {
  return shell(`
    ${topbar('Import i eksport')}
    <section class="card-list">
      <div class="card">
        <strong>Kopia zapasowa JSON</strong>
        <p class="helper">Zachowuje zestawy, podział na zestawy, etap i sposób nauki. To najlepszy format do przenoszenia danych między przeglądarkami.</p>
        <button class="btn btn-primary btn-block" data-action="export-json">Eksportuj kopię JSON</button>
      </div>
      <div class="card">
        <strong>Eksport tekstowy</strong>
        <p class="helper">Format zgodny z eksportem starej aplikacji: polskie i angielskie słowo w kolejnych liniach. Nie zachowuje granic zestawów.</p>
        <button class="btn btn-ghost btn-block" data-action="export-txt">Eksportuj TXT</button>
      </div>
      <div class="card">
        <strong>Import danych</strong>
        <p class="helper">Obsługuje kopię JSON z tej wersji oraz TXT wyeksportowany z Androida. Pary z TXT zostaną dodane jako jeden nowy zestaw.</p>
        <button class="btn btn-secondary btn-block" data-action="import-data">Wybierz plik JSON lub TXT</button>
      </div>
      <div class="card">
        <strong>Ustawienia sprawdzania</strong>
        <label style="display:flex;grid-template-columns:auto 1fr;align-items:center;gap:10px;margin-top:12px">
          <input id="ignore-case" type="checkbox" style="width:22px;min-height:22px" ${state.settings.ignoreCase ? 'checked' : ''}>
          Ignoruj wielkość liter przy sprawdzaniu
        </label>
      </div>
      <div class="card">
        <strong>Usuń wszystkie dane</strong>
        <p class="helper">Operacji nie można cofnąć. Najpierw pobierz kopię JSON.</p>
        <button class="btn btn-danger btn-block" data-action="reset-data">Usuń dane aplikacji</button>
      </div>
    </section>
  `);
}

function studyView() {
  const session = loadSession();
  if (!session || !session.items.length) {
    setTimeout(() => navigate('/home'), 0);
    return shell(`<div class="empty"><strong>Brak aktywnej sesji</strong>Wybierz tryb nauki na stronie głównej.</div>`);
  }

  if (isSessionComplete(session)) {
    finishSession(session);
    return shell(`<div class="empty"><strong>Sesja ukończona</strong>Otwieranie podsumowania…</div>`);
  }
  if (!ensureCurrentQuestion(session)) {
    finishSession(session);
    return shell(`<div class="empty"><strong>Sesja ukończona</strong>Otwieranie podsumowania…</div>`);
  }
  const item = session.items[session.currentIndex];
  saveSession(session);

  let progress = 0;
  let counter = '';
  if (session.mode === 'allRandom') {
    counter = `${session.correctTotal} poprawnych`;
  } else if (session.mode === 'adaptive30') {
    progress = session.totalWords ? (session.completedWords / session.totalWords) * 100 : 0;
    counter = `${session.completedWords}/${session.totalWords} słówek`;
  } else {
    progress = session.targetTotal ? (session.correctTotal / session.targetTotal) * 100 : 0;
    counter = `${session.correctTotal}/${session.targetTotal}`;
  }

  return shell(`
    <section class="study-shell">
      <header class="study-header">
        <button class="icon-btn" data-action="go" data-route="/home" aria-label="Wróć do menu">←</button>
        <div class="study-meta">
          <strong>${escapeHtml(session.title)}</strong>
          <span>${escapeHtml(counter)} · ${session.attempts} prób</span>
        </div>
        <button class="icon-btn" data-action="end-session" aria-label="Zakończ sesję">×</button>
      </header>
      ${session.mode === 'allRandom' ? '' : `<div class="progress-track"><div class="progress-bar" style="width:${Math.min(100, Math.max(0, progress)).toFixed(1)}%"></div></div>`}
      <div class="study-card">
        <span class="study-label">Przetłumacz na angielski</span>
        <strong class="study-word">${escapeHtml(item.pl)}</strong>
        <input id="answer-input" class="answer-input" type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Wpisz odpowiedź">
        <div class="study-actions">
          <button class="btn btn-ghost" data-action="hint">Podpowiedź</button>
          <button class="btn btn-ghost" data-action="examples">Przykłady</button>
          <button class="btn btn-primary primary-wide" data-action="check-answer">Sprawdź</button>
        </div>
      </div>
      <div class="study-footer">Wciśnij Enter, aby sprawdzić odpowiedź.</div>
    </section>
  `);
}

function completeView() {
  let result = null;
  try { result = JSON.parse(sessionStorage.getItem(RESULT_KEY)); } catch { /* ignored */ }
  if (!result) return notFoundView('Brak podsumowania sesji.', '/home');

  const accuracy = result.attempts ? Math.round((result.correctTotal / result.attempts) * 100) : 0;
  return shell(`
    ${topbar('Podsumowanie')}
    <section class="complete">
      <div class="complete-icon">✓</div>
      <h2>${escapeHtml(result.title)} ukończona</h2>
      <p>${result.mode === 'stage' ? `Przechodzisz do etapu ${state.stage + 1}.` : 'Sesja została zakończona.'}</p>
      <div class="complete-stats">
        <div class="stat"><strong>${result.correctTotal}</strong><span>Poprawne</span></div>
        <div class="stat"><strong>${result.wrongTotal}</strong><span>Błędne</span></div>
        <div class="stat"><strong>${accuracy}%</strong><span>Skuteczność</span></div>
        <div class="stat"><strong>${formatDuration(result.durationMs)}</strong><span>Czas</span></div>
      </div>
      <button class="btn btn-primary btn-block" data-action="go" data-route="/home">Wróć do menu</button>
    </section>
  `);
}

function notFoundView(message, backPath) {
  return shell(`
    ${topbar('Błąd', backPath)}
    <div class="empty"><strong>${escapeHtml(message)}</strong>Wróć do poprzedniego ekranu.</div>
  `);
}

function render() {
  const route = parseRoute();
  if (route.name === 'home') app.innerHTML = homeView();
  else if (route.name === 'sets') app.innerHTML = setsView();
  else if (route.name === 'set') app.innerHTML = setView(route.params[0]);
  else if (route.name === 'word') app.innerHTML = wordView(route.params[0], route.params[1]);
  else if (route.name === 'strategy') app.innerHTML = strategyView();
  else if (route.name === 'data') app.innerHTML = dataView();
  else if (route.name === 'study') app.innerHTML = studyView();
  else if (route.name === 'complete') app.innerHTML = completeView();
  else app.innerHTML = notFoundView('Nie znaleziono strony.', '/home');

  if (route.name === 'study') {
    requestAnimationFrame(() => document.getElementById('answer-input')?.focus());
  }
}

function plural(number, one, few, many) {
  if (number === 1) return one;
  if (number % 10 >= 2 && number % 10 <= 4 && !(number % 100 >= 12 && number % 100 <= 14)) return few;
  return many;
}

function parseStrategy(value) {
  return [...new Set(String(value).match(/\d+/g)?.map(Number) ?? [])]
    .filter(number => Number.isInteger(number) && number >= 0)
    .sort((a, b) => a - b);
}

function startSession(mode) {
  const words = allWords();
  if (!words.length) {
    showToast('Najpierw dodaj słówka.', 'error');
    return;
  }

  let selected = [];
  let remaining = [];

  if (mode === 'stage') {
    if (state.stage >= state.sets.length) {
      showToast('Wszystkie etapy są ukończone. Możesz wyzerować etap w ustawieniach.', 'error');
      return;
    }
    const indices = [...new Set(state.strategy.map(offset => state.stage - offset))]
      .filter(index => index >= 0 && index < state.sets.length);
    selected = indices.flatMap(index => state.sets[index].words.map(word => ({
      id: `${state.sets[index].id}:${word.id}`,
      setName: state.sets[index].name,
      pl: word.pl,
      en: word.en
    }))).filter(word => word.pl && word.en);
  } else if (mode === 'randomSets') {
    const nonEmptySets = state.sets.filter(set => set.words.some(word => word.pl && word.en));
    const chosenSets = shuffle(nonEmptySets).slice(0, Math.min(4, nonEmptySets.length));
    selected = chosenSets.flatMap(set => set.words.map(word => ({
      id: `${set.id}:${word.id}`,
      setName: set.name,
      pl: word.pl,
      en: word.en
    }))).filter(word => word.pl && word.en);
  } else if (mode === 'randomWords40') {
    selected = shuffle(words).slice(0, Math.min(40, words.length));
  } else if (mode === 'adaptive30') {
    const shuffled = shuffle(words);
    selected = shuffled.slice(0, Math.min(30, shuffled.length));
    remaining = shuffled.slice(selected.length);
  } else if (mode === 'allRandom') {
    selected = words;
  }

  if (!selected.length) {
    showToast('Wybrany tryb nie ma żadnych słówek.', 'error');
    return;
  }

  const items = selected.map(word => ({
    id: word.id || uid('session-word'),
    pl: word.pl,
    en: word.en,
    correct: 0,
    wrong: 0,
    complete: false
  }));

  const session = {
    version: 1,
    id: uid('session'),
    mode,
    title: formatMode(mode),
    stageAtStart: state.stage,
    items,
    remaining: remaining.map(word => ({ id: word.id, pl: word.pl, en: word.en })),
    queue: [],
    currentIndex: -1,
    correctTotal: 0,
    wrongTotal: 0,
    attempts: 0,
    completedWords: 0,
    totalWords: mode === 'adaptive30' ? words.length : items.length,
    targetTotal: ['stage', 'randomSets', 'randomWords40'].includes(mode) ? items.length * 3 : null,
    hintLength: 0,
    startedAt: Date.now()
  };

  selectNext(session);
  saveSession(session);
  navigate('/study');
}

function ensureCurrentQuestion(session) {
  if (!Number.isInteger(session.currentIndex) || !session.items[session.currentIndex]) {
    return selectNext(session);
  }
  return true;
}

function selectNext(session) {
  session.hintLength = 0;
  let available;

  if (session.mode === 'allRandom') {
    available = session.items.map((_, index) => index);
  } else {
    available = session.items.map((item, index) => item.complete ? null : index).filter(index => index !== null);
  }

  if (!available.length) return false;

  session.queue = Array.isArray(session.queue)
    ? session.queue.filter(index => available.includes(index))
    : [];

  if (!session.queue.length) session.queue = shuffle(available);
  session.currentIndex = session.queue.shift();
  return true;
}

function answersMatch(expected, actual) {
  const left = String(expected).trim();
  const right = String(actual).trim();
  return state.settings.ignoreCase
    ? left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
    : left === right;
}

function checkAnswer() {
  const session = loadSession();
  const input = document.getElementById('answer-input');
  if (!session || !input) return;

  const item = session.items[session.currentIndex];
  const actual = input.value;
  if (!actual.trim()) {
    showToast('Wpisz odpowiedź.', 'error');
    input.focus();
    return;
  }

  session.attempts += 1;
  const correct = answersMatch(item.en, actual);

  if (correct) {
    session.correctTotal += 1;

    if (session.mode === 'adaptive30') {
      if (item.wrong === 0) {
        item.complete = true;
      } else {
        item.correct += 1;
        item.complete = item.correct >= 3;
      }

      if (item.complete) {
        session.completedWords += 1;
        if (session.remaining.length) {
          const replacement = session.remaining.shift();
          session.items[session.currentIndex] = {
            id: replacement.id,
            pl: replacement.pl,
            en: replacement.en,
            correct: 0,
            wrong: 0,
            complete: false
          };
        }
      }
    } else if (session.mode !== 'allRandom') {
      item.correct += 1;
      if (item.correct >= 3 && !item.complete) {
        item.complete = true;
        session.completedWords += 1;
      }
    }
  } else {
    item.wrong += 1;
    session.wrongTotal += 1;
  }

  const answerForToast = item.en;
  if (isSessionComplete(session)) {
    finishSession(session);
    showToast(correct ? 'Dobrze! Etap ukończony.' : `Źle: ${answerForToast}`, correct ? 'success' : 'error');
    return;
  }

  selectNext(session);
  saveSession(session);
  render();
  showToast(correct ? 'Dobrze!' : `Źle! Poprawnie: ${answerForToast}`, correct ? 'success' : 'error');
}

function isSessionComplete(session) {
  if (session.mode === 'allRandom') return false;
  if (session.mode === 'adaptive30') {
    return session.remaining.length === 0 && session.items.every(item => item.complete);
  }
  return session.items.every(item => item.complete);
}

function finishSession(session) {
  if (session.mode === 'stage' && state.stage === session.stageAtStart) {
    state.stage += 1;
    saveState();
  }

  const result = {
    mode: session.mode,
    title: session.title,
    correctTotal: session.correctTotal,
    wrongTotal: session.wrongTotal,
    attempts: session.attempts,
    durationMs: Math.max(0, Date.now() - session.startedAt)
  };
  sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
  clearSession();
  navigate('/complete');
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function giveHint() {
  const session = loadSession();
  const input = document.getElementById('answer-input');
  if (!session || !input) return;
  const answer = session.items[session.currentIndex].en;
  session.hintLength = Math.min(answer.length, (session.hintLength || 0) + 1);
  input.value = answer.slice(0, session.hintLength);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  saveSession(session);
}

function openExamples() {
  const session = loadSession();
  if (!session) return;
  const answer = session.items[session.currentIndex]?.en;
  if (!answer) return;
  const url = `https://context.reverso.net/t%C5%82umaczenie/angielski-polski/${encodeURIComponent(answer.trim())}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStamp() {
  const date = new Date();
  return date.toISOString().slice(0, 19).replaceAll(':', '-');
}

function exportJson() {
  const backup = {
    app: 'NauSlo Web',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: state
  };
  downloadFile(`NauSlo-kopia-${dateStamp()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  showToast('Pobrano kopię JSON.', 'success');
}

function exportTxt() {
  const lines = [];
  for (const set of state.sets) {
    for (const word of set.words) {
      lines.push(word.pl, word.en);
    }
  }
  downloadFile(`NauSlo-eksport-${dateStamp()}.txt`, `${lines.join('\n')}${lines.length ? '\n' : ''}`, 'text/plain;charset=utf-8');
  showToast('Pobrano eksport TXT.', 'success');
}

async function importFile(file) {
  const text = await file.text();
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.json') || text.trim().startsWith('{')) {
    const parsed = JSON.parse(text);
    const imported = normalizeState(parsed.data ?? parsed);
    const confirmed = confirm(`Import zastąpi obecne dane. W pliku znaleziono ${imported.sets.length} zestawów. Kontynuować?`);
    if (!confirmed) return;
    state = imported;
    clearSession();
    saveState();
    navigate('/home');
    showToast('Zaimportowano kopię JSON.', 'success');
    return;
  }

  const normalized = text.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const lines = normalized.split('\n');
  while (lines.length && lines.at(-1) === '') lines.pop();
  if (lines.length < 2) throw new Error('Plik TXT nie zawiera par słówek.');

  if (lines.length % 2 !== 0) {
    const proceed = confirm('Plik ma nieparzystą liczbę linii. Ostatnia linia zostanie pominięta. Kontynuować?');
    if (!proceed) return;
    lines.pop();
  }

  const suggestedName = `Import Android ${new Date().toLocaleDateString('pl-PL')}`;
  const name = prompt('Nazwa zestawu dla importowanych słówek:', suggestedName)?.trim();
  if (!name) return;

  const words = [];
  for (let index = 0; index < lines.length; index += 2) {
    const pl = lines[index].trim();
    const en = lines[index + 1].trim();
    if (pl || en) words.push({ id: uid('word'), pl, en });
  }

  state.sets.push({ id: uid('set'), name, words });
  saveState();
  navigate('/sets');
  showToast(`Zaimportowano ${words.length} par.`, 'success');
}

function handleClick(event) {
  const element = event.target.closest('[data-action]');
  if (!element) return;
  const action = element.dataset.action;

  if (action === 'go') navigate(element.dataset.route);
  else if (action === 'open-set') navigate(`/set/${encodeURIComponent(element.dataset.setId)}`);
  else if (action === 'edit-word') navigate(`/word/${encodeURIComponent(element.dataset.setId)}/${encodeURIComponent(element.dataset.wordId)}`);
  else if (action === 'start-mode') startSession(element.dataset.mode);
  else if (action === 'continue-session') navigate('/study');
  else if (action === 'rename-set') renameSet(element.dataset.setId);
  else if (action === 'delete-set') deleteSet(element.dataset.setId);
  else if (action === 'delete-word') deleteWord(element.dataset.setId, element.dataset.wordId);
  else if (action === 'strategy-preset') {
    const input = document.querySelector('input[name="strategy"]');
    if (input) input.value = element.dataset.value;
  }
  else if (action === 'reset-stage') resetStage();
  else if (action === 'export-json') exportJson();
  else if (action === 'export-txt') exportTxt();
  else if (action === 'import-data') fileInput.click();
  else if (action === 'reset-data') resetData();
  else if (action === 'check-answer') checkAnswer();
  else if (action === 'hint') giveHint();
  else if (action === 'examples') openExamples();
  else if (action === 'end-session') endSession();
}

function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);

  if (form.dataset.form === 'add-set') {
    const name = String(data.get('name') || '').trim();
    if (!name) return;
    state.sets.push({ id: uid('set'), name, words: [] });
    saveState();
    render();
    showToast('Dodano zestaw.', 'success');
  }

  if (form.dataset.form === 'add-word') {
    const set = getSet(form.dataset.setId);
    const pl = String(data.get('pl') || '').trim();
    const en = String(data.get('en') || '').trim();
    if (!set || !pl || !en) return;
    set.words.push({ id: uid('word'), pl, en });
    saveState();
    render();
    requestAnimationFrame(() => document.querySelector('input[name="pl"]')?.focus());
    showToast('Dodano słówko.', 'success');
  }

  if (form.dataset.form === 'edit-word') {
    const word = getWord(form.dataset.setId, form.dataset.wordId);
    const pl = String(data.get('pl') || '').trim();
    const en = String(data.get('en') || '').trim();
    if (!word || !pl || !en) return;
    word.pl = pl;
    word.en = en;
    saveState();
    navigate(`/set/${encodeURIComponent(form.dataset.setId)}`);
    showToast('Zapisano zmiany.', 'success');
  }

  if (form.dataset.form === 'strategy') {
    const strategy = parseStrategy(data.get('strategy'));
    if (!strategy.length) {
      showToast('Wpisz co najmniej jedną liczbę.', 'error');
      return;
    }
    state.strategy = strategy;
    saveState();
    render();
    showToast('Zapisano sposób nauki.', 'success');
  }
}

function renameSet(setId) {
  const set = getSet(setId);
  if (!set) return;
  const name = prompt('Nowa nazwa zestawu:', set.name)?.trim();
  if (!name) return;
  set.name = name;
  saveState();
  render();
  showToast('Zmieniono nazwę.', 'success');
}

function deleteSet(setId) {
  const index = state.sets.findIndex(set => set.id === setId);
  if (index < 0) return;
  const set = state.sets[index];
  if (!confirm(`Usunąć zestaw „${set.name}” i ${set.words.length} słówek?`)) return;
  state.sets.splice(index, 1);
  state.stage = Math.min(state.stage, Math.max(0, state.sets.length - 1));
  clearSession();
  saveState();
  render();
  showToast('Usunięto zestaw.', 'success');
}

function deleteWord(setId, wordId) {
  const set = getSet(setId);
  const index = set?.words.findIndex(word => word.id === wordId) ?? -1;
  if (!set || index < 0) return;
  if (!confirm('Usunąć to słówko?')) return;
  set.words.splice(index, 1);
  clearSession();
  saveState();
  navigate(`/set/${encodeURIComponent(setId)}`);
  showToast('Usunięto słówko.', 'success');
}

function resetStage() {
  if (!confirm('Wyzerować postęp etapów? Zestawy i słówka pozostaną bez zmian.')) return;
  state.stage = 0;
  clearSession();
  saveState();
  render();
  showToast('Etap wyzerowany.', 'success');
}

function resetData() {
  if (!confirm('Usunąć wszystkie zestawy, słówka i postęp? Tej operacji nie można cofnąć.')) return;
  state = defaultState();
  clearSession();
  saveState();
  navigate('/home');
  showToast('Usunięto dane.', 'success');
}

function endSession() {
  if (!confirm('Zakończyć aktywną sesję? Jej bieżący postęp zostanie usunięty.')) return;
  clearSession();
  navigate('/home');
}

document.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.id === 'answer-input' && !event.isComposing) {
    event.preventDefault();
    checkAnswer();
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.list-main[role="button"]')) {
    event.preventDefault();
    event.target.click();
  }
});

document.addEventListener('change', event => {
  if (event.target.id === 'ignore-case') {
    state.settings.ignoreCase = event.target.checked;
    saveState();
    showToast('Zapisano ustawienie.', 'success');
  }
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    await importFile(file);
  } catch (error) {
    console.error(error);
    showToast(`Nie udało się zaimportować pliku: ${error.message}`, 'error');
  }
});

window.addEventListener('hashchange', render);
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY) {
    state = loadState();
    render();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
}

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

if (!location.hash) location.hash = '/home';
else render();
