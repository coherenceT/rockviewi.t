import type { Env } from '../../worker/env';
import { jsonResponse, methodNotAllowed } from '../../worker/lib/http';
import { logWarn } from '../../worker/lib/logger';
import { runHandler } from '../../worker/lib/respond';
import { readEarlyBirdCount } from '../../worker/store/supabase';
import { courses, earlyBirdSeatsRemaining, isEarlyBirdOpen } from '../../shared/courses';

/**
 * GET /api/early-bird
 *
 * Returns the campaign dates and one integer: how many early-bird places are
 * left. The counter table has no public read policy, so this endpoint is the
 * only way the landing page can show the remaining count.
 *
 * If the database is unreachable the page must not break, so the count falls
 * back to "all places remaining" and the failure is logged instead.
 */
export const onRequestGet: PagesFunction<Env> = async (context) =>
  runHandler(async () => {
    const { env } = context;
    const { seats, closesAt, closesLabel, displayLine } = courses.fees.earlyBird;
    const open = isEarlyBirdOpen();

    let paidCount = 0;
    let available = true;
    try {
      paidCount = await readEarlyBirdCount(env);
    } catch (error) {
      available = false;
      logWarn('early_bird_counter_unavailable', { reason: 'database_unreachable' });
      void error;
    }

    const remaining = available ? earlyBirdSeatsRemaining(paidCount) : seats;

    return jsonResponse({
      ok: true,
      seats,
      paidCount: available ? paidCount : null,
      remaining,
      closesAt,
      closesLabel,
      displayLine,
      isOpen: open && remaining > 0,
    });
  });

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(['GET']);
