import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GoalContext {
  title: string;
  category: string;
  progressPercent: number;
  targetDate: string;
  whyItMatters?: string;
}

interface DailyPromptRequestBody {
  cleanStreakDays?: number;
  longestCleanStreakDays?: number;
  urgeVictories?: number;
  todayHabitPercent?: number;
  habitsCompletedToday?: number;
  habitsTotal?: number;
  focusSessionsToday?: number;
  focusMinutesToday?: number;
  goals?: GoalContext[];
  whyIStarted?: string;
  recentNoteTitles?: string[];
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.post('/api/notes/daily-prompt', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured. Configure it in Settings > Secrets to generate AI Daily Prompts.',
      });
      return;
    }

    const body = (req.body ?? {}) as DailyPromptRequestBody;
    const cleanStreakDays = Number(body.cleanStreakDays ?? 0);
    const longestCleanStreakDays = Number(body.longestCleanStreakDays ?? 0);
    const urgeVictories = Number(body.urgeVictories ?? 0);
    const todayHabitPercent = Number(body.todayHabitPercent ?? 0);
    const habitsCompletedToday = Number(body.habitsCompletedToday ?? 0);
    const habitsTotal = Number(body.habitsTotal ?? 0);
    const focusSessionsToday = Number(body.focusSessionsToday ?? 0);
    const focusMinutesToday = Number(body.focusMinutesToday ?? 0);
    const goals = Array.isArray(body.goals) ? body.goals.slice(0, 6) : [];
    const recentNoteTitles = Array.isArray(body.recentNoteTitles)
      ? body.recentNoteTitles.slice(0, 5)
      : [];
    const whyIStarted = typeof body.whyIStarted === 'string' ? body.whyIStarted.trim() : '';

    const goalsSummary =
      goals.length > 0
        ? goals
            .map(
              (g) =>
                `- "${g.title}" (${g.category}, ${g.progressPercent}% milestones done, target ${g.targetDate})`
            )
            .join('\n')
        : '- No explicit goals saved yet.';

    const promptContext = [
      `User Self-Improvement Context (Quitting porn & social media using a locked Android Kiosk):`,
      `- Current Clean Streak: ${cleanStreakDays} days (Best: ${longestCleanStreakDays} days)`,
      `- Urge Victories Logged: ${urgeVictories}`,
      `- Today's Habits: ${habitsCompletedToday}/${habitsTotal} (${todayHabitPercent}%)`,
      `- Deep Focus Timer Today: ${focusSessionsToday} sessions (${focusMinutesToday} minutes)`,
      whyIStarted ? `- Personal Why: ${whyIStarted}` : '',
      `Active Goals:\n${goalsSummary}`,
      recentNoteTitles.length > 0
        ? `Recent Diary/Note Titles: ${recentNoteTitles.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents:
          `${promptContext}\n\nGenerate ONE deeply thoughtful, practical reflective journaling prompt tailored specifically to their current clean streak, habit consistency, and active goals.`,
        config: {
          systemInstruction:
            'You are a grounded, practical journaling coach inside a distraction-free self-improvement kiosk app helping someone quit porn and social media. Keep the tone calm, direct, and non-preachy. Output strictly valid JSON matching the schema: a specific reflective question referencing their real progress or goals, a short 2-4 word theme, the goal or streak milestone referenced, and a 1-sentence writing starter they can insert into their diary note.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              question: {
                type: Type.STRING,
                description: 'A single reflective journaling question (1-2 concise sentences).',
              },
              focusTheme: {
                type: Type.STRING,
                description: 'Short 2-4 word topic label for this reflection.',
              },
              goalReferenced: {
                type: Type.STRING,
                description: 'The goal or progress metric this prompt connects to.',
              },
              writingStarter: {
                type: Type.STRING,
                description: 'A short opening sentence prompt for the user diary entry.',
              },
            },
            required: ['question', 'focusTheme', 'goalReferenced', 'writingStarter'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Gemini returned an empty response. Please try again.' });
        return;
      }

      const parsed = JSON.parse(rawText) as {
        question?: string;
        focusTheme?: string;
        goalReferenced?: string;
        writingStarter?: string;
      };

      if (!parsed.question) {
        res.status(502).json({ error: 'Unexpected prompt format returned from Gemini.' });
        return;
      }

      res.json({
        question: parsed.question,
        focusTheme: parsed.focusTheme ?? 'Daily Reflection',
        goalReferenced: parsed.goalReferenced ?? `${cleanStreakDays}-day streak`,
        writingStarter: parsed.writingStarter ?? 'Today I noticed that...',
      });
    } catch (err: unknown) {
      let message =
        err instanceof Error ? err.message : 'Failed to generate AI Daily Prompt from Gemini.';
      const rawMessage = message;
      if (message.trim().startsWith('{')) {
        try {
          const parsedErr = JSON.parse(message) as { error?: { message?: string } };
          if (parsedErr.error?.message) {
            message = parsedErr.error.message;
          }
        } catch {
          // Keep original message if not valid JSON
        }
      }
      const status =
        rawMessage.includes('API_KEY_INVALID') ||
        rawMessage.includes('PERMISSION_DENIED') ||
        rawMessage.includes('free tier is not available')
          ? 403
          : rawMessage.includes('RESOURCE_EXHAUSTED')
            ? 429
            : 500;
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  return app;
}

const PORT = Number(process.env.PORT ?? 3000);
createApp()
  .then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Ironclad OS server running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start Ironclad OS server:', err);
    process.exit(1);
  });
