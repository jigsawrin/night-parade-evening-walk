import test from "node:test";
import assert from "node:assert/strict";
import { lineExternalUrl } from "../src/core/TouchLock";

const LINE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0";
const SAFARI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

test("LINE のアプリ内ブラウザでは、外部ブラウザで開き直す URL を返す（ほかの引数と URL の形を保つ）", () => {
  assert.equal(lineExternalUrl(LINE_UA, "/night-parade-evening-walk/", "", ""), "/night-parade-evening-walk/?openExternalBrowser=1");
  assert.equal(lineExternalUrl(LINE_UA, "/x/", "?seed=12345", "#a"), "/x/?seed=12345&openExternalBrowser=1#a");
});

test("すでに印が付いているとき・LINE 以外のブラウザでは何もしない（開き直しは一度だけ）", () => {
  assert.equal(lineExternalUrl(LINE_UA, "/x/", "?openExternalBrowser=1", ""), null);
  assert.equal(lineExternalUrl(SAFARI_UA, "/x/", "", ""), null);
});
