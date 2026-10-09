/*
 * Xplor Deciplus card for Home Assistant — the club planning with the action on the line.
 * Companion of the `deciplus` integration (https://github.com/Zhephyr54/ha-deciplus): it
 * subscribes to the integration's `deciplus/subscribe_planning` feed and calls its services.
 * Plain web component, no build step, no dependency.
 */

const VERSION = "0.1.0";
const STATES = ["booked", "prebooked", "waiting", "available", "full", "opening", "closed"];
const MINE = ["booked", "prebooked", "waiting"];
const DEFAULT_STATUSES = STATES.filter((s) => s !== "closed");
const VIEWS = ["agenda", "day", "week", "month"];
const MONTH_MAX = 6; // events listed in a month cell before falling back to dots
// detail lines of a session and when they show: always on the line, only when expanded, never
const FIELDS = ["location", "penalty", "opens", "projection", "blocked"];
const FIELD_DEFAULTS = { location: "always", penalty: "expanded", opens: "always", projection: "always", blocked: "always" };
const FIELD_MODES = ["always", "expanded", "hidden"];
// elements the `styles` option can restyle, by a stable name → the selector inside the card
const STYLE_KEYS = {
  card: "ha-card", header: ".card-header", quota: ".quota", toolbar: ".toolbar", filters: ".filters",
  day: ".day", dayhead: ".dayhead", row: ".row", bar: ".bar", time: ".time", title: ".title", chip: ".chip",
  detail: ".detail", actions: ".actions", button: ".actions button", week_column: ".col", week_head: ".colhead",
  month_cell: ".mcell", month_day: ".mnum", month_event: ".mev", empty: ".empty",
};

const T = {
  fr: {
    booked: "Réservé", prebooked: "Pré-réservé", waiting: "En attente", available: "Disponible",
    full: "Complet", opening: "Pas encore ouvert", closed: "Passé", windowClosed: "Plus ouvert",
    book: "Réserver", queue: "Liste d'attente", prebook: "Pré-réserver", cancel: "Annuler",
    confirm: "Confirmer l'annulation", keep: "Garder",
    agenda: "Agenda", day: "Jour", week: "Semaine", month: "Mois", today: "Aujourd'hui",
    filters: "Filtres", mine: "Mes séances", all: "Tout", allActivities: "Toutes", statuses: "Statuts", activities: "Activités",
    bookings: "Réservations", blockedNow: "Réservation bloquée", blockedShort: "bloquée",
    places: "places", position: "n°", opensOn: "Ouvre le", atOpening: "à l'ouverture",
    quotaWarn: "quota atteint à l'ouverture, réservée dès qu'une place se libère",
    blockedRetry: "bloquée, nouvel essai à chaque rafraîchissement",
    penaltyAfter: "Pénalité si annulation après le", waitingList: "liste d'attente",
    horizon: "Planning chargé jusqu'au", empty: "Aucune séance", loading: "Connexion au club…",
    quotaUnknown: "Quota pas encore connu : il est appris la première fois que le club refuse une réservation",
    emptyFiltered: "Aucune séance avec ces filtres", resetFilters: "Réinitialiser les filtres",
    absentActivity: "Activité absente du planning chargé : le filtre l'ignore",
    noDevice: "Choisissez le club (appareil Xplor Deciplus) dans la configuration de la carte.",
    done: { book: "Réservé", queue: "Inscrit en liste d'attente", prebook: "Pré-réservé", cancel: "Annulé" },
  },
  en: {
    booked: "Booked", prebooked: "Pre-booked", waiting: "Waiting list", available: "Available",
    full: "Full", opening: "Not open yet", closed: "Past", windowClosed: "No longer open",
    book: "Book", queue: "Join waiting list", prebook: "Pre-book", cancel: "Cancel",
    confirm: "Confirm cancellation", keep: "Keep",
    agenda: "Agenda", day: "Day", week: "Week", month: "Month", today: "Today",
    filters: "Filters", mine: "Mine", all: "All", allActivities: "All", statuses: "Status", activities: "Activities",
    bookings: "Bookings", blockedNow: "Booking blocked", blockedShort: "blocked",
    places: "places", position: "#", opensOn: "Opens", atOpening: "at the opening",
    quotaWarn: "quota reached at the opening, booked as soon as a slot frees",
    blockedRetry: "blocked, retried at every refresh",
    penaltyAfter: "Penalty if cancelled after", waitingList: "waiting list",
    horizon: "Planning loaded until", empty: "No session", loading: "Connecting to the club…",
    quotaUnknown: "Quota not known yet: it is learned the first time the club refuses a booking",
    emptyFiltered: "No session with these filters", resetFilters: "Reset filters",
    absentActivity: "Activity not in the loaded planning: the filter ignores it",
    noDevice: "Pick the club (Xplor Deciplus device) in the card configuration.",
    done: { book: "Booked", queue: "Joined the waiting list", prebook: "Pre-booked", cancel: "Cancelled" },
  },
};

const ICONS = {
  booked: "mdi:check-circle", prebooked: "mdi:calendar-clock", waiting: "mdi:account-clock",
  available: "mdi:calendar-plus", full: "mdi:account-group", opening: "mdi:lock-clock", closed: "mdi:lock",
};

// ---- date helpers (browser local time, which is the user's) ----------------------------

