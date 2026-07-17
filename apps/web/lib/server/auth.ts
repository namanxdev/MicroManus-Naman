import "server-only";

import type { User } from "@supabase/supabase-js";

import { ApiError } from "./api-error";
import { createSessionClient } from "./supabase";

export async function requireUser(): Promise<User> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue");
  }
  return data.user;
}

export async function optionalUser(): Promise<User | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
