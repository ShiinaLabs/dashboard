import { mkdirSync, appendFileSync, renameSync, existsSync, statSync, unlinkSync } from "fs";
import { join } from "path";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_LABEL: Record<LogLevel, string> = { debug: "DEBUG", info: "INFO", warn: "WARN", error: "ERROR" };

export interface LoggerOptions {
  dir: string;
  level: string;
  maxSize: string;
  maxFiles: number;
}

function parseSize(s: string): number {
  const m = s.match(/^(\d+)([kKmMgG])?$/);
  if (!m) return 10 * 1024 * 1024;
  const n = parseInt(m[1], 10);
  switch (m[2]?.toLowerCase()) {
    case "k": return n * 1024;
    case "m": return n * 1024 * 1024;
    case "g": return n * 1024 * 1024 * 1024;
    default: return n * 1024 * 1024;
  }
}

function formatLine(timestamp: string, level: LogLevel, component: string, message: string): string {
  return `[${timestamp}] [${LEVEL_LABEL[level]}] [${component}] ${message}\n`;
}

function interpolate(msg: string, args: unknown[]): string {
  if (args.length === 0) return msg;
  let i = 0;
  return msg.replace(/%[sdifo]/g, () => {
    if (i < args.length) {
      const val = args[i++];
      return val !== undefined && val !== null ? String(val) : "";
    }
    return "%";
  }) + (i < args.length ? " " + args.slice(i).map(String).join(" ") : "");
}

const g = globalThis as unknown as { __logger?: Logger };

export interface Logger {
  info(component: string, msg: string, ...args: unknown[]): void;
  warn(component: string, msg: string, ...args: unknown[]): void;
  error(component: string, msg: string, ...args: unknown[]): void;
  debug(component: string, msg: string, ...args: unknown[]): void;
}

export function logStructured(level: LogLevel, component: string, event: string, fields: Record<string, unknown> = {}) {
  getLogger()[level](component, "%s", JSON.stringify({ event, ...fields }));
}

class FileLogger implements Logger {
  private dir: string;
  private level: LogLevel;
  private maxSize: number;
  private maxFiles: number;
  private filePath: string;
  private fileLoggingAvailable = true;
  private fileLoggingWarningEmitted = false;

  constructor(opts: LoggerOptions) {
    this.dir = opts.dir;
    this.level = (Object.keys(LEVEL_ORDER).includes(opts.level) ? opts.level : "info") as LogLevel;
    this.maxSize = parseSize(opts.maxSize);
    this.maxFiles = opts.maxFiles;
    this.filePath = join(this.dir, "app.log");
    mkdirSync(this.dir, { recursive: true });
  }

  private log(level: LogLevel, component: string, msg: string, args: unknown[]) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const ts = new Date().toISOString();
    const line = formatLine(ts, level, component, interpolate(msg, args));
    process.stdout.write(line);
    if (!this.fileLoggingAvailable) return;
    try {
      this.rotateIfNeeded();
      appendFileSync(this.filePath, line, "utf-8");
    } catch (error) {
      this.disableFileLogging(error);
    }
  }

  private rotateIfNeeded() {
    if (!existsSync(this.filePath)) return;
    if (statSync(this.filePath).size < this.maxSize) return;

    const oldest = this.filePath + "." + this.maxFiles;
    if (existsSync(oldest)) unlinkSync(oldest);

    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const oldP = this.filePath + "." + i;
      const newP = this.filePath + "." + (i + 1);
      if (existsSync(oldP)) renameSync(oldP, newP);
    }
    renameSync(this.filePath, this.filePath + ".1");
  }

  private disableFileLogging(error: unknown) {
    this.fileLoggingAvailable = false;
    if (this.fileLoggingWarningEmitted) return;
    this.fileLoggingWarningEmitted = true;
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[Logger] File logging disabled: ${message}\n`);
  }

  info(component: string, msg: string, ...args: unknown[]) { this.log("info", component, msg, args); }
  warn(component: string, msg: string, ...args: unknown[]) { this.log("warn", component, msg, args); }
  error(component: string, msg: string, ...args: unknown[]) { this.log("error", component, msg, args); }
  debug(component: string, msg: string, ...args: unknown[]) { this.log("debug", component, msg, args); }
}

export function initLogger(opts: LoggerOptions): Logger {
  g.__logger = new FileLogger(opts);
  return g.__logger;
}

export function getLogger(): Logger {
  if (!g.__logger) throw new Error("Logger not initialized. Call initLogger() first.");
  return g.__logger;
}