const day0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };
const startOfWeek = (d) => { const x = day0(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const startOfMonth = (d) => { const x = day0(d); x.setDate(1); return x; };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- the card --------------------------------------------------------------------------

class DeciplusCard extends HTMLElement {
  static getConfigElement() { return document.createElement("deciplus-card-editor"); }
  static getStubConfig() { return { device: "" }; }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._feed = null;
    this._error = null;
    this._expanded = null;
    this._confirming = null;
    this._busy = null;
    this._narrow = false;
    this._cursor = day0(new Date());
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("Invalid configuration");
    this._config = {
      days: 14, default_view: "agenda", show_filters: true, show_quota: true,
      compact: false, title: "", statuses: null, activities: null, colors: {}, fields: {}, ...config,
    };
    this._config.days = Number(this._config.days) || 14; // "14" from YAML would concatenate in date maths
    const fields = this._config.fields || {}; // `fields:` left empty in YAML is null
    this._fields = { ...FIELD_DEFAULTS };
    for (const f of FIELDS) if (FIELD_MODES.includes(fields[f])) this._fields[f] = fields[f];
    if (config.show_location === false) this._fields.location = "hidden"; // option of the first version
    this._customStyle = this._buildStyles(this._config.styles);
    this._prefs = this._loadPrefs();
    this._view = VIEWS.includes(this._prefs.view) ? this._prefs.view : (VIEWS.includes(this._config.default_view) ? this._config.default_view : "agenda");
    // the starting point the reset button returns to: the card options, else the defaults
    const nonEmpty = (a) => (Array.isArray(a) && a.length ? a : null);
    this._baseStatuses = nonEmpty(this._config.statuses) || DEFAULT_STATUSES;
    this._baseActivities = nonEmpty(this._config.activities) || [];
    // an empty status selection is never restored: it could not show anything
    this._statuses = new Set(nonEmpty(this._prefs.statuses) || this._baseStatuses);
    this._activities = new Set(nonEmpty(this._prefs.activities) || this._baseActivities);
    this._showFilters = this._prefs.showFilters ?? false;
    this._titles = new Set();
    for (const s of STATES) {
      const c = this._config.colors && this._config.colors[s];
      if (c) this.style.setProperty(`--deciplus-${s}-color`, c); else this.style.removeProperty(`--deciplus-${s}-color`);
    }
    this._subscribe();
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      // after a Home Assistant restart the websocket library re-subscribes on its own, but
      // the integration may not be loaded yet and that silent failure would freeze the card:
      // subscribe again ourselves once the connection is ready, with retries
      this._onReady = () => { this._unsubscribe(); this._subscribe(); };
      hass.connection.addEventListener("ready", this._onReady);
      this._subscribe();
    }
  }

  connectedCallback() {
    this._subscribe();
    if (!this._ro && "ResizeObserver" in window) {
      this._ro = new ResizeObserver((entries) => {
        const narrow = entries[0].contentRect.width < 700;
        if (narrow !== this._narrow) { this._narrow = narrow; this._render(); }
      });
      this._ro.observe(this);
    }
  }

  disconnectedCallback() {
    this._unsubscribe();
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._onReady && this._hass) { this._hass.connection.removeEventListener("ready", this._onReady); this._onReady = null; }
    this._hass = null; // so the next hass set re-attaches the listener and re-subscribes
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: "full", rows: "auto" }; } // sections dashboards: full width

  // ---- feed ----

  async _subscribe() {
    const device = this._config && this._config.device;
    if (!this._hass || !device || !this.isConnected) return;
    if (this._subKey === device) return;
    this._unsubscribe();
    this._subKey = device;
    this._error = null;
    try {
      const unsub = await this._hass.connection.subscribeMessage(
        (msg) => { this._feed = msg; this._render(); },
        { type: "deciplus/subscribe_planning", device_id: device },
      );
      if (this._subKey !== device) { unsub(); return; } // config changed meanwhile
      this._unsub = unsub;
    } catch (err) {
      this._subKey = null;
      this._error = (err && err.message) || String(err);
      this._render();
      // the club is not loaded yet (restart) or the connection blipped: try again
      this._retry = setTimeout(() => { this._retry = null; this._subscribe(); }, 10000);
    }
  }

  _unsubscribe() {
    if (this._retry) { clearTimeout(this._retry); this._retry = null; }
    if (this._unsub) { try { this._unsub(); } catch (_) { /* connection gone */ } }
    this._unsub = null;
    this._subKey = null;
  }

  // `styles: {time: "font-weight: 500", title: {color: red}}` → rules appended after the
  // defaults. Declarations only: braces and angle brackets are stripped so a value cannot
  // open another rule or leave the style element
  _buildStyles(styles) {
    if (!styles || typeof styles !== "object") return "";
    return Object.entries(styles).map(([key, value]) => {
      const selector = STYLE_KEYS[key];
      if (!selector || value == null) return "";
      const body = typeof value === "string"
        ? value
        : Object.entries(value).map(([prop, val]) => `${prop}: ${val}`).join("; ");
      return `${selector} { ${String(body).replace(/[<>{}]/g, "")} }`;
    }).join("\n");
  }

  // ---- prefs (per browser, per club) ----

  get _prefKey() { return `deciplus-card:${this._config.device}`; }
  _loadPrefs() { try { return JSON.parse(localStorage.getItem(this._prefKey) || "{}"); } catch (_) { return {}; } }
  _savePrefs() {
    try {
      localStorage.setItem(this._prefKey, JSON.stringify({
        view: this._view,
        statuses: this._statuses.size ? [...this._statuses] : undefined, // empty: back to the base next time
        activities: [...this._activities],
        showFilters: this._showFilters,
      }));
    } catch (_) { /* private mode */ }
  }

  // ---- state ----

  // the user's Home Assistant display language, nothing to configure
  get _locale() {
    const h = this._hass;
    return (h && ((h.locale && h.locale.language) || h.language)) || "en";
  }
  get _t() { return T[String(this._locale).slice(0, 2)] || T.en; }

  get _rows() {
    if (!this._feed) return [];
    return this._feed.rows.map((r) => ({ ...r, _start: new Date(r.start), _end: new Date(r.end) }));
  }

  // selected activities missing from the current planning (gone for the season, renamed) are
  // kept as chips but ignored here, so a stale selection can never hide everything
  get _activeActivities() {
    return [...this._activities].filter((a) => this._titles.has(a));
  }

  _filtersActive() {
    const base = new Set(this._baseStatuses);
    const same = this._statuses.size === base.size && [...base].every((s) => this._statuses.has(s));
    return !same || this._activeActivities.length > 0;
  }

  _visible(rows) {
    const active = new Set(this._activeActivities);
    return rows.filter((r) => this._statuses.has(r.state) && (active.size === 0 || active.has(r.title)));
  }

  _range() {
    const c = this._cursor;
    switch (this._view) {
      case "day": return [c, addDays(c, 1)];
      case "week": { const s = startOfWeek(c); return [s, addDays(s, 7)]; }
      case "month": { const s = startOfMonth(c); return [s, addMonths(s, 1)]; }
      default: return [c, addDays(c, this._config.days)];
    }
  }

  _shift(n) {
    const c = this._cursor;
    this._cursor = this._view === "month" ? addMonths(c, n) : addDays(c, n * (this._view === "day" ? 1 : this._view === "week" ? 7 : this._config.days));
    this._render();
  }

  // ---- actions ----

  async _onClick(ev) {
    const el = ev.composedPath().find((n) => n.dataset && n.dataset.action);
    if (!el) return;
    const { action, id, value } = el.dataset;
    ev.stopPropagation();
    switch (action) {
      case "view": this._view = value; this._savePrefs(); this._render(); break;
      case "prev": this._shift(-1); break;
      case "next": this._shift(1); break;
      case "today": this._cursor = day0(new Date()); this._render(); break;
      case "open-day": this._cursor = new Date(Number(value)); this._view = "day"; this._render(); break; // a drill-down, not the remembered view
      case "toggle-filters": this._showFilters = !this._showFilters; this._savePrefs(); this._render(); break;
      case "status": this._toggle(this._statuses, value); break;
      case "activity": this._toggleActivity(value); break;
      case "mine": this._statuses = new Set(MINE); this._savePrefs(); this._render(); break;
      case "all": this._statuses = new Set(DEFAULT_STATUSES); this._savePrefs(); this._render(); break;
      case "all-activities": this._activities = new Set(); this._savePrefs(); this._render(); break;
      case "reset-filters":
        this._statuses = new Set(this._baseStatuses); this._activities = new Set(this._baseActivities);
        this._savePrefs(); this._render(); break;
      case "expand": this._expanded = this._expanded === id ? null : id; this._confirming = null; this._render(); break;
      case "ask-cancel": this._confirming = id; this._render(); break;
      case "keep": this._confirming = null; this._render(); break;
      case "book": case "queue": case "prebook": case "cancel": await this._act(action, Number(id)); break;
      default: break;
    }
  }

  _toggle(set, value) {
    if (set.has(value)) set.delete(value); else set.add(value);
    this._savePrefs();
    this._render();
  }

  // "nothing selected" means every activity: a tap on a chip in that state excludes it
  // rather than keeping only it; selecting every activity again goes back to that state
  _toggleActivity(value) {
    // "every activity shown" also covers a selection made only of absent ones (dropped here)
    if (this._activeActivities.length === 0) this._activities = new Set(this._titles);
    if (this._activities.has(value)) this._activities.delete(value); else this._activities.add(value);
    if ([...this._titles].every((a) => this._activities.has(a))) this._activities = new Set();
    this._savePrefs();
    this._render();
  }

  async _act(action, id) {
    if (this._busy) return;
    this._busy = id;
    this._confirming = null;
    this._render();
    const target = { device_id: this._config.device };
    try {
      if (action === "cancel") {
        await this._hass.callService("deciplus", "cancel_booking", { session_id: id }, target);
      } else {
        await this._hass.callService("deciplus", "book_session", { session_id: id, schedule: true, waiting_list_fallback: true }, target);
      }
      this._toast(this._t.done[action]);
    } catch (err) {
      // HA already shows the translated refusal (notifyOnError); keep the row open to retry
    } finally {
      this._busy = null;
      this._render();
    }
  }

  _toast(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
  }

  // ---- render ----

  _fmtTime(d) { return d.toLocaleTimeString(this._locale, { hour: "2-digit", minute: "2-digit" }); }
  _fmtDate(d, opts) { return d.toLocaleDateString(this._locale, opts); }
  _fmtDateTime(iso) { const d = new Date(iso); return `${this._fmtDate(d, { weekday: "short", day: "2-digit", month: "2-digit" })} ${this._fmtTime(d)}`; }

  _chip(r) {
    const t = this._t;
    const q = this._feed.quota.quota;
    switch (r.state) {
      case "booked": return r.places > 1 ? `${t.booked} · ${r.places} ${t.places}` : t.booked;
      case "waiting": return `${t.waiting} · ${t.position}${r.wait_index ?? "?"}`;
      case "prebooked":
        if (r.blocked_code) return `${t.prebooked} · ${t.blockedShort}`;
        return r.projected ? `${t.prebooked} · ${r.projected}${q ? "/" + q : ""} ${t.atOpening}` : t.prebooked;
      case "available": return r.max ? `${r.booked}/${r.max}` : t.available;
      case "full": return `${t.full} · ${t.waitingList}`;
      case "opening": return `${t.opensOn} ${this._fmtDateTime(r.opens)}`;
      default: return r._start <= new Date() ? t.closed : t.windowClosed; // started, or window shut early
    }
  }

  // whether a detail line shows on this row: "always" means on the line in full mode (compact
  // rows keep it for the expanded state), "expanded" only once opened, "hidden" never
  _show(field, open, mode) {
    const v = this._fields[field];
    if (v === "hidden") return false;
    if (v === "always") return mode === "full" || open;
    return open;
  }

  _details(r, open, mode) {
    const t = this._t;
    const q = this._feed.quota.quota;
    const show = (f) => this._show(f, open, mode);
    const lines = [];
    if (r.location && show("location")) lines.push(`<ha-icon icon="mdi:map-marker"></ha-icon> ${esc(r.location)}`);
    if (r.state === "booked" && r.penalty_text && show("penalty")) lines.push(`<ha-icon icon="mdi:alert-circle-outline"></ha-icon> ${esc(t.penaltyAfter)} ${esc(this._fmtDateTime(r.penalty_after))} : ${esc(r.penalty_text)}`);
    if (r.state === "prebooked") {
      if (show("opens")) lines.push(`<ha-icon icon="mdi:clock-outline"></ha-icon> ${esc(t.opensOn)} ${esc(this._fmtDateTime(r.opens))}`);
      if (r.blocked_code && show("blocked")) lines.push(`<ha-icon icon="mdi:pause-circle-outline"></ha-icon> ${esc(t.blockedRetry)} (${esc(r.blocked_code)})`);
      else if (!r.blocked_code && q && r.projected > q && show("projection")) lines.push(`<ha-icon icon="mdi:alert"></ha-icon> ${esc(t.quotaWarn)}`);
    }
    return lines.map((l) => `<div class="detail">${l}</div>`).join("");
  }

  _actions(r) {
    const t = this._t;
    const busy = this._busy === r.id;
    if (this._confirming === String(r.id)) {
      const warn = r.penalty_text && r.penalty_after && new Date(r.penalty_after) <= new Date();
      return `<div class="actions">
        ${warn ? `<div class="warn"><ha-icon icon="mdi:alert"></ha-icon> ${esc(r.penalty_text)}</div>` : ""}
        <button class="danger" data-action="cancel" data-id="${r.id}" ${busy ? "disabled" : ""}>${esc(t.confirm)}</button>
        <button data-action="keep" data-id="${r.id}">${esc(t.keep)}</button>
      </div>`;
    }
    return `<div class="actions">${r.can.map((a) => a === "cancel"
      ? `<button class="secondary" data-action="ask-cancel" data-id="${r.id}" ${busy ? "disabled" : ""}>${esc(t.cancel)}</button>`
      : `<button class="primary" data-action="${a}" data-id="${r.id}" ${busy ? "disabled" : ""}>${esc(t[a])}</button>`).join("")}</div>`;
  }

  // mode "full": details visible, tap for the action; "compact": one line, tap for both
  _row(r, mode) {
    const open = this._expanded === String(r.id);
    const past = r._end < new Date();
    return `<div class="row ${mode} state-${r.state} ${open ? "open" : ""} ${past ? "past" : ""}" data-action="expand" data-id="${r.id}">
      <div class="bar"></div>
      <div class="time">${esc(this._fmtTime(r._start))}<span class="end"> – ${esc(this._fmtTime(r._end))}</span></div>
      <div class="main">
        <div class="title">${esc(r.title)}</div>
        <div class="chip"><ha-icon icon="${ICONS[r.state] || "mdi:calendar"}"></ha-icon>${esc(this._chip(r))}</div>
        ${this._details(r, open, mode)}
        ${open ? this._actions(r) : ""}
      </div>
    </div>`;
  }

  _group(rows, from, to, mode) {
    const t = this._t;
    const byDay = new Map();
    for (const r of rows) {
      if (r._start < from || r._start >= to) continue;
      const k = dayKey(r._start);
      if (!byDay.has(k)) byDay.set(k, { date: day0(r._start), rows: [] });
      byDay.get(k).rows.push(r);
    }
    if (byDay.size === 0) return this._emptyNotice();
    const today = day0(new Date());
    return [...byDay.values()].map(({ date, rows: rs }) => `<div class="day ${sameDay(date, today) ? "today" : ""}">
      <div class="dayhead">${esc(this._fmtDate(date, { weekday: "long", day: "numeric", month: "long" }))}</div>
      ${rs.map((r) => this._row(r, mode)).join("")}
    </div>`).join("");
  }

  _week(rows, from) {
    const today = day0(new Date());
    const cols = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(from, i);
      const rs = rows.filter((r) => sameDay(r._start, d));
      cols.push(`<div class="col ${sameDay(d, today) ? "today" : ""}">
        <div class="colhead" data-action="open-day" data-value="${d.getTime()}">${esc(this._fmtDate(d, { weekday: "short", day: "numeric" }))}</div>
        ${rs.map((r) => this._row(r, "compact")).join("") || `<div class="empty small">–</div>`}
      </div>`);
    }
    return `<div class="week">${cols.join("")}</div>`;
  }

  _month(rows, from) {
    const t = this._t;
    const today = day0(new Date());
    const first = startOfWeek(from);
    const end = addMonths(from, 1);
    const cells = [];
    const names = [];
    for (let i = 0; i < 7; i++) names.push(`<div class="mname">${esc(this._fmtDate(addDays(first, i), { weekday: "short" }))}</div>`);
    for (let d = first; d < end || cells.length % 7 !== 0; d = addDays(d, 1)) {
      const rs = rows.filter((r) => sameDay(r._start, d));
      let inner;
      if (this._narrow && rs.length === 1) {
        // a phone cell fits the two times of a single session, with the state as the bar
        const r = rs[0];
        inner = `<div class="mev tiny state-${r.state}" title="${esc(r.title)} · ${esc(this._chip(r))}"><span class="mtime">${esc(this._fmtTime(r._start))}<br>${esc(this._fmtTime(r._end))}</span></div>`;
      } else if (this._narrow || rs.length > MONTH_MAX) {
        // no room for text: one dot per state present, mine first, and the count
        const states = [...MINE, ...STATES.filter((s) => !MINE.includes(s))].filter((s) => rs.some((r) => r.state === s));
        inner = `<div class="dots">${states.map((s) => `<i class="dot state-${s}"></i>`).join("")}${rs.length ? `<span class="mcount">${rs.length}</span>` : ""}</div>`;
      } else {
        inner = rs.map((r) => `<div class="mev state-${r.state}" title="${esc(r.title)} · ${esc(this._chip(r))}"><span class="mtime">${esc(this._fmtTime(r._start))} – ${esc(this._fmtTime(r._end))}</span> <span class="mtitle">${esc(r.title)}</span></div>`).join("");
      }
      cells.push(`<div class="mcell ${d.getMonth() !== from.getMonth() ? "other" : ""} ${sameDay(d, today) ? "today" : ""}" data-action="open-day" data-value="${d.getTime()}">
        <div class="mnum">${d.getDate()}</div>
        ${inner}
      </div>`);
    }
    const horizon = addDays(today, this._feed.horizon_days);
    return `<div class="month">${names.join("")}${cells.join("")}</div>
      <div class="foot">${esc(t.horizon)} ${esc(this._fmtDate(horizon, { day: "numeric", month: "long" }))}</div>`;
  }

  _header() {
    const t = this._t;
    const [from, to] = this._range();
    let label;
    if (this._view === "day") label = this._fmtDate(from, { weekday: "long", day: "numeric", month: "long" });
    else if (this._view === "month") label = this._fmtDate(from, { month: "long", year: "numeric" });
    else label = `${this._fmtDate(from, { day: "numeric", month: "short" })} – ${this._fmtDate(addDays(to, -1), { day: "numeric", month: "short" })}`;
    return `<div class="toolbar">
      <div class="nav">
        <button class="icon" data-action="prev" title="‹"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
        <button class="icon" data-action="today" title="${esc(t.today)}"><ha-icon icon="mdi:calendar-today"></ha-icon></button>
        <button class="icon" data-action="next" title="›"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
        <span class="label">${esc(label)}</span>
      </div>
      <div class="views">
        ${VIEWS.map((v) => `<button class="tab ${this._view === v ? "on" : ""}" data-action="view" data-value="${v}">${esc(t[v])}</button>`).join("")}
        ${this._config.show_filters ? `<button class="icon ${this._showFilters ? "on" : ""}" data-action="toggle-filters" title="${esc(t.filters)}"><ha-icon icon="mdi:filter-variant"></ha-icon></button>` : ""}
      </div>
    </div>`;
  }

  // the empty state names the cause when a filter is the reason, with the way out
  _emptyNotice() {
    const t = this._t;
    if (!this._filtersActive()) return `<div class="empty">${esc(t.empty)}</div>`;
    return `<div class="empty">${esc(t.emptyFiltered)}<br><button class="shortcut" data-action="reset-filters">${esc(t.resetFilters)}</button></div>`;
  }

  _filters() {
    const t = this._t;
    // current titles, plus selected ones the planning no longer has (so they can be unselected)
    const activities = [...new Set([...this._titles, ...this._activities])].sort((a, b) => a.localeCompare(b));
    const allOn = this._activeActivities.length === 0; // what the filter really does
    return `<div class="filters">
      <div class="frow"><span class="flabel">${esc(t.statuses)}</span>
        <button class="shortcut" data-action="mine">${esc(t.mine)}</button>
        <button class="shortcut" data-action="all">${esc(t.all)}</button>
        ${STATES.map((s) => `<button class="chipbtn state-${s} ${this._statuses.has(s) ? "on" : ""}" data-action="status" data-value="${s}"><ha-icon icon="${ICONS[s]}"></ha-icon>${esc(t[s])}</button>`).join("")}
      </div>
      <div class="frow"><span class="flabel">${esc(t.activities)}</span>
        <button class="shortcut" data-action="all-activities">${esc(t.allActivities)}</button>
        ${activities.map((a) => `<button class="chipbtn ${allOn || this._activities.has(a) ? "on" : ""} ${this._titles.has(a) ? "" : "absent"}" data-action="activity" data-value="${esc(a)}" ${this._titles.has(a) ? "" : `title="${esc(t.absentActivity)}"`}>${esc(a)}</button>`).join("")}
      </div>
    </div>`;
  }

  _quota() {
    const t = this._t;
    const q = this._feed.quota;
    const blocked = q.blocked && q.blocked.length;
    const tip = blocked ? (q.blocked || []).join(", ") : (q.quota ? "" : t.quotaUnknown);
    return `<div class="quota ${blocked ? "blocked" : ""}" title="${esc(tip)}">
      ${blocked ? `<ha-icon icon="mdi:alert-circle"></ha-icon>` : ""}
      ${esc(t.bookings)} : <b>${q.held} / ${q.quota || "?"}</b>
      ${q.waiting_list ? `<span class="sub">(${q.bookings} + ${q.waiting_list} ${esc(t.waiting.toLowerCase())})</span>` : ""}
      ${blocked ? `<span class="sub">· ${esc(t.blockedNow)}</span>` : ""}
    </div>`;
  }

  _render() {
    if (!this._config) return;
    const t = this._t;
    let body;
    if (!this._config.device) body = `<div class="empty">${esc(t.noDevice)}</div>`;
    else if (!this._feed && this._error) body = `<div class="empty error">${esc(this._error)}</div>`;
    else if (!this._feed) body = `<div class="empty">${esc(t.loading)}</div>`;
    // with a feed already in hand, a failed re-subscription keeps showing it (the retry runs)
    else {
      const all = this._rows;
      this._titles = new Set(all.map((r) => r.title));
      const rows = this._visible(all);
      const [from, to] = this._range();
      const mode = this._config.compact ? "compact" : "full";
      // a grid view with nothing in range because of the filters says so above the grid
      const none = !rows.some((r) => r._start >= from && r._start < to) && this._filtersActive();
      if (this._view === "month") body = (none ? this._emptyNotice() : "") + this._month(rows, from);
      else if (this._view === "week" && !this._narrow) body = (none ? this._emptyNotice() : "") + this._week(rows, from);
      else body = this._group(rows, from, to, mode);
    }
    const title = this._config.title || (this._feed && this._feed.club) || "";
    this.shadowRoot.innerHTML = `<style>${STYLE}\n${this._customStyle || ""}</style>
      <ha-card class="${this._narrow ? "narrow" : ""} ${this._config.compact ? "compact" : ""}">
        ${title ? `<h1 class="card-header">${esc(title)}</h1>` : ""}
        ${this._feed && this._config.show_quota ? this._quota() : ""}
        ${this._feed ? this._header() : ""}
        ${this._feed && this._config.show_filters && this._showFilters ? this._filters() : ""}
        <div class="body">${body}</div>
      </ha-card>`;
  }
}

