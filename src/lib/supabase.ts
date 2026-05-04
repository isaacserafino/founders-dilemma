// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma

import { createClient } from "@supabase/supabase-js";

function requirePublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const raw = process.env[name];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(
      `Missing or invalid ${name}. Set it in .env.local (see .env.local.example). ` +
        "The Supabase client cannot be initialized without this value."
    );
  }
  return value;
}

const supabaseUrl = requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
