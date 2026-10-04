import { getConnectionDetail, listConnections } from "./app-store";
import { getAppStoreHealth } from "./app-store-health";
import { getAppStoreAnalyticsStatus } from "./app-store-analytics";

type Viewer = { id: number; role: string };

export function getAppStoreConnections(viewer: Viewer) {
  return listConnections(viewer);
}

export async function getAppStoreConnectionPage(connectionId: number, viewer: Viewer) {
  const [detail, health, analyticsStatus] = await Promise.all([
    getConnectionDetail(connectionId, viewer),
    getAppStoreHealth(connectionId, viewer),
    getAppStoreAnalyticsStatus(connectionId, viewer),
  ]);
  return { ...detail, health, analyticsStatus };
}
