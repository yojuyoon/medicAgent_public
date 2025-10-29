// tools/report.ts

import type { FastifyBaseLogger } from 'fastify';
import type { LLMService } from '../../services/llm';
import { supabaseAdmin } from '../../lib/supabase';

type Focus = 'cognitive' | 'mental' | 'physical' | 'overall';
type Role = 'user' | 'assistant' | 'system';

interface InteractionRow {
  id: string;
  user_id: string;
  session_id: string | null;
  role: Role;
  text: string;
  created_at: string; // ISO
  tags: string[] | null;
  category: 'cognitive' | 'mental' | 'physical' | 'other' | null;
  tone: string | null;
  sentiment: number | null;
  cognitive_score: number | null;
  mental_score: number | null;
  physical_score: number | null;
  chroma_id?: string | null;
}

function toLocalISOString(d: Date) {
  // optional: for display purposes. actual storage/queries maintain UTC.
  return d.toISOString();
}

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function parseBP(text: string) {
  // very tolerant: "145/92", "BP 132/84", "bp reading now is 145/92 mmHg"
  const m = text.match(/(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (!m) return null;
  const sys = Number(m[1]);
  const dia = Number(m[2]);
  if (isNaN(sys) || isNaN(dia)) return null;
  return { sys, dia };
}

function isTag(tags: string[] | null, ...needles: string[]) {
  if (!tags?.length) return false;
  const set = new Set(tags.map((t) => t.toLowerCase()));
  return needles.some((n) => set.has(n.toLowerCase()));
}

function classifyAdherence(r: InteractionRow) {
  // Heuristic: if user text mentions "took" + bp tag → adherence
  // if "running late|late|delay" + bp → delayed
  // if reminder logged but next 3h no "took" → potential missed (requires window; here we mark delayed/ok only)
  const t = r.text.toLowerCase();
  if (!isTag(r.tags, 'bp', 'medication')) return null;
  if (/took/.test(t)) return 'on_time_or_taken';
  if (/(delay|late)/.test(t)) return 'delayed';
  return null;
}

function extractMetrics(rows: InteractionRow[], focus: Focus) {
  // 1) Basic filter: exclude system logs (improves report reliability). Can be included if needed.
  const core = rows.filter((r) => r.role !== 'system');

  // 2) Focus filter (keep all if overall)
  const focused =
    focus === 'overall' ? core : core.filter((r) => r.category === focus);

  // 3) Category distribution / tone / sentiment
  const catCounts: Record<string, number> = {};
  const toneCounts: Record<string, number> = {};
  const sentiments: number[] = [];
  for (const r of focused) {
    const c = r.category || 'other';
    catCounts[c] = (catCounts[c] || 0) + 1;
    if (r.tone) toneCounts[r.tone] = (toneCounts[r.tone] || 0) + 1;
    if (typeof r.sentiment === 'number') sentiments.push(r.sentiment);
  }

  // 4) Medication adherence/delay (BP)
  let adherenceOnTime = 0;
  let adherenceDelayed = 0;
  for (const r of focused) {
    const a = classifyAdherence(r);
    if (a === 'on_time_or_taken') adherenceOnTime++;
    else if (a === 'delayed') adherenceDelayed++;
  }

  // 5) Blood pressure readings aggregation
  const bpReadings = focused
    .map((r) => ({ row: r, bp: parseBP(r.text) }))
    .filter((x) => !!x.bp) as Array<{
    row: InteractionRow;
    bp: { sys: number; dia: number };
  }>;

  const sysValues = bpReadings.map((b) => b.bp.sys);
  const diaValues = bpReadings.map((b) => b.bp.dia);

  const bpStats = bpReadings.length
    ? {
        count: bpReadings.length,
        sysMin: Math.min(...sysValues),
        sysMax: Math.max(...sysValues),
        sysAvg: Math.round((avg(sysValues) ?? 0) * 10) / 10,
        diaMin: Math.min(...diaValues),
        diaMax: Math.max(...diaValues),
        diaAvg: Math.round((avg(diaValues) ?? 0) * 10) / 10,
        latest: (() => {
          const last = bpReadings[bpReadings.length - 1];
          if (!last) return null;
          return {
            created_at: last.row.created_at,
            sys: last.bp.sys,
            dia: last.bp.dia,
            text: last.row.text,
          };
        })(),
      }
    : null;

  // 6) Events: keyword aggregation for headaches/dizziness/sleep etc. (simple keywords)
  const events = {
    headaches: focused.filter((r) => /\bheadache\b/i.test(r.text)).length,
    dizziness: focused.filter((r) => /\bdizzy|dizziness\b/i.test(r.text))
      .length,
    sleep: focused.filter((r) => /\bsleep\b/i.test(r.text)).length,
    exercise: focused.filter((r) => /\bwalk|exercise|workout\b/i.test(r.text))
      .length,
  };

  // 7) Representative statements (recent 5, user-focused)
  const representative = focused
    .filter((r) => r.role === 'user')
    .slice(-5)
    .map((r) => `- [${r.created_at}] (${r.category ?? 'n/a'}) ${r.text}`);

  return {
    volume: focused.length,
    catCounts,
    toneCounts,
    sentimentAvg: sentiments.length
      ? Math.round((avg(sentiments) ?? 0) * 100) / 100
      : null,
    adherence: { onTimeOrTaken: adherenceOnTime, delayed: adherenceDelayed },
    bpStats,
    events,
    representative,
  };
}

export async function saveInteractionTool(
  logger: FastifyBaseLogger,
  params: {
    user_id: string;
    session_id: string | null;
    role: Role;
    text: string;
    created_at: string;
    category: 'cognitive' | 'mental' | 'physical' | 'other' | null;
    tone: string | null;
    sentiment: number | null;
    cognitive_score: number | null;
    mental_score: number | null;
    physical_score: number | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabaseAdmin.from('interactions').insert([params]);

    if (error) {
      logger.error({ error }, 'Failed to save interaction');
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logger.error({ err }, 'saveInteractionTool failed');
    return { ok: false, error: message };
  }
}

export async function queryInteractionsTool(
  logger: FastifyBaseLogger,
  params: {
    userId: string;
    startIso: string;
    endIso: string;
    limit?: number;
  }
): Promise<
  { ok: true; rows: InteractionRow[] } | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabaseAdmin
      .from('interactions')
      .select('*')
      .eq('user_id', params.userId)
      .gte('created_at', params.startIso)
      .lte('created_at', params.endIso)
      .order('created_at', { ascending: true })
      .limit(params.limit || 1000);

    if (error) {
      logger.error({ error }, 'Failed to query interactions');
      return { ok: false, error: error.message };
    }

    return { ok: true, rows: data || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logger.error({ err }, 'queryInteractionsTool failed');
    return { ok: false, error: message };
  }
}

export async function summarizeReportTool(
  logger: FastifyBaseLogger,
  llm: LLMService,
  params: {
    rows: InteractionRow[];
    timeframe: { startIso: string; endIso: string; label: string };
    focus: Focus;
  }
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  try {
    const { rows, timeframe, focus } = params;
    // Pre-aggregation
    const m = extractMetrics(rows, focus);

    // Explicit handling when there's little data
    if (!m.volume) {
      const empty = `No ${focus} data found for ${
        timeframe.label
      } between ${toLocalISOString(
        new Date(timeframe.startIso)
      )} and ${toLocalISOString(
        new Date(timeframe.endIso)
      )}. Consider logging a few entries (e.g., medication taken, BP readings, symptoms) and try again.`;
      return { ok: true, summary: empty };
    }

    // 'Factual summary' to pass to LLM (compressed context in table/JSON style)
    const factualContext = [
      `Timeframe: ${timeframe.label} (${timeframe.startIso} → ${timeframe.endIso})`,
      `Focus: ${focus}`,
      `Total entries (excl. system): ${m.volume}`,
      `Category counts: ${JSON.stringify(m.catCounts)}`,
      `Tone counts: ${JSON.stringify(m.toneCounts)}`,
      `Avg sentiment: ${m.sentimentAvg ?? 'n/a'}`,
      `Adherence (BP): on_time_or_taken=${m.adherence.onTimeOrTaken}, delayed=${m.adherence.delayed}`,
      `BP stats: ${m.bpStats ? JSON.stringify(m.bpStats) : 'n/a'}`,
      `Events: ${JSON.stringify(m.events)}`,
    ].join('\n');

    const quotes = m.representative.length
      ? `Representative user statements:\n${m.representative.join('\n')}`
      : 'Representative user statements: n/a';

    // Constrained prompt: 'No speculation/generalization beyond given facts'
    const prompt = [
      'You are a health reporting assistant.',
      'Write a concise, data-grounded report in bullet points plus a short paragraph.',
      'STRICT RULES:',
      '- Only use the facts provided below (factualContext & quotes).',
      '- Do NOT generalize to population-level trends.',
      '- Avoid diagnosis, prescriptions, or unsupported claims.',
      '- If a metric is n/a, explicitly say it is unavailable.',
      '',
      'factualContext:',
      factualContext,
      '',
      quotes,
      '',
      'Output structure:',
      '1) Title: "<Focus> Report for <Timeframe label>"',
      '2) Key Metrics: (bullets: adherence, BP stats, events, category/tone mix)',
      '3) Notable Entries: (1–3 bullets quoting or paraphrasing the representative statements)',
      '4) Gentle Suggestions: (data-aligned, non-clinical; e.g., hydration, timing consistency, re-check BP if elevated)',
      '',
      'Report:',
    ].join('\n');

    const text = await llm.generate(prompt, { temperature: 0.1 }); // Low temperature for fact-focused output
    return { ok: true, summary: text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logger.error({ err }, 'summarizeReportTool failed');
    return { ok: false, error: message };
  }
}
