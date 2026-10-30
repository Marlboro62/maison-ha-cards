/*
 * Cartes Maison HA : les blocs d'un tableau de bord « maison » transformés en cartes Lovelace
 * autonomes, dans un seul fichier, sans button-card, card-mod, bubble-card ni layout-card.
 *
 *   custom:maison-chips-card        barre de pastilles (Tempo, portail, ouvertures, batteries…)
 *   custom:maison-piece-card        une pièce : température, humidité, courbe 24 h, ouvertures, lumières, média
 *   custom:maison-plan-card         les pièces par étage, avec onglets Favoris / étages
 *   custom:maison-boutons-card      lumières et interrupteurs en tuiles On / Off
 *   custom:maison-volets-card       volets : position, montée / descente, curseur, groupes
 *   custom:maison-alarme-card       alarme : modes absent / nuit / vacances / désarmée
 *   custom:maison-mode-card         sélecteur de mode (input_select / select) en boutons
 *   custom:maison-robot-card        aspirateur robot
 *   custom:maison-voiture-card      voiture électrique : batterie, autonomie, charge, climatisation
 *   custom:maison-imprimante-card   imprimante 3D (Bambu Lab, Klipper / Moonraker…)
 *   custom:maison-menu-card         menu de la semaine et liste de courses
 *   custom:maison-meteo-card        température extérieure, prévisions et courbe
 *   custom:maison-agenda-card       prochains événements d'un calendrier
 *   custom:maison-jauge-card        jauge en fer à cheval avec deux valeurs secondaires
 *   custom:maison-horloge-card      horloge, date et menu de navigation vertical (colonne latérale)
 *   custom:maison-navigation-card   barre de navigation en bas de l'écran
 *   custom:maison-popup-card        fenêtre qui s'ouvre sur un lien #ancre (remplace les pop-ups)
 *
 * Les entités sont détectées automatiquement quand c'est possible (pièces, intégrations),
 * ou choisies dans la configuration (voir le README).
 */

(() => {
const CARD_VERSION = "0.2.6";

/* ------------------------------------------------------------- utilitaires */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const BAD = new Set(["unknown", "unavailable", "none", "None", ""]);

/** Nombre lu dans un état, ou null. « 1:05:00 » donne des minutes. */
const num = (v) => {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (BAD.has(s)) return null;
  const hms = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (hms) return Number(hms[1]) * 60 + Number(hms[2]) + Number(hms[3] || 0) / 60;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const fmt = (n, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Minutes en « 1 h 05 » ou « 25 min ». */
const hm = (min) => {
  if (min === null) return "—";
  const m = Math.max(0, Math.round(min));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
};

/** Minutes en « 01:05:00 ». */
const hms = (min) => {
  if (min === null) return "—";
  const s = Math.max(0, Math.round(min * 60));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, "0")).join(":");
};

const relTime = (iso) => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const s = (t - Date.now()) / 1000;
  const a = Math.abs(s);
  const txt = a < 90 ? "moins d'une minute" : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} j`;
  return s >= 0 ? `dans ${txt}` : `il y a ${txt}`;
};

/** États traduits en français, par domaine puis généraux. */
const STATE_FR = {
  cover: { open: "Ouvert", closed: "Fermé", opening: "Ouverture…", closing: "Fermeture…", stopped: "Arrêté" },
  alarm_control_panel: {
    disarmed: "désarmée", armed_away: "mode absent", armed_home: "mode présence", armed_night: "mode nuit",
    armed_vacation: "mode vacances", armed_custom_bypass: "mode personnalisé", arming: "armement…",
    pending: "en attente…", triggered: "déclenchée !", disarming: "désarmement…",
  },
  vacuum: { cleaning: "Nettoyage", docked: "Sur la base", returning: "Retour à la base", idle: "Inactif", paused: "En pause", error: "Erreur" },
  lock: { locked: "Verrouillé", unlocked: "Déverrouillé", locking: "Verrouillage…", unlocking: "Déverrouillage…", jammed: "Bloqué", open: "Ouvert" },
  media_player: { playing: "Lecture", paused: "Pause", idle: "Inactif", off: "Éteint", on: "Allumé", standby: "Veille", buffering: "Chargement" },
  "": { on: "On", off: "Off", home: "Présent", not_home: "Absent", unavailable: "Indisponible", unknown: "Inconnu", open: "Ouvert", closed: "Fermé" },
};
const stateFr = (s, domain = "") => {
  if (s === null || s === undefined) return "—";
  const k = String(s);
  return STATE_FR[domain]?.[k] ?? STATE_FR[""][k] ?? k;
};

const domainOf = (id) => String(id || "").split(".")[0];
const friendly = (o) => o?.attributes?.friendly_name || o?.entity_id || "";

/* ------------------------------------------------- modèles de texte {…} */

/**
 * Remplace les {…} d'un texte :
 *   {state} {unit} {name} {attr:nom}            l'entité de l'élément
 *   {sensor.x} {sensor.x:attribut}             une autre entité
 * suivis de filtres séparés par | :
 *   0 1 2 (décimales), k (÷ 1000), hm (minutes → 1 h 05), hms (→ 01:05:00),
 *   date, time, rel (il y a…), fr (état traduit), upper, lower, int
 */
const TPL_RE = /\{([a-z_]+\.[a-z0-9_]+(?::[a-z0-9_]+)?|state|unit|name|attr:[a-zA-Z0-9_]+)((?:\|[a-z0-9_]+)*)\}/g;

function applyFilters(v, filters, domain) {
  let out = v;
  for (const f of filters) {
    if (f === "k") out = num(out) === null ? out : num(out) / 1000;
    else if (/^\d$/.test(f)) out = num(out) === null ? out : fmt(num(out), Number(f));
    else if (f === "int") out = num(out) === null ? out : Math.round(num(out));
    else if (f === "hm") out = hm(num(out));
    else if (f === "hms") out = hms(num(out));
    else if (f === "date") out = Number.isFinite(new Date(out).getTime()) ? new Date(out).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : out;
    else if (f === "time") out = Number.isFinite(new Date(out).getTime()) ? new Date(out).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : out;
    else if (f === "rel") out = relTime(out) ?? out;
    else if (f === "fr") out = stateFr(out, domain);
    else if (f === "upper") out = String(out ?? "").toUpperCase();
    else if (f === "lower") out = String(out ?? "").toLowerCase();
  }
  if (out === null || out === undefined || BAD.has(String(out))) return "—";
  if (typeof out === "number") return Number.isInteger(out) ? String(out) : fmt(out, 1);
  return String(out);
}

/** Texte brut, {…} remplacés. */
function tplText(str, hass, eid) {
  if (str === null || str === undefined) return "";
  return String(str).replace(TPL_RE, (m, key, filt) => {
    const filters = filt ? filt.slice(1).split("|") : [];
    const so = eid ? hass?.states?.[eid] : null;
    if (key === "unit") return so?.attributes?.unit_of_measurement || "";
    if (key === "name") return friendly(so);
    if (key === "state") return applyFilters(so?.state, filters, domainOf(eid));
    if (key.startsWith("attr:")) return applyFilters(so?.attributes?.[key.slice(5)], filters, domainOf(eid));
    const [id, at] = key.split(":");
    const o = hass?.states?.[id];
    if (!o) return "—";
    return applyFilters(at ? o.attributes?.[at] : o.state, filters, domainOf(id));
  });
}

/** Texte prêt pour le HTML : échappé, retours à la ligne conservés. */
const tpl = (str, hass, eid) => esc(tplText(str, hass, eid)).replace(/\n/g, "<br>");

/** Texte choisi selon des conditions : une chaîne, ou une liste de { if, text }. */
function pickText(spec, hass, eid) {
  if (spec === null || spec === undefined) return null;
  if (!Array.isArray(spec)) return tpl(spec, hass, eid);
  for (const it of spec) {
    if (typeof it === "string") return tpl(it, hass, eid);
    if (cond(it.if, hass, eid)) return tpl(it.text, hass, eid);
  }
  return null;
}

/* --------------------------------------------------------------- conditions */

const hhmm = (s) => { const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(s)); return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null; };

/**
 * Condition d'affichage ou de couleur :
 *   { state: on }  { state: [a, b] }  { state_not: off }  { above: 0 }  { below: 30 }
 *   { entity: autre.entite, … }  { attribute: nom, … }  { after: "16:00" }  { before: "8:00" }
 *   { weekday: [mon, tue] }  { or: [ … ] }  { and: [ … ] }  { not: { … } }
 * Une liste vaut un « et ». Sans entité précisée, c'est celle de l'élément.
 */
function cond(c, hass, eid) {
  if (c === null || c === undefined) return true;
  if (Array.isArray(c)) return c.every((x) => cond(x, hass, eid));
  if (typeof c !== "object") return String(hass?.states?.[eid]?.state) === String(c);
  if (c.or) return [].concat(c.or).some((x) => cond(x, hass, eid));
  if (c.and && !cond(c.and, hass, eid)) return false;
  if (c.not && cond(c.not, hass, eid)) return false;
  const id = c.entity || eid;
  const o = id ? hass?.states?.[id] : null;
  const s = c.attribute ? o?.attributes?.[c.attribute] : o?.state;
  if ("state" in c && ![].concat(c.state).map(String).includes(String(s))) return false;
  if ("state_not" in c && [].concat(c.state_not).map(String).includes(String(s))) return false;
  if ("above" in c && !(num(s) !== null && num(s) > Number(c.above))) return false;
  if ("below" in c && !(num(s) !== null && num(s) < Number(c.below))) return false;
  if ("after" in c || "before" in c) {
    const d = new Date();
    const now = d.getHours() * 60 + d.getMinutes();
    if ("after" in c && !(now >= hhmm(c.after))) return false;
    if ("before" in c && !(now < hhmm(c.before))) return false;
  }
  if (c.weekday) {
    const wd = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
    if (![].concat(c.weekday).includes(wd)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ couleurs */

const COLORS = {
  green: "var(--m-green)", vert: "var(--m-green)",
  orange: "var(--m-orange)",
  red: "var(--m-red)", rouge: "var(--m-red)",
  yellow: "var(--m-yellow)", jaune: "var(--m-yellow)",
  blue: "var(--m-blue)", bleu: "var(--m-blue)",
  "blue-dark": "var(--m-blue-dark)", "bleu-fonce": "var(--m-blue-dark)",
  purple: "var(--m-purple)", violet: "var(--m-purple)",
  brown: "var(--m-brown)", marron: "var(--m-brown)",
  pop: "var(--m-pop)", accent: "var(--m-pop)",
  grey: "var(--m-chip)", gray: "var(--m-chip)", gris: "var(--m-chip)",
  white: "var(--m-card)", blanc: "var(--m-card)",
  black: "var(--m-text)", noir: "var(--m-text)",
  none: "transparent",
};
/** Couleur nommée, ou valeur CSS simple (#hex, rgb(), var()). */
const color = (c) => {
  if (c === null || c === undefined || c === "") return null;
  const k = String(c).trim();
  if (COLORS[k]) return COLORS[k];
  return /^[#\w(),.%\s-]+$/.test(k) ? k : null;
};
/** Première couleur dont la condition est vraie : [{ above: 60, color: green }, { color: red }]. */
const levelColor = (levels, hass, eid) => {
  for (const l of [].concat(levels || [])) if (cond(l, hass, eid)) return color(l.color);
  return null;
};
/** Couleur de texte lisible sur une couleur de fond « pastel » ou foncée. */
const onColor = (c) => (/blue-dark|bleu-fonce|m-text|m-blue-dark/.test(String(c)) ? "var(--m-card)" : "var(--m-on-pop)");

/* ------------------------------------------------------- pièces et étages */

const regOf = (hass, eid) => hass?.entities?.[eid];
const areaOf = (hass, eid) => {
  const e = regOf(hass, eid);
  if (!e) return null;
  return e.area_id || hass.devices?.[e.device_id]?.area_id || null;
};
/** Entité « visible » : ni masquée, ni de configuration / diagnostic. */
const shown = (hass, eid) => {
  const e = regOf(hass, eid);
  return !e || (!e.hidden && !e.hidden_by && !e.entity_category);
};
const floorsOf = (hass) => Object.values(hass?.floors || {}).sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
const areasOf = (hass) => Object.values(hass?.areas || {});
/** Icône d'étage selon le niveau. */
const floorIcon = (f) => f?.icon || (f?.level < 0 ? "mdi:home-floor-negative-1" : f?.level > 0 ? `mdi:home-floor-${Math.min(3, f.level)}` : "mdi:home-floor-0");

const entitiesIn = (hass, areaId, domain, test) =>
  Object.keys(hass?.states || {}).filter((id) => domainOf(id) === domain && areaOf(hass, id) === areaId && shown(hass, id) && (!test || test(hass.states[id])));

/* ----------------------------------------------------- historique partagé */

const BUS = new EventTarget();
const HIST = new Map(); // entity_id → { at, pts, busy }

/** Points [t, v] des dernières `hours` heures. Chargés une fois pour toutes les cartes, renouvelés toutes les 10 min. */
function historyOf(hass, id, hours = 24) {
  if (!id || !hass?.callApi) return null;
  const key = `${id}|${hours}`;
  const c = HIST.get(key);
  if (c && (c.busy || Date.now() - c.at < 10 * 60e3)) return c.pts;
  HIST.set(key, { at: Date.now(), pts: c?.pts || null, busy: true });
  const end = Date.now();
  const start = end - hours * 3600e3;
  const path = `history/period/${encodeURIComponent(new Date(start).toISOString())}?filter_entity_id=${encodeURIComponent(id)}` +
    `&end_time=${encodeURIComponent(new Date(end).toISOString())}&minimal_response&no_attributes`;
  hass.callApi("GET", path).then((rows) => {
    const pts = (Array.isArray(rows?.[0]) ? rows[0] : [])
      .map((r) => [new Date(r.last_changed || r.last_updated).getTime(), num(r.state)])
      .filter((p) => Number.isFinite(p[0]) && p[1] !== null);
    HIST.set(key, { at: Date.now(), pts, busy: false });
  }).catch(() => {
    HIST.set(key, { at: Date.now(), pts: c?.pts || [], busy: false });
  }).finally(() => BUS.dispatchEvent(new CustomEvent("hist", { detail: id })));
  return c?.pts || null;
}

/** Courbe SVG (ligne et aire) des points, dans une boîte w × h. */
function spark(pts, w = 300, h = 60, hours = 24) {
  if (!pts || pts.length < 2) return "";
  const end = Date.now();
  const start = end - hours * 3600e3;
  const vs = pts.map((p) => p[1]);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const x = (t) => ((Math.max(t, start) - start) / (end - start)) * w;
  const y = (v) => h - 4 - ((v - lo) / (hi - lo)) * (h - 8);
  let d = "";
  pts.forEach((p, i) => { d += `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)} `; });
  d += `L${w},${y(pts[pts.length - 1][1]).toFixed(1)}`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">` +
    `<path class="spark-a" d="${d} L${w},${h} L0,${h} Z"/><path class="spark-l" d="${d}"/></svg>`;
}

/* ---------------------------------------------------------------- actions */

const fire = (node, type, detail) =>
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

function navigate(path) {
  if (!path) return;
  const url = path.startsWith("#") ? `${location.pathname}${location.search}${path}` : path;
  history.pushState(null, "", url);
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
}

/* ------------------------------------------------------------------ thèmes */

/** maison : fond, texte et pastilles suivent le thème Home Assistant de l'utilisateur (--card-background-color,
 *  --primary-text-color…), avec les touches de couleur pastel ; --gray000 / --gray800 / --active-pop… restent prioritaires ;
 *  v2 : style MyElectricalData bleu nuit ; auto : MyElectricalData clair ou sombre ; ha : couleurs du thème Home Assistant. */
const themeClass = (theme, hass) => {
  const dark = hass?.themes?.darkMode === true;
  if (theme === "v2") return "th-v2";
  if (theme === "auto") return dark ? "th-v2" : "th-v2 light";
  if (theme === "ha") return "th-ha";
  return dark ? "th-maison dark" : "th-maison";
};

const BASE_STYLE = `<style>
:host { display: block; font-family: var(--ha-font-family-body, inherit); font-synthesis-weight: var(--maison-font-synthesis, auto); }
ha-card {
  --m-radius: 22px;
  background: var(--m-card); color: var(--m-text); border: none; box-shadow: var(--maison-shadow, none);
  border-radius: var(--m-radius); overflow: hidden; position: relative; height: 100%; box-sizing: border-box;
  font-variant-numeric: tabular-nums; container-type: inline-size; -webkit-tap-highlight-color: transparent;
}
ha-card.th-maison {
  --m-card: var(--gray000, var(--ha-card-background, var(--card-background-color, #f4f3f1)));
  --m-text: var(--gray800, var(--primary-text-color, #2b2c2f));
  --m-chip: var(--gray200, color-mix(in srgb, var(--m-text) 9%, var(--m-card)));
  --m-faint: var(--gray400, var(--disabled-text-color, #b4b2ad)); --m-pop: var(--active-pop, #f6b38b); --m-on-pop: var(--active-on-pop, var(--gray800, #2b2c2f));
  --m-green: var(--active-green, #94d3a2); --m-orange: var(--active-orange, #f5c27a); --m-red: var(--active-red, #f08c84);
  --m-yellow: var(--active-yellow, #f3dc76); --m-blue: var(--active-blue, #8eb5f5); --m-blue-dark: var(--active-blue-dark, #3f5d8f);
  --m-purple: var(--active-purple, #c4a8f4); --m-brown: var(--active-brown, #b98a63); --m-acc: var(--pop, #d2703a);
}
ha-card.th-maison.dark {
  --m-card: var(--gray000, var(--ha-card-background, var(--card-background-color, #24272c)));
  --m-text: var(--gray800, var(--primary-text-color, #eceef1));
  --m-chip: var(--gray200, color-mix(in srgb, var(--m-text) 12%, var(--m-card)));
  --m-faint: var(--gray400, var(--disabled-text-color, #6d737c)); --m-pop: var(--active-pop, #f0a274); --m-on-pop: var(--active-on-pop, #1f2124);
  --m-green: var(--active-green, #6fbf83); --m-orange: var(--active-orange, #e9ad5b); --m-red: var(--active-red, #e5776e);
  --m-yellow: var(--active-yellow, #e2c95a); --m-blue: var(--active-blue, #6f9de8); --m-blue-dark: var(--active-blue-dark, #4a6fae);
  --m-purple: var(--active-purple, #a98be6); --m-brown: var(--active-brown, #a77a55); --m-acc: var(--pop, #f0a274);
}
ha-card.th-v2 {
  --m-card: #1f2a3c; --m-chip: #2c3a52; --m-text: #e7edf5; --m-faint: #5d6e88; --m-pop: #1d93e3; --m-on-pop: #ffffff;
  --m-green: #78b81a; --m-orange: #e8962e; --m-red: #e04848; --m-yellow: #e2c33c; --m-blue: #3f7ff0; --m-blue-dark: #2b56a8;
  --m-purple: #8c6be0; --m-brown: #a77a55; --m-acc: #4fb0f0;
  border: 1px solid #2f3d55; --m-radius: 18px;
}
ha-card.th-v2.light {
  --m-card: #ffffff; --m-chip: #eef2f7; --m-text: #1a2434; --m-faint: #a3afc0; --m-pop: #1673b8; --m-on-pop: #ffffff;
  --m-green: #5c9c12; --m-orange: #d98420; --m-red: #d23c3c; --m-yellow: #d2b22a; --m-blue: #2f6fe0; --m-blue-dark: #24508f; --m-acc: #1673b8;
  border-color: #dbe2ec; box-shadow: 0 1px 3px rgba(26, 36, 52, .08);
}
ha-card.th-ha {
  --m-card: var(--ha-card-background, var(--card-background-color, #fff));
  --m-chip: color-mix(in srgb, var(--primary-text-color, #000) 8%, transparent);
  --m-text: var(--primary-text-color, #1f2937); --m-faint: var(--disabled-text-color, #9aa0a6);
  --m-pop: var(--accent-color, #ff9800); --m-on-pop: var(--text-accent-color, #fff);
  --m-green: var(--success-color, #43a047); --m-orange: var(--warning-color, #ffa600); --m-red: var(--error-color, #db4437);
  --m-yellow: var(--state-sensor-battery-medium-color, #f3c623); --m-blue: var(--info-color, #039be5);
  --m-blue-dark: var(--primary-color, #03a9f4); --m-purple: #9c6ade; --m-brown: #a77a55; --m-acc: var(--accent-color, #ff9800);
  --m-radius: var(--ha-card-border-radius, 12px);
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
}
ha-card { --m-muted: color-mix(in srgb, var(--m-text) 62%, transparent); --m-line: color-mix(in srgb, var(--m-text) 12%, transparent); }
ha-icon { --mdc-icon-size: 24px; display: inline-flex; }
[data-a], [data-h] { cursor: pointer; }
[data-a]:focus-visible, [data-h]:focus-visible, button:focus-visible { outline: 2px solid var(--m-pop); outline-offset: 2px; }
button { font: inherit; color: inherit; }
.ls { letter-spacing: .3em; }
.muted { color: var(--m-muted); }
/* barre de boutons ronds dans une pilule */
.rbar { display: flex; gap: 4px; padding: 5px; border-radius: 50px; background: var(--m-chip); }
.rbar.col { flex-direction: column; }
.rb { all: unset; box-sizing: border-box; width: 44px; height: 44px; flex: 1 1 44px; max-width: 64px; min-width: 38px; border-radius: 50px; display: grid; place-items: center;
  cursor: pointer; color: var(--m-text); transition: background .2s; }
.rbar.col .rb { flex: none; width: 44px; }
.rb ha-icon { --mdc-icon-size: 24px; }
.rb.on { background: var(--m-pop); color: var(--m-on-pop); }
.rb.warn { background: var(--m-red); color: var(--m-on-pop); }
.rb:focus-visible { outline: 2px solid var(--m-pop); outline-offset: 1px; }
.spark { width: 100%; height: 100%; display: block; }
.spark-l { fill: none; stroke: var(--m-pop); stroke-width: 2; vector-effect: non-scaling-stroke; }
.spark-a { fill: var(--m-pop); opacity: .12; stroke: none; }
.bar-p { height: 8px; border-radius: 8px; background: var(--m-line); overflow: hidden; }
.bar-p i { display: block; height: 100%; border-radius: 8px; background: var(--m-pop); }
.empty { padding: 16px; font-size: .9rem; color: var(--m-muted); }
.empty b { color: var(--m-text); display: block; margin-bottom: 4px; }
@keyframes m-flash { 0%, 100% { opacity: .85; } 50% { opacity: .15; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>`;

/* -------------------------------------------------------------- carte de base */

