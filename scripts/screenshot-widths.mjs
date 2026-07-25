import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import { join } from "path";

const WIDTHS = [360, 500, 640, 768, 900, 1024, 1280];
const HEIGHT = 900;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const OUTPUT_DIR = process.argv[2] || "screenshots/before";
const MAX_RETRIES = 3;

async function captureWidth(browser, width) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const context = await browser.newContext({
      viewport: { width, height: HEIGHT },
      colorScheme: "dark",
    });
    const page = await context.newPage();

    const response = await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    const hasError = await page.locator("text=Runtime SyntaxError").count();
    if (hasError > 0 && attempt < MAX_RETRIES) {
      console.log(`  ${width}px attempt ${attempt} hit server error, retrying...`);
      await context.close();
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    const filename = `${width}x${HEIGHT}.png`;
    await page.screenshot({
      path: join(OUTPUT_DIR, filename),
      fullPage: true,
    });
    console.log(`  captured ${OUTPUT_DIR}/${filename}${hasError > 0 ? " (with error overlay)" : ""}`);

    await context.close();
    return;
  }
}

async function run() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  for (const width of WIDTHS) {
    await captureWidth(browser, width);
  }

  await browser.close();
  console.log(`\nDone: ${WIDTHS.length} screenshots saved to ${OUTPUT_DIR}/`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
