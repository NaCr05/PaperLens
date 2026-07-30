import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("mobile PDF controls keep zoom and every annotation action reachable", () => {
  assert.match(styles, /\.pdf-stage \{[^}]*touch-action: pan-x pan-y pinch-zoom;/);
  assert.doesNotMatch(styles, /\.zoom-readout button:not\(\.zoom-reset\) \{[^}]*display: none;/);
  assert.match(styles, /\.pdf-toolbar \{[^}]*height: 76px;[^}]*flex-basis: 76px;[^}]*grid-template-areas: "pagination zoom" "annotation annotation";/);
  assert.match(styles, /\.pdf-toolbar > \.toolbar-group:first-child \{[^}]*grid-area: pagination;/);
  assert.match(styles, /\.zoom-readout \{[^}]*grid-area: zoom;[^}]*justify-self: end;/);
  assert.match(styles, /\.annotation-tools \{[^}]*grid-area: annotation;[^}]*justify-self: stretch;[^}]*justify-content: flex-end;/);
});

test("AI settings stay scrollable on a 320 by 480 viewport", () => {
  assert.match(styles, /\.ai-settings-modal \{[^}]*max-height: calc\(100dvh - 40px\);[^}]*overflow-y: auto;[^}]*-webkit-overflow-scrolling: touch;/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.modal-backdrop \{ padding: 10px; \}/);
  assert.match(styles, /\.ai-settings-modal \{ max-height: calc\(100dvh - 20px\); padding: 18px; \}/);
  assert.match(styles, /\.ai-settings-modal \.modal-actions \{ flex-wrap: wrap; \}/);
});
