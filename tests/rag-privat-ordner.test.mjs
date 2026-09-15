// Betreiber-Freigabe 1b (15.09.2026): docs/mail gehoert nie in den Wissenskorpus der Bruecke.
import test from "node:test";
import assert from "node:assert/strict";
import { isKnowledgeFile, PRIVATE_DIRECTORIES } from "../control-server/src/rag/knowledgeCorpus.js";

test("docs/mail ist ausgeschlossen, andere Sachordner bleiben", () => {
  assert.deepEqual([...PRIVATE_DIRECTORIES], ["mail"]);
  assert.equal(isKnowledgeFile("docs/mail/MAIL_SETUP_smejj.md"), false);
  assert.equal(isKnowledgeFile("docs/mail/CODEX_PROMPT_send-as.md"), false);
  assert.equal(isKnowledgeFile("docs/deployment/BREVO_MAIL_UMSTELLUNG.md"), true);
});
