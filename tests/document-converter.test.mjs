import assert from "node:assert/strict";
import test from "node:test";

import {
  DocumentConversionError,
  OFFICE_DOCUMENT_EXTENSIONS,
  findSoffice,
  normalizeOfficeFileName,
} from "../bridge/document-converter.mjs";

test("Office conversion accepts Word and PowerPoint formats and sanitizes file names", () => {
  assert.deepEqual(OFFICE_DOCUMENT_EXTENSIONS, [".doc", ".docx", ".ppt", ".pptx"]);
  assert.equal(normalizeOfficeFileName("../Method: Notes.DOCX"), "Method_ Notes.docx");
  assert.equal(normalizeOfficeFileName("slides.PPTX"), "slides.pptx");
});

test("Office conversion rejects unrelated formats before invoking LibreOffice", () => {
  assert.throws(
    () => normalizeOfficeFileName("paper.pages"),
    (error) => error instanceof DocumentConversionError && error.status === 415 && error.code === "unsupported_document_type",
  );
});

test("LibreOffice discovery returns empty for an explicit missing path", async () => {
  assert.equal(await findSoffice(["/paperlens/definitely-missing/soffice"]), "");
});
