import { createGraphQLError } from "graphql-yoga";
import { getAiStatus } from "@/lib/services/ai-analysis";
import { getAiSettings } from "@/lib/services/settings";
import { getUsers } from "@/lib/services/users";
import type { GraphQLContext } from "./context";

export const settingsTypeDefs = /* GraphQL */ `
  extend type Query { settings: SettingsQuery!, admin: AdminQuery!, ai: AiQuery! }
  type SettingsQuery { ai: AiSettings! }
  type AiSettings { baseUrl: String!, apiKey: String!, model: String! }
  type AdminQuery { users: [AdminUser!]! }
  type AdminUser { id: Int!, username: String!, role: String!, created_at: String! }
  type AiQuery { status: AiStatus! }
  type AiStatus { configured: Boolean!, quota: AiQuota! }
  type AiQuota { used: Int!, limit: Int! }
`;

export const settingsResolvers = {
  Query: {
    settings: () => ({}),
    admin: () => ({}),
    ai: () => ({}),
  },
  SettingsQuery: {
    ai: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (context.user.role !== "admin") throw createGraphQLError("Forbidden", { extensions: { code: "FORBIDDEN" } });
      const { ai } = await getAiSettings();
      return ai;
    },
  },
  AdminQuery: {
    users: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (context.user.role !== "admin") throw createGraphQLError("Forbidden", { extensions: { code: "FORBIDDEN" } });
      return getUsers();
    },
  },
  AiQuery: {
    status: (_parent: unknown, _args: unknown, context: GraphQLContext) => getAiStatus(context.user.id),
  },
};
