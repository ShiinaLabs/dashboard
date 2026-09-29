import type { AuthUser } from "@/lib/auth-helpers";

export interface GraphQLContext {
  user: AuthUser;
}
