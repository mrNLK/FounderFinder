import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export const FOUNDER_FINDER_APP_SLUG = "founderfinder";

export async function assertAppMembership(
  serviceClient: SupabaseClient,
  userId: string,
  appSlug: string,
): Promise<void> {
  const { data, error } = await serviceClient
    .from("app_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("app_slug", appSlug)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("App membership check failed:", error);
    throw new Error("membership_check_failed");
  }

  if (!data) {
    throw new Error("not_authorized");
  }
}
