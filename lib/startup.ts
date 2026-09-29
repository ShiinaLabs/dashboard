import { loadConfig, isMockMode } from "./config";
import { initLogger } from "./logger";
import { bootstrap } from "./setup";
import { ensureScheduler } from "./scheduler-singleton";

let startupPromise: Promise<void> | null = null;

export function ensureApplicationReady(): Promise<void> {
  if (!startupPromise) {
    startupPromise = initializeApplication().catch((error: unknown) => {
      startupPromise = null;
      throw error;
    });
  }
  return startupPromise;
}

async function initializeApplication(): Promise<void> {
  const config = loadConfig();
  initLogger(config.log);

  await bootstrap();

  if (!isMockMode()) {
    ensureScheduler();
  }
}
