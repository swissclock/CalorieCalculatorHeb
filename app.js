/* Calorie Calculator — Hebrew nutrition lookup and carb counting.
   No build step, no dependencies. Data ships as static JSON alongside. */

'use strict';

/* ── Nutrient catalogue ──────────────────────────────────────────────────
   Ids come from dictionary.json; units and ordering are presentation
   concerns, so they live here rather than in the data files.            */

const NUTRIENT = {
  KCAL: '0', PROTEIN: '1', SUGAR: '2', FAT: '3',
  CARBS: '8', CHOLESTEROL: '223', FIBRE: '291',
};

const UNITS = {
  [NUTRIENT.KCAL]: 'קק״ל',
  [NUTRIENT.CHOLESTEROL]: 'מ״ג',
};
const DEFAULT_UNIT = 'גרם';

/* Shown in the four-up macro row, in this order. */
const MACROS = [
  { key: 'kcal',    id: NUTRIENT.KCAL,    label: 'קלוריות',  unit: 'קק״ל', decimals: 0 },
  { key: 'carbs',   id: NUTRIENT.CARBS,   label: 'פחמימות',  unit: 'ג׳',   decimals: 1 },
  { key: 'fat',     id: NUTRIENT.FAT,     label: 'שומן',     unit: 'ג׳',   decimals: 1 },
  { key: 'protein', id: NUTRIENT.PROTEIN, label: 'חלבון',    unit: 'ג׳',   decimals: 1 },
];

/* Shown under "ערכים נוספים". */
const SECONDARY = [NUTRIENT.SUGAR, NUTRIENT.FIBRE, NUTRIENT.CHOLESTEROL];

const MAX_RESULTS = 50;
const STORAGE_KEY = 'calorie-calculator/journal/v1';

/* ── State ───────────────────────────────────────────────────────────── */

const state = {
  index: [],          // [{ id, name, norm, map }]
  nutrition: null,    // id -> [{ id, value }]
  names: {},          // nutrient id -> Hebrew label
  matches: [],
  highlighted: -1,
  food: null,         // { id, name }
  mode: 'grams',      // 'grams' | 'carbs'
  journal: [],
};

const $ = (id) => document.getElementById(id);

const el = {
  input:    $('search-input'),
  clear:    $('search-clear'),
  results:  $('search-results'),
  status:   $('search-status'),
  common:   $('common'),
  commonList: $('common-list'),
  food:     $('food'),
  foodName: $('food-name'),
  foodMacros: $('food-macros'),
  extraWrap: $('food-extra-wrap'),
  extra:    $('food-extra'),
  segments: document.querySelectorAll('.segmented button'),
  amount:   $('amount'),
  amountUnit: $('amount-unit'),
  note:     $('portion-note'),
  portionLabel: $('portion-label'),
  portionMacros: $('portion-macros'),
  add:      $('add'),
  journalEmpty: $('journal-empty'),
  journalBody:  $('journal-body'),
  totalKcal: $('total-kcal'),
  totalMacros: $('total-macros'),
  split:    $('split'),
  entries:  $('entries'),
  clearAll: $('clear'),
};

/* ── Text normalisation ──────────────────────────────────────────────────
   Product names carry niqqud and a mix of apostrophe characters (the data
   uses a backtick in e.g. "ג`חנון"). Strip all of it so that what the user
   types matches what is stored, and keep a map back to the original index
   so matches can still be highlighted in the unmodified name.           */

