import { closeDb, initPgPool } from "../lib/db/connection";
import { repairHistoricalOngoingDailyCoverage } from "../lib/repositories/app-store-facts";

const apply = process.argv.includes("--apply");
await initPgPool();
try {
  const audit = await repairHistoricalOngoingDailyCoverage({ dryRun: !apply });
  console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", ...audit }, null, 2));
} finally {
  await closeDb();
}
