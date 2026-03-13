import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ROOT_DIR = process.cwd();
const DEFAULT_BASE_URL = "https://founder-finder-mu.vercel.app";
const FALLBACK_AUTH_STORAGE_KEY = "sb-iirwwadiedcbcrxpehog-auth-token";

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

function deriveSupabaseAuthStorageKey(supabaseUrl) {
  if (process.env.SMOKE_SUPABASE_AUTH_STORAGE_KEY) {
    return process.env.SMOKE_SUPABASE_AUTH_STORAGE_KEY;
  }

  try {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split(".")[0];
    if (projectRef) {
      return `sb-${projectRef}-auth-token`;
    }
  } catch {
    // fall through to legacy key fallback
  }

  return FALLBACK_AUTH_STORAGE_KEY;
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

  const attempts = [];

  if (email && password) {
    attempts.push({
      label: "password",
      run: () => fetchJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      }),
    });
  }

  if (refreshToken) {
    attempts.push({
      label: "refresh_token",
      run: () => fetchJson(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers,
        body: JSON.stringify({ refresh_token: refreshToken }),
      }),
    });
  }

  if (attempts.length === 0) {
    throw new Error("Set SMOKE_EMAIL and SMOKE_PASSWORD, or SMOKE_SUPABASE_REFRESH_TOKEN.");
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await attempt.run();
    } catch (error) {
      lastError = error;
      console.warn(`Full smoke auth with ${attempt.label} failed; trying next method if available.`);
    }
  }

  throw lastError || new Error("Unable to create full smoke auth session.");
}

function artifactCard(page, title) {
  return page
    .getByRole("heading", { name: title })
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
}

async function fillArtifact(page, artifactTitle, markdown) {
  const card = artifactCard(page, artifactTitle);
  await card.locator("textarea").fill(markdown);
  await card.getByRole("button", { name: "Save" }).click();
}

async function checkChecklistItem(page, label) {
  const row = page.locator("label", { hasText: label }).first();
  const checkbox = row.locator('input[type="checkbox"]');
  const checked = await checkbox.isChecked();
  if (!checked) {
    await checkbox.check();
  }
}

function projectFieldByLabel(page, labelText) {
  return page
    .locator("label", { hasText: labelText })
    .first()
    .locator("xpath=following-sibling::input[1] | following-sibling::select[1] | following-sibling::textarea[1]");
}

async function runFullSmokeTest() {
  bootstrapEnv();

  const baseUrl = process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL;
  const supabaseUrl = process.env.SMOKE_SUPABASE_URL || requireEnv("VITE_SUPABASE_URL");
  const authStorageKey = deriveSupabaseAuthStorageKey(supabaseUrl);
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
    key: authStorageKey,
    value: JSON.stringify(session),
  });

  const page = await context.newPage();
  const result = {
    baseUrl,
    loggedIn: false,
    fullFlow: false,
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

    const title = `Full Smoke ${new Date().toISOString().slice(0, 19)}`;
    await page.getByPlaceholder("Idea or product name").fill(title);
    await page.locator('textarea[placeholder="Problem statement"]').fill("Full smoke: prove Build OS from explore to shipped.");
    await page.getByPlaceholder("Target user").fill("Internal builder");
    await page.getByRole("button", { name: "Create Build Project" }).click();
    await page.getByRole("heading", { name: title }).waitFor({ timeout: 30_000 });
    result.steps.push("created_project");

    await fillArtifact(page, "Experiment Log", "# Experiment Log\n\nValidated APIs and rough architecture.");
    await page.getByRole("button", { name: "Advance Stage" }).click();
    await page.getByText("Write the PRD and iterate with research until the opportunity and market signals are crisp.").waitFor({
      timeout: 30_000,
    });
    result.steps.push("advanced_to_prd_research");

    await fillArtifact(page, "PRD", "# Product Requirements Document\n\n## Scope\n\nBuild OS full flow.");
    await fillArtifact(page, "Market Signals", "# Market Signals\n\nClear demand from repeated founder workflow.");
    await page.getByRole("button", { name: "Advance Stage" }).click();
    await page.getByText("Mark the research checklist item complete before moving on.").waitFor({ timeout: 30_000 });
    await checkChecklistItem(page, "Research pass captured competitive context and market signals.");
    await checkChecklistItem(page, "PRD scope is specific enough to hand to engineering.");
    await page.getByRole("button", { name: "Advance Stage" }).click();
    await page.getByText("Write the TDD and pressure-test it with a fresh engineering context until there are no open questions.").waitFor({
      timeout: 30_000,
    });
    result.steps.push("advanced_to_tdd_review");

    await fillArtifact(page, "TDD", "# Technical Design Document\n\n## Architecture\n\nStage-driven workflow.");
    await fillArtifact(page, "Engineering Questions", "# Engineering Questions\n\nAll blockers closed.");
    await page.getByRole("button", { name: "Advance Stage" }).click();
    await page.getByText("Open engineering questions must be resolved before moving on.").waitFor({ timeout: 30_000 });
    await checkChecklistItem(page, "Open engineering questions are resolved or explicitly parked.");
    await checkChecklistItem(page, "The TDD is specific enough for implementation without new product decisions.");
    await page.getByRole("button", { name: "Advance Stage" }).click();
    await page.getByText("Implement, deploy, and run QA loops until the spec is complete and tested.").waitFor({
      timeout: 30_000,
    });
    result.steps.push("advanced_to_build_loop");

    await fillArtifact(page, "Implementation Notes", "# Implementation Notes\n\nShipped core Build OS surfaces.");
    await fillArtifact(page, "QA Notes", "# QA Notes\n\nPass on stage transitions and prompt packets.");
    await projectFieldByLabel(page, "Deploy URL").fill("https://founder-finder-mu.vercel.app");
    await page.getByRole("button", { name: "Advance Stage" }).click();
    await page.getByText("Spec passes QA must be checked before moving on.").waitFor({ timeout: 30_000 });
    await checkChecklistItem(page, "Design skill guidance was applied to the shipped UI.");
    await checkChecklistItem(page, "Closed-loop QA passed against the current spec.");
    await page.getByRole("button", { name: "Advance Stage" }).click();
    await page.getByText("Return for manual testing, polish rough edges, and either ship or park the project.").waitFor({
      timeout: 30_000,
    });
    result.steps.push("advanced_to_manual_polish");

    await fillArtifact(page, "Manual Test Notes", "# Manual Test Notes\n\nFinal pass done, no blockers.");
    await fillArtifact(page, "Polish Backlog", "# Polish Backlog\n\n- Optional copy tweaks");
    await checkChecklistItem(page, "Manual testing identified the remaining polish or sign-off items.");
    await page.getByRole("button", { name: "Finish Project" }).click();
    await page.getByText("Mark the project as shipped or parked before finishing.").waitFor({ timeout: 30_000 });

    await projectFieldByLabel(page, "Status").selectOption("shipped");
    await page.getByRole("button", { name: "Finish Project" }).click();

    const finishButton = page.getByRole("button", { name: "Finish Project" });
    await finishButton.waitFor({ timeout: 30_000 });
    const isDisabled = await finishButton.isDisabled();
    if (!isDisabled) {
      throw new Error("Expected Finish Project button to be disabled after completion.");
    }
    await page.getByText("Shipped").first().waitFor({ timeout: 30_000 });
    result.steps.push("completed_manual_polish_and_shipped");

    result.fullFlow = true;
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const screenshotPath = path.join("/tmp", "founderfinder-build-os-full-smoke-failure.png");
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

await runFullSmokeTest();