const NIQQUD = /[֑-ׇ]/;
const QUOTES = /[`'"׳״‘’“”]/;

function normalize(text) {
  let norm = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (NIQQUD.test(ch) || QUOTES.test(ch)) continue;
    norm += (ch === '־' || ch === '-') ? ' ' : ch.toLowerCase();
    map.push(i);
  }
  return { norm, map };
}

/* ── Loading ─────────────────────────────────────────────────────────── */

const json = (path) => fetch(path).then((r) => {
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
});

async function boot() {
  /* nutrition_data.json is by far the largest file and is not needed until a
     food is picked, so it loads in parallel and is awaited lazily. */
  const nutritionReady = json('nutrition_data.json')
    .then((data) => { state.nutrition = data; });
  state.nutritionReady = nutritionReady;

  let index, dictionary, common;
  try {
    [index, dictionary, common] = await Promise.all([
      json('all_alphabetical.json'),
      json('dictionary.json'),
      json('popular.json'),
    ]);
  } catch (err) {
    el.status.textContent = 'טעינת נתוני המזון נכשלה. נסו לרענן את הדף.';
    console.error(err);
    return;
  }

  state.index = Object.values(index).flat().map((product) => {
    const { norm, map } = normalize(product.name);
    return { id: product.id, name: product.name, norm, map };
  });

  dictionary.forEach((entry) => { state.names[entry.id] = entry.value; });

  renderCommon(common);
  restoreJournal();
  renderJournal();

  el.input.disabled = false;
  el.input.placeholder = 'חיפוש מוצר…';
  nutritionReady.catch((err) => {
    el.status.textContent = 'טעינת הערכים התזונתיים נכשלה.';
    console.error(err);
  });
}

/* ── Search ──────────────────────────────────────────────────────────── */

function search(query) {
  const { norm } = normalize(query.trim());
  if (norm.length < 2) return [];

  const tokens = norm.split(/\s+/).filter(Boolean);
  const scored = [];

  for (const product of state.index) {
    const at = product.norm.indexOf(tokens[0]);
    if (at === -1) continue;
    if (!tokens.every((token) => product.norm.includes(token))) continue;

    /* Prefix beats word-start beats anywhere; shorter names win ties. */
    let rank = 3;
    if (at === 0) rank = product.norm.length === norm.length ? 0 : 1;
    else if (product.norm[at - 1] === ' ') rank = 2;

    scored.push({ product, rank, at, length: tokens[0].length });
  }

  scored.sort((a, b) => a.rank - b.rank || a.product.name.length - b.product.name.length);
  return scored.slice(0, MAX_RESULTS);
}

function renderResults(matches) {
  state.matches = matches;
  state.highlighted = -1;
  el.results.replaceChildren();

  if (!matches.length) {
    closeResults();
    return;
  }

  matches.forEach((match, i) => {
    const li = document.createElement('li');
    li.id = `result-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.append(...highlight(match));
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();          // keep focus so the input does not blur first
      selectFood(match.product);
    });
    el.results.append(li);
  });

  el.results.hidden = false;
  el.input.setAttribute('aria-expanded', 'true');
}

/* Wrap the matched span of the original name in <mark>. */
function highlight({ product, at, length }) {
  const start = product.map[at];
  const end = product.map[at + length - 1] + 1;
  const mark = document.createElement('mark');
  mark.textContent = product.name.slice(start, end);
  return [
    document.createTextNode(product.name.slice(0, start)),
    mark,
    document.createTextNode(product.name.slice(end)),
  ];
}

function closeResults() {
  el.results.hidden = true;
  el.results.replaceChildren();
  el.input.setAttribute('aria-expanded', 'false');
  el.input.removeAttribute('aria-activedescendant');
  state.matches = [];
  state.highlighted = -1;
}

function moveHighlight(step) {
  if (!state.matches.length) return;
  const count = state.matches.length;
  const next = state.highlighted === -1 && step < 0
    ? count - 1
    : (state.highlighted + step + count) % count;

  el.results.children[state.highlighted]?.setAttribute('aria-selected', 'false');
  const option = el.results.children[next];
  option.setAttribute('aria-selected', 'true');
  option.scrollIntoView({ block: 'nearest' });
  el.input.setAttribute('aria-activedescendant', option.id);
  state.highlighted = next;
}

/* ── Food detail ─────────────────────────────────────────────────────── */

function per100(id) {
  const values = state.nutrition?.[id] || [];
  const out = {};
  for (const { id: nutrient, value } of values) out[nutrient] = parseFloat(value) || 0;
  return out;
}