const STYLE = `
  :host {
    --deciplus-booked-color: var(--success-color, #43a047);
    --deciplus-prebooked-color: var(--info-color, #039be5);
    --deciplus-waiting-color: var(--warning-color, #fb8c00);
    --deciplus-available-color: var(--primary-color, #03a9f4);
    --deciplus-full-color: var(--error-color, #e53935);
    --deciplus-opening-color: var(--secondary-text-color, #757575);
    --deciplus-closed-color: var(--disabled-text-color, #9e9e9e);
    display: block;
  }
  ha-card { overflow: hidden; }
  .card-header { padding: 12px 16px 0; font-size: 1.3em; font-weight: 400; margin: 0; }
  .quota { display: flex; align-items: center; gap: 6px; padding: 8px 16px 0; color: var(--secondary-text-color); font-size: 0.95em; }
  .quota.blocked { color: var(--error-color); }
  .quota .sub { font-size: 0.85em; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; padding: 8px 12px; }
  .nav { display: flex; align-items: center; gap: 2px; }
  .nav .label { margin-left: 8px; font-weight: 500; text-transform: capitalize; }
  .views { display: flex; align-items: center; gap: 2px; }
  button { font: inherit; color: var(--primary-text-color); background: none; border: none; border-radius: 8px; padding: 6px 10px; cursor: pointer; min-height: 36px; }
  button:hover { background: rgba(var(--rgb-primary-text-color, 0,0,0), 0.06); }
  button:disabled { opacity: 0.5; cursor: default; }
  button.icon { padding: 4px; min-width: 36px; }
  button.icon.on, button.tab.on { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  button.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); font-weight: 500; }
  button.secondary { border: 1px solid var(--divider-color); }
  button.danger { background: var(--error-color); color: #fff; font-weight: 500; }
  .filters { padding: 0 12px 8px; border-bottom: 1px solid var(--divider-color); }
  .frow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 0; }
  .flabel { font-size: 0.8em; color: var(--secondary-text-color); min-width: 64px; }
  .chipbtn { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--divider-color); border-radius: 16px; padding: 2px 10px; min-height: 28px; font-size: 0.85em; opacity: 0.6; }
  .chipbtn.on { opacity: 1; border-color: var(--chip-color, var(--primary-color)); background: color-mix(in srgb, var(--chip-color, var(--primary-color)) 15%, transparent); }
  .chipbtn ha-icon { --mdc-icon-size: 16px; }
  .chipbtn.absent { border-style: dashed; }
  .shortcut { border-radius: 8px; padding: 2px 10px; min-height: 28px; font-size: 0.85em; font-weight: 500; color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3,169,244), 0.12); }
  .empty .shortcut { margin-top: 10px; }
  .shortcut:hover { background: rgba(var(--rgb-primary-color, 3,169,244), 0.2); }
  .body { padding: 0 8px 8px; }
  .day { margin-top: 8px; }
  .dayhead { font-weight: 500; text-transform: capitalize; padding: 6px 8px 2px; color: var(--secondary-text-color); font-size: 0.9em; }
  .day.today .dayhead { color: var(--primary-color); }
  .row { display: grid; grid-template-columns: 4px auto 1fr; gap: 10px; align-items: start; padding: 8px 8px 8px 4px; border-radius: 10px; cursor: pointer; }
  .row:hover { background: rgba(var(--rgb-primary-text-color, 0,0,0), 0.04); }
  .row.open { background: rgba(var(--rgb-primary-text-color, 0,0,0), 0.06); }
  .row.past { opacity: 0.55; }
  .bar { width: 4px; align-self: stretch; border-radius: 2px; background: var(--chip-color); }
  /* times share one style; the activity title is the bold, primary-coloured element */
  .time { font-variant-numeric: tabular-nums; font-weight: 400; color: var(--secondary-text-color); white-space: nowrap; }
  .main { min-width: 0; }
  .title { font-weight: 500; color: var(--primary-text-color); overflow: hidden; text-overflow: ellipsis; }
  .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 0.85em; color: var(--chip-color); margin-top: 2px; }
  .chip ha-icon { --mdc-icon-size: 16px; }
  /* compact: title and chip on one line, details and actions only once opened */
  .row.compact .main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; }
  .row.compact .main .detail, .row.compact .main .actions { flex-basis: 100%; }
  .state-closed .title { text-decoration: line-through; }
  .detail { display: flex; gap: 6px; align-items: flex-start; font-size: 0.85em; color: var(--secondary-text-color); margin-top: 6px; }
  .detail ha-icon { --mdc-icon-size: 16px; flex: none; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; align-items: center; }
  .warn { flex-basis: 100%; color: var(--error-color); font-size: 0.85em; display: flex; gap: 6px; align-items: center; }
  .empty { padding: 24px 8px; text-align: center; color: var(--secondary-text-color); }
  .empty.small { padding: 8px; }
  .empty.error { color: var(--error-color); }
  .week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .col { min-width: 0; }
  .colhead { text-align: center; font-size: 0.85em; padding: 6px 0; color: var(--secondary-text-color); text-transform: capitalize; cursor: pointer; border-radius: 8px; }
  .col.today .colhead { color: var(--primary-color); font-weight: 500; }
  /* week columns: the bar spans two rows, time above the title, everything in the column width */
  .week .row { grid-template-columns: 3px minmax(0, 1fr); grid-template-rows: auto auto; padding: 6px 4px; gap: 2px 6px; }
  .week .bar { grid-row: 1 / span 2; }
  .week .time { grid-column: 2; font-size: 0.8em; }
  .week .row.compact .main { grid-column: 2; display: block; } /* outranks the compact flex rule */
  .week .title { font-size: 0.85em; white-space: normal; overflow-wrap: anywhere; }
  .week .chip { font-size: 0.75em; }
  .month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
  .mname { text-align: center; font-size: 0.75em; color: var(--secondary-text-color); padding: 4px 0; text-transform: capitalize; }
  .mcell { min-height: 56px; border-radius: 8px; padding: 4px; cursor: pointer; border: 1px solid transparent; }
  .mcell:hover { background: rgba(var(--rgb-primary-text-color, 0,0,0), 0.04); }
  .mcell.other { opacity: 0.35; }
  .mcell.today { border-color: var(--primary-color); }
  .mnum { font-size: 0.85em; }
  .dots { display: flex; align-items: center; gap: 3px; margin-top: 2px; min-height: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--chip-color); display: inline-block; }
  .mcount { font-size: 0.7em; color: var(--secondary-text-color); margin-left: 2px; }
  .mev { font-size: 0.72em; line-height: 1.3; margin-top: 2px; padding-left: 4px; border-left: 3px solid var(--chip-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mev .mtime { font-weight: 400; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .mev .mtitle { font-weight: 500; }
  .mev.tiny { font-size: 0.6em; white-space: normal; line-height: 1.2; }
  .mev.state-closed { opacity: 0.5; text-decoration: line-through; }
  .foot { padding: 8px; font-size: 0.8em; color: var(--secondary-text-color); text-align: center; }
  .state-booked { --chip-color: var(--deciplus-booked-color); }
  .state-prebooked { --chip-color: var(--deciplus-prebooked-color); }
  .state-waiting { --chip-color: var(--deciplus-waiting-color); }
  .state-available { --chip-color: var(--deciplus-available-color); }
  .state-full { --chip-color: var(--deciplus-full-color); }
  .state-opening { --chip-color: var(--deciplus-opening-color); }
  .state-closed { --chip-color: var(--deciplus-closed-color); }
  .narrow .toolbar { padding: 8px; }
  .narrow .nav .label { font-size: 0.9em; }
  .narrow .tab { padding: 6px 8px; font-size: 0.9em; }
  .narrow .actions button { flex: 1 1 auto; }
  .compact .row { padding: 4px 6px 4px 4px; }
  .compact .dayhead { padding-top: 2px; }
  .narrow .mcell { min-height: 44px; }
`;

