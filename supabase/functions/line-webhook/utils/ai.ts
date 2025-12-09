// =============================
// AI GENERATION UTILITIES
// =============================

export async function generateWorkFeedback(
  taskTitle: string,
  progressText: string,
  wasOverdue: boolean,
  daysLate: number,
  userName: string
): Promise<string | null> {
  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      console.log('[generateWorkFeedback] LOVABLE_API_KEY not set, skipping feedback');
      return null;
    }

    const prompt = `You are a supportive work manager providing brief, constructive feedback on completed work.

Task: "${taskTitle}"
Completed by: ${userName}
Delivery status: ${wasOverdue ? `Late by ${daysLate} day(s)` : 'On time'}

Progress update from team member:
"${progressText}"

Provide a short (2-3 sentences), encouraging feedback that:
1. Acknowledges the completion
2. ${wasOverdue ? 'Gently mentions the delay but stays positive' : 'Celebrates the timely delivery'}
3. Offers one specific, actionable tip for improvement (if applicable)

Keep it friendly, brief, and motivating. Write in Thai if the progress text is in Thai, otherwise in English.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.error('[generateWorkFeedback] API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const feedback = data.choices?.[0]?.message?.content?.trim();
    
    console.log(`[generateWorkFeedback] Generated feedback for task "${taskTitle}"`);
    return feedback || null;
  } catch (error) {
    console.error('[generateWorkFeedback] Error:', error);
    return null;
  }
}

export async function callLovableAI(
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 1000
): Promise<string | null> {
  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      console.error('[callLovableAI] LOVABLE_API_KEY not set');
      return null;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      console.error('[callLovableAI] API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('[callLovableAI] Error:', error);
    return null;
  }
}
