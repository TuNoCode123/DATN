import {
  AlignedPair,
  TokenEvolution,
  WordScore,
  SpeakingAssessment,
} from './types';
import { BedrockService } from '../bedrock/bedrock.service';
import { TOEIC_SW_SPEAKING_SYSTEM_PROMPT } from './prompts/speaking-system-prompt';

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** LCS-based word alignment between spoken and target sentences */
export function alignWords(
  spoken: string[],
  target: string[],
): AlignedPair[] {
  const m = spoken.length;
  const n = target.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (normalizeWord(spoken[i - 1]) === normalizeWord(target[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const aligned: AlignedPair[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      normalizeWord(spoken[i - 1]) === normalizeWord(target[j - 1])
    ) {
      aligned.unshift({
        spoken: spoken[i - 1],
        target: target[j - 1],
        type: 'match',
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      aligned.unshift({ spoken: null, target: target[j - 1], type: 'missing' });
      j--;
    } else {
      aligned.unshift({ spoken: spoken[i - 1], target: null, type: 'extra' });
      i--;
    }
  }

  return aligned;
}

/** Score words after alignment, using stable token metadata */
export function scoreWords(
  aligned: AlignedPair[],
  stableTokens: TokenEvolution[],
  targetSentence: string,
): SpeakingAssessment {
  const wordScores: WordScore[] = [];
  let correctCount = 0;
  const totalTargetWords = targetSentence.split(/\s+/).filter(Boolean).length;

  for (const pair of aligned) {
    const token = stableTokens.find((t) => t.token === pair.spoken);

    if (pair.type === 'match') {
      const confidence = token?.confidence ?? 0.5;
      const wasAutoCorrected = token?.wasAutoCorrected ?? false;

      if (wasAutoCorrected || confidence < 0.4) {
        wordScores.push({
          word: token?.token ?? pair.spoken!,
          targetWord: pair.target,
          status: 'warning',
          confidence,
          startTime: token?.startTime ?? 0,
          endTime: token?.endTime ?? 0,
          pauseBefore: 0,
          wasAutoCorrected,
          details: wasAutoCorrected
            ? `Auto-corrected: you said "${token?.variants[0]}" but Transcribe corrected to "${pair.target}"`
            : `Low confidence (${(confidence * 100).toFixed(0)}%) — pronunciation may be unclear`,
        });
      } else {
        wordScores.push({
          word: pair.spoken!,
          targetWord: pair.target,
          status: 'correct',
          confidence,
          startTime: token?.startTime ?? 0,
          endTime: token?.endTime ?? 0,
          pauseBefore: 0,
          wasAutoCorrected: false,
          details: '',
        });
        correctCount++;
      }
    } else if (pair.type === 'missing') {
      wordScores.push({
        word: '',
        targetWord: pair.target,
        status: 'missing',
        confidence: 0,
        startTime: 0,
        endTime: 0,
        pauseBefore: 0,
        wasAutoCorrected: false,
        details: `Word "${pair.target}" was not spoken`,
      });
    } else if (pair.type === 'extra') {
      wordScores.push({
        word: pair.spoken!,
        targetWord: null,
        status: 'extra',
        confidence: token?.confidence ?? 0.3,
        startTime: token?.startTime ?? 0,
        endTime: token?.endTime ?? 0,
        pauseBefore: 0,
        wasAutoCorrected: false,
        details: `Extra word "${pair.spoken}" not in target`,
      });
    }
  }

  // Calculate pauses between consecutive spoken words
  const spokenWords = wordScores.filter((w) => w.startTime > 0);
  for (let i = 1; i < spokenWords.length; i++) {
    spokenWords[i].pauseBefore =
      spokenWords[i].startTime - spokenWords[i - 1].endTime;
  }

  // Fluency scoring
  const pauses = spokenWords.filter((w) => w.pauseBefore > 0.5);
  const longPauses = spokenWords.filter((w) => w.pauseBefore > 1.5);
  const totalPauseTime = pauses.reduce((sum, w) => sum + w.pauseBefore, 0);
  const totalDuration =
    spokenWords.length > 0
      ? spokenWords[spokenWords.length - 1].endTime - spokenWords[0].startTime
      : 0;

  const pausePenalty = Math.min(pauses.length * 5, 30);
  const longPausePenalty = Math.min(longPauses.length * 10, 30);
  const fluencyScore = Math.max(0, 100 - pausePenalty - longPausePenalty);

  const pronunciationScore =
    wordScores.length > 0
      ? wordScores.reduce((sum, w) => {
          if (w.status === 'correct') return sum + 100;
          if (w.status === 'warning') return sum + 50;
          if (w.status === 'incorrect') return sum + 10;
          return sum;
        }, 0) / Math.max(totalTargetWords, 1)
      : 0;

  const completenessScore = (correctCount / Math.max(totalTargetWords, 1)) * 100;

  return {
    wordScores,
    pronunciationScore: Math.round(pronunciationScore),
    fluencyScore: Math.round(fluencyScore),
    completenessScore: Math.round(completenessScore),
    overallScore: Math.round(
      0.4 * pronunciationScore + 0.3 * fluencyScore + 0.3 * completenessScore,
    ),
    spokenSentence: stableTokens.map((t) => t.token).join(' '),
    targetSentence,
    finalTranscript: '',
    totalDuration,
    pauseCount: pauses.length,
    totalPauseTime,
    autoCorrectionCount: stableTokens.filter((t) => t.wasAutoCorrected).length,
  };
}

/** Grade open-ended speaking questions via Bedrock AI */
export async function gradeSpeakingOpenEnded(
  transcript: string,
  questionType: string,
  questionStem: string | null,
  bedrock: BedrockService,
): Promise<SpeakingAssessment> {
  const prompt = `## Question Type: ${questionType}
## Prompt: ${questionStem || '(no prompt)'}
## Student's Spoken Response (transcribed):
${transcript || '(empty)'}

Grade this spoken response. Return a JSON object.`;

  const response = await bedrock.messages.create({
    max_tokens: 1024,
    system: TOEIC_SW_SPEAKING_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText =
    response.content[0].type === 'text' ? response.content[0].text : '';
  const text = rawText.trim();

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      wordScores: [],
      pronunciationScore: 50,
      fluencyScore: 50,
      completenessScore: 50,
      overallScore: 50,
      spokenSentence: transcript,
      targetSentence: '',
      finalTranscript: transcript,
      totalDuration: 0,
      pauseCount: 0,
      totalPauseTime: 0,
      autoCorrectionCount: 0,
    };
  }

  return {
    wordScores: [],
    pronunciationScore: (parsed.pronunciationScore as number) ?? 50,
    fluencyScore: (parsed.fluencyScore as number) ?? 50,
    completenessScore: (parsed.contentScore as number) ?? 50,
    overallScore: (parsed.overallScore as number) ?? 50,
    spokenSentence: transcript,
    targetSentence: '',
    finalTranscript: transcript,
    totalDuration: 0,
    pauseCount: 0,
    totalPauseTime: 0,
    autoCorrectionCount: 0,
  };
}