// ---- the visual editor ----------------------------------------------------------------

const LABELS = {
  fr: {
    device: "Club (appareil Xplor Deciplus)", title: "Titre", default_view: "Vue par défaut", days: "Jours en vue Agenda",
    show_filters: "Afficher les filtres", show_quota: "Afficher le compteur de réservations", compact: "Compact (une ligne par séance, détails au toucher)",
    fields: "Informations affichées sur une séance", location: "Salle", penalty: "Pénalité d'annulation (séances réservées)",
    opens: "Instant d'ouverture (pré-réservations)", projection: "Alerte quota à l'ouverture (pré-réservations)", blocked: "Motif de blocage (pré-réservations)",
    always: "Toujours", expanded: "Une fois dépliée", hidden: "Jamais",
    stylesSection: "Styles (CSS par élément, voir le README)", styles: "Styles", colors: "Couleurs par état",
  },
  en: {
    device: "Club (Xplor Deciplus device)", title: "Title", default_view: "Default view", days: "Days in Agenda view",
    show_filters: "Show filters", show_quota: "Show the bookings counter", compact: "Compact (one line per session, details on tap)",
    fields: "Information shown on a session", location: "Room", penalty: "Cancellation penalty (booked sessions)",
    opens: "Opening instant (pre-bookings)", projection: "Quota warning at the opening (pre-bookings)", blocked: "Blocking reason (pre-bookings)",
    always: "Always", expanded: "Once expanded", hidden: "Never",
    stylesSection: "Styles (CSS per element, see the README)", styles: "Styles", colors: "Colours per state",
  },
};
const EDITOR_DEFAULTS = { days: 14, default_view: "agenda", show_filters: true, show_quota: true, compact: false };
const schema = (l) => [
  { name: "device", required: true, selector: { device: { integration: "deciplus" } } },
  { name: "title", selector: { text: {} } },
  { name: "default_view", selector: { select: { mode: "dropdown", options: VIEWS.map((v) => ({ value: v, label: v })) } } },
  { name: "days", selector: { number: { min: 1, max: 90, mode: "box" } } },
  { name: "show_filters", selector: { boolean: {} } },
  { name: "show_quota", selector: { boolean: {} } },
  { name: "compact", selector: { boolean: {} } },
  {
    name: "fields", type: "expandable", title: l.fields,
    schema: FIELDS.map((f) => ({
      name: f, selector: { select: { mode: "dropdown", options: FIELD_MODES.map((m) => ({ value: m, label: l[m] })) } },
    })),
  },
  {
    type: "expandable", title: l.stylesSection,
    schema: [
      { name: "colors", selector: { object: {} } },
      { name: "styles", selector: { object: {} } },
    ],
  },
];

