# 9. BusinessOS Design System

BusinessOS provides the visual design system, UI components, typography, layout tokens, and motion standards for all RestaurantOS workspaces.

---

## Core Guidelines

1. **Touch First Excellence:**
   * Minimum touch target size: **48px x 48px** for desktop/tablet, **56px x 56px** for POS terminals.
   * High-contrast dark and light modes tailored for kitchen environment (heat/steam/brightness) and dimly lit dining rooms.

2. **Typography & Styling:**
   * Modern, clean sans-serif typography (e.g. Inter / Outfit).
   * Curated HSL color palette avoiding raw browser primary colors.

3. **Component System:**
   * **Floor Map Component:** Interactive SVG grid with live drag-and-drop table status overlays.
   * **KDS/BDS Ticket Card:** High-visibility timer badges (Green: <5m, Yellow: 5-12m, Red: >12m).
   * **Numpad PIN Input:** Fast, responsive 6-digit PIN keypad with clear visual feedback.
   * **Order Builder Panel:** Quick category pills, instant modifier modal, real-time ticket preview.

4. **Motion & Feedback:**
   * Micro-animations for status state transitions (e.g., ticket moving from `Queued` to `Preparing`).
   * Tactile and acoustic feedback for touch interactions on POS terminals.
