// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma

import Image from "next/image";

/**
 * Subtle footer line: brand mark, separator, and AGPL source link.
 */
export default function BrandFooter() {
  return (
    <span className="inline-flex flex-wrap items-center align-middle">
      <span className="inline-flex items-center gap-1 align-middle">
        <Image
          src="/brand/isai-logo.png"
          alt=""
          width={32}
          height={32}
          className="rounded-full"
          aria-hidden
        />
        &nbsp;
        <span>
          Isaac Serafino AI<sup className="text-[0.6em] -top-[0.4em]">™</sup>
        </span>
      </span>
      &nbsp;
      {" · "}
      &nbsp;
      <span>
        Free software —{" "}
        <a
          href="https://github.com/isaacserafino/founders-dilemma"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-white/40 transition-colors"
        >
          source (AGPL-3.0)
        </a>
      </span>
    </span>
  );
}
