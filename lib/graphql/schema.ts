import { createSchema, createYoga } from "graphql-yoga";
import type { GraphQLContext } from "./context";
import { analyticsResolvers, analyticsTypeDefs } from "./analytics";

const schema = createSchema<GraphQLContext>({
  typeDefs: analyticsTypeDefs,
  resolvers: analyticsResolvers,
});

export const yoga = createYoga<GraphQLContext, GraphQLContext>({
  schema,
  graphqlEndpoint: "/api/graphql",
  graphiql: process.env.NODE_ENV !== "production",
  batching: false,
  cors: false,
  context: ({ user }) => ({ user }),
});
