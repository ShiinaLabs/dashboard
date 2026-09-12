import { join } from "path";
import { mkdirSync } from "fs";

// ── Paths ─────────────────────────────────────────────────────────

const DATA_DIR = process.env.DATA_DIR
  ? (process.env.DATA_DIR.startsWith("/") ? process.env.DATA_DIR : join(process.cwd(), process.env.DATA_DIR))
  : join(process.cwd(), "data");

export function logDir(): string {
  return process.env.LOG_DIR
    ? (process.env.LOG_DIR.startsWith("/") ? process.env.LOG_DIR : join(process.cwd(), process.env.LOG_DIR))
    : join(dataDir(), "logs");
}

export function logLevel(): string {
  return process.env.LOG_LEVEL || "info";
}

export function logMaxSize(): string {
  return process.env.LOG_MAX_SIZE || "10m";
}

export function logMaxFiles(): number {
  return Number(process.env.LOG_MAX_FILES) || 5;
}

// Content older than this window is not discovered/fetched/recomputed.
// Shared by the X and Reddit fetchers. Set TWEET_WINDOW_DAYS to tune;
// old data has no processing value.
export function contentWindowDays(): number {
  return Number(process.env.TWEET_WINDOW_DAYS) || 90;
}

export function dataDir(): string {
  mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

// ── Types ──────────────────────────────────────────────────────────

export interface LogConfig {
  dir: string;
  level: string;
  maxSize: string;
  maxFiles: number;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
  ssl?: boolean;
}

export interface DashboardConfig {
  host: string;
  port: number;
  https: boolean;
  allowedOrigins: string[];
  passwordHash: string;
  database: DatabaseConfig;
  log: LogConfig;
}

// ── Parse DATABASE_URL ─────────────────────────────────────────────

function parseDbUrl(url: string): DatabaseConfig | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port || "5432"),
      database: u.pathname.slice(1) || "dashboard",
      user: u.username || "dashboard",
      password: u.password || "",
      ssl: u.searchParams.get("sslmode") === "require",
    };
  } catch {
    return null;
  }
}

// ── Config (env-only, no filesystem persistence) ────────────────────

const g = globalThis as unknown as { __dashboardConfig?: DashboardConfig };

export function loadConfig(): DashboardConfig {
  if (g.__dashboardConfig) return g.__dashboardConfig;

  // DATABASE_URL takes priority; fall back to individual PG_* vars
  const dbUrl = process.env.DATABASE_URL?.trim();
  const dbConfig = dbUrl ? parseDbUrl(dbUrl) ?? defaultDb() : defaultDb();

  g.__dashboardConfig = {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT) || 3000,
    https: process.env.HTTPS === "true",
    allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
    passwordHash: process.env.ADMIN_PASSWORD_HASH?.trim() || "",
    database: dbConfig,
    log: {
      dir: logDir(),
      level: logLevel(),
      maxSize: logMaxSize(),
      maxFiles: logMaxFiles(),
    },
  };
  return g.__dashboardConfig;
}

function defaultDb(): DatabaseConfig {
  return {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT) || 5432,
    database: process.env.PG_DB || "dashboard",
    user: process.env.PG_USER || "dashboard",
    password: process.env.PG_PASSWORD || "",
  };
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

// ── Mock / debug mode ─────────────────────────────────────────────
// When MOCK_DATA is set (truthy), the app serves fixture data from lib/mock
// instead of querying PostgreSQL, and skips DB bootstrap + real auth. This is
// for debugging the frontend in isolation (no backend). Dev/debug ONLY — never
// enable in production. The client reads the build-time mirror NEXT_PUBLIC_MOCK_DATA
// to show a "MOCK MODE" banner.
export function isMockMode(): boolean {
  const v = process.env.MOCK_DATA;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isMockFetcherMode(): boolean {
  const v = process.env.MOCK_FETCHER;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  // Also treat mockuser screenName as mock fetcher in tests
  return false;
}

// ── Encryption key ─────────────────────────────────────────────────

export function loadOrGenerateKey(): string {
  const envKey = process.env.DASHBOARD_SECRET?.trim();
  if (!envKey) throw new Error("DASHBOARD_SECRET environment variable is required");
  if (envKey.length !== 64) throw new Error("DASHBOARD_SECRET must be 64 hex characters (32 bytes)");
  return envKey;
}

// ── AI Analysis ─────────────────────────────────────────────────

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dailyTokenLimit: number;
}

export function aiConfig(): AiConfig {
  return {
    baseUrl: process.env.AI_BASE_URL || "",
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "gpt-4o-mini",
    dailyTokenLimit: Number(process.env.AI_DAILY_TOKEN_LIMIT) || 100_000,
  };
}
