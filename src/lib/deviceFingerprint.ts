// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

/** Best-effort canvas noise; not meant to resist spoofing, only bind prototype voters. */
function canvasToken(): string {
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    c.width = 280;
    c.height = 60;
    ctx.textBaseline = "top";
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#f60";
    ctx.fillRect(120, 1, 60, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("founders-dilemma", 2, 15);
    ctx.strokeStyle = "#ff0";
    ctx.arc(80, 30, 20, 0, Math.PI, true);
    ctx.stroke();
    return c.toDataURL();
  } catch {
    return "";
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stable-ish device fingerprint for anonymous binding (prototype-grade).
 */
export async function getDeviceFingerprintHash(): Promise<string> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { brands?: { brand: string; version: string }[] };
  };
  const brands = nav.userAgentData?.brands
    ?.map((b) => `${b.brand}/${b.version}`)
    .join(",");

  const parts = [
    nav.userAgent,
    nav.language,
    (nav.languages ?? []).join(","),
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(nav.hardwareConcurrency ?? ""),
    String(nav.deviceMemory ?? ""),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    brands ?? "",
    canvasToken(),
  ];

  return sha256Hex(parts.join("|"));
}