async function selectFood(product) {
  state.food = product;
  el.input.value = product.name;
  el.clear.hidden = false;
  closeResults();
  el.input.blur();

  if (!state.nutrition) {
    el.status.textContent = 'טוען ערכים…';
    await state.nutritionReady;
    el.status.textContent = '';
  }

  const values = per100(product.id);
  el.foodName.textContent = product.name;
  el.foodMacros.replaceChildren(...MACROS.map((macro) =>
    macroCell(macro, values[macro.id] || 0)));

  const extras = SECONDARY
    .filter((id) => values[id] !== undefined && state.names[id])
    .map((id) => row(state.names[id], format(values[id], 1), UNITS[id] || DEFAULT_UNIT));
  el.extra.replaceChildren(...extras);
  el.extraWrap.hidden = extras.length === 0;

  el.common.hidden = true;
  el.food.hidden = false;
  el.amount.value = '';
  renderPortion();
  el.amount.focus({ preventScroll: true });
  el.food.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function macroCell({ key, label, unit }, value, decimals) {
  const wrap = document.createElement('div');
  wrap.dataset.macro = key;
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  const d = decimals ?? MACROS.find((m) => m.key === key).decimals;
  dd.textContent = format(value, d);
  const small = document.createElement('small');
  small.textContent = unit;
  dd.append(' ', small);
  wrap.append(dt, dd);
  return wrap;
}

function row(label, value, unit) {
  const wrap = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = `${value} ${unit}`;
  wrap.append(dt, dd);
  return wrap;
}

function format(value, decimals) {
  if (!isFinite(value)) return '—';
  const rounded = Number(value.toFixed(decimals));
  return rounded.toLocaleString('he-IL', { maximumFractionDigits: decimals });
}

/* ── Portion ─────────────────────────────────────────────────────────── */

/* Grams of product represented by the current input, or null. */
function portionGrams() {
  const amount = parseFloat(el.amount.value);
  if (!(amount > 0)) return null;
  if (state.mode === 'grams') return amount;

  const carbsPer100 = per100(state.food.id)[NUTRIENT.CARBS] || 0;
  if (carbsPer100 <= 0) return null;
  return (amount * 100) / carbsPer100;
}

function renderPortion() {
  const grams = state.food ? portionGrams() : null;
  const values = state.food ? per100(state.food.id) : {};
  const noCarbs = state.mode === 'carbs' && !(values[NUTRIENT.CARBS] > 0);

  if (noCarbs) {
    el.note.textContent = 'למוצר זה לא רשומות פחמימות, לכן לא ניתן לחשב לפיהן.';
  } else if (state.mode === 'carbs' && grams) {
    el.note.replaceChildren('נדרשים ', bold(`${format(grams, 0)} גרם`), ' מהמוצר.');
  } else {
    el.note.textContent = '';
  }

  el.portionLabel.textContent =
    (state.mode === 'grams' && grams) ? `ל־${format(grams, 0)} גרם` : '';
  el.portionMacros.replaceChildren(...MACROS.map((macro) =>
    macroCell(macro, ((values[macro.id] || 0) * (grams || 0)) / 100)));

  el.add.disabled = !grams;
}

function bold(text) {
  const b = document.createElement('b');
  b.textContent = text;
  return b;
}

function setMode(mode) {
  state.mode = mode;
  el.segments.forEach((button) => {
    button.setAttribute('aria-checked', String(button.dataset.mode === mode));
  });
  const byWeight = mode === 'grams';
  el.amountUnit.textContent = byWeight ? 'גרם' : 'גרם פחמימות';
  el.amount.setAttribute('aria-label', byWeight ? 'משקל בגרמים' : 'פחמימות בגרמים');
  renderPortion();
}

/* ── Journal ─────────────────────────────────────────────────────────── */

function addEntry() {
  const grams = portionGrams();
  if (!state.food || !grams) return;

  const values = per100(state.food.id);
  const scale = grams / 100;

  state.journal.push({
    name: state.food.name,
    grams,
    kcal:    (values[NUTRIENT.KCAL]    || 0) * scale,
    carbs:   (values[NUTRIENT.CARBS]   || 0) * scale,
    fat:     (values[NUTRIENT.FAT]     || 0) * scale,
    protein: (values[NUTRIENT.PROTEIN] || 0) * scale,
  });

  saveJournal();
  renderJournal();
  el.amount.value = '';
  renderPortion();
  el.amount.focus({ preventScroll: true });
}

function totals() {
  return state.journal.reduce((sum, entry) => ({
    kcal: sum.kcal + entry.kcal,
    carbs: sum.carbs + entry.carbs,
    fat: sum.fat + entry.fat,
    protein: sum.protein + entry.protein,
  }), { kcal: 0, carbs: 0, fat: 0, protein: 0 });
}

function renderJournal() {
  const any = state.journal.length > 0;
  el.journalEmpty.hidden = any;
  el.journalBody.hidden = !any;
  el.clearAll.hidden = !any;
  if (!any) return;

  const sum = totals();
  el.totalKcal.textContent = format(sum.kcal, 0);

  el.totalMacros.replaceChildren(
    ...MACROS.filter((m) => m.key !== 'kcal').map((m) => macroCell(m, sum[m.key])),
  );

  /* Share of energy, not of mass: carbs and protein 4 kcal/g, fat 9. */
  const energy = {
    carbs: sum.carbs * 4,
    fat: sum.fat * 9,
    protein: sum.protein * 4,
  };
  const totalEnergy = energy.carbs + energy.fat + energy.protein;
  el.split.querySelectorAll('.split__seg').forEach((seg) => {
    const share = totalEnergy > 0 ? (energy[seg.dataset.macro] / totalEnergy) * 100 : 0;
    seg.style.flexBasis = `${share}%`;
  });

  el.entries.replaceChildren(...state.journal.map((entry, i) => entryRow(entry, i)));
}

function entryRow(entry, index) {
  const li = document.createElement('li');

  const text = document.createElement('div');
  text.className = 'entry__text';
  const name = document.createElement('span');
  name.className = 'entry__name';
  name.textContent = entry.name;
  const meta = document.createElement('span');
  meta.className = 'entry__meta';
  meta.textContent = `${format(entry.grams, 0)} גרם · ${format(entry.carbs, 1)} ג׳ פחמימות`;
  text.append(name, meta);

  const kcal = document.createElement('span');
  kcal.className = 'entry__kcal';
  kcal.textContent = format(entry.kcal, 0);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'entry__remove';
  remove.setAttribute('aria-label', `הסר ${entry.name}`);
  remove.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">'
    + '<path d="M6 6 L14 14 M14 6 L6 14"/></svg>';
  remove.addEventListener('click', () => {
    state.journal.splice(index, 1);
    saveJournal();
    renderJournal();
  });

  li.append(text, kcal, remove);
  return li;
}

function saveJournal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.journal));
  } catch { /* private mode or quota — the session still works */ }
}

