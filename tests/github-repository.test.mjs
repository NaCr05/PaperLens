import assert from "node:assert/strict";
import test from "node:test";

import { findGitHubRepository } from "../app/github-repository.ts";

test("extracts a repository URL without absorbing the next section heading", () => {
  const text = "Reference code: https://github.com/openai/openai-agents-python. 1. Introduction";
  assert.equal(findGitHubRepository(text), "https://github.com/openai/openai-agents-python");
});

test("repairs PDF spacing around GitHub URL punctuation", () => {
  const text = "Code: https : / / github . com / QwenLM / Qwen-RobotManip .";
  assert.equal(findGitHubRepository(text), "https://github.com/QwenLM/Qwen-RobotManip");
});

test("returns empty when the paper has no GitHub repository", () => {
  assert.equal(findGitHubRepository("Project page: https://example.com/paper"), "");
});