class MaisonCard extends HTMLElement {
  static get DEFAULTS() { return { theme: "maison" }; }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("Configuration invalide");
    this._config = { ...this.constructor.DEFAULTS, ...config };
    this._check?.(this._config);
    this._ui = this._ui || {};
    this._sig = null;
    this._res = null;
    if (!this.shadowRoot) this._setup();
    if (this._hass) this._update(true);
  }

  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    if (first || this._regKey !== this._registryKey()) this._res = null;
    this._update(false);
  }

  get hass() { return this._hass; }

  set editMode(v) { this._editMode = v; this._update(true); }

  get editMode() { return this._editMode; }

  set preview(v) { this._preview = v; this._update(true); }

  get preview() { return this._preview; }

  connectedCallback() {
    if (!this._onHist) {
      this._onHist = (ev) => { if (this._histIds?.includes(ev.detail)) this._update(true); };
    }
    BUS.addEventListener("hist", this._onHist);
    this._timer = setInterval(() => this._tick?.(), 60e3);
    if (this._hass && this._config) this._update(true);
  }

  disconnectedCallback() {
    BUS.removeEventListener("hist", this._onHist);
    clearInterval(this._timer);
  }

  getCardSize() { return 3; }

  /** Clé du registre : la détection automatique est refaite quand les entités ou pièces changent. */
  _registryKey() {
    const h = this._hass;
    return `${Object.keys(h?.states || {}).length}|${Object.keys(h?.entities || {}).length}|${Object.keys(h?.areas || {}).length}`;
  }

  /** Résultat de la détection automatique, gardé en cache. */
  _resolved() {
    if (!this._res) {
      this._regKey = this._registryKey();
      this._res = this._resolve ? this._resolve(this._config, this._hass) : {};
    }
    return this._res;
  }

  /** Entités dont un changement redessine la carte. */
  _ids() { return []; }

  _update(force) {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    if (this._busy && !force) return;
    let sig = `${this._hass.themes?.darkMode ? "d" : "l"}|${JSON.stringify(this._ui)}`;
    for (const id of this._ids()) {
      const o = this._hass.states[id];
      sig += `|${id}=${o ? `${o.state}@${o.last_updated || o.last_changed || ""}` : "-"}`;
    }
    if (!force && sig === this._sig) return;
    this._sig = sig;
    this._draw();
  }

  _tick() { this._update(true); }

  _draw() {
    this._acts = [];
    this._histIds = [];
    let body;
    try {
      body = this._render(this._config, this._hass);
    } catch (err) {
      console.error(`[${this.localName}]`, err);
      body = `<div class="empty"><b>Erreur d'affichage</b>${esc(err?.message || err)}</div>`;
    }
    const cls = `${themeClass(this._config.theme, this._hass)} ${this._cardClass ? this._cardClass() : ""}`;
    const style = this.constructor.STYLE || "";
    this.shadowRoot.innerHTML = `${BASE_STYLE}${style}<ha-card class="${cls}">${body}</ha-card>`;
    this._after?.();
  }

  /** Historique d'une entité (courbe), la carte se redessine quand il arrive. */
  _hist(id, hours = 24) {
    if (!id) return null;
    this._histIds.push(id);
    return historyOf(this._hass, id, hours);
  }

  /** Enregistre une action et renvoie son numéro, pour data-a="…" (clic) ou data-h="…" (appui long). */
  _a(act) {
    if (!act || act.action === "none") return "";
    this._acts.push(act);
    return String(this._acts.length - 1);
  }

  /** Attributs d'un élément cliquable : clic, appui long, accessibilité. */
  _click(tap, hold, label) {
    const t = this._a(tap);
    const h = this._a(hold);
    let s = "";
    if (t !== "") s += ` data-a="${t}"`;
    if (h !== "") s += ` data-h="${h}"`;
    if (s) s += ` role="button" tabindex="0"`;
    if (label) s += ` aria-label="${esc(label)}"`;
    return s;
  }

  /** Action de la configuration (tap_action…), ou action par défaut. */
  _cfgAct(cfg, def, entity) {
    if (cfg === undefined || cfg === null) return def ? { entity, ...def } : null;
    if (typeof cfg === "string") return { action: cfg, entity };
    return { entity, ...cfg };
  }

  _setup() {
    this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    let timer = null;
    let held = false;
    let start = null;
    root.addEventListener("pointerdown", (ev) => {
      held = false;
      if (ev.target.closest?.("input[type=range]")) this._busy = true;
      const el = ev.target.closest?.("[data-h]");
      if (!el) return;
      start = [ev.clientX, ev.clientY];
      clearTimeout(timer);
      timer = setTimeout(() => {
        held = true;
        this._run(Number(el.dataset.h), el);
      }, 500);
    });
    root.addEventListener("pointermove", (ev) => {
      if (start && Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) > 12) clearTimeout(timer);
    });
    const end = () => {
      clearTimeout(timer);
      start = null;
      if (this._busy) {
        this._busy = false;
        setTimeout(() => this._update(true), 50);
      }
    };
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);
    root.addEventListener("click", (ev) => {
      if (held) { held = false; ev.stopPropagation(); return; }
      const el = ev.target.closest?.("[data-a]");
      if (!el) return;
      ev.stopPropagation();
      this._run(Number(el.dataset.a), el);
    });
    root.addEventListener("change", (ev) => {
      const el = ev.target.closest?.("[data-chg]");
      if (el) this._run(Number(el.dataset.chg), el, el.value);
    });
    root.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches?.("[role=button]")) {
        ev.preventDefault();
        ev.target.click();
      }
    });
    root.addEventListener("contextmenu", (ev) => { if (ev.target.closest?.("[data-h]")) ev.preventDefault(); });
  }

  _run(i, el, value) {
    const act = this._acts?.[i];
    if (!act) return;
    if (act.confirm) {
      const key = `${i}:${act.entity || act.perform_action || act.service || ""}`;
      if (this._ui.confirm !== key) {
        this._ui = { ...this._ui, confirm: key };
        this._update(true);
        clearTimeout(this._confirmTimer);
        this._confirmTimer = setTimeout(() => { this._ui = { ...this._ui, confirm: null }; this._update(true); }, 3000);
        return;
      }
      this._ui = { ...this._ui, confirm: null };
    }
    this._exec(act, value);
  }

  _exec(act, value) {
    const h = this._hass;
    const e = act.entity;
    switch (act.action) {
      case "fn":
        act.fn(value);
        break;
      case "ui":
        this._ui = { ...this._ui, ...act.set };
        this._update(true);
        break;
      case "toggle": {
        const d = domainOf(e);
        if (d === "lock") h.callService("lock", h.states[e]?.state === "locked" ? "unlock" : "lock", { entity_id: e });
        else if (d === "button" || d === "input_button") h.callService(d, "press", { entity_id: e });
        else if (d === "scene" || d === "script") h.callService(d, "turn_on", { entity_id: e });
        else h.callService("homeassistant", "toggle", { entity_id: e });
        break;
      }
      case "more-info":
        if (e) fire(this, "hass-more-info", { entityId: e });
        break;
      case "navigate":
        navigate(act.navigation_path || act.path);
        break;
      case "url":
        window.open(act.url_path || act.url, "_blank", "noopener");
        break;
      case "call-service":
      case "perform-action": {
        const svc = act.perform_action || act.service;
        if (!svc || !svc.includes(".")) break;
        const [d, s] = svc.split(".");
        const data = { ...(act.data || act.service_data || {}) };
        if (value !== undefined && act.value_key) data[act.value_key] = act.value_num ? Number(value) : value;
        h.callService(d, s, data, act.target);
        break;
      }
      default:
        break;
    }
  }
}

/* ------------------------------------------------------------ éditeur visuel */

const THEME_SELECT = {
  name: "theme",
  selector: {
    select: {
      mode: "dropdown",
      options: [
        { value: "maison", label: "Maison : suit votre thème Home Assistant, avec des touches pastel" },
        { value: "v2", label: "Style MyElectricalData (bleu nuit)" },
        { value: "auto", label: "Style MyElectricalData, clair ou sombre selon Home Assistant" },
        { value: "ha", label: "Thème Home Assistant" },
      ],
    },
  },
};

/** Éditeur : formulaire Home Assistant. Les options absentes du formulaire (listes en YAML) sont conservées. */
function makeEditor(schema, labels, defaults, helper) {
  return class extends HTMLElement {
    setConfig(config) {
      this._config = { ...config };
      this._draw();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._form) this._form.hass = hass;
      else this._draw();
    }

    _draw() {
      if (!this._hass || !this._config) return;
      if (!this._form) {
        if (helper) {
          const p = document.createElement("p");
          p.style.cssText = "margin:0 0 12px;font-size:.88rem;color:var(--secondary-text-color)";
          p.textContent = helper;
          this.appendChild(p);
        }
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (s) => labels[s.name] || s.name;
        this._form.addEventListener("value-changed", (ev) => {
          const v = { ...this._config, ...ev.detail.value };
          for (const k of Object.keys(v)) {
            if (v[k] === "" || v[k] === undefined || (k in defaults && v[k] === defaults[k] && !(k in this._config))) delete v[k];
          }
          this._config = v;
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: v }, bubbles: true, composed: true }));
        });
        this.appendChild(this._form);
      }
      this._form.hass = this._hass;
      this._form.schema = typeof schema === "function" ? schema(this._config) : schema;
      this._form.data = { ...defaults, ...this._config };
    }
  };
}

/* ================================================================== pastilles */

const TEMPO_FR = { bleu: "blue-dark", blue: "blue-dark", blanc: "white", white: "white", rouge: "red", red: "red" };
const tempoKey = (s) => TEMPO_FR[String(s || "").trim().toLowerCase()] || null;

/** Première entité d'état dont l'id correspond. */
const findId = (hass, re, domain) => Object.keys(hass?.states || {}).find((id) => (!domain || domainOf(id) === domain) && re.test(id)) || null;

const OPENING_DC = ["door", "window", "opening", "garage_door"];

/** Imprimante 3D : entités par appareil (Bambu Lab, Moonraker / Klipper, OctoPrint) ou par préfixe. */
const PRN_FIELDS = {
  progress: /_(print_progress|progress|job_percentage)$/,
  remaining: /_(remaining_time|print_time_left|print_eta|time_remaining|approximate_completion_time_left)$/,
  stage: /_(current_stage|print_status|current_print_state|print_state|current_state)$/,
  file: /_(gcode_filename|task_name|filename|current_file|subtask_name|job_name)$/,
  bed: /_(bed_temperature|bed_temp|heater_bed_temperature|actual_bed_temp)$/,
  nozzle: /_(nozzle_temperature|nozzle_temp|extruder_temperature|actual_tool0_temp|tool0_temperature)$/,
  bed_target: /_(target_bed_temperature|bed_target)$/,
  nozzle_target: /_(target_nozzle_temperature|extruder_target|nozzle_target)$/,
  pause: /_(pause_printing|pause_print|pause_job|pause)$/,
  resume: /_(resume_printing|resume_print|resume_job|resume)$/,
  stop: /_(stop_printing|cancel_print|stop_print|cancel_job|stop)$/,
  cover: /_(cover_image|thumbnail|preview)$/,
};
const PRINTING = /^(printing|running|prepare|preparing|imprime|impression|heating)$/i;

function findPrinter(hass, prefix) {
  const ids = Object.keys(hass?.states || {});
  let pre = prefix;
  if (!pre) {
    const prog = ids.find((id) => domainOf(id) === "sensor" && PRN_FIELDS.progress.test(id) && /p1p|p1s|x1c|a1|bambu|printer|imprimante|klipper|moonraker|octoprint|voron|ender|neptune|prusa/.test(id))
      || ids.find((id) => domainOf(id) === "sensor" && /_print_progress$/.test(id));
    if (!prog) return null;
    pre = prog.split(".")[1].replace(PRN_FIELDS.progress, "");
  }
  const out = { prefix: pre };
  const pool = ids.filter((id) => id.split(".")[1].startsWith(pre));
  for (const [k, re] of Object.entries(PRN_FIELDS)) {
    const dom = ["pause", "resume", "stop"].includes(k) ? "button" : k === "cover" ? "image" : "sensor";
    out[k] = pool.find((id) => domainOf(id) === dom && re.test(id)) || null;
  }
  out.camera = pool.find((id) => domainOf(id) === "camera") || findId(hass, new RegExp(`${pre}|bambu|printer|imprimante`), "camera");
  return out.progress || out.stage ? out : null;
}

const CHIP_PRESETS = {
  count: { show: { above: 0 }, name: "x{state|int}", active: true },
  timer: { show: { state_not: ["0", "0:00:00", "0:00", "00:00:00", "unknown", "unavailable", "", "0.0"] }, name: "{state}", active: true },
  flag: { show: { state: "on" }, active: true },
  bin: { icon: "mdi:trash-can", after: "16:00" },
  battery: {},
  goal: {},
  level: {},
};

class MaisonChipsCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison", wrap: true }; }

  _cardClass() { return "bare"; }

  _resolve(c, hass) {
    const ids = Object.keys(hass.states);
    const st = hass.states;
    let chips = c.chips;
    if (!Array.isArray(chips) || !chips.length) {
      chips = [{ type: "tempo" }];
      ids.filter((id) => domainOf(id) === "cover" && ["gate", "garage"].includes(st[id].attributes?.device_class) && shown(hass, id))
        .forEach((id) => chips.push({ type: "gate", entity: id }));
      chips.push({ type: "openings" }, { type: "lights" }, { type: "alarm" }, { type: "vacuum" }, { type: "printer" }, { type: "batteries" });
    }
    // Entités trouvées automatiquement pour les pastilles qui n'en ont pas
    return chips.map((ch) => {
      const x = { ...ch };
      if (x.type === "tempo") {
        x.entity = x.entity || findId(hass, /rte_tempo_couleur_actuelle|tempo_couleur_aujourd|tempo_today|tempo_couleur_du_jour|couleur_tempo_aujourd/, "sensor");
        x.next = x.next || findId(hass, /rte_tempo_prochaine_couleur|tempo_couleur_demain|tempo_tomorrow|couleur_tempo_demain/, "sensor");
      } else if (x.type === "openings" || x.type === "lights" || x.type === "batteries") {
        if (!x.entities) {
          x.entities = ids.filter((id) => {
            if (!shown(hass, id)) return false;
            const dc = st[id].attributes?.device_class;
            if (x.type === "openings") return domainOf(id) === "binary_sensor" && OPENING_DC.includes(dc);
            if (x.type === "lights") return domainOf(id) === "light" && !st[id].attributes?.entity_id; // pas les groupes
            return domainOf(id) === "sensor" && dc === "battery" && st[id].attributes?.unit_of_measurement === "%";
          });
        }
      } else if (x.type === "alarm") {
        x.entity = x.entity || ids.find((id) => domainOf(id) === "alarm_control_panel");
      } else if (x.type === "vacuum") {
        x.entity = x.entity || ids.find((id) => domainOf(id) === "vacuum");
      } else if (x.type === "printer") {
        x.printer = findPrinter(hass, x.prefix);
        x.entity = x.entity || x.printer?.stage || x.printer?.progress || null;
      }
      return x;
    });
  }

  _ids() {
    const out = new Set();
    for (const ch of this._resolved()) {
      [ch.entity, ch.next, ch.goal, ...(ch.entities || [])].forEach((id) => id && out.add(id));
      if (ch.printer) Object.values(ch.printer).forEach((id) => typeof id === "string" && id.includes(".") && out.add(id));
      if (ch.charging?.entity) out.add(ch.charging.entity);
      if (ch.plugged?.entity) out.add(ch.plugged.entity);
      JSON.stringify(ch.show || "").replace(/"entity":"([^"]+)"/g, (m, id) => out.add(id));
      JSON.stringify(ch.name || "").replace(/\{([a-z_]+\.[a-z0-9_]+)/g, (m, id) => out.add(id));
    }
    return [...out];
  }

  /** Une pastille : { icon, name, circle, bg, fg, active, tap, hold } ou null si cachée. */
  _chip(ch, hass) {
    const st = hass.states;
    const e = ch.entity;
    const o = e ? st[e] : null;
    const preset = CHIP_PRESETS[ch.type] || {};
    const m = { ...preset, ...ch };
    let icon = m.icon || o?.attributes?.icon || "mdi:circle-outline";
    let name = m.name === undefined ? null : m.name;
    let circle = null;
    let bg = null;
    let active = !!m.active;
    let tap = this._cfgAct(m.tap_action, null, e);
    const hold = this._cfgAct(m.hold_action, e ? { action: "more-info" } : null, e);

    switch (m.type) {
      case "tempo": {
        if (!o) return null;
        const cur = tempoKey(o.state);
        const nxt = tempoKey(m.next ? st[m.next]?.state : null);
        icon = m.icon || "mdi:lightning-bolt";
        circle = cur ? color(cur) : null;
        bg = nxt ? color(nxt === "white" ? "black" : nxt === "red" ? "pop" : nxt) : null;
        name = m.name ?? null;
        tap = this._cfgAct(m.tap_action, { action: "more-info" }, e);
        break;
      }
      case "gate": {
        if (!o) return null;
        const open = o.state !== "closed";
        icon = m.icon || (open ? "mdi:gate-open" : "mdi:gate");
        if (o.attributes?.device_class === "garage" && !m.icon) icon = open ? "mdi:garage-open-variant" : "mdi:garage-variant";
        name = m.name ?? stateFr(o.state, "cover").toLowerCase();
        circle = open ? null : color("green");
        active = open;
        tap = this._cfgAct(m.tap_action, { action: "toggle" }, e);
        break;
      }
      case "openings":
      case "lights":
      case "batteries": {
        const on = (m.entities || []).filter((id) => {
          const s = st[id];
          if (!s) return false;
          if (m.type === "batteries") return num(s.state) !== null && num(s.state) < Number(m.below ?? 20);
          return s.state === "on";
        });
        if (!on.length) return null;
        icon = m.icon || { openings: "mdi:window-open-variant", lights: "mdi:lightbulb-group", batteries: "mdi:battery-alert-variant-outline" }[m.type];
        name = m.name ? tplText(m.name, hass).replace("{n}", on.length) : `x${on.length}`;
        name = esc(name);
        active = m.type !== "batteries";
        if (m.type === "batteries") circle = color("red");
        tap = this._cfgAct(m.tap_action, on.length === 1 ? { action: "more-info", entity: on[0] } : null, on[0]);
        return { icon, name, circle, bg, active, tap, hold: null, title: on.map((id) => friendly(st[id])).join(", ") };
      }
      case "alarm":
        if (!o || ["disarmed", "unavailable", "unknown"].includes(o.state)) return null;
        icon = m.icon || (o.state === "triggered" ? "mdi:shield-alert" : o.state === "armed_night" ? "mdi:shield-moon" : o.state === "armed_vacation" ? "mdi:shield-airplane" : "mdi:shield-lock");
        name = m.name ?? stateFr(o.state, "alarm_control_panel");
        active = true;
        if (o.state === "triggered") circle = color("red");
        tap = this._cfgAct(m.tap_action, { action: "more-info" }, e);
        break;
      case "vacuum": {
        if (!o || ["docked", "unavailable", "unknown", "off"].includes(o.state)) return null;
        icon = m.icon || "mdi:robot-vacuum";
        const b = num(o.attributes?.battery_level);
        name = m.name ?? (o.state === "error" ? "erreur" : b !== null ? `${Math.round(b)} %` : stateFr(o.state, "vacuum").toLowerCase());
        active = true;
        if (o.state === "error") circle = color("red");
        break;
      }
      case "printer": {
        const p = m.printer;
        if (!p) return null;
        const stage = p.stage ? st[p.stage]?.state : null;
        const prog = num(p.progress ? st[p.progress]?.state : null);
        const printing = (stage && PRINTING.test(stage)) || (!p.stage && prog !== null && prog > 0 && prog < 100);
        if (!printing) return null;
        icon = m.icon || "mdi:printer-3d-nozzle";
        const rem = p.remaining ? st[p.remaining] : null;
        let left = num(rem?.state);
        if (rem && rem.attributes?.device_class === "timestamp") left = (new Date(rem.state).getTime() - Date.now()) / 60000;
        else if (rem && /^(h|hours?)$/.test(rem.attributes?.unit_of_measurement || "")) left = left * 60;
        else if (rem && /^(s|sec)/.test(rem.attributes?.unit_of_measurement || "")) left = left / 60;
        name = m.name ? tpl(m.name, hass, e) : left !== null ? hms(left) : prog !== null ? `${Math.round(prog)} %` : "impression";
        active = true;
        tap = this._cfgAct(m.tap_action, { action: "more-info", entity: p.progress || p.stage }, e);
        return { icon, name: m.name ? name : esc(name), circle, bg, active, tap, hold };
      }
      case "battery": {
        if (!o) return null;
        const b = num(o.state);
        icon = m.icon || (b === null ? "mdi:battery-unknown" : b < 30 ? "mdi:battery-alert-variant-outline" : b >= 95 ? "mdi:battery" : `mdi:battery-${Math.max(10, Math.floor(b / 10) * 10)}`);
        const label = m.label ?? m.title ?? "";
        let txt = `${label ? `${label} ` : ""}${b === null ? "—" : Math.round(b)}%`;
        if (m.charging && cond(m.charging, hass, e)) txt += " | en charge";
        else if (m.plugged && cond(m.plugged, hass, e)) txt += " | branchée";
        name = m.name ? tpl(m.name, hass, e) : esc(txt);
        circle = levelColor(m.levels || [{ above: 60, color: "green" }, { above: 31, color: "orange" }, { color: "red" }], hass, e);
        if (m.show && !cond(m.show, hass, e)) return null;
        return { icon, name, circle, bg: color(m.background), active, tap, hold };
      }
      case "goal": {
        if (!o) return null;
        const cur = num(o.state) || 0;
        const goal = num(m.goal ? st[m.goal]?.state : m.target) || 1;
        const pct = Math.max(0, Math.min(100, (cur / goal) * 100));
        icon = pct >= 100 ? "mdi:check-circle-outline" : pct < 10 ? "mdi:circle-outline" : `mdi:circle-slice-${Math.min(8, Math.floor((pct - 1) / (90 / 8)) + 1)}`;
        circle = color(pct >= 90 ? "green" : pct > 40 ? "orange" : "red");
        break;
      }
      case "bin":
        if (!o) return null;
        if (!cond(m.show || [{ state: "on" }, ...(m.after ? [{ after: m.after }] : [])], hass, e)) return null;
        break;
      default:
        break;
    }

    if (m.show && !["tempo", "gate", "battery", "bin"].includes(m.type) && !cond(m.show, hass, e)) return null;
    if (m.states && o && m.states[o.state]) {
      const s = m.states[o.state];
      if (s.hide) return null;
      if (s.icon) icon = s.icon;
      if (s.name !== undefined) name = s.name;
      if (s.color) circle = color(s.color);
      if (s.background) bg = color(s.background);
      if (s.active !== undefined) active = !!s.active;
    }
    if (m.color && !circle) circle = color(m.color);
    if (m.levels && !["battery", "goal"].includes(m.type)) circle = levelColor(m.levels, hass, e) || circle;
    if (m.background) bg = color(m.background);
    return { icon, name: name === null || name === false ? null : tpl(name, hass, e), circle, bg, active, tap, hold };
  }

  _render(c, hass) {
    const out = [];
    for (const ch of this._resolved()) {
      const v = this._chip(ch, hass);
      if (!v) continue;
      const style = [v.bg ? `background:${v.bg}` : "", v.bg ? `color:${onColor(v.bg)}` : ""].filter(Boolean).join(";");
      const cstyle = v.circle ? `background:${v.circle};color:${onColor(v.circle)}` : "";
      out.push(`<div class="chip${v.active ? " act" : ""}${v.name ? "" : " solo"}" style="${style}"${this._click(v.tap, v.hold, v.title || v.name?.replace(/<[^>]+>/g, ""))}${v.title ? ` title="${esc(v.title)}"` : ""}>` +
        `<span class="ci" style="${cstyle}"><ha-icon icon="${esc(v.icon)}"></ha-icon></span>${v.name ? `<span class="cn">${v.name}</span>` : ""}</div>`);
    }
    return `<div class="chips${c.wrap === false ? " scroll" : ""}${c.align === "center" ? " center" : ""}">${out.join("")}</div>`;
  }

  getCardSize() { return 1; }
}
MaisonChipsCard.STYLE = `<style>
ha-card.bare { background: none; border: none; box-shadow: none; overflow: visible; }
.chips { display: flex; flex-wrap: wrap; gap: 10px; padding: 2px 0; }
.chips.center { justify-content: center; }
.chips.scroll { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding-bottom: 4px; }
.chips.scroll::-webkit-scrollbar { display: none; }
.chip { display: inline-flex; align-items: center; padding: 4px; border-radius: 50px; background: var(--m-chip); color: var(--m-text); flex: none; transition: background .2s; }
.chip.act { background: var(--m-pop); color: var(--m-on-pop); }
.ci { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--m-card); color: var(--m-text); flex: none; }
.ci ha-icon { --mdc-icon-size: 22px; }
.cn { padding: 0 12px 0 10px; font-size: 14px; font-weight: 600; white-space: nowrap; }
</style>`;

