// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Idea } from "@/types";

interface VideoDrawerProps {
  idea: Idea | null;
  onClose: (watchSeconds: number) => void;
}

export default function VideoDrawer({ idea, onClose }: VideoDrawerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Wall-clock ms accumulated while the video was actually playing (not paused / buffering / seeking). */
  const playedMsRef = useRef(0);
  const playSegmentStartRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Sync open state with idea presence; reset playback tally for this open
  useEffect(() => {
    if (idea) {
      setIsOpen(true);
      playedMsRef.current = 0;
      playSegmentStartRef.current = null;
    }
  }, [idea]);

  const handleClose = useCallback(() => {
    const flushPlaySegment = () => {
      if (playSegmentStartRef.current != null) {
        playedMsRef.current += performance.now() - playSegmentStartRef.current;
        playSegmentStartRef.current = null;
      }
    };

    flushPlaySegment();

    const watchSeconds = Math.round(playedMsRef.current / 100) / 10; // 1 decimal

    // Pause video before unmounting
    if (videoRef.current) {
      videoRef.current.pause();
    }

    setIsOpen(false);
    onClose(watchSeconds);
  }, [onClose]);

  // Track real playback time (not drawer-open wall clock)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !idea?.video_url || !isOpen) return;

    const flushPlaySegment = () => {
      if (playSegmentStartRef.current != null) {
        playedMsRef.current += performance.now() - playSegmentStartRef.current;
        playSegmentStartRef.current = null;
      }
    };

    const onPlaying = () => {
      if (playSegmentStartRef.current == null) {
        playSegmentStartRef.current = performance.now();
      }
    };

    const onPause = () => flushPlaySegment();
    const onEnded = () => flushPlaySegment();
    const onWaiting = () => flushPlaySegment();
    const onSeeking = () => flushPlaySegment();

    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("seeking", onSeeking);

    // Autoplay may emit `playing` before listeners attach
    if (!video.paused && !video.ended && playSegmentStartRef.current == null) {
      playSegmentStartRef.current = performance.now();
    }

    return () => {
      flushPlaySegment();
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("seeking", onSeeking);
    };
  }, [idea?.id, idea?.video_url, isOpen]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, handleClose]);

  return (
    <AnimatePresence>
      {isOpen && idea && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-[#12121a] rounded-t-3xl shadow-2xl max-h-[90dvh] overflow-hidden"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-2 pb-4 shrink-0">
              <div className="flex flex-col gap-0.5 flex-1 pr-4">
                <h3 className="text-xl font-bold leading-tight">{idea.title}</h3>
                <p className="text-sm text-white/60">{idea.tagline}</p>
              </div>
              <button
                onClick={handleClose}
                className="mt-0.5 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-lg shrink-0"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Video */}
            <div className="relative w-full bg-black aspect-video shrink-0">
              {idea.video_url ? (
                <video
                  ref={videoRef}
                  src={idea.video_url}
                  className="w-full h-full object-contain"
                  controls
                  playsInline
                  autoPlay
                  preload="metadata"
                  poster={idea.poster_url ?? undefined}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">
                  No pitch video yet
                </div>
              )}
            </div>

            {/* Description */}
            {idea.description && (
              <div className="px-5 py-5 overflow-y-auto">
                <p className="text-sm text-white/70 leading-relaxed">{idea.description}</p>
              </div>
            )}

            {/* Bottom CTA */}
            <div className="px-5 pb-8 pt-3 shrink-0 border-t border-white/5">
              <button
                onClick={handleClose}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-brand-600 to-purple-600 font-semibold text-base"
              >
                Got it — back to swiping
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
