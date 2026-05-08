// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { POSITIVE_VOTE_BUDGET } from "@/lib/constants";

const LIKED_KEY = "fd_liked_ideas";

interface ResultRow {
  slug: string;
  title: string;
  direction: "right" | "up";
}

export default function ResultsScreen() {
  const router = useRouter();
  const [results, setResults] = useState<ResultRow[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LIKED_KEY);
      if (!raw) return;
      setResults(JSON.parse(raw) as ResultRow[]);
    } catch {
      // ignore parse errors
    } finally {
      try {
        sessionStorage.removeItem(LIKED_KEY);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const liked = results.filter((r) => r.direction === "right");
  const loved = results.filter((r) => r.direction === "up");

  return (
    <main className="relative flex flex-col items-center min-h-dvh px-6 py-12 overflow-hidden bg-[#0a0a0f]">
      {/* Ambient */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-brand-700/20 blur-3xl" />
      </div>

      <motion.div
        className="relative z-10 flex flex-col gap-8 w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Header */}
        <div className="text-center flex flex-col gap-2">
          <span className="text-5xl">🏁</span>
          <h1 className="text-3xl font-bold tracking-tight">Your verdict</h1>
          <p className="text-sm text-white/50">
            {results.length === 0
              ? "Here's what resonated with you"
              : `Your ${results.length} of ${POSITIVE_VOTE_BUDGET} pick${
                  results.length === 1 ? "" : "s"
                }`}
          </p>
        </div>

        {/* Loved */}
        {loved.length > 0 && (
          <Section label="❤️‍🔥 Loved" items={loved} color="from-brand-600 to-purple-600" />
        )}

        {/* Liked */}
        {liked.length > 0 && (
          <Section label="✅ Liked" items={liked} color="from-green-600 to-emerald-600" />
        )}

        {/* Empty state */}
        {results.length === 0 && (
          <div className="text-center text-white/40 py-10">
            No votes recorded — try again!
          </div>
        )}

        {/* CTA */}
        <div className="flex flex-col gap-3 mt-4">
          <a
            href="https://www.serafinosoftware.com/p/about-us.html"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-brand-600 to-purple-600 font-semibold text-lg text-center shadow-lg shadow-brand-700/30"
          >
            Tell me more →
          </a>
          <button
            onClick={() => router.push("/")}
            className="w-full py-3 rounded-2xl border border-white/10 text-white/60 text-sm"
          >
            Start over
          </button>

          <p className="text-center text-xs text-white/20 pt-1">
            Free software —{" "}
            <a
              href="https://github.com/isaacserafino/founders-dilemma"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white/40 transition-colors"
            >
              source (AGPL-3.0)
            </a>
          </p>
        </div>
      </motion.div>
    </main>
  );
}

function Section({
  label,
  items,
  color,
}: {
  label: string;
  items: ResultRow[];
  color: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/40">{label}</p>
      {items.map((item, i) => (
        <motion.div
          key={item.slug}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r ${color} bg-opacity-10`}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
        >
          <span className="font-semibold text-sm">{item.title}</span>
        </motion.div>
      ))}
    </div>
  );
}
