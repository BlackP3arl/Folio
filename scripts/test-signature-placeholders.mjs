// Focused cross-platform regression for the custom drag placeholder and all-page signature workflow.
import { _electron as electron } from "playwright-core";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { readerPage } from "./reader-page.mjs";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const executablePath = require("electron");
const env = { ...process.env, FOLIO_TEST_USER_DATA: mkdtempSync(path.join(tmpdir(), "folio-signatures-")), FOLIO_TEST_HIDDEN: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const args = [root, "--mute-audio", ...(process.platform === "linux" && process.getuid?.() === 0 ? ["--no-sandbox"] : [])];
const app = await electron.launch({ executablePath, args, env, timeout: 60_000 });
let passed = false;

try {
  const page = readerPage(await app.firstWindow());
  await page.getByRole("button", { name: /Try a sample/ }).click();
  await page.locator(".textLayer span:not(.markedContent)").first().waitFor({ timeout: 30_000 });
  const pageCount = Number((await page.locator(".page-total").textContent()).match(/\d+/)?.[0]);
  assert.ok(pageCount > 1, "the sample must have multiple pages");

  const photo = await page.evaluate(() => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 600, height: 200 });
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff"; context.fillRect(0, 0, 600, 200);
    context.lineWidth = 10; context.beginPath(); context.moveTo(40, 150);
    context.bezierCurveTo(150, 10, 250, 190, 350, 60); context.lineTo(560, 120); context.stroke();
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByTitle("Add a signature").click();
  await page.locator('input[aria-label="Upload signature photo"]').setInputFiles({
    name: "signature.png", mimeType: "image/png", buffer: Buffer.from(photo, "base64"),
  });
  await page.getByRole("button", { name: /Use this signature/ }).click();
  await page.locator('select[aria-label="Signature placement"]').selectOption("manual");
  const preview = page.locator('[aria-label^="Draw a signature placeholder on page"]');
  const box = await preview.boundingBox();
  assert.ok(box, "signature page preview was not visible");
  await page.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.68);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.84, { steps: 8 });
  await page.mouse.up();

  const fitted = page.locator("img.signature-placement");
  await fitted.waitFor();
  const ratios = await fitted.evaluate(image => ({ rendered: image.getBoundingClientRect().width / image.getBoundingClientRect().height,
    natural: image.naturalWidth / image.naturalHeight }));
  assert.ok(Math.abs(ratios.rendered - ratios.natural) < 0.03, "the preview distorted the signature aspect ratio");

  await page.getByRole("button", { name: "Yes, all pages" }).click();
  await page.getByRole("button", { name: new RegExp(`Approve and sign ${pageCount} pages`) }).click();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    if (pageNumber > 1) await page.getByTitle("Next page").click();
    const stamp = page.locator(`.page[data-page-number="${pageNumber}"] .stampEditor`);
    await stamp.waitFor({ timeout: 30_000 });
    assert.equal(await stamp.count(), 1);
  }
  console.log(`PASS (${process.platform}): signature aspect ratio preserved and placeholder repeated on ${pageCount} pages`);
  passed = true;
} finally {
  const closed = app.close().then(() => true, () => false);
  if (!(await Promise.race([closed, new Promise(resolve => setTimeout(() => resolve(false), 5000))]))) app.process().kill();
  if (passed) process.exit(0);
}
