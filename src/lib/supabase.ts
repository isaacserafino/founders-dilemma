// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma

import { createClient } from "@supabase/supabase-js";

function requirePublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY", raw: string | undefined): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(
      `Missing or invalid ${name}. Set it in .env.local (see .env.local.example). ` +
        "The Supabase client cannot be initialized without this value."
    );
  }
  return value;
}

// Use direct member access so Next can inline NEXT_PUBLIC_* in client bundles.
const supabaseUrl = requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
