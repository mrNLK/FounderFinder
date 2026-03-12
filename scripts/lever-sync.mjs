import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();

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
  const supabaseUrl = process.env.LEVER_SYNC_SUPABASE_URL || process.env.SMOKE_SUPABASE_URL || requireEnv("VITE_SUPABASE_URL");
  const anonKey = process.env.LEVER_SYNC_SUPABASE_ANON_KEY || process.env.SMOKE_SUPABASE_ANON_KEY || requireEnv("VITE_SUPABASE_ANON_KEY");
  const refreshToken = process.env.LEVER_SYNC_REFRESH_TOKEN || process.env.SMOKE_SUPABASE_REFRESH_TOKEN;
  const email = process.env.LEVER_SYNC_EMAIL || process.env.SMOKE_EMAIL;
  const password = process.env.LEVER_SYNC_PASSWORD || process.env.SMOKE_PASSWORD;

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
    throw new Error("Set LEVER_SYNC_REFRESH_TOKEN or LEVER_SYNC_EMAIL+LEVER_SYNC_PASSWORD.");
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await attempt.run();
    } catch (error) {
      lastError = error;
      console.warn(`Lever sync auth with ${attempt.label} failed; trying next method if available.`);
    }
  }

  throw lastError || new Error("Unable to create auth session for Lever sync.");
}

function asInt(value, fallback) {
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  return fallback;
}

function asBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true" || value === "1") {
      return true;
    }
    if (value.toLowerCase() === "false" || value === "0") {
      return false;
    }
  }
  return fallback;
}

async function runLeverSync() {
  bootstrapEnv();

  const session = await createSession();
  const supabaseUrl = process.env.LEVER_SYNC_SUPABASE_URL || process.env.SMOKE_SUPABASE_URL || requireEnv("VITE_SUPABASE_URL");
  const anonKey = process.env.LEVER_SYNC_SUPABASE_ANON_KEY || process.env.SMOKE_SUPABASE_ANON_KEY || requireEnv("VITE_SUPABASE_ANON_KEY");
  const functionUrl = `${supabaseUrl}/functions/v1/aifund-lever-sync`;
  const mode = process.env.LEVER_SYNC_MODE === "preview" ? "preview" : "sync";
  const source = process.env.LEVER_SYNC_SOURCE === "manual_rows" ? "manual_rows" : "lever_api";
  const maxApplicants = asInt(process.env.LEVER_SYNC_MAX_APPLICANTS, 120);
  const includeArchived = asBool(process.env.LEVER_SYNC_INCLUDE_ARCHIVED, false);
  const resurfacingWindowDays = asInt(process.env.LEVER_SYNC_RESURFACING_WINDOW_DAYS, 180);

  const payload = {
    mode,
    source,
    maxApplicants,
    includeArchived,
    resurfacingWindowDays,
  };

  const result = await fetchJson(functionUrl, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  console.log(JSON.stringify({
    action: "lever_sync",
    functionUrl,
    payload,
    result,
  }, null, 2));
}

await runLeverSync();
