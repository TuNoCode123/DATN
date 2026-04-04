export function gradeSentenceReorder(
  userAnswer: string | null,
  question: { correctAnswer: string; metadata: { fragments: string[] } },
): { isCorrect: boolean; score: number; feedback: string } {
  if (!userAnswer?.trim()) {
    return { isCorrect: false, score: 0, feedback: '未作答。' };
  }

  const normalize = (s: string) => s.replace(/[\s，。、！？,.!?\u3000]/g, '');
  const userNorm = normalize(userAnswer);
  const correctNorm = normalize(question.correctAnswer);

  // Exact match → full credit
  if (userNorm === correctNorm) {
    return { isCorrect: true, score: 1, feedback: '完全正确！' };
  }

  // All fragments present but wrong order → partial credit
  const fragments = question.metadata.fragments;
  const allPresent = fragments.every((f) => userNorm.includes(normalize(f)));

  if (allPresent) {
    return {
      isCorrect: false,
      score: 0.5,
      feedback: '词语都用了，但语序不正确。',
    };
  }

  return {
    isCorrect: false,
    score: 0,
    feedback: '请使用所有给定的词语组成句子。',
  };
}
