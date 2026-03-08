import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { assertAppMembership, FOUNDER_FINDER_APP_SLUG } from "./app-membership.ts";

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export interface AuthResult {
  userId: string;
  email: string;
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
}

/**
 * Authenticates the request AND verifies the user has an active Founder Finder membership.
 * Returns clients and user info on success, throws on failure.
 */
export async function authenticateAiFundUser(request: Request): Promise<AuthResult> {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("Authorization") || "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    throw new AuthGuardError("Unauthorized", "unauthorized", 401);
  }

  const userEmail = user.email;
  if (!userEmail) {
    throw new AuthGuardError("No email on account", "missing_email", 403);
  }

  try {
    await assertAppMembership(serviceClient, user.id, FOUNDER_FINDER_APP_SLUG);
  } catch (error) {
    if (error instanceof Error && error.message === "membership_check_failed") {
      throw new AuthGuardError("Access check failed", "membership_check_failed", 500);
    }
    throw new AuthGuardError("Access denied", "not_authorized", 403);
  }

  return {
    userId: user.id,
    email: userEmail,
    userClient,
    serviceClient,
  };
}

export class AuthGuardError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
