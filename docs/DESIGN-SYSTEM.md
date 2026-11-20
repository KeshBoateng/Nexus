# NEXUS Design System

## Brief
- **Audience & context:** one ambitious student, mostly on an Android phone, often between lectures; sometimes planning at a desk. Wants to know "what matters now" in seconds.
- **Character:** calm, exact, quietly premium. **Not:** playful, corporate, "AI-glowy" (no gradients, sparkles, chat-bubble everything).
- **Signature:**
  1. Deep graphite surfaces with a single **brass** accent — used only for the active destination, the primary action and key emphasis.
  2. One focal point per screen; few cards, generous space.
  3. Tabular numerals for every figure (money, GPA, counts) so columns align.
- **References:** Things 3 (restraint, one focus), Linear (density without clutter, keyboard-calm), a well-made bank statement (numbers you trust).

## Tokens (`src/index.css`)
| Role | Dark | Light |
|---|---|---|
| bg | `#0d0e11` | `#f6f5f1` |
| surface / raised | `#15171c` / `#1c1f26` | `#ffffff` / `#efede7` |
| border | `#272b33` | `#dedbd2` |
| text / muted / faint | `#ecebe7` / `#9a9ca3` / `#8a8d95` | `#17181b` / `#565961` / `#6b6e76` |
| accent / on-accent | `#d9a54a` / `#17130a` | `#8a5d14` / `#ffffff` |
| danger / success | `#f07a6a` / `#6cc49a` | `#b3372a` / `#24744f` |

Contrast targets: body text ≥ 4.5:1 on bg and surface in both themes (values chosen for this; formal check pending — UNVERIFIED).

- **Type:** Inter Variable (self-hosted via @fontsource; works offline). Sizes: 28 (page title) · 15 (body/UI) · 13–14 (secondary) · 11–12 (labels). Line height 1.5 body.
- **Space:** 4-px scale via Tailwind (gap-1 = 4px … gap-12 = 48px).
- **Radius:** 12 px controls (`rounded-xl`), 16 px panels (`rounded-2xl`).
- **Motion:** 150 ms colour transitions; 320 ms "rise" on page entry with `cubic-bezier(.22,1,.36,1)`; all disabled under `prefers-reduced-motion`.
- **Touch:** controls ≥ 44 px tall; bottom nav items 64 px.

## Layout
- Mobile: sticky top bar (logo + Settings), content max 768 px, fixed 5-item bottom nav with safe-area padding.
- Desktop ≥ 1024 px: 240 px left rail (5 destinations, Settings pinned bottom), content centred.

## Components
`Button` (primary / ghost / danger), `Field`, `TextInput`, `Select`, `Panel`, `Notice` — `src/components/ui.tsx`. Add new primitives there; features compose them.
