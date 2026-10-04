import { apiRequest } from "./api-transport";

interface GraphQLErrorPayload {
  message?: unknown;
  extensions?: { code?: unknown };
}

interface GraphQLResponse<TData> {
  data?: TData | null;
  errors?: GraphQLErrorPayload[];
  error?: string;
}

export class GraphQLRequestError extends Error {
  readonly extensions: { code?: string };

  constructor(message: string, extensions: { code?: string } = {}, readonly status?: number) {
    super(message);
    this.name = "GraphQLRequestError";
    this.extensions = extensions;
  }
}

export async function graphqlRequest<TData, TVariables extends Record<string, unknown> = Record<string, never>>(
  query: string,
  variables?: TVariables,
  signal?: AbortSignal,
): Promise<TData> {
  const response = await apiRequest("/graphql", {
    method: "POST",
    body: JSON.stringify(variables === undefined ? { query } : { query, variables }),
    signal,
  });
  const result = await response.json().catch(() => null) as GraphQLResponse<TData> | null;

  const firstError = result?.errors?.[0];
  if (firstError) {
    const message = typeof firstError.message === "string" ? firstError.message : "GraphQL request failed";
    const code = typeof firstError.extensions?.code === "string" ? firstError.extensions.code : undefined;
    throw new GraphQLRequestError(message, code ? { code } : {}, response.ok ? undefined : response.status);
  }

  if (!response.ok) {
    throw new GraphQLRequestError(result?.error ?? `GraphQL HTTP error: ${response.status}`, {}, response.status);
  }

  if (!result || result.data === undefined || result.data === null) {
    throw new GraphQLRequestError("Invalid GraphQL response");
  }

  return result.data;
}
