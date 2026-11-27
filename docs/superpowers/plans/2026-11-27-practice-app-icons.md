# Practice App Icons Implementation Plan

> **For agentic workers:** Apply the existing viewer's Node regression tests before editing markup or behavior.

**Goal:** Make the viewer read like a focused NWC rehearsal app with four familiar primary controls and a nearly unobstructed full view.

**Architecture:** Use one small, consistent inline SVG icon set in `viewer/index.html`. Keep accessible names on icon buttons. Preserve the existing playback and layout handlers; update only their icon and state presentation. Keep detailed practice controls and numeric values in the expanded menu.

**Tech Stack:** Plain HTML/CSS, browser JavaScript, Node `node:test`.

---

### Task 1: Primary and full-view controls

**Files:** `viewer/index.html`, `viewer/src/main.js`, `tests/view-controls-regressions.mjs`

- [x] Add failing tests for icon-only open, play/pause, menu, expand/collapse, and accessible labels.
- [x] Run the focused test and confirm the expected failure.
- [x] Replace text and ambiguous stop square with matching SVGs; keep handlers and button positions stable.
- [x] Run the focused test until green.

### Task 2: Secondary controls and simpler surface

**Files:** `viewer/index.html`, `viewer/src/main.js`, `tests/view-controls-regressions.mjs`, `tests/sample-scores.mjs`

- [x] Add failing tests for volume and octave in expanded settings, chevron page controls, `1×` speed, `8va` octave, `A–B` repeat, PDF icon with text, and version moved out of the primary row.
- [x] Run the focused test and confirm the expected failure.
- [x] Move and relabel controls while preserving sample-score easter egg and numeric part checkboxes.
- [x] Run focused tests until green.

### Task 3: Release verification

**Files:** `README.md`, `PATCH_NOTES.md`, `index.html`, `converter/index.html`, `viewer/index.html`

- [x] Bump the visible version and write the patch note.
- [x] Run `node --test tests/*.mjs`, syntax checks, and `git diff --check`.
- [x] Commit the verified changes.
