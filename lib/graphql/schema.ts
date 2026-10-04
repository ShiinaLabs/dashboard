import { createSchema, createYoga } from "graphql-yoga";
import type { GraphQLContext } from "./context";
import { analyticsResolvers, analyticsTypeDefs } from "./analytics";
import { appStoreResolvers, appStoreTypeDefs } from "./app-store";
import { settingsResolvers, settingsTypeDefs } from "./settings";
import { xResolvers, xTypeDefs } from "./x";

const schema = createSchema<GraphQLContext>({
  typeDefs: [analyticsTypeDefs, appStoreTypeDefs, settingsTypeDefs, xTypeDefs],
  resolvers: {
    ...analyticsResolvers,
    ...appStoreResolvers,
    ...settingsResolvers,
    ...xResolvers,
    Query: { ...analyticsResolvers.Query, ...appStoreResolvers.Query, ...settingsResolvers.Query, ...xResolvers.Query },
  },
});

export const yoga = createYoga<GraphQLContext, GraphQLContext>({
  schema,
  graphqlEndpoint: "/api/graphql",
  graphiql: process.env.NODE_ENV !== "production",
  batching: false,
  cors: false,
  context: ({ user }) => ({ user }),
});
