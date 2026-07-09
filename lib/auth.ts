import { supabase } from "./supabase";

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function isAdminLoggedIn() {
  const user = await getCurrentUser();
  return !!user;
}

export async function logout() {
  await supabase.auth.signOut();
}