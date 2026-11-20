// Optional: rewrite stand-up notes with Claude, using your own API key.
// Only the stand-up text you're looking at is sent, and only when you press the button.

export class AIError extends Error {}

const SYSTEM = `You help someone prepare what to SAY at a short daily stand-up meeting.
Rewrite their notes into natural, spoken, first-person sentences: friendly, plain and brief.
Rules:
- Keep every fact (projects, tasks, meetings, times). Don't invent anything.
- Round times naturally ("about two hours"). Group related work.
- "yesterday": 2–4 sentences. "today": 1–3 sentences. "blockers": 1–2 sentences, or "No blockers right now." if none.
- Reply with JSON only: {"yesterday": "...", "today": "...", "blockers": "..."}`;

export async function rewriteStandup({ apiKey, model }, notes) {
  if (!apiKey) throw new AIError('Add your Claude API key in Settings → AI first.');
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-5-5',
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: 'user', content: `My stand-up notes:\n\nWHAT I DID (${notes.yesterdayLabel}):\n${notes.yesterday}\n\nWHAT I'LL DO TODAY:\n${notes.today || '(nothing written yet)'}\n\nBLOCKERS / REQUESTS / UNCLEAR:\n${notes.blockers || '(none)'}` }],
      }),
    });
  } catch {
    throw new AIError("Couldn't reach Claude. Check your internet connection.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) throw new AIError("Claude didn't accept that API key.");
    throw new AIError(json?.error?.message || `Claude returned an error (${res.status}).`);
  }
  const text = (json?.content || []).map((c) => c.text || '').join('').trim();
  try {
    const m = text.match(/\{[\s\S]*\}/);
    const o = JSON.parse(m ? m[0] : text);
    return { yesterday: o.yesterday || '', today: o.today || '', blockers: o.blockers || '' };
  } catch {
    return { yesterday: text, today: '', blockers: '' };
  }
}
