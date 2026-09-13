# מחשבון קלוריות · Calorie & Carb Calculator

A Hebrew-language nutrition lookup and **carb-counting** tool. Search a food, see its
values per 100 g, then size a portion in one of two directions:

- **by weight** — "how much is in 60 g of rye bread?"
- **by carbs** — "how many grams of rye bread give me exactly 30 g of carbohydrate?"

That second direction is the point of the app. Counting carbohydrate backwards from a
target is the everyday arithmetic of insulin dosing and low-carb portioning, and it is
the calculation most calorie apps make you do by hand.

Portions can be added to a running daily journal that totals calories and macronutrients
and shows how the energy splits between carbs, fat and protein.

מחשבון עברי לערכים תזונתיים ולספירת פחמימות: חיפוש מוצר, חישוב מנה לפי משקל או לפי כמות
פחמימות נדרשת, וסיכום יומי של קלוריות ואבות מזון.

---

## Status

Static site. No build step, no dependencies, no backend, no tracking, no network calls
beyond the four JSON files it ships with. Everything runs in the browser; the journal is
kept in `localStorage` and never leaves the device.

## Features

- **Search** over ~985 foods — generic items and Israeli retail products alike.
  Matching ignores niqqud and normalises the several apostrophe characters the data
  mixes (`` ` ``, `'`, `׳`), so typing `קוטג'` finds ``קוטג` 3%``. Multi-word queries
  match in any order; results are ranked prefix-first and capped at 50.
- **Two portion modes** — by weight, or by target carbohydrate.
- **Daily journal** — per-entry removal, live totals, and an energy-split bar.
  Persists across reloads.
- **Hebrew-first, RTL throughout**, with a light and dark theme that follow the OS.
- **Keyboard and screen-reader support** — the search field is an ARIA combobox with
  arrow-key navigation; the calculator is operable without a mouse.
- **Installable** — ships a web manifest and icons, so it can be added to a phone's
  home screen and opened like an app.

## Deployment

Deployed on **Vercel**. Pushing to `main` ships it — there is no build step to run and
no configuration to keep in sync; Vercel serves the repository root as-is.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Page structure. |
| `styles.css` | All styling. Theme tokens live in `:root`; the dark theme redefines only the tokens. |
| `app.js` | Search, portion maths, journal. Plain ES modules-free JavaScript. |
| `all_alphabetical.json` | Food **names**, grouped by first letter. Drives search. |
| `nutrition_data.json` | Food **values**, per 100 g, keyed by food id. |
| `dictionary.json` | Nutrient id → Hebrew label. |
| `popular.json` | The shortlist shown as chips on the empty screen. |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | Home-screen install metadata. |

## Data format

Three files join on a shared **food id**, and a fourth names the nutrients.

`all_alphabetical.json` — an object whose keys are positions in the Hebrew alphabet
*including* final forms (`1`=א … `11`=ך, `12`=כ … `27`=ת). The four keys that never
appear (14, 16, 20, 22 — ם, ן, ף, ץ) are the finals that cannot begin a word. The app
flattens this into one list; the grouping is kept for a future browse-by-letter view.

```json
{ "1": [ { "id": "1", "name": "אבוקדו" } ] }
```

`nutrition_data.json` — food id → nutrient readings, **always per 100 g**. Values are
strings, and a nutrient is simply absent when unmeasured rather than zero.

```json
{ "1": [ { "id": "0", "value": "162.454" }, { "id": "8", "value": "5" } ] }
```

`dictionary.json` — nutrient id → label. The ids in use:

| id | Label | Nutrient | Unit |
| --- | --- | --- | --- |
| `0` | קלוריות | Energy | kcal |
| `1` | חלבון | Protein | g |
| `2` | סוכרים | Sugars | g |
| `3` | שומן | Fat | g |
| `8` | פחמימות | Carbohydrate | g |
| `223` | כולסטרול | Cholesterol | mg |
| `291` | סיבים | Fibre | g |

Units are not in the data — they are declared in `UNITS` / `MACROS` in `app.js`, since
they are a presentation concern. A nutrient added to `dictionary.json` but not to
`SECONDARY` in `app.js` will not be displayed.

### Known data gaps

- `nutrition_data.json` holds **2741** rows but only **985** have names in
  `all_alphabetical.json`. The remaining ~1756 are unreachable: nothing maps them to a
  name. If the upstream export can emit those names, search coverage nearly triples.
- Nutrient id `1000` appears on about a third of rows and has no entry in
  `dictionary.json`, so the app ignores it. Its meaning is undocumented.
- One item (`כרוב כבוש`) is filed under ך rather than כ. Harmless — search flattens the
  groups — but it would matter to a browse-by-letter view.

### Updating the database

Replace the JSON files and commit. Keep them pretty-printed as they are: it keeps the
`db update` diffs reviewable. No rebuild is needed — the page reads them at runtime.

## Accuracy

Values are per 100 g as published for each food and are an **estimate**. Prepared and
branded items vary batch to batch. Anyone dosing insulin against these numbers should
verify them against the product's own label.

## Browser support

Any current browser. Uses `replaceChildren`, optional chaining, CSS custom properties,
logical properties and `:focus-visible` — so roughly Safari 15.4+, Chrome 105+,
Firefox 110+.
