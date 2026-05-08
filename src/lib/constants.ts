// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma

/**
 * How many positive votes (right + up swipes combined) a voter is allowed
 * across one playthrough. Enforced both client-side (UX) and server-side
 * (trigger on `votes`).
 */
export const POSITIVE_VOTE_BUDGET = 3;
