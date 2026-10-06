import { json } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
async function GET() {
  return json({ status: "ok", serverTime: new Date().toISOString(), version: process.env.BUILD_COMMIT_SHA ?? process.env.CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET();
}
