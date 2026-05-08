// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function LandingScreen() {
  const router = useRouter();

  return (
    <main className="relative flex flex-col items-center justify-center min-h-dvh px-6 overflow-hidden bg-[#0a0a0f]">
      {/* Ambient gradient orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-brand-700/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-brand-600/20 blur-3xl" />
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center text-center gap-8 max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo / icon */}
        <motion.div
          className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-2xl shadow-brand-700/40"
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
        >
          <span className="text-4xl select-none" aria-hidden>
            ⚡
          </span>
        </motion.div>

        {/* Headline */}
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-bold tracking-tight leading-none">
            Founder&apos;s
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-purple-300">
              Dilemma&trade;
            </span>
          </h1>
          <p className="text-base text-white/60 leading-relaxed">
            Seven startup ideas. Swipe right on the ones that could define your
            company.
          </p>
        </div>

        {/* Swipe legend */}
        <div className="flex gap-6 text-sm">
          <span className="flex items-center gap-1.5 text-green-400">
            <span className="text-lg">👉</span> Like
          </span>
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="text-lg">👈</span> Pass
          </span>
          <span className="flex items-center gap-1.5 text-brand-400">
            <span className="text-lg">☝️</span> Love
          </span>
        </div>

        {/* CTA */}
        <motion.button
          onClick={() => router.push("/game")}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-brand-600 to-purple-600 font-semibold text-lg shadow-lg shadow-brand-700/30 active:scale-95 transition-transform"
          whileTap={{ scale: 0.97 }}
        >
          Start swiping →
        </motion.button>

        <p className="text-xs text-white/30">
          ~2 minutes · anonymous · no sign-up required
        </p>

        <p className="text-xs text-white/20">
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
      </motion.div>
    </main>
  );
}
