import { graphqlRequest } from "../graphql";

const settingsQuery = /* GraphQL */ `
  query SettingsPage {
    settings { ai { baseUrl apiKey model } }
  }
`;
const adminUsersQuery = /* GraphQL */ `
  query AdminUsersPage {
    admin { users { id username role created_at } }
  }
`;
const aiStatusQuery = /* GraphQL */ `
  query AiStatus { ai { status { configured quota { used limit } } } }
`;

export async function getSettingsPage(signal?: AbortSignal) {
  const result = await graphqlRequest<{ settings: { ai: { baseUrl: string; apiKey: string; model: string } } }>(settingsQuery, undefined, signal);
  return result.settings;
}

export async function getAdminUsersPage(signal?: AbortSignal) {
  const result = await graphqlRequest<{ admin: { users: { id: number; username: string; role: string; created_at: string }[] } }>(adminUsersQuery, undefined, signal);
  return { users: result.admin.users };
}

export async function getAiStatusPage(signal?: AbortSignal) {
  const result = await graphqlRequest<{ ai: { status: { configured: boolean; quota: { used: number; limit: number } } } }>(aiStatusQuery, undefined, signal);
  return result.ai.status;
}
