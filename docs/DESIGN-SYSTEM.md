# Design system

## Brand

- **Official logo:** a bracketed diamond (code brackets `< >` in blue around a charcoal diamond) containing "hi", with the "OMNIHack" wordmark: "OMNI" in charcoal and "Hack" in blue. The source files are in `design/brand/`:
  - horizontal and stacked PNGs with transparent backgrounds, in blue (`#03A0E2`) and charcoal (`#2B2A28`);
  - cyan JPG versions for print.
- **Web assets** are generated with `node scripts/brand-assets.mjs` into `public/brand/`:
  - `omnihack-logo.png` (horizontal) for light backgrounds, and `omnihack-logo-light.png` for dark ones (charcoal becomes white);
  - `omnihack-logo-stacked(-light).png`;
  - `omnihack-mark.png` (the symbol on its own);
  - the favicon `src/app/icon.png` and `src/app/apple-icon.png`.
- **Usage:**
  - **Components:** `Logo` (horizontal; header, sidebar, auth, 404), `Logo inverted` (dark footer), `LogoStacked` (auth side panel) and `LogoMark` (compact spaces), all in `src/components/brand/logo.tsx`.
  - **Generated images:** certificates and the social preview image embed the horizontal PNG.
  - **Don't:** recolor, stretch, add effects, or place the dark version on dark backgrounds.
- **Brand configuration** is centralized in `src/config/brand.ts` (name, description, contact addresses, legal paths, social links; empty social links are not rendered).
- **Imagery:** deterministic generative banner art per competition (`BannerArt`, six themes) instead of stock photography. Organizers can upload their own banner or logo (PNG/JPG/WebP, magic-byte checked).

## Tokens (`src/app/globals.css`, Tailwind 4 `@theme`)

| Token                                                  | Value / use                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `ink-50 … ink-950`                                     | Neutral scale, a slightly blue-tinted slate. `ink-950 #0B1020` is used for dark surfaces and the footer.      |
| `brand-50 … brand-900`                                 | Indigo; `brand-600 #4F46E5` is primary (white text contrast 6.3:1)                                            |
| `accent-300 … 600`                                     | Cyan highlights on dark surfaces; not used for body text on light backgrounds                                 |
| Status                                                 | Tailwind emerald, amber, rose and cyan for success, warning, danger and info, always paired with a text label |
| `--font-display` / `--font-sans`                       | Plus Jakarta Sans / Inter (self-hosted by `next/font`)                                                        |
| `--radius-card` 1rem, `--shadow-card`, `--shadow-lift` | Cards and hover lift                                                                                          |

## Components (`src/components/ui`)

`Button`, `ButtonLink` (primary, secondary, outline, ghost, danger, light × sm/md/lg) · `Badge` (seven tones, optional dot) · `Card`, `CardHeader` · `Alert` · `PageHeader` · `EmptyState` · `Stat` · `Progress` · `Pagination` · `DemoBadge` · `Icon` (inline SVG set) · **Forms:** `ActionForm` (server-action form; keeps input after validation errors, shows field and global errors, focuses the first invalid field), `TextInput`, `TextArea`, `Select`, `Checkbox`, `SubmitButton` (pending state), `FieldErrorText` · `ConfirmAction` (native `<dialog>` confirmation with optional reason, used for every destructive action) · `InlineAction` · `TabNav` · `AppSidebar` · charts (`BarChart`, `HBarList`, each with a table view).

## Accessibility and responsiveness

- Semantic landmarks, a skip link, a single `h1` per page, labelled inputs (`aria-invalid`, `aria-describedby`), `role="alert"` for errors, and `aria-live` for search results and autosave status.
- Visible focus rings (`:focus-visible` outline), Escape closes menus and dialogs, and dropdowns are keyboard-operable.
- `prefers-reduced-motion` disables animation.
- Layouts are tested at 390px (Pixel 5 profile in Playwright) and desktop widths. Tables scroll horizontally inside cards, and the sidebar becomes an off-canvas menu below 1024px.
- Charts use one validated hue (brand-600 passes the palette validator's lightness, chroma and contrast checks on the light surface), with a "Show table" view and native tooltips.

## Reference-site observations (hackculture.io)

Public markup was inspected; no assets, copy or code were reused. Observed structure:

- A header with logo and three top-level groups (Programs, Offerings, Get involved) and a primary call-to-action in the content.
- A hero with a large two-level headline (statement plus small-caps tagline), a one-line value proposition, an audience toggle (corporates / innovators) and a client-logo strip.
- A six-card offerings grid; an impact strip of four large numerals with captions; testimonial cards with logo, quote, headshot and name; a partner-logo marquee; a closing CTA band; and a four-column footer (brand blurb, company, offerings, about) with contact details and a legal bar.

How OmniHack applies this (original treatment):

- Header: grouped dropdowns ("Explore", "For organizers") plus FAQ and About, with a prominent "Host a competition" CTA.
- Hero: dark ink canvas with a grid mask and glow, a two-part headline, dual CTAs, and a product "competition pipeline" visual in place of client logos (no customers are claimed).
- Impact numerals: shown **only from real, non-demo database counts**; otherwise capability facts are shown.
- Testimonials and partner logos: deliberately omitted until authorized content exists.
- Card grid → competition cards and "How OmniHack works"; a closing gradient CTA band; and a four-column footer.
