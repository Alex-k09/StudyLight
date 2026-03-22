import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://kxsbxxddwhizgrkhjnua.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QDA3WzhHpF3pCj6gPEpwIw_gLts80wU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

