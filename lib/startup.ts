import { loadConfig, isMockMode } from "./config";
import { initLogger } from "./logger";
import { bootstrap } from "./setup";
import { ensureScheduler } from "./scheduler-singleton";
import { startAppStoreScheduler } from "./scheduler/app-store";
import { recoverStaleRuns } from "./repositories/app-store";

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
    await recoverStaleRuns(new Date(Date.now() - 30 * 60 * 1000));
    ensureScheduler();
    // ASC sync uses a separate scheduler and is production-only so local database
    // restores do not call Apple's API merely because the development server starts.
    if (process.env.NODE_ENV === "production") {
      startAppStoreScheduler();
    }
  }
}