function restoreJournal() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) {
      state.journal = saved.filter((e) => e && typeof e.name === 'string' && isFinite(e.kcal));
    }
  } catch { /* ignore malformed storage */ }
}

/* ── Common foods ────────────────────────────────────────────────────── */

const COMMON_COLLAPSED = 15;

function renderCommon(list, expanded = false) {
  const shown = expanded ? list : list.slice(0, COMMON_COLLAPSED);

  const chips = shown.map((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.name;
    button.addEventListener('click', () => selectFood(item));
    return button;
  });

  if (!expanded && list.length > COMMON_COLLAPSED) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'chips__more';
    more.textContent = `עוד ${list.length - COMMON_COLLAPSED}`;
    more.addEventListener('click', () => renderCommon(list, true));
    chips.push(more);
  }

  el.commonList.replaceChildren(...chips);
  el.common.hidden = list.length === 0;
}

/* ── Wiring ──────────────────────────────────────────────────────────── */

el.input.addEventListener('input', () => {
  const query = el.input.value;
  el.clear.hidden = query.length === 0;
  if (query.trim().length < 2) {
    closeResults();
    el.status.textContent = '';
    return;
  }
  const matches = search(query);
  renderResults(matches);
  el.status.textContent = matches.length ? '' : 'לא נמצאו מוצרים תואמים.';
});

el.input.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); moveHighlight(1); break;
    case 'ArrowUp':   e.preventDefault(); moveHighlight(-1); break;
    case 'Enter': {
      const pick = state.matches[state.highlighted] || state.matches[0];
      if (pick) { e.preventDefault(); selectFood(pick.product); }
      break;
    }
    case 'Escape': closeResults(); break;
  }
});

el.input.addEventListener('blur', () => setTimeout(closeResults, 120));

el.clear.addEventListener('click', () => {
  el.input.value = '';
  el.clear.hidden = true;
  el.status.textContent = '';
  el.food.hidden = true;
  el.common.hidden = false;
  state.food = null;
  closeResults();
  el.input.focus();
});

el.segments.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

el.amount.addEventListener('input', renderPortion);
el.amount.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !el.add.disabled) addEntry();
});
el.add.addEventListener('click', addEntry);

el.clearAll.addEventListener('click', () => {
  if (!confirm('לנקות את כל הפריטים ביומן?')) return;
  state.journal = [];
  saveJournal();
  renderJournal();
});

boot();