async function ensureHaForm() {
  if (customElements.get("ha-form")) return;
  try {
    const helpers = await window.loadCardHelpers();
    const card = await helpers.createCardElement({ type: "entities", entities: [] });
    await card.constructor.getConfigElement();
  } catch (_) { /* the editor then renders once ha-form appears */ }
  await customElements.whenDefined("ha-form");
}

class DeciplusCardEditor extends HTMLElement {
  setConfig(config) { this._config = { ...config }; this._render(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; }

  async connectedCallback() {
    await ensureHaForm();
    this._render();
  }

  _render() {
    if (!customElements.get("ha-form") || !this._config) return;
    const labels = LABELS[String((this._hass && this._hass.language) || "en").slice(0, 2)] || LABELS.en;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => labels[s.name] || s.name;
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        // keep the saved YAML to what differs from the defaults
        const value = { ...ev.detail.value };
        for (const [k, v] of Object.entries(EDITOR_DEFAULTS)) if (value[k] === v) delete value[k];
        const fields = { ...(value.fields || {}) };
        for (const [k, v] of Object.entries(FIELD_DEFAULTS)) if (fields[k] === v) delete fields[k];
        if (Object.keys(fields).length) value.fields = fields; else delete value.fields;
        this._config = value;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = schema(labels);
    this._form.data = { ...EDITOR_DEFAULTS, ...this._config, fields: { ...FIELD_DEFAULTS, ...(this._config.fields || {}) } };
  }
}

if (!customElements.get("deciplus-card")) customElements.define("deciplus-card", DeciplusCard);
if (!customElements.get("deciplus-card-editor")) customElements.define("deciplus-card-editor", DeciplusCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "deciplus-card",
  name: "Xplor Deciplus",
  description: "Club planning with bookings, waiting lists and pre-bookings, and the action on each session.",
  preview: false,
  documentationURL: "https://github.com/Zhephyr54/ha-deciplus-card",
});
console.info(`%c DECIPLUS-CARD %c ${VERSION} `, "color: white; background: #039be5; font-weight: 700;", "color: #039be5; background: white; font-weight: 700;");