/* ===================================================================== pièce */

const ROOM_CORNERS = { "top-left": "6px 36px 36px 36px", "top-right": "36px 6px 36px 36px", "bottom-right": "36px 36px 6px 36px", "bottom-left": "36px 36px 36px 6px", none: "36px" };

/** Pièce complétée par la détection automatique (zone Home Assistant). */
function resolveRoom(rc, hass) {
  const r = { ...rc };
  let areaId = r.area;
  if (areaId && !hass.areas?.[areaId]) {
    const a = areasOf(hass).find((x) => x.name?.toLowerCase() === String(areaId).toLowerCase());
    areaId = a?.area_id || areaId;
  }
  const area = areaId ? hass.areas?.[areaId] : null;
  r.areaId = areaId;
  if (area) {
    r.name = r.name ?? area.name;
    r.icon = r.icon ?? area.icon;
    const sens = (dc) => {
      const pref = dc === "temperature" ? area.temperature_entity_id : area.humidity_entity_id;
      if (pref && hass.states[pref]) return pref;
      return entitiesIn(hass, areaId, "sensor", (s) => s.attributes?.device_class === dc && num(s.state) !== null)
        .sort((a, b) => (/cpu|processor|processeur|battery|batterie/.test(a) ? 1 : 0) - (/cpu|processor|processeur|battery|batterie/.test(b) ? 1 : 0))[0];
    };
    r.temperature = r.temperature ?? sens("temperature");
    r.humidity = r.humidity ?? sens("humidity");
    r.doors = r.doors ?? entitiesIn(hass, areaId, "binary_sensor", (s) => OPENING_DC.includes(s.attributes?.device_class));
    r.lights = r.lights ?? entitiesIn(hass, areaId, "light", (s) => !s.attributes?.entity_id);
    r.media_player = r.media_player ?? entitiesIn(hass, areaId, "media_player")[0];
  }
  r.doors = [].concat(r.doors || []).filter(Boolean);
  r.lights = [].concat(r.lights || []).filter(Boolean);
  return r;
}

const roomIds = (r) => [r.temperature, r.humidity, r.media_player, r.media_image, ...r.doors, ...r.lights].filter(Boolean);

/** HTML d'une pièce, partagé par la carte pièce et la carte plan. */
function roomHtml(card, r, hass) {
  const st = hass.states;
  const t = num(st[r.temperature]?.state);
  const hu = num(st[r.humidity]?.state);
  const open = r.doors.filter((id) => st[id]?.state === "on");
  const lit = r.lights.filter((id) => st[id]?.state === "on");
  const mp = r.media_player ? st[r.media_player] : null;
  const playing = mp && ["playing", "paused", "buffering"].includes(mp.state);
  const pic = playing ? (r.media_image ? st[r.media_image]?.attributes?.entity_picture : null) || mp.attributes?.entity_picture : null;

  const tap = card._cfgAct(r.tap_action, r.path ? { action: "navigate", navigation_path: r.path } : r.temperature ? { action: "more-info" } : null, r.temperature);
  const hold = card._cfgAct(r.hold_action, r.temperature ? { action: "more-info" } : null, r.temperature);
  const radius = r.radius || ROOM_CORNERS[r.corner || "bottom-right"] || ROOM_CORNERS["bottom-right"];
  const bg = color(r.background) || "var(--m-card)";
  const circle = color(r.color) || "var(--m-chip)";
  const name = tpl(r.name ?? "Pièce", hass);

  let temp = "";
  if (t !== null) {
    const [i, d] = t.toFixed(1).split(".");
    temp = `${i}<small>.${d}</small>°${hu !== null ? `<em>${Math.round(hu)}%</em>` : ""}`;
  } else if (hu !== null) temp = `${Math.round(hu)}<em>%</em>`;

  let mid = "";
  if (playing) {
    const title = mp.attributes?.media_title || mp.attributes?.media_series_title || friendly(mp);
    mid = `<div class="r-media">${pic ? `<img src="${esc(pic)}" alt="" loading="lazy">` : `<ha-icon icon="mdi:play-circle-outline"></ha-icon>`}<span>${esc(title)}</span></div>`;
  } else if (r.graph !== false && r.temperature) {
    const pts = card._hist(r.temperature);
    if (pts) mid = `<div class="r-graph">${spark(pts, 200, 50)}</div>`;
  }

  const badges = [];
  if (open.length) {
    badges.push(`<span class="r-b" title="${esc(open.map((id) => friendly(st[id])).join(", "))}"${card._click({ action: "more-info", entity: open[0] }, null, `${open.length} ouverture(s)`)}><ha-icon icon="mdi:window-open-variant"></ha-icon></span>`);
  }
  if (lit.length) {
    const off = r.lights_action === "more-info" ? { action: "more-info", entity: lit[0] } : { action: "perform-action", perform_action: "light.turn_off", target: { entity_id: lit } };
    badges.push(`<span class="r-b"${card._click(off, { action: "more-info", entity: lit[0] }, `Éteindre ${lit.length} lumière(s)`)} title="${esc(lit.map((id) => friendly(st[id])).join(", "))}"><ha-icon icon="mdi:lightbulb"></ha-icon></span>`);
  }

  return `<div class="room" style="border-radius:${esc(radius)};background:${bg}"${card._click(tap, hold, String(r.name || ""))}>` +
    `<div class="r-i" style="background:${circle}"><ha-icon icon="${esc(r.icon || "mdi:home-outline")}"></ha-icon></div>` +
    `<div class="r-n">${name}</div>${mid}` +
    `<div class="r-t">${temp}</div><div class="r-bs">${badges.join("")}</div></div>`;
}

const ROOM_STYLE = `
.room { position: relative; height: 100%; min-height: var(--room-h, 146px); box-sizing: border-box; overflow: hidden;
  background: var(--m-card); color: var(--m-text); container-type: inline-size; }
.r-i { position: absolute; top: -30px; left: -30px; width: 80px; height: 80px; border-radius: 50%; z-index: 2; }
.r-i ha-icon { position: absolute; left: 35px; top: 37px; --mdc-icon-size: 26px; color: var(--m-pop); opacity: .9; }
.r-n { position: relative; z-index: 2; padding: 10px 10px 0 58px; font-size: .78em; letter-spacing: .3em; line-height: 1.35; text-align: left;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.r-graph { position: absolute; left: 0; right: 0; bottom: 46px; height: 38px; z-index: 1; opacity: .9; }
.r-graph .spark-a { display: none; }
.r-media { position: absolute; left: 10px; right: 10px; top: 52px; bottom: 50px; display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 1; min-height: 0; }
.r-media img { max-width: 100%; flex: 1 1 auto; min-height: 0; object-fit: cover; border-radius: 10px; }
.r-media ha-icon { --mdc-icon-size: 34px; color: var(--m-pop); }
.r-media span { font-size: .7rem; padding-right: 36px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--m-muted); }
.r-t { position: absolute; left: 12px; bottom: 6px; z-index: 2; font-size: min(2.4em, 19cqw); line-height: 1; font-weight: 300; white-space: nowrap; max-width: calc(100% - 52px); overflow: hidden; }
.r-t small { font-size: .55em; }
.r-t em { font-style: normal; font-size: .32em; opacity: .7; margin-left: 2px; }
.r-bs { position: absolute; right: 8px; bottom: 8px; z-index: 3; display: flex; flex-direction: column; gap: 6px; }
.r-b { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--m-pop); color: var(--m-on-pop); }
.r-b ha-icon { --mdc-icon-size: 19px; }
@container (max-width: 150px) { .r-n { padding-left: 52px; letter-spacing: .18em; } }
`;

class MaisonPieceCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison" }; }

  _check(c) {
    if (!c.area && !c.temperature && !c.name) throw new Error("Indiquez une pièce (area) ou au moins un nom et une température");
  }

  _cardClass() { return "bare"; }

  _resolve(c, hass) { return resolveRoom(c, hass); }

  _ids() { return roomIds(this._resolved()); }

  _render(c, hass) {
    const r = this._resolved();
    const h = c.height ? `--room-h:${Number(c.height) || 146}px;` : "";
    return `<div class="wrap" style="${h}">${roomHtml(this, r, hass)}</div>`;
  }

  getCardSize() { return 3; }

  getGridOptions() { return { columns: 4, rows: 3, min_columns: 3, min_rows: 2 }; }
}
MaisonPieceCard.STYLE = `<style>
ha-card.bare { background: none; border: none; box-shadow: none; border-radius: 0; overflow: visible; }
.wrap { height: 100%; }
${ROOM_STYLE}
</style>`;

/* ===================================================================== plan */

class MaisonPlanCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison", row_height: 146 }; }

  _cardClass() { return "bare"; }

  _resolve(c, hass) {
    const tabs = [];
    const mk = (t, key, defIcon) => ({
      key,
      name: t.name ?? "",
      icon: t.icon || defIcon,
      layout: t.layout || null,
      rows: t.rows || null,
      columns: t.columns || 3,
      rooms: (t.rooms || []).map((rc) => resolveRoom(typeof rc === "string" ? { area: rc } : rc, hass)),
    });
    if (c.favorites) tabs.push(mk(Array.isArray(c.favorites) ? { rooms: c.favorites } : c.favorites, "fav", "mdi:heart"));
    if (Array.isArray(c.floors) && c.floors.length) {
      c.floors.forEach((f, i) => tabs.push(mk(f, `f${i}`, f.icon || "mdi:home-floor-0")));
    } else {
      // Automatique : étages et pièces de Home Assistant, pièces qui ont au moins une mesure ou une lumière
      const useful = (a) => {
        const r = resolveRoom({ area: a.area_id }, hass);
        return r.temperature || r.humidity || r.lights.length || r.doors.length ? r : null;
      };
      const floors = floorsOf(hass);
      const areas = areasOf(hass);
      for (const f of floors) {
        const rooms = areas.filter((a) => a.floor_id === f.floor_id).map(useful).filter(Boolean);
        if (rooms.length) tabs.push({ key: f.floor_id, name: f.name, icon: floorIcon(f), columns: 3, rooms });
      }
      const rest = areas.filter((a) => !a.floor_id || !floors.length).map(useful).filter(Boolean);
      if (rest.length) tabs.push({ key: "all", name: floors.length ? "Autres pièces" : "Maison", icon: "mdi:home", columns: 3, rooms: rest });
    }
    return tabs;
  }

  _tab() {
    const tabs = this._resolved();
    const k = this._ui.tab ?? this._config.default;
    const ground = this._config.floors ? null : tabs.find((t) => this._hass?.floors?.[t.key]?.level === 0);
    return tabs.find((t) => t.key === k) || tabs.find((t, i) => String(i) === String(k)) || tabs.find((t) => t.name === k) || ground || tabs[0];
  }

  _ids() {
    const t = this._tab();
    return t ? t.rooms.flatMap(roomIds) : [];
  }

  _render(c, hass) {
    const tabs = this._resolved();
    if (!tabs.length) return `<div class="empty"><b>Aucune pièce</b>Ajoutez des pièces (floors / rooms) ou rangez vos appareils par pièce dans Home Assistant.</div>`;
    const cur = this._tab();
    const nav = tabs.length > 1 || c.title ? `<div class="p-tabs"><div class="p-title">${tpl(c.title ?? (cur.key === "fav" ? "" : cur.name), hass)}</div>${tabs.map((t) => {
      const on = t === cur;
      const big = t.key === "fav";
      return `<span class="p-tab${big ? " big" : ""}${on ? " on" : ""}"${this._click({ action: "ui", set: { tab: t.key } }, null, t.name || "Favoris")} aria-pressed="${on}">` +
        `<span class="p-ti"><ha-icon icon="${esc(t.icon)}"></ha-icon></span>${big ? `<span class="p-tn">${esc(t.name || "Favoris")}</span>` : ""}</span>`;
    }).join("")}</div>` : "";
    const rh = Number(c.row_height) || 146;
    let grid;
    if (cur.layout) {
      const areasCss = String(cur.layout).trim().split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
      grid = `grid-template-columns:repeat(${cur.columns},1fr);grid-template-areas:${esc(areasCss)};${cur.rows ? `grid-template-rows:${esc(cur.rows)}` : `grid-auto-rows:${rh}px`}`;
    } else {
      grid = `grid-template-columns:repeat(${cur.columns},1fr);grid-auto-rows:${Math.round(rh / 2)}px`;
    }
    const cells = cur.rooms.map((r, i) => {
      let pos = "";
      if (cur.layout && r.grid_area) pos = `grid-area:${esc(r.grid_area)}`;
      else if (!cur.layout) pos = `grid-row:span ${r.span ? Number(r.span) * 2 : r.size === "large" || r.tall ? 4 : 2};${r.wide ? "grid-column:span 2;" : ""}`;
      return `<div class="p-cell" style="${pos}">${roomHtml(this, r, hass)}</div>`;
    });
    return `${nav}<div class="p-grid" style="${grid}">${cells.join("")}</div>`;
  }

  getCardSize() { return 6; }
}
MaisonPlanCard.STYLE = `<style>
ha-card.bare { background: none; border: none; box-shadow: none; border-radius: 0; overflow: visible; }
.room { box-shadow: var(--maison-shadow, none); }
.p-tabs { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; }
.p-title { flex: 1; font-size: 16px; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-tab { display: inline-flex; align-items: center; padding: 4px; border-radius: 50px; background: var(--m-text); color: var(--m-card); }
.p-tab .p-ti { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; }
.p-tab ha-icon { --mdc-icon-size: 21px; }
.p-tab.on { background: var(--m-pop); color: var(--m-on-pop); }
.p-tab.big { background: var(--m-chip); color: var(--m-text); }
.p-tab.big .p-ti { background: var(--m-card); color: var(--m-text); }
.p-tab.big.on { background: var(--m-pop); color: var(--m-on-pop); }
.p-tn { padding: 0 12px 0 8px; font-size: 14px; font-weight: 600; }
.p-grid { display: grid; gap: 10px; }
.p-cell { min-width: 0; min-height: 0; }
.p-cell .room { min-height: 0; }
${ROOM_STYLE}
</style>`;

/* ====================================================== sections d'entités */

/** Sections { title, subtitle, entities } depuis la configuration, ou automatiques (par étage, sinon une seule). */
function sectionsOf(c, hass, domain, filter) {
  const norm = (e) => (typeof e === "string" ? { entity: e } : { ...e });
  if (Array.isArray(c.sections) && c.sections.length) {
    return c.sections.map((s) => ({ title: s.title ?? s.name ?? "", subtitle: s.subtitle ?? "", entities: (s.entities || []).map(norm).filter((e) => e.entity) }));
  }
  if (Array.isArray(c.entities) && c.entities.length) return [{ title: c.title ?? "", subtitle: c.subtitle ?? "", entities: c.entities.map(norm).filter((e) => e.entity) }];
  const all = Object.keys(hass.states).filter((id) => domainOf(id) === domain && shown(hass, id) && (!filter || filter(hass.states[id])));
  const floors = floorsOf(hass);
  if (floors.length) {
    const out = floors.map((f) => ({
      title: f.name,
      entities: all.filter((id) => hass.areas?.[areaOf(hass, id)]?.floor_id === f.floor_id).map((id) => ({ entity: id })),
    })).filter((s) => s.entities.length);
    const rest = all.filter((id) => !hass.areas?.[areaOf(hass, id)]?.floor_id);
    if (rest.length) out.push({ title: out.length ? "Autres" : (c.title ?? ""), entities: rest.map((id) => ({ entity: id })) });
    return out;
  }
  return all.length ? [{ title: c.title ?? "", entities: all.map((id) => ({ entity: id })) }] : [];
}

const SECTION_STYLE = `
ha-card.bare { background: none; border: none; box-shadow: none; border-radius: 0; overflow: visible; }
.sec + .sec { margin-top: 14px; }
.sec-t { padding: 4px 10px 8px; font-size: 1.2em; font-weight: 500; letter-spacing: .3em; }
.sec-s { padding: 0 10px 8px; margin-top: -6px; font-size: .9rem; color: var(--m-muted); font-weight: 300; }
.grid { display: grid; gap: 10px; }
`;

const nameOf = (e, o) => e.name ?? (o?.attributes?.friendly_name || e.entity);

/* ================================================== lumières et interrupteurs */

class MaisonBoutonsCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison" }; }

  _cardClass() { return "bare"; }

  _resolve(c, hass) { return sectionsOf(c, hass, "light", (s) => !s.attributes?.entity_id); }

  _ids() {
    const out = new Set();
    for (const s of this._resolved()) {
      for (const e of s.entities) {
        out.add(e.entity);
        JSON.stringify([e.text_on, e.text_off, e.info] ).replace(/(?:\{|"entity":")([a-z_]+\.[a-z0-9_]+)/g, (m, id) => out.add(id));
      }
    }
    return [...out];
  }

  _tile(e, hass) {
    const o = hass.states[e.entity];
    const d = domainOf(e.entity);
    const on = o ? (d === "cover" ? o.state !== "closed" : d === "lock" ? o.state === "unlocked" : ["on", "open", "playing", "home", "cleaning"].includes(o.state)) : false;
    const na = !o || o.state === "unavailable";
    let big = pickText(on ? e.text_on : e.text_off, hass, e.entity);
    if (big === null) big = na ? "Indisp." : on ? "On" : "Off";
    let info = pickText(e.info, hass, e.entity);
    if (info === null && on && d === "light" && num(o?.attributes?.brightness) !== null) info = `${Math.round((num(o.attributes.brightness) / 255) * 100)}%`;
    const bg = on ? color(e.color) || "var(--m-pop)" : "var(--m-card)";
    const fg = on ? onColor(bg) : "var(--m-text)";
    const icon = e.icon || o?.attributes?.icon || { light: "mdi:lightbulb", switch: "mdi:power-socket-eu", fan: "mdi:fan", input_boolean: "mdi:toggle-switch-outline", cover: "mdi:window-shutter", lock: "mdi:lock" }[d] || "mdi:power";
    const tap = this._cfgAct(e.tap_action, { action: "toggle" }, e.entity);
    const hold = this._cfgAct(e.hold_action, { action: "more-info" }, e.entity);
    if (["carre", "carré", "square"].includes(this._config.tile)) {
      // tuile carrée : icône en haut, nom espacé, état en petit ; allumée = fond d'accent doux et icône colorée
      let st = pickText(on ? e.text_on : e.text_off, hass, e.entity);
      if (st === null) st = na ? "indisponible" : on ? "activé" : "désactivé";
      if (info !== null && on) st = `${st} · ${info}`;
      const ic = on ? (color(e.color) || "var(--m-acc)") : "var(--m-text)";
      return `<div class="tile sq${on ? " on" : ""}${na ? " na" : ""}"${this._click(tap, hold, `${nameOf(e, o)} : ${on ? "allumé" : "éteint"}`)} aria-pressed="${on}">` +
        `<ha-icon class="q-i" icon="${esc(icon)}" style="color:${ic}"></ha-icon>` +
        `<div class="q-n">${tpl(nameOf(e, o), hass)}</div><div class="q-s">${st}</div></div>`;
    }
    return `<div class="tile${on ? " on" : ""}${na ? " na" : ""}" style="background:${bg};color:${fg}"${this._click(tap, hold, `${nameOf(e, o)} : ${on ? "allumé" : "éteint"}`)} aria-pressed="${on}">` +
      `<ha-icon class="t-i" icon="${esc(icon)}"></ha-icon>` +
      `<div class="t-s">${big}${info ? `<small>${info}</small>` : ""}</div>` +
      `<ha-icon class="t-sw" icon="${on ? "mdi:toggle-switch" : "mdi:toggle-switch-off"}"></ha-icon>` +
      `<div class="t-n">${tpl(nameOf(e, o), hass)}</div></div>`;
  }

  _render(c, hass) {
    const secs = this._resolved();
    if (!secs.length) return `<div class="empty"><b>Aucune entité</b>Ajoutez « entities » ou « sections » dans la configuration.</div>`;
    const sq = ["carre", "carré", "square"].includes(c.tile);
    const cols = c.columns ? `repeat(${Number(c.columns)},minmax(0,1fr))` : `repeat(auto-fill,minmax(${sq ? 104 : 120}px,1fr))`;
    return secs.map((s) => `<div class="sec">${s.title ? `<div class="sec-t">${tpl(s.title, hass)}</div>` : ""}${s.subtitle ? `<div class="sec-s">${tpl(s.subtitle, hass)}</div>` : ""}` +
      `<div class="grid" style="grid-template-columns:${cols}">${s.entities.map((e) => this._tile(e, hass)).join("")}</div></div>`).join("");
  }

  getCardSize() { return 3; }
}
MaisonBoutonsCard.STYLE = `<style>
${SECTION_STYLE}
.tile { position: relative; height: 114px; box-sizing: border-box; border-radius: var(--m-radius); padding: 14px 10px 14px 18px; overflow: hidden; transition: background .25s; container-type: inline-size; }
.th-v2 .tile, .th-ha .tile { border: 1px solid var(--m-line); }
.t-i { position: absolute; top: 14px; right: 14px; --mdc-icon-size: 28px; opacity: .85; }
.t-s { position: absolute; left: 16px; top: 24px; font-size: clamp(22px, 24cqw, 38px); font-weight: 300; line-height: 1; white-space: nowrap; max-width: calc(100% - 66px); }
.t-s small { display: block; font-size: calc(12px * var(--maison-font-scale, 1)); font-weight: 600; margin-top: 3px; opacity: .85; overflow: hidden; text-overflow: ellipsis; }
.tile:not(.on) .t-s small { color: var(--m-acc); opacity: 1; }
.t-sw { position: absolute; right: 8px; top: 44px; --mdc-icon-size: 50px; opacity: .9; }
.tile:not(.on) .t-sw { opacity: .35; }
.t-n { position: absolute; left: 16px; right: 10px; bottom: 12px; font-size: calc(13px * var(--maison-font-scale, 1)); font-weight: 600; letter-spacing: var(--maison-letter-spacing, .3em); opacity: .75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile.na { opacity: .55; }
.tile.sq { height: auto; aspect-ratio: 1; min-height: 104px; max-height: 140px; padding: 14px 12px; background: var(--m-card); color: var(--m-text);
  box-shadow: var(--maison-shadow, none); display: flex; flex-direction: column; justify-content: flex-end; cursor: pointer; }
.tile.sq.on { background: color-mix(in srgb, var(--m-pop) 55%, var(--m-card)); }
.q-i { position: absolute; top: 14px; left: 12px; --mdc-icon-size: 34px; }
.tile.sq:not(.on) .q-i { opacity: .8; }
.q-n { font-size: calc(15px * var(--maison-font-scale, 1)); font-weight: 600; letter-spacing: var(--maison-letter-spacing, .12em); text-transform: lowercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.q-s { font-size: calc(11px * var(--maison-font-scale, 1)); letter-spacing: var(--maison-letter-spacing, .1em); color: var(--m-muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>`;

/* ===================================================================== volets */

class MaisonVoletsCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison", slider: true }; }

  _cardClass() { return this._config.tabs ? "" : "bare"; }

  _resolve(c, hass) {
    if (Array.isArray(c.tabs) && c.tabs.length) return { tabs: c.tabs.map((t) => ({ ...t, option: t.option ?? t.name })) };
    return { sections: sectionsOf(c, hass, "cover", (s) => s.attributes?.device_class !== "gate" && s.attributes?.device_class !== "garage") };
  }

  _ids() {
    const r = this._resolved();
    const ids = r.tabs ? r.tabs.map((t) => t.entity) : r.sections.flatMap((s) => s.entities.map((e) => e.entity));
    if (this._config.select) ids.push(this._config.select);
    return ids.filter(Boolean);
  }

  _tile(e, hass, inTab) {
    const id = e.entity;
    const o = hass.states[id];
    const pos = num(o?.attributes?.current_position);
    const moving = ["opening", "closing"].includes(o?.state);
    const label = pos !== null ? `${Math.round(pos)}<sup>%</sup>` : `<span class="v-word">${esc(stateFr(o?.state, "cover"))}</span>`;
    const sl = this._ui.sl === id;
    const canPos = pos !== null && (Number(o?.attributes?.supported_features || 0) & 4 || o?.attributes?.supported_features === undefined);
    const slider = this._config.slider !== false && canPos && sl
      ? `<div class="v-sl"><input type="range" min="0" max="100" step="1" value="${Math.round(pos)}" aria-label="Position de ${esc(nameOf(e, o))}" data-chg="${this._a({ action: "perform-action", perform_action: "cover.set_cover_position", target: { entity_id: id }, value_key: "position", value_num: true })}"></div>`
      : "";
    const btn = (icon, act, lbl, cls = "") => `<span class="rb${cls}"${this._click(act, null, lbl)}><ha-icon icon="${icon}"></ha-icon></span>`;
    const mid = canPos && this._config.slider !== false
      ? `<span class="rb${sl ? " on" : ""}"${this._click({ action: "ui", set: { sl: sl ? null : id } }, { action: "perform-action", perform_action: "cover.stop_cover", target: { entity_id: id } }, "Curseur (appui long : stop)")}><ha-icon icon="mdi:menu"></ha-icon></span>`
      : btn("mdi:stop", { action: "perform-action", perform_action: "cover.stop_cover", target: { entity_id: id } }, "Stop", moving ? " on" : "");
    const tap = this._cfgAct(e.tap_action, { action: "more-info" }, id);
    return `<div class="vt${inTab ? " in-tab" : ""}">` +
      `<div class="v-txt"${this._click(tap, null, nameOf(e, o))}><div class="v-l">${label}</div><div class="v-n">${tpl(nameOf(e, o), hass)}</div>` +
      `<div class="v-st">${esc(moving ? stateFr(o.state, "cover") : stateFr(o?.state, "cover"))}${o?.last_changed ? ` · ${esc(relTime(o.last_changed) || "")}` : ""}</div></div>` +
      `${slider}<div class="rbar col">${btn("mdi:chevron-up", { action: "perform-action", perform_action: "cover.open_cover", target: { entity_id: id } }, "Ouvrir", o?.state === "opening" ? " on" : "")}` +
      `${mid}${btn("mdi:chevron-down", { action: "perform-action", perform_action: "cover.close_cover", target: { entity_id: id } }, "Fermer", o?.state === "closing" ? " on" : "")}</div></div>`;
  }

  _render(c, hass) {
    const r = this._resolved();
    if (r.tabs) {
      const selOpt = c.select ? hass.states[c.select]?.state : null;
      const cur = r.tabs.find((t) => selOpt !== null && String(t.option) === String(selOpt)) || r.tabs.find((t) => t.entity === this._ui.tab) || r.tabs[0];
      const bar = r.tabs.map((t) => {
        const on = t === cur;
        const act = c.select
          ? { action: "perform-action", perform_action: `${domainOf(c.select)}.select_option`, target: { entity_id: c.select }, data: { option: t.option } }
          : { action: "ui", set: { tab: t.entity } };
        return `<span class="rb${on ? " on" : ""}"${this._click(act, null, t.name)} aria-pressed="${on}"><ha-icon icon="${esc(t.icon || "mdi:window-shutter")}"></ha-icon></span>`;
      }).join("");
      return `<div class="v-tabs">${this._tile({ ...cur, name: cur.title ?? cur.name }, hass, true)}<div class="v-bar"><div class="rbar">${bar}</div></div></div>`;
    }
    if (!r.sections.length) return `<div class="empty"><b>Aucun volet</b>Ajoutez « entities » ou « sections » dans la configuration.</div>`;
    const cols = c.columns ? `repeat(${Number(c.columns)},minmax(0,1fr))` : "repeat(auto-fill,minmax(215px,1fr))";
    return r.sections.map((s) => `<div class="sec">${s.title ? `<div class="sec-t">${tpl(s.title, hass)}</div>` : ""}` +
      `<div class="grid" style="grid-template-columns:${cols}">${s.entities.map((e) => this._tile(e, hass, false)).join("")}</div></div>`).join("");
  }

  getCardSize() { return 4; }
}
MaisonVoletsCard.STYLE = `<style>
${SECTION_STYLE}
.vt { display: flex; align-items: stretch; gap: 10px; padding: 18px 14px 18px 20px; border-radius: 20px; background: var(--m-card); min-height: 168px; box-sizing: border-box; }
.th-v2 .vt:not(.in-tab), .th-ha .vt:not(.in-tab) { border: 1px solid var(--m-line); }
.vt.in-tab { background: none; padding: 16px 16px 6px 20px; }
.v-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: flex-start; }
.v-l { font-size: 4.2em; font-weight: 400; line-height: 1; }
.v-l sup { font-size: .32em; vertical-align: top; position: relative; top: .35em; margin-left: 2px; }
.v-word { font-size: .45em; font-weight: 500; }
.v-n { margin-top: auto; font-size: 1.15em; font-weight: 500; letter-spacing: .22em; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.v-st { font-size: 12px; color: var(--m-muted); margin-top: 2px; }
.v-sl { display: flex; align-items: center; }
.v-sl input { writing-mode: vertical-lr; direction: rtl; width: 40px; height: 150px; margin: 0; accent-color: var(--m-pop); cursor: pointer; }
.v-bar { padding: 4px 14px 14px; display: flex; justify-content: center; }
.v-bar .rbar { width: 100%; max-width: 360px; justify-content: space-around; }
</style>`;

/* ===================================================================== alarme */

const ALARM_MODES = {
  away: { feat: 2, icon: "mdi:shield-lock", svc: "alarm_arm_away", state: "armed_away", label: "Absent" },
  home: { feat: 1, icon: "mdi:shield-home", svc: "alarm_arm_home", state: "armed_home", label: "Présence" },
  night: { feat: 4, icon: "mdi:shield-moon", svc: "alarm_arm_night", state: "armed_night", label: "Nuit" },
  vacation: { feat: 32, icon: "mdi:shield-airplane", svc: "alarm_arm_vacation", state: "armed_vacation", label: "Vacances" },
  custom_bypass: { feat: 16, icon: "mdi:shield-half-full", svc: "alarm_arm_custom_bypass", state: "armed_custom_bypass", label: "Personnalisé" },
  disarm: { feat: 0, icon: "mdi:shield-off", svc: "alarm_disarm", state: "disarmed", label: "Désarmer" },
};
const ALARM_ICON = {
  disarmed: "mdi:shield-off", armed_away: "mdi:shield-lock", armed_home: "mdi:shield-home", armed_night: "mdi:shield-moon",
  armed_vacation: "mdi:shield-airplane", armed_custom_bypass: "mdi:shield-half-full", arming: "mdi:shield", pending: "mdi:shield",
  disarming: "mdi:shield", triggered: "mdi:shield-alert",
};

class MaisonAlarmeCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison" }; }

  _resolve(c, hass) {
    return { entity: c.entity || Object.keys(hass.states).find((id) => domainOf(id) === "alarm_control_panel") || null };
  }

  _ids() { return [this._resolved().entity].filter(Boolean); }

  _cardClass() {
    const o = this._hass?.states?.[this._resolved().entity];
    return o?.state === "triggered" ? "trig" : "";
  }

  _modes(o) {
    if (Array.isArray(this._config.modes)) return this._config.modes.filter((m) => ALARM_MODES[m]);
    const f = num(o?.attributes?.supported_features);
    if (f === null) return ["away", "night", "vacation", "disarm"];
    return ["away", "home", "night", "vacation", "custom_bypass"].filter((m) => f & ALARM_MODES[m].feat).concat("disarm");
  }

  _send(mode, code) {
    const id = this._resolved().entity;
    const data = { entity_id: id };
    if (code) data.code = code;
    this._hass.callService("alarm_control_panel", ALARM_MODES[mode].svc, data);
  }

  _press(mode) {
    const o = this._hass.states[this._resolved().entity];
    const needCode = o?.attributes?.code_format && (mode === "disarm" || o.attributes.code_arm_required !== false);
    if (needCode && !this._config.code) {
      this._ui = { ...this._ui, pad: mode, code: "" };
      this._update(true);
      return;
    }
    this._send(mode, this._config.code ? String(this._config.code) : undefined);
  }

  _render(c, hass) {
    const id = this._resolved().entity;
    const o = hass.states[id];
    if (!o) return `<div class="empty"><b>Aucune alarme</b>Indiquez « entity: alarm_control_panel.… ».</div>`;
    const s = o.state;
    const names = { ...STATE_FR.alarm_control_panel, ...(c.state_names || {}) };
    const pending = ["arming", "pending", "disarming"].includes(s);
    const target = pending ? (o.attributes?.next_state || o.attributes?.arm_mode || null) : null;
    const btns = this._modes(o).map((m) => {
      const def = ALARM_MODES[m];
      const on = s === def.state;
      const blink = pending && (target === def.state || (!target && m !== "disarm" && s === "arming"));
      return `<span class="rb${on ? " on" : ""}${blink ? " blink" : ""}"${this._click({ action: "fn", fn: () => this._press(m) }, null, def.label)} aria-pressed="${on}" title="${def.label}"><ha-icon icon="${def.icon}"></ha-icon></span>`;
    }).join("");
    const tap = this._cfgAct(c.tap_action, null, id);
    let pad = "";
    if (this._ui.pad) {
      const code = this._ui.code || "";
      const key = (k, lbl, fn) => `<span class="k"${this._click({ action: "fn", fn }, null, lbl)}>${k}</span>`;
      const add = (d) => () => { this._ui = { ...this._ui, code: (this._ui.code || "") + d }; this._update(true); };
      const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => key(d, d, add(d)));
      keys.push(key(`<ha-icon icon="mdi:backspace-outline"></ha-icon>`, "Effacer", () => { this._ui = { ...this._ui, code: (this._ui.code || "").slice(0, -1) }; this._update(true); }));
      keys.push(key("0", "0", add("0")));
      keys.push(key(`<ha-icon icon="mdi:check"></ha-icon>`, "Valider", () => { const m = this._ui.pad; const cd = this._ui.code; this._ui = { ...this._ui, pad: null, code: "" }; this._send(m, cd); this._update(true); }));
      pad = `<div class="pad"><div class="pad-h"><span>${esc(ALARM_MODES[this._ui.pad].label)} : code</span><span class="dots">${"●".repeat(code.length) || "&nbsp;"}</span>` +
        `<span class="rb"${this._click({ action: "ui", set: { pad: null, code: "" } }, null, "Annuler")}><ha-icon icon="mdi:close"></ha-icon></span></div><div class="keys">${keys.join("")}</div></div>`;
    }
    return `<div class="al${pending ? " pend" : ""}"${tap ? this._click(tap, { action: "more-info", entity: id }, friendly(o)) : ""}>` +
      `<div class="al-bg"><ha-icon icon="${ALARM_ICON[s] || "mdi:shield"}"></ha-icon></div>` +
      `<div class="al-n">${esc(names[s] || s)}</div>` +
      `<div class="al-l">${tpl(c.name ?? friendly(o), hass)}${o.last_changed ? ` · ${esc(relTime(o.last_changed) || "")}` : ""}</div>` +
      `<div class="al-b"><div class="rbar col">${btns}</div></div>${pad}</div>`;
  }

  getCardSize() { return 4; }
}
MaisonAlarmeCard.STYLE = `<style>
.al { position: relative; min-height: 240px; padding: 20px; box-sizing: border-box; overflow: hidden; display: grid; grid-template-columns: 1fr auto; grid-template-rows: min-content 1fr; gap: 2px 12px; }
.al-n { grid-column: 1; font-size: 1.5em; font-weight: 400; letter-spacing: .3em; position: relative; z-index: 2; }
.al-l { grid-column: 1; font-size: 12px; font-weight: 500; color: var(--m-muted); position: relative; z-index: 2; align-self: start; }
.al-b { grid-column: 2; grid-row: 1 / span 2; position: relative; z-index: 2; }
.al-b .rbar { background: var(--m-chip); }
.al-bg { position: absolute; left: -90px; bottom: -150px; width: 300px; height: 300px; border-radius: 50%; background: var(--m-chip); z-index: 1; }
.al-bg ha-icon { position: absolute; left: 110px; top: 22px; --mdc-icon-size: 140px; color: var(--m-pop); opacity: .8; }
.rb.blink { background: var(--m-orange); animation: m-flash 2.5s linear infinite; }
.pend .al-bg ha-icon { animation: m-flash 2.5s linear infinite; color: var(--m-orange); }
ha-card.trig { background: var(--m-red); color: #fff; }
ha-card.trig .al-l { color: rgba(255,255,255,.85); }
ha-card.trig .al-bg { background: rgba(255,255,255,.18); }
ha-card.trig .al-bg ha-icon { color: #fff; animation: m-flash 1.2s infinite; }
.pad { position: absolute; inset: 0; z-index: 5; background: var(--m-card); padding: 14px; display: flex; flex-direction: column; gap: 10px; color: var(--m-text); }
.pad-h { display: flex; align-items: center; gap: 10px; font-size: .95rem; }
.pad-h .dots { flex: 1; text-align: center; letter-spacing: .3em; font-size: 1.1rem; }
.keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; flex: 1; }
.k { display: grid; place-items: center; border-radius: 14px; background: var(--m-chip); font-size: 1.3rem; min-height: 40px; }
</style>`;

/* ======================================================================= mode */

const MODE_ICONS = [
  [/^(off|arr[eê]t|power_?off|eteint|éteint)$/i, "mdi:power"],
  [/nuit|night|sleep/i, "mdi:moon-waning-crescent"],
  [/confort|comfort/i, "mdi:thermometer-plus"],
  [/r[eé]duit|eco/i, "mdi:leaf"],
  [/hors.?gel|frost/i, "mdi:snowflake-thermometer"],
  [/vacances|away|absent|holiday/i, "mdi:airplane"],
  [/turbo|boost/i, "mdi:fire"],
  [/marche.?forc|manuel|manual|forc/i, "mdi:toggle-switch-outline"],
  [/[eé]lectrique|electric/i, "mdi:lightning-bolt"],
  [/chaudi[eè]re|boiler|gaz|fioul/i, "mdi:water-boiler"],
  [/home.?office|bureau|t[eé]l[eé]travail/i, "mdi:desk"],
  [/^(auto|automatique|automatic)$/i, "mdi:autorenew"],
  [/^rdc$|rez/i, "mdi:home-floor-0"],
  [/[eé]tage|upstairs/i, "mdi:home-floor-1"],
  [/maison|home|tout/i, "mdi:home"],
  [/[eé]t[eé]|summer/i, "mdi:white-balance-sunny"],
  [/hiver|winter/i, "mdi:snowflake"],
  [/film|movie|cin[eé]/i, "mdi:movie-open"],
  [/ps5|ps4|playstation/i, "mdi:sony-playstation"],
  [/switch|nintendo/i, "mdi:nintendo-switch"],
  [/xbox/i, "mdi:microsoft-xbox"],
  [/tv|t[eé]l[eé]/i, "mdi:television"],
  [/musique|music/i, "mdi:music"],
];
const modeIcon = (opt) => (MODE_ICONS.find(([re]) => re.test(String(opt).trim())) || [null, "mdi:circle-medium"])[1];

class MaisonModeCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison" }; }

  _check(c) {
    if (!c.entity || !["input_select", "select"].includes(domainOf(c.entity))) throw new Error("Indiquez « entity: input_select.… » ou « select.… »");
  }

  _ids() {
    const out = new Set([this._config.entity]);
    JSON.stringify([this._config.info, this._config.name, this._config.options]).replace(/\{([a-z_]+\.[a-z0-9_]+)/g, (m, id) => out.add(id));
    return [...out];
  }

  _render(c, hass) {
    const o = hass.states[c.entity];
    if (!o) return `<div class="empty"><b>Entité introuvable</b>${esc(c.entity)}</div>`;
    const avail = o.attributes?.options || [];
    let opts = Array.isArray(c.options) && c.options.length
      ? c.options.map((x) => (typeof x === "string" ? { option: x } : x))
      : avail.map((x) => ({ option: x }));
    if (c.hide_options) opts = opts.filter((x) => !c.hide_options.includes(x.option));
    const cur = opts.find((x) => String(x.option) === String(o.state));
    const label = cur?.name ?? o.state;
    const info = pickText(cur?.info ?? c.info, hass, c.entity);
    const svc = `${domainOf(c.entity)}.select_option`;
    const btns = opts.map((x) => {
      const on = String(x.option) === String(o.state);
      const bg = on && x.color ? color(x.color) : null;
      return `<span class="rb${on ? " on" : ""}" ${bg ? `style="background:${bg};color:${onColor(bg)}"` : ""}${this._click({ action: "perform-action", perform_action: svc, target: { entity_id: c.entity }, data: { option: x.option } }, null, x.name ?? x.option)} aria-pressed="${on}" title="${esc(x.name ?? x.option)}"><ha-icon icon="${esc(x.icon || modeIcon(x.option))}"></ha-icon></span>`;
    }).join("");
    const tap = this._cfgAct(c.tap_action, null, c.entity);
    return `<div class="md"><div class="md-h"${tap ? this._click(tap, { action: "more-info", entity: c.entity }, friendly(o)) : ""}>` +
      `<div class="md-n">${c.name !== undefined ? tpl(c.name, hass, c.entity) : esc(label)}${info ? `<span class="md-i">${info}</span>` : ""}</div>` +
      `${c.subtitle !== undefined ? `<div class="md-s">${tpl(c.subtitle, hass, c.entity)}</div>` : ""}` +
      `<ha-icon class="md-ic" icon="${esc(c.icon || o.attributes?.icon || (cur ? cur.icon || modeIcon(cur.option) : "mdi:tune-variant"))}"></ha-icon></div>` +
      `<div class="rbar">${btns}</div></div>`;
  }

  getCardSize() { return 2; }
}
MaisonModeCard.STYLE = `<style>
.md { padding: 10px; }
.md-h { position: relative; padding: 6px 48px 4px 10px; min-height: 34px; }
.md-n { font-size: 1.5em; font-weight: 400; letter-spacing: .3em; line-height: 1.25; overflow-wrap: anywhere; }
.md-i { font-size: .45em; font-weight: 600; letter-spacing: 0; color: var(--m-acc); margin-left: 6px; vertical-align: middle; }
.md-s { font-size: 12px; color: var(--m-muted); font-weight: 500; }
.md-ic { position: absolute; right: 8px; top: 6px; --mdc-icon-size: 30px; opacity: .8; }
.md .rbar { margin-top: 10px; justify-content: space-between; }
.md .rb { max-width: none; }
</style>`;

/* ======================================================= outils « appareil » */

/** Entités d'un même appareil (registre), sinon de même préfixe d'entity_id. */
function poolOf(hass, anchor, prefix) {
  const ids = Object.keys(hass.states);
  const dev = anchor ? regOf(hass, anchor)?.device_id : null;
  if (dev) {
    const p = ids.filter((id) => regOf(hass, id)?.device_id === dev);
    if (p.length > 1) return p;
  }
  const pre = prefix || (anchor ? anchor.split(".")[1].split("_")[0] : null);
  return pre ? ids.filter((id) => id.split(".")[1].startsWith(pre)) : [];
}
const pick = (pool, domain, re, not) => pool.find((id) => domainOf(id) === domain && re.test(id.split(".")[1]) && !(not && not.test(id.split(".")[1]))) || null;

/** Tuile de valeur : libellé, grande valeur, barre facultative. */
const tileHtml = (label, value, unit, bar, barColor, extra = "") =>
  `<div class="vt2"${extra}><div class="vt2-l">${label}</div><div class="vt2-v">${value}${unit ? `<span>${unit}</span>` : ""}</div>` +
  `${bar !== null && bar !== undefined ? `<div class="bar-p"><i style="width:${Math.max(0, Math.min(100, bar))}%;background:${barColor || "var(--m-pop)"}"></i></div>` : ""}</div>`;

