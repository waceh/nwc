# Mobile Choral Practice Implementation Plan

**Goal:** Configure a choir part in the menu, then rehearse from an unobstructed full view.

**Architecture:** Keep music timing and part-mix rules in small testable helpers. Wire controls in the viewer, retaining the current score renderer and scheduler. Use playback-order segments for repeat-aware measure looping. Keep PC-specific ideas in `TODO.md`.

**Tech Stack:** Browser JavaScript, HTML/CSS, Node `node:test`.

---

## 1. Playback model

- [x] Add failing tests for score measure ranges, repeat-aware A–B boundaries, and selected-part audio modes.
- [x] Implement tested helpers and connect them to `PlaybackController` without losing position on changes.
- [x] Verify the new tests and existing playback regressions.

## 2. Mobile setup controls

- [x] Add failing tests for A–B inputs, count-in and start-note checkboxes, audio-mode radios, visual-emphasis checkbox, and default-on auto-page checkbox.
- [x] Add controls to the expanded menu and connect them to score loading, selection, and playback.
- [x] Keep the speed slider in the expanded menu.

## 3. Full-view reading

- [x] Add failing tests for visible page navigation outside full view and swipe navigation inside full view.
- [x] Implement gesture thresholds, selected-staff visual emphasis, and early automatic page turning in single-page mode.
- [x] Verify controls disappear in full view and page transitions remain available by gesture.

## 4. Recovery and score reliability

- [x] Add failing tests for inline file errors and retry with the alternate NWC parser.
- [x] Add complex choir fixtures covering parts, lyrics, ties, repeats, and playback order.
- [x] Run the full suite and inspect mobile layout structure (browser host unavailable for a visual screenshot).

## 5. Release

- [x] Update visible version to v1.0.826 and add patch notes.
- [x] Keep PC feature ideas in `TODO.md`.
- [x] Run syntax, diff, and full-test verification.
