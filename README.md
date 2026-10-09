# Xplor Deciplus card

A Lovelace card for the [Xplor Deciplus integration](https://github.com/Zhephyr54/ha-deciplus):
your club's planning with your bookings, waiting-list spots and pre-bookings on it, and the
action on each line: book, join the waiting list, pre-book a session that is not open yet,
cancel. Live: the integration pushes the planning to the card on every poll and right after
every action.

> [!WARNING]
> This is fully vibe coded for personal use.

Requires the integration **0.2.0 or later** (the `deciplus/subscribe_planning` feed).

## Install (HACS)

1. HACS → ⋮ → _Custom repositories_ → add this repository URL, category **Dashboard**.
2. Install "Xplor Deciplus card". HACS registers the resource; reload the browser.
3. Add the card to a dashboard: _Add card_ → "Xplor Deciplus" → pick your club (the Deciplus
   device). Everything else is optional.

Without HACS: copy `deciplus-card.js` to `config/www/` and add
`/local/deciplus-card.js` as a JavaScript module resource.

## What you see

| View   | Content                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------- |
| Agenda | sessions grouped by day over the next N days (default 14)                                         |
| Day    | one day                                                                                           |
| Week   | seven columns; on a phone, the agenda of that week                                                |
| Month  | a grid listing each day's sessions as `10:15 – 11:00 Aquabiking` lines coloured by state; dots when a day has more than six; on a phone the times only for a day with one session, dots otherwise; tap a day to open it |

Each session is a line with its time, title and a state chip:

| State       | Chip                                   | Action            |
| ----------- | -------------------------------------- | ----------------- |
| Booked      | `Réservé`, `· 2 places` with guests    | Annuler           |
| Waiting     | `En attente · n°13`                    | Annuler           |
| Pre-booked  | `Pré-réservé · 5/6 à l'ouverture`, or `· bloquée` while a quota or another rule holds it | Annuler |
| Available   | `22/26`                                | Réserver          |
| Full        | `Complet · liste d'attente`            | Liste d'attente   |
| Not open    | `Ouvre le 12/09 14:00`                 | Pré-réserver      |
| Past        | `Passé` once started, `Plus ouvert` for the rare window shut before the start; hidden by default | – |

Tap a line for the action. The detail lines, and when each one shows, are configuration
(`fields` below): by default the room, the opening instant and the quota warning of a
pre-booking and its blocking reason are on the line, and the cancellation penalty of a booked
session appears only once the line is expanded, next to the Cancel button. In `compact` mode
a line is one row, title and chip, and everything else waits for the tap. Cancelling asks for
confirmation on the line and repeats the penalty when it already applies. Pre-booking is
immediate and reversible.

The header shows `Réservations : 5 / 6`, the number the club's quota applies to (bookings and
waiting-list entries together) against the limit the integration has learned, `5 / ?` until a
refusal has taught it. Red when the club would refuse you a booking right now, with the
reasons on hover.

Filters (funnel button): status chips with the shortcuts _Mes séances_ and _Tout_, and one
chip per activity found in the planning with a _Toutes_ shortcut. With every activity chip
on, nothing is filtered; tapping one then excludes it, tapping the last excluded one back
returns to "everything". An activity you selected that is no longer in the loaded planning
keeps a dashed chip so you can unselect it, and is ignored meanwhile. View and filters are
remembered per browser; an empty status selection is not, so a reload always shows the
planning again. When filters leave nothing to show, the card says so and offers a reset.
Texts follow the Home Assistant display language (French or English).

## Options

| Option         | Default  |                                                                        |
| -------------- | -------- | ---------------------------------------------------------------------- |
| `device`       | required | the club's device id (picker in the visual editor)                     |
| `title`        | club name| header; empty string hides it                                          |
| `default_view` | `agenda` | `agenda` \| `day` \| `week` \| `month`                                 |
| `days`         | `14`     | length of the agenda view                                              |
| `show_filters` | `true`   |                                                                        |
| `show_quota`   | `true`   | the bookings counter                                                   |
| `compact`      | `false`  | one row per session, details and action on tap                         |
| `fields`       | see below| when each detail line shows: `always`, `expanded` or `hidden`           |
| `statuses`     | all but closed | initial status filter, e.g. `[booked, prebooked, waiting]`       |
| `activities`   | all      | initial activity filter, by title                                       |
| `colors`       | theme    | per state: `booked`, `prebooked`, `waiting`, `available`, `full`, `opening`, `closed` |
| `styles`       | none     | CSS per element of the card, see below                                 |

```yaml
type: custom:deciplus-card
device: 0123456789abcdef0123456789abcdef
default_view: week
fields:
  location: hidden     # default always
  penalty: expanded    # default expanded
  opens: always        # default always
  projection: always   # default always
  blocked: always      # default always
colors:
  prebooked: "#8e24aa"
```

`always` puts the line on the session in the normal mode (compact rows still wait for the tap),
`expanded` shows it once the line is tapped, `hidden` never. The visual editor has the same
choices under "Information shown on a session".

Styling follows the Home Assistant theme (dark mode included). To change the look of one
element without touching the code, `styles` takes CSS declarations per element, as a string
or a map, appended after the card's own rules:

```yaml
styles:
  time: "font-weight: 500; color: var(--primary-text-color)"
  title:
    font-weight: 400
  chip: "font-size: 0.8em"
  month_event: "font-size: 0.8em"
```

Elements: `card`, `header`, `quota`, `toolbar`, `filters`, `day`, `dayhead`, `row`, `bar`,
`time`, `title`, `chip`, `detail`, `actions`, `button`, `week_column`, `week_head`,
`month_cell`, `month_day`, `month_event`, `empty`. Declarations only; a rule the card
applies in a specific view (week columns, month cells) may need `!important` to be overridden.
The state colours are also CSS variables `--deciplus-<state>-color` for `card-mod` users.

## How it works

The card opens one websocket subscription to the integration (`deciplus/subscribe_planning`
with the device id) and receives the full planning as rows with their state; the integration
sends it again after each poll and each action. Actions call `deciplus.book_session`
(with `schedule: true`, so a session not open yet is pre-booked) and `deciplus.cancel_booking`
on the device. Refusals from the club show as the usual Home Assistant error toast. Only the
horizon loaded by the integration is available (its _sessions horizon_ option, 7–90 days);
the month view says until when.