const DEVICE_STYLE = `
.dv { padding: 16px; }
.dv-h { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.dv-ic { width: 48px; height: 48px; border-radius: 50%; background: var(--m-chip); display: grid; place-items: center; flex: none; }
.dv-ic ha-icon { --mdc-icon-size: 28px; color: var(--m-acc); }
.dv-t { flex: 1; min-width: 0; }
.dv-n { font-size: 1.35em; font-weight: 500; letter-spacing: .3em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dv-s { font-size: .85rem; color: var(--m-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dv-g { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.vt2 { background: var(--m-chip); border-radius: 16px; padding: 12px 12px 10px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.vt2-l { font-size: .78rem; color: var(--m-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vt2-v { font-size: 1.7rem; font-weight: 300; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vt2-v span { font-size: .5em; margin-left: 3px; color: var(--m-muted); font-weight: 500; }
.vt2 .bar-p { margin-top: auto; height: 10px; }
.dv-alert { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--m-pop); color: var(--m-on-pop); margin-bottom: 12px; font-weight: 600; }
.dv-alert.err { background: var(--m-red); }
.dv-alert span { flex: 1; }
.dv-alert .rb { width: 36px; height: 36px; flex: none; background: rgba(255,255,255,.35); }
.dv-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; align-items: center; }
.dv-row .rbar { flex: 1; justify-content: space-around; }
.chipx { padding: 6px 12px; border-radius: 50px; background: var(--m-chip); font-size: .82rem; font-weight: 600; }
.chipx.on { background: var(--m-pop); color: var(--m-on-pop); }
.cam { margin-top: 12px; border-radius: 16px; overflow: hidden; background: var(--m-chip); aspect-ratio: 16 / 9; display: grid; place-items: center; }
.cam img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cam ha-icon { --mdc-icon-size: 40px; color: var(--m-muted); }
.btns { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; margin-top: 12px; }
.btn { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 14px; border-radius: 18px; background: var(--m-pop); color: var(--m-on-pop); font-weight: 500; min-height: 70px; box-sizing: border-box; }
.btn.alt { background: var(--m-chip); color: var(--m-text); }
.btn.warn { background: var(--m-red); color: #fff; }
.btn.off { background: var(--m-chip); color: var(--m-muted); opacity: .55; pointer-events: none; }
`;

const levelBar = (v, hi = 60, lo = 35) => (v === null ? null : v >= hi ? "var(--m-green)" : v <= lo ? "var(--m-pop)" : "var(--m-orange)");

/* ================================================================= robot */

class MaisonRobotCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison" }; }

  _resolve(c, hass) {
    const e = c.entity || Object.keys(hass.states).find((id) => domainOf(id) === "vacuum") || null;
    if (!e) return { entity: null };
    const pool = poolOf(hass, e, c.prefix);
    return {
      entity: e,
      battery: c.battery ?? pool.find((id) => domainOf(id) === "sensor" && hass.states[id].attributes?.device_class === "battery") ?? null,
      area: c.area ?? pick(pool, "sensor", /cleaning_area|clean_area|surface|superficie/, /total/),
      duration: c.duration ?? pick(pool, "sensor", /cleaning_time|clean_time|duree_de_nettoyage|temps_de_nettoyage/, /total/),
      alert: c.alert ?? null,
    };
  }

  _ids() { const r = this._resolved(); return [r.entity, r.battery, r.area, r.duration, r.alert].filter(Boolean); }

  _render(c, hass) {
    const r = this._resolved();
    const o = r.entity ? hass.states[r.entity] : null;
    if (!o) return `<div class="empty"><b>Aucun aspirateur</b>Indiquez « entity: vacuum.… ».</div>`;
    const s = o.state;
    const bat = num(r.battery ? hass.states[r.battery]?.state : o.attributes?.battery_level);
    const area = num(hass.states[r.area]?.state);
    const dur = num(hass.states[r.duration]?.state);
    const f = num(o.attributes?.supported_features) ?? 0xffff;
    const cleaning = s === "cleaning";
    const svc = (x) => ({ action: "perform-action", perform_action: `vacuum.${x}`, target: { entity_id: r.entity } });
    const alertOn = r.alert && hass.states[r.alert]?.state === "on";
    const err = s === "error" ? (o.attributes?.error || o.attributes?.status || "Erreur") : null;
    const banners = (alertOn
      ? `<div class="dv-alert"><ha-icon icon="mdi:delete-empty-outline"></ha-icon><span>${tpl(c.alert_text ?? "Vider le bac à poussière !", hass)}</span>` +
        `<span class="rb"${this._click({ action: "perform-action", perform_action: "homeassistant.turn_off", target: { entity_id: r.alert } }, null, "C'est fait")}><ha-icon icon="mdi:check"></ha-icon></span></div>`
      : "") + (err ? `<div class="dv-alert err"><ha-icon icon="mdi:alert"></ha-icon><span>${esc(err)}</span></div>` : "");
    const speeds = o.attributes?.fan_speed_list || [];
    const fan = speeds.length && speeds.length <= 6 && c.show_fan_speed !== false
      ? `<div class="dv-row">${speeds.map((sp) => `<span class="chipx${sp === o.attributes?.fan_speed ? " on" : ""}"${this._click({ action: "perform-action", perform_action: "vacuum.set_fan_speed", target: { entity_id: r.entity }, data: { fan_speed: sp } }, null, `Puissance ${sp}`)}>${esc(sp)}</span>`).join("")}</div>`
      : "";
    const btn = (icon, act, lbl, on) => `<span class="rb${on ? " on" : ""}"${this._click(act, null, lbl)} title="${lbl}"><ha-icon icon="${icon}"></ha-icon></span>`;
    const bar = [
      cleaning ? btn("mdi:pause", svc("pause"), "Pause", true) : btn("mdi:play", svc("start"), "Démarrer", false),
      f & 8 ? btn("mdi:stop", svc("stop"), "Arrêter") : "",
      btn("mdi:home-import-outline", svc("return_to_base"), "Retour à la base", s === "returning"),
      f & 512 ? btn("mdi:map-marker-question-outline", svc("locate"), "Localiser") : "",
    ].join("");
    return `<div class="dv">${banners}<div class="dv-h"><div class="dv-ic"><ha-icon icon="${esc(c.icon || "mdi:robot-vacuum")}"></ha-icon></div>` +
      `<div class="dv-t"${this._click({ action: "more-info", entity: r.entity }, null, friendly(o))}><div class="dv-n">${tpl(c.name ?? friendly(o), hass)}</div><div class="dv-s">${esc(stateFr(s, "vacuum"))}${o.attributes?.status && ![s, stateFr(s, "vacuum")].map((x) => String(x).toLowerCase()).includes(String(o.attributes.status).toLowerCase()) ? ` · ${esc(o.attributes.status)}` : ""}</div></div></div>` +
      `<div class="dv-g">${tileHtml("Batterie", fmt(bat), "%", bat, levelBar(bat))}` +
      `${r.area ? tileHtml("Surface", fmt(area), esc(hass.states[r.area]?.attributes?.unit_of_measurement || "m²")) : ""}` +
      `${r.duration ? tileHtml("Durée", fmt(dur), esc(hass.states[r.duration]?.attributes?.unit_of_measurement || "min")) : ""}</div>` +
      `${fan}<div class="dv-row"><div class="rbar">${bar}</div></div></div>`;
  }

  getCardSize() { return 4; }
}
MaisonRobotCard.STYLE = `<style>${DEVICE_STYLE}</style>`;

/* ================================================================ voiture */

const CAR_PLATFORMS = ["tesla_fleet", "teslemetry", "tessie", "tesla_custom", "tesla"];

class MaisonVoitureCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison", icon: "mdi:car-electric" }; }

  _resolve(c, hass) {
    let anchor = c.battery || null;
    if (!anchor && !c.prefix) {
      anchor = Object.keys(hass.states).find((id) => domainOf(id) === "sensor" && CAR_PLATFORMS.includes(regOf(hass, id)?.platform) && /battery_level|battery$|_soc$/.test(id)) || null;
    }
    const pool = anchor || c.prefix ? poolOf(hass, anchor, c.prefix) : [];
    const f = (k, dom, re, not) => (c[k] !== undefined ? c[k] : pick(pool, dom, re, not));
    return {
      battery: f("battery", "sensor", /battery_level|_battery$|batterie|_soc$|state_of_charge/, /range|temp|voltage/),
      range: f("range", "sensor", /range|autonomie/, /ideal|est_|target/),
      odometer: f("odometer", "sensor", /odometer|kilometrage|mileage|odometre/),
      charging: c.charging !== undefined ? c.charging : pick(pool, "binary_sensor", /charging$|en_charge$|is_charging/) || pick(pool, "sensor", /charging_state|charging_status|charge_state|etat_de_charge/),
      plugged: f("plugged", "binary_sensor", /charger$|charge_cable|plugged|branche|cable|charger_connected/),
      power: f("charger_power", "sensor", /charger_power|charging_power|charge_power|puissance_de_charge/),
      limit: f("charge_limit", "number", /charge_limit|limite_de_charge|charge_target/),
      climate: f("climate", "climate", /./),
      inside: f("inside_temp", "sensor", /inside_temp|interior_temp|temperature_interieure|cabin/),
      lock: f("lock", "lock", /./, /charge_port|frunk|trunk/),
      location: f("location", "device_tracker", /location|position|gps|./),
      switch: f("charge_switch", "switch", /charge$|charging$|_charger$/),
    };
  }

  _ids() { return Object.values(this._resolved()).filter((x) => typeof x === "string"); }

  _chargeText(r, hass) {
    const st = hass.states;
    const chRaw = r.charging ? st[r.charging]?.state : null;
    const pw = num(r.power ? st[r.power]?.state : null);
    const pwU = r.power ? st[r.power]?.attributes?.unit_of_measurement || "kW" : "kW";
    const pwKw = pw === null ? null : /^w$/i.test(pwU) ? pw / 1000 : pw;
    let charging = null;
    if (chRaw !== null && chRaw !== undefined) {
      if (domainOf(r.charging) === "binary_sensor") charging = chRaw === "on";
      else charging = /charging|inprogress|in_progress|en_charge|^on$/i.test(chRaw) ? true : /complete|termin/i.test(chRaw) ? "done" : false;
    }
    const plugged = r.plugged ? st[r.plugged]?.state === "on" : chRaw ? !/disconnected|not_?connected|unplugged|d[eé]branch/i.test(chRaw) : null;
    if (charging === true) return { txt: `En charge${pwKw !== null ? ` à ${fmt(pwKw, pwKw < 10 ? 1 : 0)} kW` : ""}`, on: true };
    if (charging === "done") return { txt: "Charge terminée", on: false };
    if (plugged === false) return { txt: "Débranchée", on: false };
    if (plugged === true) return { txt: "Branchée, en attente", on: false };
    return { txt: chRaw ? stateFr(chRaw) : "—", on: false };
  }

  _render(c, hass) {
    const r = this._resolved();
    const st = hass.states;
    if (!r.battery && !r.range) return `<div class="empty"><b>Voiture introuvable</b>Indiquez « battery: sensor.… » (et les autres capteurs) ou « prefix ».</div>`;
    const bat = num(st[r.battery]?.state);
    const rng = num(st[r.range]?.state);
    const odo = num(st[r.odometer]?.state);
    const ch = this._chargeText(r, hass);
    const lim = num(st[r.limit]?.state);
    const tiles = [
      r.battery ? tileHtml("Batterie", fmt(bat), "%", bat, levelBar(bat), this._click({ action: "more-info", entity: r.battery })) : "",
      r.range ? tileHtml("Autonomie", fmt(rng), esc(st[r.range]?.attributes?.unit_of_measurement || "km"), bat, levelBar(bat), this._click({ action: "more-info", entity: r.range })) : "",
      r.odometer ? tileHtml("Kilométrage", fmt(odo), esc(st[r.odometer]?.attributes?.unit_of_measurement || "km"), null, null, this._click({ action: "more-info", entity: r.odometer })) : "",
      tileHtml("Charge", `<small class="ch${ch.on ? " on" : ""}">${esc(ch.txt)}</small>`, "", lim !== null ? lim : null, "var(--m-faint)", r.switch ? this._click({ action: "toggle", entity: r.switch }, { action: "more-info", entity: r.switch }, "Démarrer / arrêter la charge") : r.charging ? this._click({ action: "more-info", entity: r.charging }) : ""),
    ].join("");
    let clim = "";
    const cl = r.climate ? st[r.climate] : null;
    if (cl) {
      const on = cl.state !== "off";
      const t = num(cl.attributes?.temperature);
      const inside = num(r.inside ? st[r.inside]?.state : cl.attributes?.current_temperature);
      const step = num(cl.attributes?.target_temp_step) || 0.5;
      const set = (v) => ({ action: "perform-action", perform_action: "climate.set_temperature", target: { entity_id: r.climate }, data: { temperature: v } });
      clim = `<div class="cl"><div class="cl-t"${this._click({ action: "more-info", entity: r.climate }, null, "Climatisation")}><span class="vt2-l">Climatisation · intérieur ${fmt(inside, 1)} °C</span>` +
        `<span class="cl-v">${on ? `${fmt(t, 1)}<span>°C</span>` : "Arrêtée"}</span></div><div class="rbar">` +
        `${on && t !== null ? `<span class="rb"${this._click(set(t - step), null, "Moins")}><ha-icon icon="mdi:minus"></ha-icon></span><span class="rb"${this._click(set(t + step), null, "Plus")}><ha-icon icon="mdi:plus"></ha-icon></span>` : ""}` +
        `<span class="rb${on ? " on" : ""}"${this._click({ action: "perform-action", perform_action: on ? "climate.turn_off" : "climate.turn_on", target: { entity_id: r.climate } }, null, on ? "Arrêter" : "Démarrer")}><ha-icon icon="mdi:fan"></ha-icon></span></div></div>`;
    }
    let lock = "";
    const lk = r.lock ? st[r.lock] : null;
    if (lk) {
      const locked = lk.state === "locked";
      const pending = this._ui.confirm?.endsWith?.(r.lock);
      lock = `<span class="rb${locked ? "" : " warn"}"${this._click({ action: "toggle", entity: r.lock, confirm: locked }, { action: "more-info", entity: r.lock }, locked ? "Déverrouiller (deux clics)" : "Verrouiller")} title="${locked ? "Verrouillée" : "Déverrouillée"}"><ha-icon icon="${pending ? "mdi:lock-question" : locked ? "mdi:lock" : "mdi:lock-open-variant"}"></ha-icon></span>`;
    }
    const loc = r.location ? st[r.location] : null;
    const where = loc ? (loc.state === "home" ? "À la maison" : loc.state === "not_home" ? "En déplacement" : stateFr(loc.state)) : "";
    return `<div class="dv"><div class="dv-h"><div class="dv-ic"><ha-icon icon="${esc(c.icon)}"></ha-icon></div>` +
      `<div class="dv-t"><div class="dv-n">${tpl(c.name ?? "Voiture", hass)}</div><div class="dv-s">${esc([ch.txt, where].filter(Boolean).join(" · "))}</div></div>${lock}</div>` +
      `<div class="dv-g car">${tiles}</div>${clim}</div>`;
  }

  getCardSize() { return 5; }
}
MaisonVoitureCard.STYLE = `<style>${DEVICE_STYLE}
.dv-g.car { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@container (min-width: 560px) { .dv-g.car { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.ch { font-size: .62em; font-weight: 500; white-space: normal; display: block; line-height: 1.25; }
.ch.on { color: var(--m-acc); font-weight: 700; }
.dv-h .rb { flex: none; width: 44px; }
.cl { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 10px 10px 10px 14px; border-radius: 16px; background: var(--m-chip); }
.cl-t { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cl-v { font-size: 1.5rem; font-weight: 300; }
.cl-v span { font-size: .55em; margin-left: 2px; color: var(--m-muted); }
.cl .rbar { background: var(--m-card); flex: none; }
.cl .rb { width: 40px; height: 40px; flex: none; }
</style>`;

/* ===================================================== téléphones et tablettes */

/** Capteurs de l'application Companion (mobile_app), d'après la fin de l'identifiant. */
const TEL_ROLES = [
  ["battery", "sensor", /_battery_level$/],
  ["state", "sensor", /_battery_state$/],
  ["charging", "binary_sensor", /_is_charging$/],
  ["charger", "sensor", /_charger_type$/],
  ["temp", "sensor", /_battery_temperature$/],
  ["health", "sensor", /_battery_health$/],
  ["remaining", "sensor", /_remaining_charge_time$/],
  ["wifi", "sensor", /_wifi_connection$|_wi_fi_connection$/],
  ["signal", "sensor", /_wifi_signal_strength$|_wi_fi_signal_strength$/],
  ["network", "sensor", /_network_type$/],
  ["storage", "sensor", /_internal_storage$/],
  ["alarm", "sensor", /_next_alarm$/],
  ["reboot", "sensor", /_last_reboot$/],
  ["os", "sensor", /_os_version$/],
  ["app", "sensor", /_current_version$|_app_version$/],
  ["steps", "sensor", /_daily_steps$|_steps_sensor$/],
  ["dnd", "sensor", /_do_not_disturb_sensor$/],
  ["ringer", "sensor", /_ringer_mode$/],
  ["tracker", "device_tracker", /./],
];
const TEL_FR = {
  charging: "En charge", discharging: "Sur batterie", full: "Chargé", not_charging: "Branché, ne charge pas", unknown: "—",
  ac: "secteur", usb: "USB", wireless: "sans fil", none: "", dock: "station",
  good: "Bonne", overheated: "Surchauffe", dead: "Morte", over_voltage: "Surtension", failed: "Défaillante", cold: "Froide",
  normal: "Sonnerie", vibrate: "Vibreur", silent: "Silencieux", off: "Désactivé", priority_only: "Prioritaires seulement", alarms_only: "Alarmes seulement", total_silence: "Silence total",
  wifi: "Wi-Fi", cellular: "Données mobiles", ethernet: "Ethernet", bluetooth: "Bluetooth", vpn: "VPN",
};

class MaisonTelephonesCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison", title: "Téléphones", low: 20, show_location: true, stale_hours: 24 }; }

  _resolve(c, hass) {
    const reg = hass.entities || {}, devs = hass.devices || {};
    const only = [].concat(c.devices || []).map((x) => String(x).toLowerCase());
    const map = {};
    for (const [id, e] of Object.entries(reg)) {
      if (e.platform !== "mobile_app" || !hass.states[id] || e.hidden) continue;
      const dev = devs[e.device_id];
      if (!dev) continue;
      const name = dev.name_by_user || dev.name || "Téléphone";
      if (only.length && !only.includes(name.toLowerCase()) && !only.includes(e.device_id)) continue;
      const d = (map[e.device_id] ||= { id: e.device_id, name, model: [dev.manufacturer, dev.model].filter(Boolean).join(" "), roles: {} });
      const role = TEL_ROLES.find(([, dom, re]) => dom === domainOf(id) && re.test(id));
      if (role && !d.roles[role[0]]) d.roles[role[0]] = id;
    }
    const list = Object.values(map).filter((d) => d.roles.battery || d.roles.tracker);
    // ordre : celui de « devices », sinon par nom
    list.sort((a, b) => (only.length ? only.indexOf(a.name.toLowerCase()) - only.indexOf(b.name.toLowerCase()) : 0) || a.name.localeCompare(b.name, "fr", { numeric: true }));
    for (const d of list) d.tablet = /tab|pad|tb-|tablette|tablet/i.test(`${d.name} ${d.model}`);
    return { list };
  }

  _ids() { return this._resolved().list.flatMap((d) => Object.values(d.roles)); }

  _render(c, hass) {
    const { list } = this._resolved();
    if (!list.length) return `<div class="empty"><b>Aucun téléphone</b>Installez l'application Home Assistant (Companion) sur vos téléphones et tablettes.</div>`;
    const st = hass.states;
    const val = (id) => { const s = id ? st[id]?.state : undefined; return s === undefined || BAD.has(s) ? null : s; };
    const low = num(c.low) ?? 20;
    // appareil muet : aucun capteur reçu depuis stale_hours (appareil éteint, application arrêtée)
    const staleMs = (num(c.stale_hours) ?? 24) * 3600e3;
    const info = list.map((d) => {
      const r = d.roles;
      const seen = Math.max(0, ...Object.values(r).map((id) => {
        const o = st[id];
        return o ? Math.max(Date.parse(o.last_reported || 0) || 0, Date.parse(o.last_updated || 0) || 0, Date.parse(o.last_changed || 0) || 0) : 0;
      }));
      const muted = staleMs > 0 && seen > 0 && Date.now() - seen > staleMs;
      const bat = num(val(r.battery));
      const stTxt = String(val(r.state) || "").toLowerCase();
      const charging = !muted && (val(r.charging) === "on" || stTxt === "charging");
      const full = !muted && stTxt === "full";
      return { d, bat, charging, full, muted, seen, lowBat: !muted && bat !== null && bat <= low && !charging };
    });
    const lowN = info.filter((x) => x.lowBat).length;
    const chN = info.filter((x) => x.charging).length;
    const open = this._ui.tel;

    const tiles = info.map(({ d, bat, charging, full, lowBat, muted, seen }) => {
      const r = d.roles;
      const tr = r.tracker ? st[r.tracker] : null;
      const where = c.show_location !== false && tr && !BAD.has(tr.state)
        ? tr.state === "home" ? "À la maison" : tr.state === "not_home" ? "Absent" : (st[`zone.${tr.state}`]?.attributes?.friendly_name || tr.state.replace(/_/g, " "))
        : null;
      const ssid = val(r.wifi);
      const net = ssid && !/^<not connected>$|^non connecté$/i.test(ssid) ? "Wi-Fi" : TEL_FR[String(val(r.network) || "").toLowerCase()] || null;
      const charger = TEL_FR[String(val(r.charger) || "").toLowerCase()];
      const sub = muted
        ? `Pas de nouvelles ${relTime(new Date(seen).toISOString()) || ""}`.replace("il y a", "depuis")
        : [charging ? `En charge${charger ? ` (${charger})` : ""}` : full ? "Chargé" : null, where, net].filter(Boolean).join(" · ");
      const color = muted ? "var(--m-faint)" : lowBat ? "var(--m-red)" : charging ? "var(--m-acc)" : levelBar(bat);
      const isOpen = open === d.id;
      let detail = "";
      if (isOpen) {
        const rows = [
          ["mdi:heart-pulse", "Santé de la batterie", TEL_FR[String(val(r.health) || "").toLowerCase()] || val(r.health), r.health],
          ["mdi:thermometer", "Température de la batterie", num(val(r.temp)) !== null ? `${fmt(num(val(r.temp)), 1)} °C` : null, r.temp],
          ["mdi:timer-sand", "Charge complète", num(val(r.remaining)) !== null && charging ? hm(num(val(r.remaining))) : null, r.remaining],
          ["mdi:wifi", "Réseau", ssid && net === "Wi-Fi" ? `Wi-Fi ${ssid}${num(val(r.signal)) !== null ? ` (${fmt(num(val(r.signal)))} dBm)` : ""}` : net, r.wifi || r.network],
          ["mdi:harddisk", "Stockage interne", num(val(r.storage)) !== null ? `${fmt(num(val(r.storage)))} % libre` : null, r.storage],
          ["mdi:alarm", "Prochaine alarme", val(r.alarm) ? new Date(val(r.alarm)).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null, r.alarm],
          ["mdi:walk", "Pas aujourd'hui", num(val(r.steps)) !== null ? fmt(num(val(r.steps))) : null, r.steps],
          ["mdi:bell-outline", "Sonnerie", TEL_FR[String(val(r.ringer) || "").toLowerCase()] || null, r.ringer],
          ["mdi:minus-circle-outline", "Ne pas déranger", TEL_FR[String(val(r.dnd) || "").toLowerCase()] || val(r.dnd), r.dnd],
          ["mdi:restart", "Dernier redémarrage", val(r.reboot) ? relTime(val(r.reboot)) : null, r.reboot],
          ["mdi:android", "Système", val(r.os) ? `Android ${val(r.os)}` : null, r.os],
          ["mdi:cellphone-arrow-down", "Application", val(r.app), r.app],
        ].filter(([, , v]) => v !== null && v !== undefined && v !== "");
        detail = `<div class="tel-d">${rows.map(([ic, l, v, id]) => `<div class="tel-r"${this._click({ action: "more-info", entity: id }, null, l)}><ha-icon icon="${ic}"></ha-icon><span>${l}</span><b>${esc(v)}</b></div>`).join("")}</div>`;
      }
      return `<div class="tel${isOpen ? " open" : ""}${lowBat ? " low" : ""}${muted ? " muted" : ""}"${muted ? ` title="Dernière valeur reçue : ${esc(new Date(seen).toLocaleString("fr-FR"))}"` : ""}>
        <div class="tel-h"${this._click({ action: "ui", set: { tel: isOpen ? null : d.id } }, { action: "more-info", entity: r.battery || r.tracker }, d.name)}>
          <div class="tel-ic${charging ? " ch" : ""}"><ha-icon icon="${d.tablet ? "mdi:tablet" : "mdi:cellphone"}"></ha-icon>${charging ? `<ha-icon class="tel-bolt" icon="mdi:lightning-bolt"></ha-icon>` : ""}</div>
          <div class="tel-t"><div class="tel-n">${esc(d.name)}</div><div class="tel-s">${esc(sub || d.model)}</div></div>
          <div class="tel-b${lowBat ? " low" : ""}">${bat === null ? "—" : `${fmt(bat)}<span>%</span>`}</div>
        </div>
        ${bat !== null ? `<div class="bar-p tel-bar"><i style="width:${Math.max(0, Math.min(100, bat))}%;background:${color}"></i></div>` : ""}
        ${detail}
      </div>`;
    }).join("");

    const mutedN = info.filter((x) => x.muted).length;
    const sum = [lowN ? `<span class="chipx warn">${lowN} à recharger</span>` : "", chN ? `<span class="chipx on">${chN} en charge</span>` : "", mutedN ? `<span class="chipx">${mutedN} muet${mutedN > 1 ? "s" : ""}</span>` : ""].join("");
    return `<div class="dv"><div class="dv-h"><div class="dv-ic"><ha-icon icon="${esc(c.icon || "mdi:cellphone-link")}"></ha-icon></div>` +
      `<div class="dv-t"><div class="dv-n">${tpl(c.title ?? "Téléphones", hass)}</div><div class="dv-s">${list.length} appareil${list.length > 1 ? "s" : ""}</div></div>${sum ? `<div class="tel-sum">${sum}</div>` : ""}</div>` +
      `<div class="tel-g">${tiles}</div></div>`;
  }

  getCardSize() { return 4; }
}
MaisonTelephonesCard.STYLE = `<style>${DEVICE_STYLE}
.dv-n { letter-spacing: normal; }
.tel-sum { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
@container (max-width: 480px) { .dv-h:has(.tel-sum) { flex-wrap: wrap; } .tel-sum { flex-basis: 100%; justify-content: flex-start; } }
.chipx.warn { background: var(--m-red); color: var(--m-on-pop); }
.tel-g { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
.tel { background: var(--m-chip); border-radius: 16px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.tel.low { box-shadow: inset 0 0 0 2px var(--m-red); }
.tel.open { grid-column: 1 / -1; }
.tel.muted .tel-h, .tel.muted .tel-bar { opacity: .5; }
.tel.muted .tel-ic ha-icon { color: var(--m-muted); }
.tel-h { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tel-ic { position: relative; width: 38px; height: 38px; border-radius: 50%; background: var(--m-card); display: grid; place-items: center; flex: none; }
.tel-ic ha-icon { --mdc-icon-size: 22px; color: var(--m-acc); }
.tel-ic .tel-bolt { position: absolute; right: -4px; bottom: -4px; --mdc-icon-size: 16px; color: var(--m-yellow); }
.tel-t { flex: 1; min-width: 0; }
.tel-n { font-weight: 600; font-size: .95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tel-s { font-size: .76rem; color: var(--m-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tel-b { font-size: 1.5rem; font-weight: 300; white-space: nowrap; }
.tel-b span { font-size: .55em; color: var(--m-muted); margin-left: 2px; }
.tel-b.low { color: var(--m-red); font-weight: 500; }
.tel-bar { height: 6px; }
.tel-d { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 4px 12px; padding-top: 4px; border-top: 1px solid var(--m-line); }
.tel-r { display: flex; align-items: center; gap: 8px; font-size: .8rem; padding: 4px 2px; min-width: 0; }
.tel-r ha-icon { --mdc-icon-size: 18px; color: var(--m-muted); flex: none; }
.tel-r span { color: var(--m-muted); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tel-r b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }
</style>`;

/* ============================================================= imprimante */

const PRN_FR = {
  printing: "Impression", running: "Impression", idle: "Inactive", finish: "Terminée", finished: "Terminée", complete: "Terminée",
  failed: "Échec", error: "Erreur", pause: "En pause", paused: "En pause", prepare: "Préparation", preparing: "Préparation",
  offline: "Hors ligne", standby: "En attente", ready: "Prête", cancelled: "Annulée", heating: "Chauffe",
  heatbed_preheating: "Préchauffage du plateau", auto_bed_leveling: "Calibrage du plateau", cleaning_nozzle_tip: "Nettoyage de la buse",
  changing_filament: "Changement de filament", homing_toolhead: "Mise à zéro", checking_extruder_temperature: "Contrôle de la buse",
};
const prnFr = (s) => (s === null || s === undefined ? "—" : PRN_FR[String(s).toLowerCase()] || String(s).replace(/_/g, " "));

class MaisonImprimanteCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison", icon: "mdi:printer-3d-nozzle", camera_view: "live" }; }

  _resolve(c, hass) {
    const auto = findPrinter(hass, c.prefix) || {};
    const r = {};
    for (const k of [...Object.keys(PRN_FIELDS), "camera"]) r[k] = c[k] !== undefined ? c[k] : auto[k] || null;
    return r;
  }

  _ids() { return Object.values(this._resolved()).filter((x) => typeof x === "string"); }

  _render(c, hass) {
    const r = this._resolved();
    const st = hass.states;
    if (!r.progress && !r.stage && !r.nozzle) return `<div class="empty"><b>Imprimante introuvable</b>Indiquez « prefix » (début des entités) ou les capteurs (progress, remaining, nozzle…).</div>`;
    const stage = r.stage ? st[r.stage]?.state : null;
    const prog = num(r.progress ? st[r.progress]?.state : null);
    const rem = r.remaining ? st[r.remaining] : null;
    let left = num(rem?.state);
    if (rem?.attributes?.device_class === "timestamp") left = Number.isFinite(new Date(rem.state).getTime()) ? (new Date(rem.state).getTime() - Date.now()) / 60000 : null;
    else if (/^(h|hours?)$/.test(rem?.attributes?.unit_of_measurement || "")) left = left === null ? null : left * 60;
    else if (/^(s|sec)/.test(rem?.attributes?.unit_of_measurement || "")) left = left === null ? null : left / 60;
    const printing = stage ? PRINTING.test(stage) : prog !== null && prog > 0 && prog < 100;
    const paused = /paus/i.test(stage || "");
    const temp = (id, tgt) => {
      const v = num(st[id]?.state);
      const t = num(tgt ? st[tgt]?.state : null);
      return `${fmt(v)}${t ? `<span>/ ${fmt(t)} °C</span>` : "<span>°C</span>"}`;
    };
    const file = r.file ? st[r.file]?.state : null;
    const tiles = [
      r.bed ? `<div class="vt2"${this._click({ action: "more-info", entity: r.bed })}><div class="vt2-l"><ha-icon icon="mdi:heat-wave"></ha-icon> Plateau</div><div class="vt2-v">${temp(r.bed, r.bed_target)}</div></div>` : "",
      r.nozzle ? `<div class="vt2"${this._click({ action: "more-info", entity: r.nozzle })}><div class="vt2-l"><ha-icon icon="mdi:printer-3d-nozzle-heat"></ha-icon> Buse</div><div class="vt2-v">${temp(r.nozzle, r.nozzle_target)}</div></div>` : "",
      r.progress || r.remaining ? tileHtml(`Restant${prog !== null ? ` · ${Math.round(prog)} %` : ""}`, left !== null && (printing || paused) ? esc(hm(left)) : "—", "", prog ?? 0, prog === null ? null : prog >= 85 ? "var(--m-green)" : prog <= 35 ? "var(--m-pop)" : "var(--m-orange)", this._click({ action: "more-info", entity: r.progress || r.remaining })) : "",
    ].join("");
    let cam = "";
    if (c.show_camera !== false && (r.camera || r.cover)) {
      const co = r.camera ? st[r.camera] : st[r.cover];
      let pic = co?.attributes?.entity_picture || "";
      if (pic && r.camera && c.camera_view === "live") pic = pic.replace("/api/camera_proxy/", "/api/camera_proxy_stream/");
      cam = `<div class="cam"${this._click({ action: "more-info", entity: r.camera || r.cover })}>${pic ? `<img src="${esc(pic)}" alt="" loading="lazy">` : `<ha-icon icon="mdi:camera-off"></ha-icon>`}</div>`;
    }
    const press = (id, conf) => ({ action: "perform-action", perform_action: "button.press", target: { entity_id: id }, confirm: conf, entity: id });
    const confirmStop = this._ui.confirm && r.stop && this._ui.confirm.endsWith(r.stop);
    const btns = [
      r.pause ? `<div class="btn${printing && !paused ? "" : " off"}"${this._click(press(r.pause), null, "Pause")}><ha-icon icon="mdi:pause"></ha-icon>Pause</div>` : "",
      r.resume ? `<div class="btn${paused ? "" : " off"}"${this._click(press(r.resume), null, "Reprise")}><ha-icon icon="mdi:play"></ha-icon>Reprise</div>` : "",
      r.stop ? `<div class="btn${confirmStop ? " warn" : " alt"}${printing || paused ? "" : " off"}"${this._click(press(r.stop, true), null, "Arrêter (deux clics)")}><ha-icon icon="mdi:stop"></ha-icon>${confirmStop ? "Confirmer" : "Arrêter"}</div>` : "",
    ].join("");
    return `<div class="dv"><div class="dv-h"><div class="dv-ic"><ha-icon icon="${esc(c.icon)}"></ha-icon></div>` +
      `<div class="dv-t"><div class="dv-n">${tpl(c.name ?? "Imprimante 3D", hass)}</div><div class="dv-s">${esc(prnFr(stage))}${file && !BAD.has(file) ? ` · ${esc(file)}` : ""}</div></div></div>` +
      `<div class="dv-g">${tiles}</div>${cam}${btns ? `<div class="btns">${btns}</div>` : ""}</div>`;
  }

  getCardSize() { return 6; }
}
MaisonImprimanteCard.STYLE = `<style>${DEVICE_STYLE}
.vt2-l ha-icon { --mdc-icon-size: 16px; vertical-align: -3px; }
</style>`;

/* =================================================================== menu */

const DAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const DAY_ALIASES = { monday: "lundi", tuesday: "mardi", wednesday: "mercredi", thursday: "jeudi", friday: "vendredi", saturday: "samedi", sunday: "dimanche" };
const cleanRecipe = (s) => String(s ?? "").replace(/&#39;?/g, "'").replace(/&amp;/g, "&").replace(/\s*(\d+\s?-)\s*/g, "\n$1 ").trim();

class MaisonMenuCard extends MaisonCard {
  static get DEFAULTS() {
    return { theme: "maison", first_day: "lundi", name_attribute: "recette_nom", ingredients_attribute: "recette_ingredients", details_attribute: "recette_details" };
  }

  _cardClass() { return "bare"; }

  _resolve(c, hass) {
    let days;
    if (Array.isArray(c.days) && c.days.length) {
      days = c.days.map((d) => (typeof d === "string" ? { entity: d } : { ...d }));
      days.forEach((d) => { d.day = d.day || (/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/.exec(d.entity || "") || [])[1] || d.entity; });
    } else {
      const ids = Object.keys(hass.states).filter((id) => domainOf(id) === "sensor" && /menu.*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(id));
      const byDay = {};
      for (const id of ids.sort()) {
        const m = /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.exec(id);
        const d = DAY_ALIASES[m[1]] || m[1];
        if (!byDay[d]) byDay[d] = id;
      }
      const start = Math.max(0, DAYS_FR.indexOf(String(c.first_day).toLowerCase()));
      days = [];
      for (let i = 0; i < 7; i++) {
        const d = DAYS_FR[(start + i) % 7];
        if (byDay[d]) days.push({ day: d, entity: byDay[d] });
      }
    }
    return { days, todo: c.todo || null };
  }

  _ids() {
    const r = this._resolved();
    return [...r.days.map((d) => d.entity), r.todo, this._config.day_entity].filter(Boolean);
  }

  connectedCallback() {
    super.connectedCallback();
    this._todoState = null;
  }

  _loadTodo() {
    const id = this._resolved().todo;
    const s = this._hass?.states?.[id];
    if (!id || !s || !this._hass.callWS) return;
    const key = `${s.state}@${s.last_updated}`;
    if (this._todoState === key) return;
    this._todoState = key;
    this._hass.callWS({ type: "todo/item/list", entity_id: id }).then((r) => {
      this._todo = r?.items || [];
      this._update(true);
    }).catch(() => { this._todo = []; });
  }

  _after() {
    const inp = this.shadowRoot.querySelector("input[data-add]");
    if (inp) {
      inp.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" || !inp.value.trim()) return;
        this._hass.callService("todo", "add_item", { item: inp.value.trim() }, { entity_id: this._resolved().todo });
        inp.value = "";
      });
      if (this._focusAdd) { inp.focus(); this._focusAdd = false; }
    }
  }

  _render(c, hass) {
    const r = this._resolved();
    this._loadTodo();
    if (!r.days.length) return `<div class="empty"><b>Aucun menu</b>Indiquez « days » (capteurs du menu, un par jour).</div>`;
    const today = DAYS_FR[new Date().getDay()];
    const selFromEntity = c.day_entity ? hass.states[c.day_entity]?.state : null;
    const sel = (selFromEntity && r.days.find((d) => d.day === selFromEntity)?.day) || this._ui.day || (r.days.find((d) => d.day === today)?.day) || r.days[0].day;
    const rows = r.days.map((d) => {
      const o = hass.states[d.entity];
      const at = o?.attributes || {};
      const name = cleanRecipe(at[c.name_attribute] ?? o?.state ?? "—");
      const on = d.day === sel;
      const act = c.day_entity
        ? { action: "perform-action", perform_action: `${domainOf(c.day_entity)}.select_option`, target: { entity_id: c.day_entity }, data: { option: d.day } }
        : { action: "ui", set: { day: d.day } };
      const more = on
        ? `${at[c.ingredients_attribute] ? `<div class="mr-x">${esc(cleanRecipe(at[c.ingredients_attribute])).replace(/\n/g, "<br>")}</div>` : ""}` +
          `${at[c.details_attribute] ? `<div class="mr-x">${esc(cleanRecipe(at[c.details_attribute])).replace(/\n/g, "<br>")}</div>` : ""}`
        : "";
      return `<div class="mr${on ? " on" : ""}${d.day === today ? " today" : ""}"${on ? this._click({ action: "more-info", entity: d.entity }) : this._click(act, { action: "more-info", entity: d.entity }, d.day)}>` +
        `<div class="mr-d">${esc(c.short_days ? d.day.slice(0, 3) : d.day)}</div><div class="mr-b"><div class="mr-n">${esc(name).replace(/\n/g, "<br>")}</div>${more}</div></div>`;
    }).join("");
    let todo = "";
    if (r.todo) {
      const items = (this._todo || []).filter((it) => it.status !== "completed");
      const done = (this._todo || []).filter((it) => it.status === "completed").length;
      const tid = r.todo;
      todo = `<div class="td"><div class="td-h">${tpl(c.todo_title ?? friendly(hass.states[tid]) ?? "Courses", hass)}<span>${items.length}</span></div>` +
        `<input data-add type="text" placeholder="Ajouter…" aria-label="Ajouter un article">` +
        `${items.map((it) => `<div class="td-i"${this._click({ action: "perform-action", perform_action: "todo.update_item", target: { entity_id: tid }, data: { item: it.uid || it.summary, status: "completed" } }, null, `${it.summary} : fait`)}><ha-icon icon="mdi:checkbox-blank-circle-outline"></ha-icon><span>${esc(it.summary)}</span></div>`).join("")}` +
        `${done ? `<div class="td-d">${done} article${done > 1 ? "s" : ""} fait${done > 1 ? "s" : ""}</div>` : ""}</div>`;
    }
    return `<div class="mn${r.todo ? " with-todo" : ""}"><div class="mrs">${rows}</div>${todo}</div>`;
  }

  getCardSize() { return 7; }
}
MaisonMenuCard.STYLE = `<style>
ha-card.bare { background: none; border: none; box-shadow: none; border-radius: 0; overflow: visible; }
.mn { display: grid; gap: 10px; }
@container (min-width: 640px) { .mn.with-todo { grid-template-columns: 3fr 1fr; align-items: start; } }
.mrs { display: flex; flex-direction: column; gap: 8px; }
.mr { display: flex; align-items: stretch; gap: 0; padding: 15px; border-radius: var(--m-radius); background: var(--m-card); }
.th-v2 .mr, .th-ha .mr, .th-v2 .td, .th-ha .td { border: 1px solid var(--m-line); }
.mr-d { flex: none; width: 130px; font-size: 1.3em; text-transform: uppercase; padding-right: 15px; border-right: 1px solid var(--m-pop); align-self: center; overflow: hidden; text-overflow: ellipsis; }
.mr-b { flex: 1; min-width: 0; padding-left: 12px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
.mr-n { font-size: 1.25em; line-height: 1.25; }
.mr.on { background: var(--m-pop); color: var(--m-on-pop); }
.mr.on .mr-d { font-size: 2.4em; font-weight: 500; border-right-color: currentColor; align-self: stretch; display: flex; align-items: center; width: auto; min-width: 110px; }
.mr.on .mr-n { font-size: 1.7em; font-weight: 500; }
.mr-x { font-size: .92rem; line-height: 1.45; overflow-wrap: anywhere; }
.mr.today:not(.on) .mr-d { font-weight: 700; }
@container (max-width: 480px) {
  .mr-d { width: 92px; font-size: 1em; }
  .mr.on .mr-d { font-size: 1.5em; min-width: 80px; }
  .mr.on .mr-n { font-size: 1.3em; }
}
.td { background: var(--m-card); border-radius: var(--m-radius); padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.td-h { display: flex; justify-content: space-between; font-weight: 600; font-size: 1.05rem; }
.td-h span { color: var(--m-muted); font-weight: 500; }
.td input { font: inherit; color: var(--m-text); background: var(--m-chip); border: none; border-radius: 12px; padding: 9px 12px; outline: none; }
.td input:focus-visible { box-shadow: 0 0 0 2px var(--m-pop); }
.td-i { display: flex; align-items: center; gap: 8px; padding: 6px 2px; border-bottom: 1px solid var(--m-line); }
.td-i ha-icon { --mdc-icon-size: 20px; color: var(--m-muted); flex: none; }
.td-i span { overflow-wrap: anywhere; }
.td-d { font-size: .8rem; color: var(--m-muted); padding-top: 4px; }
</style>`;

/* ================================================================== météo */

const WX_ICON = {
  "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy", exceptional: "mdi:alert-circle-outline", fog: "mdi:weather-fog",
  hail: "mdi:weather-hail", lightning: "mdi:weather-lightning", "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy", pouring: "mdi:weather-pouring", rainy: "mdi:weather-rainy", snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy", sunny: "mdi:weather-sunny", windy: "mdi:weather-windy", "windy-variant": "mdi:weather-windy-variant",
};

class MaisonMeteoCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison", forecast_type: "daily", days: 5, show_graph: true }; }

  _resolve(c, hass) {
    const ids = Object.keys(hass.states);
    const w = c.entity || ids.find((id) => domainOf(id) === "weather") || null;
    return { weather: w, temperature: c.temperature || null, humidity: c.humidity || null };
  }

  _ids() { const r = this._resolved(); return [r.weather, r.temperature, r.humidity].filter(Boolean); }

  connectedCallback() {
    super.connectedCallback();
    this._subscribe();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.then?.((u) => u?.()).catch?.(() => {});
    this._unsub = null;
    this._subKey = null;
  }

  _subscribe() {
    const h = this._hass;
    const r = this._config && h ? this._resolved() : null;
    if (!r?.weather || !h.connection?.subscribeMessage || this._config.days === 0) return;
    const key = `${r.weather}|${this._config.forecast_type}`;
    if (this._subKey === key) return;
    this._unsub?.then?.((u) => u?.()).catch?.(() => {});
    this._subKey = key;
    this._unsub = h.connection.subscribeMessage((ev) => {
      this._fc = ev?.forecast || [];
      this._update(true);
    }, { type: "weather/subscribe_forecast", forecast_type: this._config.forecast_type, entity_id: r.weather }).catch(() => { this._subKey = null; });
  }

  _render(c, hass) {
    this._subscribe();
    const r = this._resolved();
    const w = r.weather ? hass.states[r.weather] : null;
    const t = num(r.temperature ? hass.states[r.temperature]?.state : w?.attributes?.temperature);
    const hu = num(r.humidity ? hass.states[r.humidity]?.state : w?.attributes?.humidity);
    if (t === null && !w) return `<div class="empty"><b>Météo introuvable</b>Indiquez « entity: weather.… » ou « temperature: sensor.… ».</div>`;
    const fc = (this._fc || w?.attributes?.forecast || []).slice(0, Number(c.days) || 0);
    const hourly = c.forecast_type === "hourly";
    const days = fc.map((f) => {
      const d = new Date(f.datetime);
      const lbl = hourly ? d.toLocaleTimeString("fr-FR", { hour: "2-digit" }) : d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
      return `<div class="fd"><span class="fd-d">${esc(lbl)}</span><ha-icon icon="${WX_ICON[f.condition] || "mdi:weather-cloudy"}"></ha-icon>` +
        `<span class="fd-t">${fmt(num(f.temperature))}°</span>${!hourly && num(f.templow) !== null ? `<span class="fd-l">${fmt(num(f.templow))}°</span>` : ""}</div>`;
    }).join("");
    let big = "";
    if (t !== null) {
      const [i, d] = t.toFixed(1).split(".");
      big = `${i}<small>.${d}</small>°${hu !== null ? `<em>${Math.round(hu)}%</em>` : ""}`;
    }
    const graphId = r.temperature;
    const pts = c.show_graph !== false && graphId ? this._hist(graphId) : null;
    const tap = this._cfgAct(c.tap_action, { action: "more-info" }, r.weather || r.temperature);
    const cond = w ? `<div class="wx-c"><ha-icon icon="${WX_ICON[w.state] || "mdi:weather-cloudy"}"></ha-icon>${c.name !== undefined ? tpl(c.name, hass) : ""}</div>` : "";
    return `<div class="wx"${this._click(tap, null, "Météo")}>${days ? `<div class="fds">${days}</div>` : ""}` +
      `<div class="wx-m">${cond}<div class="wx-t">${big}</div></div>${pts ? `<div class="wx-g">${spark(pts, 300, 70)}</div>` : ""}</div>`;
  }

  getCardSize() { return 4; }
}
MaisonMeteoCard.STYLE = `<style>
.wx { position: relative; padding: 14px 0 0; min-height: 190px; display: flex; flex-direction: column; }
.fds { display: flex; justify-content: space-around; gap: 4px; padding: 0 10px; }
.fd { display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: .82rem; min-width: 0; }
.fd-d { color: var(--m-muted); text-transform: capitalize; }
.fd ha-icon { --mdc-icon-size: 26px; color: var(--m-acc); }
.fd-t { font-weight: 600; }
.fd-l { color: var(--m-muted); font-size: .76rem; }
.wx-m { position: relative; z-index: 2; padding: 4px 18px 10px; display: flex; align-items: flex-end; gap: 10px; flex: 1; }
.wx-c { display: flex; align-items: center; gap: 6px; color: var(--m-muted); font-size: .85rem; padding-bottom: 14px; order: 2; }
.wx-c ha-icon { --mdc-icon-size: 22px; }
.wx-t { font-size: 5rem; font-weight: 400; line-height: .95; white-space: nowrap; }
.wx-t small { font-size: .5em; }
.wx-t em { font-style: normal; font-size: .3em; opacity: .7; margin-left: 2px; }
.wx-g { position: absolute; left: 0; right: 0; bottom: 0; height: 70px; z-index: 1; }
@container (max-width: 300px) { .wx-t { font-size: 3.6rem; } }
</style>`;

/* ================================================================= agenda */

class MaisonAgendaCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison", days: 30, max: 4 }; }

  _cardClass() { return "bare"; }

  _resolve(c, hass) {
    const list = [].concat(c.entities || c.entity || []).map((x) => (typeof x === "string" ? x : x.entity)).filter(Boolean);
    return { ids: list.length ? list : Object.keys(hass.states).filter((id) => domainOf(id) === "calendar").slice(0, 1) };
  }

  _ids() { return this._resolved().ids; }

  _load() {
    const h = this._hass;
    const ids = this._resolved().ids;
    const key = ids.map((id) => `${id}=${h.states[id]?.state}@${h.states[id]?.last_updated}`).join("|");
    if (this._evKey === key && Date.now() - (this._evAt || 0) < 15 * 60e3) return;
    this._evKey = key;
    this._evAt = Date.now();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + (Number(this._config.days) || 30) * 86400e3);
    const cal = ids.filter((id) => domainOf(id) === "calendar");
    const fromAttr = ids.filter((id) => domainOf(id) !== "calendar").flatMap((id) => (h.states[id]?.attributes?.events || []).map((e) => ({ ...e, _src: id })));
    if (!cal.length || !h.callApi) { this._events = fromAttr; return; }
    Promise.all(cal.map((id) => h.callApi("GET", `calendars/${id}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`)
      .then((evs) => (evs || []).map((e) => ({ ...e, _src: id }))).catch(() => [])))
      .then((all) => { this._events = [...all.flat(), ...fromAttr]; this._update(true); });
  }

  _render(c, hass) {
    this._load();
    const parse = (x) => {
      const v = x?.dateTime || x?.date || x;
      if (!v) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split("-").map(Number); return { d: new Date(y, m - 1, d), allDay: true }; }
      const d = new Date(v);
      return Number.isFinite(d.getTime()) ? { d, allDay: false } : null;
    };
    const now = Date.now();
    const evs = (this._events || []).map((e) => ({ ...e, s: parse(e.start), e2: parse(e.end) }))
      .filter((e) => e.s && (e.e2 ? e.e2.d.getTime() > now : e.s.d.getTime() >= now - 86400e3))
      .sort((a, b) => a.s.d - b.s.d).slice(0, Number(c.max) || 4);
    if (!evs.length) return `<div class="ag"><div class="ev first none"><div class="ev-e">${this._events ? "Rien de prévu" : "Chargement…"}</div></div></div>`;
    const today = new Date().toDateString();
    return `<div class="ag">${evs.map((e, i) => {
      const isToday = e.s.d.toDateString() === today;
      const day = e.s.d.toLocaleDateString("fr-FR", { weekday: "long" });
      const date = e.s.d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");
      const time = e.s.allDay ? "Journée" : e.s.d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      return `<div class="ev${i === 0 ? " first" : ""}${isToday ? " today" : ""}"${this._click({ action: "more-info", entity: e._src }, null, e.summary)}>` +
        `${i === 0 ? `<div class="ev-day">${esc(isToday ? "aujourd'hui" : day)}</div>` : ""}<div class="ev-date">${esc(date)}</div>` +
        `<div class="ev-time">${esc(time)}</div><div class="ev-e">${esc(e.summary || "(sans titre)")}</div></div>`;
    }).join("")}</div>`;
  }

  getCardSize() { return 4; }
}
MaisonAgendaCard.STYLE = `<style>
ha-card.bare { background: none; border: none; box-shadow: none; border-radius: 0; overflow: visible; }
.ag { display: flex; flex-direction: column; gap: 6px; }
.ev { display: grid; grid-template-columns: min-content 1fr; grid-template-areas: "date time" "date ev"; padding: 14px 18px; border-radius: var(--m-radius); background: var(--m-card); align-items: center; }
.th-v2 .ev, .th-ha .ev { border: 1px solid var(--m-line); }
.ev.first { grid-template-areas: "day ." "date time" "date ev"; padding: 18px; }
.ev-day { grid-area: day; font-size: calc(.85rem * var(--maison-font-scale, 1)); text-transform: capitalize; color: var(--m-muted); }
.ev-date { grid-area: date; font-size: 1.4em; text-transform: uppercase; padding-right: 18px; border-right: 1px solid var(--m-pop); white-space: nowrap; align-self: stretch; display: flex; align-items: center; }
.ev.first .ev-date { font-size: 2.6em; }
.ev-time { grid-area: time; padding-left: 18px; font-size: calc(.95em * var(--maison-font-scale, 1)); }
.ev.first .ev-time { font-size: calc(1.3em * var(--maison-font-scale, 1)); }
.ev-e { grid-area: ev; padding-left: 18px; overflow: hidden; min-width: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.ev.none { grid-template-areas: "ev"; color: var(--m-muted); }
.ev.none .ev-e { padding: 0; }
.ev.today { background: var(--m-pop); color: var(--m-on-pop); }
.ev.today .ev-date { border-right-color: currentColor; }
.ev.today .ev-day { color: inherit; opacity: .8; }
</style>`;

/* ================================================================== jauge */

class MaisonJaugeCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison", min: 0, max: 100, decimals: 0 }; }

  _check(c) { if (!c.entity) throw new Error("Indiquez « entity »"); }

  _ids() { return [this._config.entity, ...(this._config.secondary || []).map((s) => (typeof s === "string" ? s : s.entity))].filter(Boolean); }

  _render(c, hass) {
    const o = hass.states[c.entity];
    const v = num(o?.state);
    const min = Number(c.min) || 0;
    const max = Number(c.max) || 100;
    const pct = v === null ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
    const R = 80, C = 2 * Math.PI * R, arc = C * 0.75;
    const unit = c.unit ?? o?.attributes?.unit_of_measurement ?? "";
    const sec = (c.secondary || []).slice(0, 3).map((s) => {
      const x = typeof s === "string" ? { entity: s } : s;
      const so = hass.states[x.entity];
      const sv = num(so?.state);
      const u = x.unit ?? so?.attributes?.unit_of_measurement ?? "";
      return `<div class="jg-s"${this._click(this._cfgAct(x.tap_action ?? c.tap_action, { action: "more-info" }, x.entity), null, friendly(so))}><ha-icon icon="${esc(x.icon || so?.attributes?.icon || "mdi:circle-small")}"></ha-icon>` +
        `<span>${sv === null ? esc(so?.state ?? "—") : fmt(sv, Number(x.decimals ?? 0))}${u ? ` ${esc(u)}` : ""}</span></div>`;
    }).join("");
    const gid = `g${Math.random().toString(36).slice(2, 8)}`;
    const tap = this._cfgAct(c.tap_action, { action: "more-info" }, c.entity);
    return `<div class="jg"${this._click(tap, null, friendly(o))}><svg viewBox="0 0 200 200" aria-hidden="true">` +
      `<defs><linearGradient id="${gid}" x1="0" x2="1" y1="1" y2="0"><stop offset="0" stop-color="var(--m-pop)"/><stop offset="1" stop-color="var(--m-acc)"/></linearGradient></defs>` +
      `<circle cx="100" cy="100" r="${R}" class="jg-bg" stroke-dasharray="${arc} ${C}" transform="rotate(135 100 100)"/>` +
      `<circle cx="100" cy="100" r="${R}" class="jg-v" stroke="url(#${gid})" stroke-dasharray="${(arc * pct).toFixed(1)} ${C}" transform="rotate(135 100 100)"/></svg>` +
      `<div class="jg-o"><div class="jg-m">${v === null ? "—" : fmt(v, Number(c.decimals) || 0)}<span>${esc(unit)}</span></div><div class="jg-line"></div>${sec}</div>` +
      `<div class="jg-n">${tpl(c.name ?? friendly(o), hass)}</div></div>`;
  }

  getCardSize() { return 4; }
}
MaisonJaugeCard.STYLE = `<style>
.jg { position: relative; aspect-ratio: 1; max-height: 320px; margin: 0 auto; }
.jg svg { position: absolute; inset: 6%; width: 88%; height: 88%; }
.jg-bg { fill: none; stroke: var(--m-chip); stroke-width: 14; stroke-linecap: round; }
.jg-v { fill: none; stroke-width: 14; stroke-linecap: round; transition: stroke-dasharray .6s; }
.jg-o { position: absolute; inset: 22% 18% 22%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
.jg-m { font-size: clamp(1.6rem, 15cqw, 3rem); font-weight: 400; line-height: 1; }
.jg-m span { font-size: .38em; margin-left: 3px; color: var(--m-muted); }
.jg-line { width: 55%; height: 4px; border-radius: 4px; background: var(--m-text); opacity: .6; margin: 4px 0 6px; }
.jg-s { display: flex; align-items: center; gap: 6px; font-size: clamp(.8rem, 6cqw, 1.15rem); white-space: nowrap; }
.jg-s ha-icon { --mdc-icon-size: 20px; color: var(--m-muted); }
.jg-n { position: absolute; left: 0; right: 0; bottom: 6%; text-align: center; font-size: clamp(.8rem, 6cqw, 1.1rem); letter-spacing: .4em; text-transform: lowercase; color: var(--m-acc); opacity: .85; }
</style>`;

/* ============================================================= navigation */

class MaisonNavigationCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison", position: "fixed" }; }

  _check(c) { if (!Array.isArray(c.items) || !c.items.length) throw new Error("Indiquez « items » : une liste d'icônes et de liens"); }

  connectedCallback() {
    super.connectedCallback();
    this._onLoc = () => this._update(true);
    window.addEventListener("location-changed", this._onLoc);
    window.addEventListener("popstate", this._onLoc);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("location-changed", this._onLoc);
    window.removeEventListener("popstate", this._onLoc);
  }

  _ids() {
    const out = new Set();
    this._config.items.forEach((it) => { if (it.entity) out.add(it.entity); if (it.badge?.entity) out.add(it.badge.entity); });
    return [...out];
  }

  _cardClass() {
    const fixed = this._config.position !== "inline" && !this.editMode && !this.preview;
    return fixed ? "nav-fixed" : "nav-inline";
  }

  _render(c, hass) {
    const here = `${location.pathname}${location.hash}`;
    const items = c.items.map((it) => {
      const path = it.path || it.navigation_path;
      const active = path && (path.startsWith("#") ? location.hash === path : here === path || location.pathname === path);
      const tap = this._cfgAct(it.tap_action, path ? { action: "navigate", navigation_path: path } : it.entity ? { action: "more-info" } : null, it.entity);
      const hold = this._cfgAct(it.hold_action, null, it.entity);
      const badge = it.badge && cond(it.badge, hass, it.badge.entity || it.entity) ? `<i class="nv-b" style="background:${color(it.badge.color) || "var(--m-pop)"}"></i>` : "";
      return `<span class="nv${active ? " on" : ""}"${this._click(tap, hold, it.name || path || it.icon)} title="${esc(it.name || "")}"><ha-icon icon="${esc(it.icon || "mdi:circle")}"></ha-icon>${badge}</span>`;
    }).join("");
    return `<div class="nv-bar" style="grid-template-columns:repeat(${c.items.length},1fr)">${items}</div>`;
  }

  getCardSize() { return 1; }

  getGridOptions() { return { columns: 12, rows: "auto" }; }
}
MaisonNavigationCard.STYLE = `<style>
:host { display: block; min-height: 70px; font-family: var(--ha-font-family-body, inherit); font-synthesis-weight: var(--maison-font-synthesis, auto); }
ha-card { background: var(--m-text); color: var(--m-card); border-radius: 100px; padding: 8px 10px; overflow: visible; }
ha-card.th-v2 { background: #0f1724; color: #e7edf5; }
ha-card.nav-fixed { position: fixed; z-index: 6; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); left: 10px; width: calc(100% - 20px); height: auto; box-shadow: 0 6px 24px rgba(0,0,0,.25); }
@media (min-width: 871px) {
  ha-card.nav-fixed { width: min(640px, calc(100% - var(--mdc-drawer-width, 0px) - 40px)); left: calc((100% + var(--mdc-drawer-width, 0px)) / 2); transform: translateX(-50%); }
}
.nv-bar { display: grid; align-items: center; }
.nv { position: relative; height: 50px; display: grid; place-items: center; border-radius: 50px; }
.nv ha-icon { --mdc-icon-size: 24px; }
.nv.on { background: var(--m-pop); color: var(--m-on-pop); }
.nv-b { position: absolute; top: 8px; right: calc(50% - 18px); width: 9px; height: 9px; border-radius: 50%; }
</style>`;

/* ============================================================ horloge et menu */

class MaisonHorlogeCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison", show_date: true }; }

  _cardClass() { return "bare"; }

  connectedCallback() {
    super.connectedCallback();
    this._onLoc = () => this._update(true);
    window.addEventListener("location-changed", this._onLoc);
    window.addEventListener("popstate", this._onLoc);
    window.addEventListener("hashchange", this._onLoc);
    // redessine pile au changement de minute
    const next = () => {
      this._clk = setTimeout(() => { this._update(true); next(); }, 60e3 - (Date.now() % 60e3) + 50);
    };
    clearTimeout(this._clk);
    next();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._clk);
    window.removeEventListener("location-changed", this._onLoc);
    window.removeEventListener("popstate", this._onLoc);
    window.removeEventListener("hashchange", this._onLoc);
  }

  _ids() {
    const out = new Set();
    JSON.stringify([this._config.items, this._config.info]).replace(/(?:\{|"entity":")([a-z_]+\.[a-z0-9_]+)/g, (m, id) => out.add(id));
    return [...out];
  }

  _render(c, hass) {
    const now = new Date();
    const lang = hass?.locale?.language || hass?.language || "fr";
    const time = now.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
    const date = c.show_date === false ? "" : now.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" });
    const here = `${location.pathname}${location.hash}`;
    const items = (c.items || []).map((it) => {
      const path = it.path || it.navigation_path;
      const active = path && (path.startsWith("#") ? location.hash === path : here === path || location.pathname === path);
      const tap = this._cfgAct(it.tap_action, path ? { action: "navigate", navigation_path: path } : it.entity ? { action: "more-info" } : null, it.entity);
      const hold = this._cfgAct(it.hold_action, null, it.entity);
      return `<div class="hm-i${active ? " on" : ""}"${this._click(tap, hold, it.name || path)}><span>${tpl(it.name || "", hass, it.entity)}</span>` +
        `${it.icon ? `<ha-icon icon="${esc(it.icon)}"></ha-icon>` : ""}</div>`;
    }).join("");
    const info = [].concat(c.info || []).map((x) => {
      const spec = typeof x === "string" ? { text: x } : x;
      if (spec.show && !cond(spec.show, hass, spec.entity)) return "";
      const txt = pickText(spec.text, hass, spec.entity);
      if (!txt) return "";
      const tap = this._cfgAct(spec.tap_action, spec.entity ? { action: "more-info" } : null, spec.entity);
      return `<div class="hm-x"${this._click(tap, null, txt)}>${spec.icon ? `<ha-icon icon="${esc(spec.icon)}"></ha-icon>` : ""}<span>${txt}</span></div>`;
    }).join("");
    return `<div class="hm-c">${esc(time)}</div>${date ? `<div class="hm-d">${esc(date)}</div>` : ""}` +
      (items ? `<div class="hm-m">${items}</div>` : "") + (info ? `<div class="hm-xs">${info}</div>` : "");
  }

  getCardSize() { return 6; }

  getGridOptions() { return { columns: 12, rows: "auto" }; }
}
MaisonHorlogeCard.STYLE = `<style>
ha-card.bare { background: none; border: none; box-shadow: none; border-radius: 0; overflow: visible; padding: 4px 6px; }
.hm-c { font-size: 64px; font-weight: 600; letter-spacing: .04em; line-height: 1; text-align: center; }
.hm-d { margin-top: 6px; text-align: center; font-size: calc(15px * var(--maison-font-scale, 1)); font-weight: 300; color: var(--m-muted); }
.hm-m { margin-top: 26px; display: flex; flex-direction: column; gap: 4px; padding-top: 18px; border-top: 1px solid var(--m-line); }
.hm-i { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px 10px 18px; border-radius: 14px;
  font-size: 19px; font-weight: 300; letter-spacing: .3em; text-transform: lowercase; transition: background .2s; }
.hm-i ha-icon { --mdc-icon-size: 22px; opacity: .55; }
.hm-i.on { background: color-mix(in srgb, var(--m-blue) 22%, var(--m-card)); color: var(--m-blue-dark); }
.hm-i.on ha-icon { opacity: 1; }
.hm-xs { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--m-line); display: flex; flex-direction: column; gap: 8px; }
.hm-x { display: flex; align-items: center; gap: 8px; font-size: calc(15px * var(--maison-font-scale, 1)); font-weight: 300; }
.hm-x ha-icon { --mdc-icon-size: 20px; color: var(--m-acc); }
</style>`;

/* ================================================================== titre */

class MaisonTitreCard extends MaisonCard {
  static get DEFAULTS() { return { theme: "maison" }; }

  _cardClass() { return "bare"; }

  _render(c, hass) {
    const tap = this._cfgAct(c.tap_action, null);
    return `<div class="ti${c.style === "subtitle" ? " sub" : ""}"${this._click(tap, null, c.title)}>` +
      `${c.icon ? `<ha-icon icon="${esc(c.icon)}"></ha-icon>` : ""}<span>${tpl(c.title || "", hass)}</span></div>`;
  }

  getCardSize() { return 1; }

  getGridOptions() { return { columns: "full", rows: "auto" }; }
}
MaisonTitreCard.STYLE = `<style>
ha-card.bare { background: none; border: none; box-shadow: none; border-radius: 0; overflow: visible; }
.ti { display: flex; align-items: center; gap: 8px; padding: 6px 4px 2px; font-size: 16px; font-weight: 400; line-height: 1.4; color: var(--m-text); }
.ti.sub { font-size: 14px; color: var(--m-muted); }
.ti ha-icon { --mdc-icon-size: 20px; color: var(--m-acc); }
.ti[role="button"] { cursor: pointer; }
</style>`;

/* ================================================================= pop-up */

/** Crée une carte Lovelace (y compris les cartes HA de base) à partir de sa configuration. */
async function createCard(cfg) {
  if (window.loadCardHelpers) {
    const helpers = await window.loadCardHelpers();
    return helpers.createCardElement(cfg);
  }
  const tag = String(cfg.type || "").startsWith("custom:") ? cfg.type.slice(7) : `hui-${cfg.type}-card`;
  await customElements.whenDefined(tag).catch(() => {});
  const el = document.createElement(tag);
  el.setConfig?.(cfg);
  return el;
}

class MaisonPopupCard extends HTMLElement {
  static get DEFAULTS() { return { theme: "maison", close_on_click_outside: true }; }

  setConfig(config) {
    if (!config?.hash || !String(config.hash).startsWith("#")) throw new Error("Indiquez « hash » : le lien qui ouvre la fenêtre, par exemple #lumieres");
    if (!Array.isArray(config.cards) && !Array.isArray(config.tabs)) throw new Error("Indiquez « cards » (ou « tabs ») : les cartes de la fenêtre");
    this._config = { ...MaisonPopupCard.DEFAULTS, ...config };
    this._tabs = Array.isArray(config.tabs) && config.tabs.length ? config.tabs : [{ cards: config.cards || [] }];
    this._tab = Math.min(this._tab || 0, this._tabs.length - 1);
    this._cache = {};
    this._els = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._build();
  }

  set hass(h) {
    this._hass = h;
    Object.values(this._cache || {}).flat().forEach((el) => { el.hass = h; });
    const cls = themeClass(this._config?.theme, h);
    if (this._cls !== cls) { this._cls = cls; this._build(); }
  }

  set editMode(v) { this._edit = v; this._build(); }

  set preview(v) { this._prev = v; this._build(); }

  connectedCallback() {
    this._onLoc = () => this._sync();
    window.addEventListener("location-changed", this._onLoc);
    window.addEventListener("popstate", this._onLoc);
    window.addEventListener("hashchange", this._onLoc);
    this._onKey = (ev) => { if (ev.key === "Escape" && this._open) this._close(); };
    document.addEventListener("keydown", this._onKey);
    this._sync();
  }

  disconnectedCallback() {
    window.removeEventListener("location-changed", this._onLoc);
    window.removeEventListener("popstate", this._onLoc);
    window.removeEventListener("hashchange", this._onLoc);
    document.removeEventListener("keydown", this._onKey);
    clearTimeout(this._auto);
  }

  getCardSize() { return this._edit ? 4 : 0; }

  getGridOptions() { return { columns: 12, rows: "auto" }; }

  /** Cartes de l'onglet en cours, créées une seule fois. */
  async _ensureCards() {
    const i = this._tab || 0;
    if (this._cache[i]) return this._cache[i];
    this._creating = this._creating || {};
    if (this._creating[i]) return this._creating[i];
    this._creating[i] = Promise.all((this._tabs[i].cards || []).map((cfg) => createCard(cfg).catch((err) => {
      const d = document.createElement("div");
      d.textContent = `Carte invalide : ${err?.message || err}`;
      return d;
    }))).then((els) => {
      els.forEach((el) => { if (this._hass) el.hass = this._hass; });
      this._cache[i] = els;
      this._creating[i] = null;
      return els;
    });
    return this._creating[i];
  }

  _tabsHtml() {
    if (this._tabs.length < 2) return "";
    return `<div class="pp-tabs" role="tablist">${this._tabs.map((t, i) => `<button class="pp-tab${i === this._tab ? " on" : ""}" role="tab" aria-selected="${i === this._tab}" data-tab="${i}">` +
      `${t.icon ? `<ha-icon icon="${esc(t.icon)}"></ha-icon>` : ""}${esc(t.name ?? `Onglet ${i + 1}`)}</button>`).join("")}</div>`;
  }

  _editing() { return !!(this._edit || this._prev); }

  _build() {
    if (!this.shadowRoot || !this._config) return;
    const c = this._config;
    const cls = themeClass(c.theme, this._hass);
    const editing = this._editing();
    const w = c.width_desktop || c.width || "";
    this.shadowRoot.innerHTML = `${BASE_STYLE}${MaisonPopupCard.STYLE}` +
      (editing
        ? `<ha-card class="${cls} pp-edit"><div class="pp-eh"><ha-icon icon="${esc(c.icon || "mdi:window-maximize")}"></ha-icon><span>Fenêtre ${esc(c.hash)}${c.title ? ` · ${esc(c.title)}` : ""}</span></div>${this._tabsHtml()}<div class="pp-c"></div></ha-card>`
        : `<div class="pp-ov${this._open ? " open" : ""}" part="overlay"><div class="pp-bd"></div>` +
          `<ha-card class="${cls} pp-sheet" role="dialog" aria-modal="true" aria-label="${esc(c.title || c.hash)}" style="${w ? `--pp-w:${esc(w)}` : ""}">` +
          `<div class="pp-h">${c.icon ? `<span class="pp-i"><ha-icon icon="${esc(c.icon)}"></ha-icon></span>` : ""}<span class="pp-t">${esc(c.title || "")}</span>` +
          `<button class="pp-x" aria-label="Fermer"><ha-icon icon="mdi:close"></ha-icon></button></div>${this._tabsHtml()}<div class="pp-c"></div></ha-card></div>`);
    const slot = this.shadowRoot.querySelector(".pp-c");
    const mount = () => this._ensureCards().then((els) => { slot.replaceChildren(...els); });
    if (editing || this._open) mount();
    this.shadowRoot.querySelectorAll(".pp-tab").forEach((b) => b.addEventListener("click", () => {
      this._tab = Number(b.dataset.tab);
      this.shadowRoot.querySelectorAll(".pp-tab").forEach((x, i) => { x.classList.toggle("on", i === this._tab); x.setAttribute("aria-selected", String(i === this._tab)); });
      mount();
    }));
    if (!editing) {
      this.shadowRoot.querySelector(".pp-x").addEventListener("click", () => this._close());
      this.shadowRoot.querySelector(".pp-bd").addEventListener("click", () => { if (c.close_on_click_outside !== false) this._close(); });
    }
  }

  _sync() {
    if (!this._config || this._editing()) return;
    const want = location.hash === this._config.hash;
    if (want === !!this._open) return;
    this._open = want;
    const ov = this.shadowRoot?.querySelector(".pp-ov");
    if (!ov) return;
    if (want) {
      const slot = this.shadowRoot.querySelector(".pp-c");
      this._ensureCards().then((els) => { slot.replaceChildren(...els); });
      ov.classList.add("open");
      document.documentElement.style.overflow = "hidden";
      if (this._config.open_action) this._act(this._config.open_action);
      clearTimeout(this._auto);
      const ms = Number(this._config.auto_close) || 0;
      if (ms > 0) this._auto = setTimeout(() => this._close(), ms);
      setTimeout(() => this.shadowRoot.querySelector(".pp-x")?.focus(), 50);
    } else {
      ov.classList.remove("open");
      document.documentElement.style.overflow = "";
      clearTimeout(this._auto);
      if (this._config.close_action) this._act(this._config.close_action);
    }
  }

  _act(a) {
    if (!this._hass || !a) return;
    const svc = a.perform_action || a.service;
    if ((a.action === "perform-action" || a.action === "call-service") && svc?.includes(".")) {
      const [d, s] = svc.split(".");
      this._hass.callService(d, s, a.data || {}, a.target);
    } else if (a.action === "navigate") navigate(a.navigation_path);
  }

  _close() {
    if (location.hash !== this._config.hash) { this._sync(); return; }
    history.replaceState(history.state, "", `${location.pathname}${location.search}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: true } }));
    this._sync();
  }
}
MaisonPopupCard.STYLE = `<style>
:host { display: block; font-family: var(--ha-font-family-body, inherit); font-synthesis-weight: var(--maison-font-synthesis, auto); }
.pp-ov { position: fixed; inset: 0; z-index: 7; display: none; align-items: flex-end; justify-content: center; }
.pp-ov.open { display: flex; }
.pp-bd { position: absolute; inset: 0; background: rgba(0, 0, 0, .35); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); animation: pp-f .2s; }
.pp-sheet { position: relative; width: 100%; max-height: 92vh; height: auto; display: flex; flex-direction: column; border-radius: 28px 28px 0 0;
  background: color-mix(in srgb, var(--m-chip) 92%, transparent); animation: pp-up .25s ease-out; overflow: hidden; }
.th-maison.pp-sheet { background: var(--popupBG, color-mix(in srgb, var(--m-chip) 92%, transparent)); }
@media (min-width: 768px) {
  .pp-ov { align-items: center; }
  .pp-sheet { width: var(--pp-w, min(90vw, 900px)); max-width: calc(100vw - 40px); max-height: 86vh; border-radius: 28px; animation: pp-f .2s; }
}
.pp-h { display: flex; align-items: center; gap: 10px; padding: 14px 14px 6px 18px; }
.pp-i { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--m-text); color: var(--m-card); flex: none; }
.pp-t { flex: 1; font-size: 1.15rem; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-x { all: unset; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; background: var(--m-card); color: var(--m-text); }
.pp-x:focus-visible { outline: 2px solid var(--m-pop); }
.pp-c { overflow-y: auto; padding: 8px 14px calc(18px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 12px; overscroll-behavior: contain; }
.pp-tabs { display: flex; justify-content: center; gap: 8px; padding: 4px 14px 6px; flex-wrap: wrap; }
.pp-tab { all: unset; display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px 9px 12px; border-radius: 50px; cursor: pointer; background: var(--m-text); color: var(--m-card); font-size: 14px; }
.pp-tab ha-icon { --mdc-icon-size: 20px; }
.pp-tab.on { background: var(--m-pop); color: var(--m-on-pop); }
.pp-tab:focus-visible { outline: 2px solid var(--m-pop); outline-offset: 2px; }
.pp-edit { border: 2px dashed var(--m-line); background: none; }
.pp-edit .pp-c { padding: 10px; }
.pp-eh { display: flex; align-items: center; gap: 8px; padding: 10px 12px 0; font-weight: 600; color: var(--m-muted); }
@keyframes pp-up { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes pp-f { from { opacity: 0; } to { opacity: 1; } }
</style>`;

/* ================================================================ éditeurs */

const E = (name, domain, extra = {}) => ({ name, selector: { entity: { ...(domain ? { domain } : {}), ...extra } } });
const T = (name) => ({ name, selector: { text: {} } });
const B = (name) => ({ name, selector: { boolean: {} } });
const N = (name, min, max, step = 1) => ({ name, selector: { number: { min, max, step, mode: "box" } } });
const I = (name) => ({ name, selector: { icon: {} } });
const S = (name, options) => ({ name, selector: { select: { mode: "dropdown", options } } });
const allStrings = (v) => v === undefined || (Array.isArray(v) && v.every((x) => typeof x === "string"));

const LABELS = {
  theme: "Thème", name: "Nom", title: "Titre", style: "Style", tile: "Style des tuiles", show_date: "Afficher la date", icon: "Icône", entity: "Entité", entities: "Entités", columns: "Colonnes (vide = automatique)",
  wrap: "Pastilles sur plusieurs lignes", align: "Alignement", area: "Pièce", temperature: "Température", humidity: "Humidité",
  media_player: "Lecteur multimédia", path: "Lien au clic (ex. #salon)", corner: "Coin carré", graph: "Courbe de température 24 h",
  height: "Hauteur (px)", row_height: "Hauteur d'une pièce (px)", slider: "Curseur de position", select: "Sélecteur de groupe (input_select)",
  code: "Code de l'alarme (sinon clavier)", modes: "Modes affichés", info: "Info à côté du nom (modèle {…})", subtitle: "Sous-titre",
  alert: "Alerte (input_boolean, ex. vider le bac)", alert_text: "Texte de l'alerte", battery: "Batterie", range: "Autonomie",
  odometer: "Kilométrage", charging: "En charge", plugged: "Branchée", charger_power: "Puissance de charge", climate: "Climatisation",
  lock: "Verrouillage", location: "Position", prefix: "Préfixe des entités (si non détectées)", progress: "Progression",
  remaining: "Temps restant", stage: "État", nozzle: "Buse", bed: "Plateau", camera: "Caméra", pause: "Bouton pause", resume: "Bouton reprise",
  stop: "Bouton arrêt", camera_view: "Caméra", day_entity: "Jour choisi (input_select, facultatif)", todo: "Liste de courses",
  first_day: "Premier jour de la semaine", short_days: "Jours abrégés", forecast_type: "Prévisions", days: "Jours",
  show_graph: "Courbe 24 h", max: "Nombre maximum", min: "Minimum", unit: "Unité", decimals: "Décimales", secondary: "Valeurs secondaires",
  position: "Position", hash: "Lien d'ouverture (#…)", width_desktop: "Largeur sur ordinateur (ex. 70%)", auto_close: "Fermeture automatique (ms)",
  show_camera: "Afficher la caméra", file: "Fichier en cours",
  devices: "Appareils (vide = tous)", low: "Batterie faible à partir de (%)", show_location: "Afficher la zone (maison, absent…)",
  stale_hours: "Appareil muet (gris) sans nouvelles depuis (heures, 0 = jamais)",
};

const EDITORS = {
  "maison-chips-card": [() => [B("wrap"), S("align", [{ value: "left", label: "À gauche" }, { value: "center", label: "Centré" }]), THEME_SELECT],
    "Sans « chips: » en YAML, la carte trouve seule Tempo, portail, ouvertures, lumières, alarme, robot, imprimante 3D et piles faibles. Les pastilles personnalisées se règlent en YAML (voir le README)."],
  "maison-piece-card": [() => [{ name: "area", selector: { area: {} } }, T("name"), I("icon"), E("temperature", "sensor"), E("humidity", "sensor"), E("media_player", "media_player"), T("path"),
    S("corner", ["bottom-right", "bottom-left", "top-right", "top-left", "none"].map((v) => ({ value: v, label: { "bottom-right": "En bas à droite", "bottom-left": "En bas à gauche", "top-right": "En haut à droite", "top-left": "En haut à gauche", none: "Aucun" }[v] }))), B("graph"), THEME_SELECT],
    "Choisissez une pièce : température, humidité, ouvertures, lumières et lecteur sont trouvés tout seuls. Ouvertures et lumières se règlent aussi en YAML (doors:, lights:)."],
  "maison-plan-card": [() => [T("title"), N("row_height", 60, 400), THEME_SELECT],
    "Sans « floors: » en YAML, les étages et pièces de Home Assistant sont utilisés. Plan personnalisé (grille, favoris) : voir le README."],
  "maison-boutons-card": [(c) => [...(allStrings(c.entities) && !c.sections ? [{ name: "entities", selector: { entity: { multiple: true } } }] : []), T("title"), N("columns", 1, 8),
    S("tile", [{ value: "classique", label: "Classique : état en grand et interrupteur" }, { value: "carre", label: "Carré : icône, nom et état" }]), THEME_SELECT],
    "Vide : toutes les lumières, rangées par étage. Sections, textes et couleurs : en YAML."],
  "maison-volets-card": [(c) => [...(allStrings(c.entities) && !c.sections && !c.tabs ? [{ name: "entities", selector: { entity: { multiple: true, domain: "cover" } } }] : []), N("columns", 1, 6), B("slider"), THEME_SELECT],
    "Vide : tous les volets, rangés par étage. Groupes avec sélecteur (tabs:) : en YAML."],
  "maison-alarme-card": [() => [E("entity", "alarm_control_panel"), T("name"), T("code"),
    { name: "modes", selector: { select: { multiple: true, options: ["away", "home", "night", "vacation", "custom_bypass", "disarm"].map((v) => ({ value: v, label: ALARM_MODES[v].label })) } } }, THEME_SELECT]],
  "maison-mode-card": [() => [E("entity", ["input_select", "select"]), T("name"), T("subtitle"), I("icon"), T("info"), THEME_SELECT],
    "Icônes et noms par option : en YAML (options:)."],
  "maison-robot-card": [() => [E("entity", "vacuum"), T("name"), E("battery", "sensor"), E("alert", "input_boolean"), T("alert_text"), THEME_SELECT]],
  "maison-voiture-card": [() => [T("name"), I("icon"), E("battery", "sensor"), E("range", "sensor"), E("odometer", "sensor"), E("charging"), E("plugged", "binary_sensor"),
    E("charger_power", "sensor"), E("climate", "climate"), E("lock", "lock"), E("location", "device_tracker"), T("prefix"), THEME_SELECT],
    "Tesla (Fleet, Teslemetry, Tessie, Tesla custom) est détectée seule. Pour une autre voiture, choisissez au moins la batterie."],
  "maison-telephones-card": [() => [T("title"), I("icon"), { name: "devices", selector: { device: { integration: "mobile_app", multiple: true } } }, N("low", 0, 100), N("stale_hours", 0, 720), B("show_location"), THEME_SELECT],
    "Les téléphones et tablettes de l'application Home Assistant (Companion) sont trouvés seuls. Un clic sur un appareil affiche son détail."],
  "maison-imprimante-card": [() => [T("name"), T("prefix"), E("progress", "sensor"), E("remaining", "sensor"), E("stage", "sensor"), E("nozzle", "sensor"), E("bed", "sensor"),
    E("camera", "camera"), E("pause", "button"), E("resume", "button"), E("stop", "button"),
    S("camera_view", [{ value: "live", label: "Vidéo en direct" }, { value: "image", label: "Image" }]), B("show_camera"), THEME_SELECT],
    "Bambu Lab, Moonraker (Klipper) et OctoPrint sont détectés seuls ; sinon indiquez le préfixe des entités."],
  "maison-menu-card": [() => [E("todo", "todo"), E("day_entity", "input_select"), S("first_day", DAYS_FR.map((d) => ({ value: d, label: d }))), B("short_days"), THEME_SELECT],
    "Les capteurs sensor.menu_lundi, …_mardi… sont trouvés seuls ; sinon, en YAML : days:."],
  "maison-meteo-card": [() => [E("entity", "weather"), E("temperature", "sensor"), E("humidity", "sensor"), S("forecast_type", [{ value: "daily", label: "Par jour" }, { value: "hourly", label: "Par heure" }]),
    N("days", 0, 10), B("show_graph"), THEME_SELECT]],
  "maison-agenda-card": [(c) => [...(allStrings([].concat(c.entities || [])) ? [{ name: "entities", selector: { entity: { multiple: true, domain: "calendar" } } }] : []), N("days", 1, 365), N("max", 1, 10), THEME_SELECT]],
  "maison-jauge-card": [(c) => [E("entity"), T("name"), T("unit"), N("min", -1e6, 1e6, 0.1), N("max", -1e6, 1e6, 0.1), N("decimals", 0, 3),
    ...(allStrings(c.secondary) ? [{ name: "secondary", selector: { entity: { multiple: true } } }] : []), THEME_SELECT]],
  "maison-navigation-card": [() => [S("position", [{ value: "fixed", label: "Fixée en bas de l'écran" }, { value: "inline", label: "Dans la page" }]), THEME_SELECT],
    "Les icônes et liens se règlent en YAML (items:)."],
  "maison-horloge-card": [() => [B("show_date"), THEME_SELECT],
    "Le menu (items: nom, icône, lien) et les lignes d'info (info:) se règlent en YAML."],
  "maison-titre-card": [() => [T("title"), I("icon"), S("style", [{ value: "title", label: "Titre" }, { value: "subtitle", label: "Sous-titre" }]), THEME_SELECT],
    "Remplace la carte Titre de Home Assistant, avec la police et les couleurs du thème des Cartes Maison."],
  "maison-popup-card": [() => [T("hash"), T("title"), I("icon"), T("width_desktop"), N("auto_close", 0, 600000, 1000), THEME_SELECT],
    "Les cartes de la fenêtre se règlent en YAML (cards:). Un bouton avec « navigate » vers ce lien ouvre la fenêtre."],
};


/* ============================================================ enregistrement */

const CARDS = [
  ["maison-chips-card", MaisonChipsCard, "Maison · Pastilles", "Barre de pastilles : Tempo, portail, ouvertures, batteries, machines, poubelles… avec conditions d'affichage.", () => ({})],
  ["maison-piece-card", MaisonPieceCard, "Maison · Pièce", "Une pièce : température, humidité, courbe 24 h, ouvertures, lumières allumées, média en cours.",
    (h) => ({ area: areasOf(h)[0]?.area_id || "salon" })],
  ["maison-plan-card", MaisonPlanCard, "Maison · Plan par étage", "Les pièces de la maison, avec onglets Favoris et étages.", () => ({})],
  ["maison-boutons-card", MaisonBoutonsCard, "Maison · Lumières et interrupteurs", "Tuiles On / Off pour lumières, prises et interrupteurs, rangées par étage.", () => ({})],
  ["maison-volets-card", MaisonVoletsCard, "Maison · Volets", "Volets : position, montée, descente, curseur, groupes.", () => ({})],
  ["maison-alarme-card", MaisonAlarmeCard, "Maison · Alarme", "Alarme : modes absent, nuit, vacances et désarmée, avec clavier.", () => ({})],
  ["maison-mode-card", MaisonModeCard, "Maison · Sélecteur de mode", "Un input_select ou select en boutons : chauffage, ballon, saison, activités…",
    (h) => ({ entity: Object.keys(h?.states || {}).find((id) => domainOf(id) === "input_select") || "input_select.mode" })],
  ["maison-robot-card", MaisonRobotCard, "Maison · Aspirateur robot", "État, batterie, surface, puissance et commandes de l'aspirateur.", () => ({})],
  ["maison-voiture-card", MaisonVoitureCard, "Maison · Voiture électrique", "Batterie, autonomie, kilométrage, charge, climatisation et verrouillage.", () => ({ name: "Voiture" })],
  ["maison-telephones-card", MaisonTelephonesCard, "Maison · Téléphones et tablettes", "Batterie, charge, réseau, stockage et zone des téléphones et tablettes (application Companion).", () => ({})],
  ["maison-imprimante-card", MaisonImprimanteCard, "Maison · Imprimante 3D", "Bambu Lab, Klipper / Moonraker ou OctoPrint : températures, avancement, caméra et commandes.", () => ({})],
  ["maison-menu-card", MaisonMenuCard, "Maison · Menu de la semaine", "Le menu jour par jour, la recette du jour, et la liste de courses.", () => ({})],
  ["maison-meteo-card", MaisonMeteoCard, "Maison · Météo", "Température extérieure en grand, prévisions et courbe 24 h.", () => ({})],
  ["maison-agenda-card", MaisonAgendaCard, "Maison · Agenda", "Les prochains événements d'un ou plusieurs calendriers.", () => ({})],
  ["maison-jauge-card", MaisonJaugeCard, "Maison · Jauge", "Jauge en fer à cheval avec deux valeurs secondaires.",
    (h) => ({ entity: Object.keys(h?.states || {}).find((id) => domainOf(id) === "sensor" && num(h.states[id].state) !== null) || "sensor.exemple", max: 100 })],
  ["maison-navigation-card", MaisonNavigationCard, "Maison · Barre de navigation", "Barre d'icônes fixée en bas de l'écran, vers vos vues et fenêtres.",
    () => ({ position: "inline", items: [{ icon: "mdi:home", path: "#" }, { icon: "mdi:lightbulb-group", path: "#lumieres" }, { icon: "mdi:window-shutter", path: "#volets" }] })],
  ["maison-horloge-card", MaisonHorlogeCard, "Maison · Horloge et menu", "Heure en grand, date, menu de navigation vertical et lignes d'info, pour une colonne latérale.",
    () => ({ items: [{ name: "home", icon: "mdi:dots-grid", path: "#" }, { name: "énergie", icon: "mdi:chart-areaspline", path: "/energy" }] })],
  ["maison-titre-card", MaisonTitreCard, "Maison · Titre", "Titre de section, avec la police et les couleurs du thème (remplace la carte Titre).",
    () => ({ title: "l a m p e s" })],
  ["maison-popup-card", MaisonPopupCard, "Maison · Fenêtre (pop-up)", "Une fenêtre qui s'ouvre sur un lien #… et contient d'autres cartes.",
    () => ({ hash: "#exemple", title: "Exemple", icon: "mdi:information-outline", cards: [{ type: "markdown", content: "Contenu de la fenêtre" }] })],
];

if (typeof customElements !== "undefined") {
  const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };
  window.customCards = window.customCards || [];
  for (const [type, cls, name, description, stub] of CARDS) {
    const [schemaFn, helper] = EDITORS[type];
    const Ed = makeEditor(schemaFn, LABELS, cls.DEFAULTS || {}, helper);
    cls.getConfigElement = () => document.createElement(`${type}-editor`);
    cls.getStubConfig = (hass) => stub(hass);
    define(type, cls);
    define(`${type}-editor`, Ed);
    if (!window.customCards.some((c) => c.type === type)) window.customCards.push({ type, name, description, preview: type !== "maison-popup-card" && type !== "maison-navigation-card" });
  }
  console.info(`%c MAISON-HA-CARDS %c ${CARD_VERSION} `, "background:#f6b38b;color:#2b2c2f;font-weight:700", "background:#2b2c2f;color:#fff");
}
})();
