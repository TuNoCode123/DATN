export const TOEIC_SW_WRITING_SYSTEM_PROMPT = `You are an expert TOEIC Speaking & Writing grader. Grade the student's writing answer according to official TOEIC Writing scoring criteria.

Return a JSON object with EXACTLY these fields:
{
  "grammarScore": <number 0-100>,
  "vocabScore": <number 0-100>,
  "contentScore": <number 0-100>,
  "overallScore": <number 0-100>,
  "feedback": "<detailed feedback string with improvement suggestions>",
  "grammarErrors": [{"error": "<error>", "correction": "<correction>", "explanation": "<why>"}] or null,
  "vocabAnalysis": {"level": "<basic|intermediate|advanced>", "range": <number 0-100>, "notes": "<notes>"} or null
}

## Scoring Rubrics by Question Type

### WRITE_SENTENCES (Image + Keywords)
- Grammar (40%): Correct sentence structure, verb forms, articles, prepositions
- Keyword Usage (30%): Both keywords used naturally and correctly in the sentence
- Content/Relevance (30%): Sentence accurately describes what is shown in the image. The image will be provided — carefully examine it and verify the sentence matches the visual content.
- Scoring: Simple sentences with correct grammar → 60-70. Complex sentences with good keyword integration → 80-90.
- IMPORTANT: If the sentence does not match what the image shows (e.g., describes a different scene), penalize the contentScore heavily regardless of grammar quality.

### RESPOND_WRITTEN_REQUEST (Email/Letter Response)
- Content (30%): Responds to all parts of the request appropriately
- Organization (20%): Proper email/letter format, logical structure
- Grammar (25%): Sentence structure, verb tenses, subject-verb agreement
- Vocabulary (25%): Appropriate register, word choice, varied expressions
- Scoring: Addresses request but basic language → 50-60. Complete response with good language → 70-80. Sophisticated response → 85+.

### WRITE_OPINION_ESSAY
- Organization (25%): Clear introduction, body paragraphs, conclusion. Logical flow.
- Argument Quality (25%): Reasons and examples support the opinion effectively
- Grammar (25%): Complex sentence structures used correctly, minimal errors
- Vocabulary Range (25%): Varied word choice, academic vocabulary, precise language
- Scoring: Basic opinion with weak support → 40-50. Clear opinion with examples → 60-70. Well-structured argument with sophisticated language → 80+.

## Important Guidelines
- Be strict but fair — this is a standardized test
- For WRITE_SENTENCES: penalize heavily if keywords are missing or misused
- For RESPOND_WRITTEN_REQUEST: check that ALL parts of the original request are addressed
- For WRITE_OPINION_ESSAY: word count matters — very short essays (< 200 words) should score lower
- Provide specific, actionable feedback in English
- CRITICAL: You MUST ALWAYS return valid JSON, no matter what the student wrote. Even if the answer is gibberish, empty, off-topic, or nonsensical, you must still return the JSON object with low scores (0-5) and feedback explaining why. Never refuse to grade. Never return prose instead of JSON.
- Return ONLY valid JSON, no additional text
`;

export interface WritingPromptResult {
  text: string;
  /** If set, the image should be included in the AI request as a vision input */
  needsImage: boolean;
}

export function buildWritingPrompt(
  questionType: string,
  stem: string | null,
  metadata: Record<string, unknown> | null,
  answer: string,
): WritingPromptResult {
  let prompt = `## Question Type: ${questionType}\n\n`;
  let needsImage = false;

  if (questionType === 'WRITE_SENTENCES') {
    const keywords = (metadata?.keywords as string[]) || [];
    prompt += `## Task: Write a sentence using the given keywords about the image.\n\n`;
    prompt += `## Keywords: ${keywords.join(', ')}\n\n`;
    if (stem) prompt += `## Additional Instructions: ${stem}\n\n`;
    prompt += `## Important: The image is provided below. Verify that the student's sentence accurately describes what is shown in the image.\n\n`;
    needsImage = true;
  } else if (questionType === 'RESPOND_WRITTEN_REQUEST') {
    prompt += `## Task: Respond to the following email/letter.\n\n`;
    prompt += `## Original Message:\n${stem || '(no message provided)'}\n\n`;
    const minWords = metadata?.minWords || 50;
    const maxWords = metadata?.maxWords || 120;
    prompt += `## Word Limits: ${minWords}-${maxWords} words\n\n`;
  } else if (questionType === 'WRITE_OPINION_ESSAY') {
    prompt += `## Task: Write an essay expressing your opinion on the topic.\n\n`;
    prompt += `## Topic:\n${stem || '(no topic provided)'}\n\n`;
    const minWords = metadata?.minWords || 300;
    prompt += `## Minimum Words: ${minWords}\n\n`;
  }

  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  prompt += `## Student's Answer (${wordCount} words):\n${answer || '(empty)'}\n`;

  return { text: prompt, needsImage };
}
