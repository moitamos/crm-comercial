const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const docs = path.resolve(__dirname, "..", "docs");
const main = fs.readFileSync(path.join(docs, "crm-one-console-main.js"), "utf8");
const popup = fs.readFileSync(path.join(docs, "crm-one-console-popup.js"), "utf8");

test("both standalone console scripts have valid JavaScript syntax", () => {
  assert.doesNotThrow(() => new Function(main));
  assert.doesNotThrow(() => new Function(popup));
});

test("scripts use matching isolated message channels and storage state", () => {
  assert.match(main, /crmcom\.crm-one\.invoice\.batch\.v1/);
  assert.match(popup, /crmcom\.crm-one\.invoice\.batch\.v1/);
  assert.match(main, /crmcom_crm_one_batch_v1/);
  assert.match(main, /__crmComInvoiceBatch/);
  assert.match(popup, /__crmComInvoiceWorker/);
  assert.doesNotMatch(main + popup, /__wecallInvoice|wecall\.crm-one|appwecall\.com/);
});

test("worker prevents wrong invoice and requires PDF signature", () => {
  assert.match(popup, /ncc!==job\.ncc/);
  assert.match(popup, /signature!=='%PDF-'/);
  assert.match(popup, /15\*1024\*1024/);
  assert.match(popup, /crypto\.subtle\.digest\('SHA-256'/);
});

test("worker only uploads to CRM Comercial and fixed Supabase bucket", () => {
  assert.match(main, /crm-comercial-rust-seven\.vercel\.app/);
  assert.match(popup, /job\.destination!=='https:\/\/crm-comercial-rust-seven\.vercel\.app'/);
  assert.match(popup, /crm-invoices\//);
  assert.match(popup, /\/api\/crm-one\/prepare/);
  assert.match(popup, /\/api\/crm-one\/finish/);
  assert.doesNotMatch(popup, /\/api\/faturas\/crm-one-import\.php/);
});

test("legacy process controls remain manual, sequential and resumable", () => {
  assert.match(main, /data-action="auto-start"/);
  assert.match(main, /data-action="auto-stop"/);
  assert.match(main, /data-action="pause"/);
  assert.match(main, /data-action="restore"/);
  assert.match(main, /NEXT_SERVICE_MIN_MS = 10000/);
  assert.match(main, /NEXT_SERVICE_MAX_MS = 15000/);
});
