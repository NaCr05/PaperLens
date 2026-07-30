import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaperAliases,
  choosePaperDisplayName,
  getActivePaperMention,
  inferPaperTitle,
  rankFolderPaperContexts,
  rankPaperPages,
  removeMentionQuery,
  searchMentionPapers,
  searchMentionTargets,
} from "../app/paper-mentions.ts";

test("uses PDF metadata or prominent first-page text instead of a numeric filename", () => {
  assert.equal(inferPaperTitle([], "1234567.pdf", "Native Video Action Pretraining"), "Native Video Action Pretraining");
  assert.equal(inferPaperTitle([
    { str: "Native Video Action", transform: [22, 0, 0, 22, 80, 720] },
    { str: "Pretraining", transform: [22, 0, 0, 22, 150, 690] },
    { str: "Authors", transform: [11, 0, 0, 11, 130, 650] },
  ], "1234567.pdf"), "Native Video Action Pretraining");
  assert.equal(inferPaperTitle([
    { str: "Verifiable World Action:", transform: [20, 0, 0, 20, 80, 720] },
    { str: "Closed-loop Control for Embodied Agents", transform: [20, 0, 0, 20, 80, 690] },
  ], "sample-research-paper.pdf", "(anonymous)"), "Verifiable World Action: Closed-loop Control for Embodied Agents");
});

test("prefers the newly parsed formal title and merges aliases without duplicates", () => {
  assert.equal(choosePaperDisplayName("Native Video Action Pretraining", "1234567.pdf", "1234567"), "Native Video Action Pretraining");
  assert.deepEqual(buildPaperAliases(["Native Video Action Pretraining", "1234567.pdf", "LingBot-VA", "lingbot va"]), ["Native Video Action Pretraining", "1234567", "LingBot-VA"]);
});

test("detects and removes the active @ mention query", () => {
  const text = "比较这个方法和 @Ling";
  const range = getActivePaperMention(text, text.length);
  assert.deepEqual(range, { start: 8, end: text.length, query: "Ling" });
  assert.equal(removeMentionQuery(text, range), "比较这个方法和 ");
});

test("finds one paper through formal title, filename, or repository alias", () => {
  const papers = [{
    id: "paper-1",
    displayName: "Native Video Action Pretraining",
    fileName: "1234567.pdf",
    aliases: ["LingBot-VA"],
    repositoryUrl: "https://github.com/robbyant/lingbot-va",
    lastOpenedAt: 10,
  }];
  assert.equal(searchMentionPapers(papers, "native")[0]?.id, "paper-1");
  assert.equal(searchMentionPapers(papers, "1234567")[0]?.id, "paper-1");
  assert.equal(searchMentionPapers(papers, "lingbot")[0]?.id, "paper-1");
});

test("shows folders before papers for an empty @ query and finds folders by name", () => {
  const papers = [{ id: "paper-1", displayName: "RT-2", fileName: "rt2.pdf", lastOpenedAt: 20 }];
  const folders = [{ id: "folder-1", name: "具身智能", paperIds: ["paper-1"], updatedAt: 10 }];
  const emptyResults = searchMentionTargets(papers, folders, "");
  assert.equal(emptyResults[0]?.kind, "folder");
  assert.equal(emptyResults[0]?.record.id, "folder-1");
  const namedResults = searchMentionTargets(papers, folders, "具身");
  assert.deepEqual(namedResults.map((item) => [item.kind, item.record.id]), [["folder", "folder-1"]]);
});

test("folder mentions rank the most relevant papers and pages across the collection", () => {
  const ranked = rankFolderPaperContexts("action tokenizer training", [
    {
      id: "paper-embodied",
      displayName: "Native Video Action Pretraining",
      fileName: "lingbot.pdf",
      lastOpenedAt: 10,
      pages: [
        { pageNumber: 1, text: "Embodied manipulation overview" },
        { pageNumber: 8, text: "We train the action tokenizer with discrete action tokens." },
      ],
    },
    {
      id: "paper-llm",
      displayName: "Language Modeling Notes",
      fileName: "llm.pdf",
      lastOpenedAt: 20,
      pages: [{ pageNumber: 1, text: "Transformer language modeling and next token prediction" }],
    },
  ], 1, 2);
  assert.equal(ranked[0]?.id, "paper-embodied");
  assert.deepEqual(ranked[0]?.pages.map((page) => page.pageNumber), [1, 8]);
});

test("ranks pages related to the actual question while retaining overview context", () => {
  const ranked = rankPaperPages("action tokenizer training", [
    { pageNumber: 1, text: "Native Video Action Pretraining abstract" },
    { pageNumber: 2, text: "Related work" },
    { pageNumber: 8, text: "We train the action tokenizer with discrete tokens. The tokenizer training objective follows..." },
    { pageNumber: 11, text: "Experiments" },
  ], 2);
  assert.deepEqual(ranked.map((page) => page.pageNumber), [1, 8]);
});
