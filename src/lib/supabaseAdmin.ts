// Server-side only — jangan import ini di komponen frontend.
// Dipakai oleh Vercel API routes (api/).
// Butuh env vars: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
