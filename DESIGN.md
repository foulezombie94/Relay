---
name: Relay
description: Un espace commercial lisible, des relations aux engagements client.
colors:
  relay-blue: "#365de3"
  ink: "#20252d"
  muted: "#626b7b"
  paper: "#ffffff"
  surface: "#f4f6fb"
  line: "#dfe4ec"
  delivery: "#202d48"
  delivery-panel: "#2a3a59"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(42px, 5.25vw, 72px)"
    fontWeight: 650
    lineHeight: 1.14
    letterSpacing: "-0.04em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    lineHeight: 1.75
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 500
rounded:
  control: "8px"
  scene: "14px"
  explorer: "16px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "13px 22px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.relay-blue}"
---

# Design System: Relay

## Overview

Relay uses a clear commercial workspace as its visual reference: white paper, precise ink, confident blue accents and real product views. The approved identity supports continuity from selling to delivering client commitments. Calm typography and generous surrounding space let dense CRM content carry the evidence.

The landing surface is Persuade; its composition and sales-to-delivery story remain in `.impeccable/landing-brief.md`. Finish reviewer disposition: **ship; no further fixes requested**.

## Colors

Relay blue identifies emphasis, active controls and linked next actions. Ink anchors headlines and primary actions; muted text carries supporting explanation. White surfaces sit inside cool pale containers with fine borders. Dark delivery surfaces provide a deliberate change of chapter while keeping product panels legible.

## Typography

Manrope is the display family; DM Sans is the reading and interface family. Both variable fonts are self-hosted through `next/font/local`, with swap loading. Balanced headings use tight tracking. Body copy has open line spacing. Product amounts use tabular numerals where presented as comparative totals.

The landing hero uses the display token, with a larger (75px) desktop treatment above 1500px and smaller (38px) mobile treatment below 600px. Reused CRM views retain their compact UI hierarchy rather than inheriting the hero scale.

## Layout

The header has a centered maximum width (1240px); the product container is similarly broad (1210px). Story sections alternate copy and product evidence, then collapse to one column on small screens. Responsive thresholds are 1050px, 800px and 600px, with a spacious large-screen adjustment at 1500px. Mobile navigation uses a native disclosure menu.

The actual CRM preview retains its wide working canvas inside a scroll container. It scales from 0.85 to 0.75 and 0.65 across narrower screens; the sidebar disappears on mobile while horizontal scrolling preserves the records. The three preview tabs remain interactive outside the inert product view.

## Elevation & Depth

Depth comes primarily from tonal containers, fine borders and inset white product surfaces. Selected tabs receive a small ambient shadow. Avoid introducing decorative floating layers or making every content block a card. Focus uses a visible blue outline (3px with 5px offset). Control transitions are short (0.18s); reduced-motion preference removes transitions and animation.

## Shapes

Controls have gently curved corners. Scenes and the product explorer use progressively larger corners to group evidence without softening the internal data hierarchy. Thin borders separate rows and surfaces; rounded initials and Lucide line icons belong to the product interface.

## Components

Primary actions are dark, turning blue on hover. Secondary actions are white with a restrained border; delivery actions reverse to white on dark. Navigation is compact, and FAQs use native disclosure elements.

Product evidence is coded UI, with no raster or generated image assets. The landing reuses `RecordBoard`, `RecordTable`, `RecordDirectory`, `ResourceCard`, `ForecastTotals`, sidebar primitives and `PageHeader`. Local synthetic fixtures and visible demonstration labels identify the examples. Inner product surfaces are inert and read-only; actual page actions and preview tabs stay usable.

The pure `AppSidebarView` accepts public props separately from the authenticated `AppSidebar` adapter. Public previews disable preference persistence and private-route prefetch. `ui/display` separates visual primitives from editors and the date picker. The public `/` route skips Supabase claims refresh in the proxy. `src/app/landing-isolation.test.ts` recursively guards the preview dependency boundary and these public-route safeguards.

## Do's and Don'ts

- Do preserve the approved white, Relay blue and dark delivery identity, self-hosted font pairing and sales-to-delivery positioning.
- Do reuse actual display components with synthetic, clearly labelled data for public product evidence.
- Do keep public previews independent of authentication, data fetching and mutation interfaces.
- Don't publish invented customer logos, testimonials, adoption statistics or commercial outcomes.
- Don't substitute image mockups for the implemented CRM UI or enable private prefetch in public previews.
