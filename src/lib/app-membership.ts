import { supabase } from "@/integrations/supabase/client";

export type PrivateAppSlug = "founderfinder" | "sourcekit";

export interface AppMembership {
  id: string;
  userId: string;
  appSlug: PrivateAppSlug;
  role: string;
  status: string;
}

interface AppMembershipRow {
  id: string;
  user_id: string;
  app_slug: PrivateAppSlug;
  role: string;
  status: string;
}

export async function fetchActiveAppMembership(
  appSlug: PrivateAppSlug,
): Promise<AppMembership | null> {
  const { data, error } = await supabase
    .from("app_memberships")
    .select("id, user_id, app_slug, role, status")
    .eq("app_slug", appSlug)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row = data as AppMembershipRow;
  return {
    id: row.id,
    userId: row.user_id,
    appSlug: row.app_slug,
    role: row.role,
    status: row.status,
  };
}
