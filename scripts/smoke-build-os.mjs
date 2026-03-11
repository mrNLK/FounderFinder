import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ROOT_DIR = process.cwd();
const DEFAULT_BASE_URL = "https://founder-finder-mu.vercel.app";
const AUTH_STORAGE_KEY = "sb-iirwwadiedcbcrxpehog-auth-token";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function bootstrapEnv() {
  loadEnvFile(path.join(ROOT_DIR, ".env.local"));
  loadEnvFile(path.join(ROOT_DIR, ".env"));
  loadEnvFile(path.join(ROOT_DIR, ".vercel", ".env.production.local"));
  loadEnvFile(path.join(ROOT_DIR, ".vercel", ".env.preview.local"));
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const bodyText = await response.text();
  let body = null;

  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = bodyText;
  }

  if (!response.ok) {
    const details = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`${response.status} ${response.statusText}: ${details}`);
  }

  return body;
}

async function createSession() {
  const supabaseUrl = process.env.SMOKE_SUPABASE_URL || requireEnv("VITE_SUPABASE_URL");
  const anonKey = process.env.SMOKE_SUPABASE_ANON_KEY || requireEnv("VITE_SUPABASE_ANON_KEY");
  const refreshToken = process.env.SMOKE_SUPABASE_REFRESH_TOKEN;
  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  };

  if (refreshToken) {
    return fetchJson(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers,
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  if (email && password) {
    return fetchJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    });
  }

  throw new Error("Set SMOKE_SUPABASE_REFRESH_TOKEN or SMOKE_EMAIL and SMOKE_PASSWORD.");
}

async function runSmokeTest() {
  bootstrapEnv();

  const baseUrl = process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL;
  const headless = process.env.SMOKE_HEADLESS !== "false";
  const browserChannel = process.env.SMOKE_BROWSER_CHANNEL ?? (process.env.CI ? "" : "chrome");
  const session = await createSession();
  const browser = await chromium.launch({
    ...(browserChannel ? { channel: browserChannel } : {}),
    headless,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
  });

  await context.addInitScript(({ value, key }) => {
    window.localStorage.setItem(key, value);
  }, {
    key: AUTH_STORAGE_KEY,
    value: JSON.stringify(session),
  });

  const page = await context.newPage();
  const result = {
    baseUrl,
    loggedIn: false,
    steps: [],
  };

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
    result.steps.push("loaded_app");

    const loginVisible = await page.getByRole("button", { name: "Sign In" }).isVisible().catch(() => false);
    if (loginVisible) {
      throw new Error("Smoke login failed: app still shows Sign In.");
    }

    result.loggedIn = true;

    await page.getByRole("button", { name: "Build OS" }).click();
    await page.getByText("One canonical Eli workflow for turning raw ideas into shipped products.").waitFor({
      timeout: 30_000,
    });
    result.steps.push("opened_build_os");

    const title = `Smoke Test ${new Date().toISOString().slice(0, 19)}`;
    await page.getByPlaceholder("Idea or product name").fill(title);
    await page.locator('textarea[placeholder="Problem statement"]').fill("Smoke test problem statement");
    await page.getByPlaceholder("Target user").fill("Smoke test user");
    await page.getByRole("button", { name: "Create Build Project" }).click();
    await page.getByRole("heading", { name: title }).waitFor({ timeout: 30_000 });
    result.steps.push("created_project");

    const experimentCard = page
      .getByRole("heading", { name: "Experiment Log" })
      .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await experimentCard.locator("textarea").fill("# Experiment Log\n\nSmoke test entry");
    await experimentCard.getByRole("button", { name: "Save" }).click();
    result.steps.push("saved_experiment_log");

    await page.getByRole("button", { name: "Advance Stage" }).click();
    await page.getByText("Write the PRD and iterate with research until the opportunity and market signals are crisp.").waitFor({
      timeout: 30_000,
    });
    result.steps.push("advanced_to_prd_research");

    const prdCard = page
      .getByRole("heading", { name: "PRD" })
      .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await prdCard.locator("textarea").fill("# Product Requirements Document\n\nSmoke prompt update check");
    const promptPreview = page.locator("pre");
    await promptPreview.waitFor({ timeout: 30_000 });
    const promptText = await promptPreview.textContent();
    if (!promptText || !promptText.includes("Smoke prompt update check")) {
      throw new Error("Prompt packet did not update from live PRD draft.");
    }
    result.steps.push("prompt_packet_updates_from_draft");

    await page.getByRole("button", { name: "Advance Stage" }).click();
    await page.getByText("Mark the research checklist item complete before moving on.").waitFor({
      timeout: 30_000,
    });
    result.steps.push("prd_gate_blocks_without_checklist");

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const screenshotPath = path.join("/tmp", "founderfinder-build-os-smoke-failure.png");
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      result.screenshot = screenshotPath;
    } catch {
      result.screenshot = null;
    }

    result.error = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

await runSmokeTest();
