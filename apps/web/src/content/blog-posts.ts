export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: 'IELTS' | 'TOEIC' | 'HSK' | 'AI Tools' | 'Study Tips';
  author: string;
  publishedAt: string;
  updatedAt?: string;
  readingMinutes: number;
  tags: string[];
  content: { heading: string; body: string[] }[];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'how-to-get-ielts-band-7',
    title: 'How to Get IELTS Band 7 in 30 Days: A Realistic Study Plan',
    description:
      'A day-by-day IELTS Band 7 study plan covering Listening, Reading, Writing, and Speaking — with AI feedback strategies and pitfalls to avoid.',
    category: 'IELTS',
    author: 'NEU Study Editorial',
    publishedAt: '2026-03-18',
    updatedAt: '2026-04-02',
    readingMinutes: 11,
    tags: ['IELTS', 'Band 7', 'Study Plan'],
    content: [
      {
        heading: 'What Band 7 actually requires',
        body: [
          'IELTS Band 7 is the threshold most universities, skilled migration programs, and professional bodies require. In practice, it means you can handle complex language fairly accurately, understand detailed reasoning, and produce clear, well-organized writing and speech.',
          'For Listening and Reading, Band 7 corresponds to roughly 30 out of 40 correct answers. For Writing and Speaking, it requires consistent control of grammar, a wide vocabulary range, clear coherence, and accurate pronunciation.',
        ],
      },
      {
        heading: 'Week 1 — Diagnostic and foundations',
        body: [
          'Start by taking a full official practice test under timed conditions. Do not skip this: you need a baseline score and an honest picture of which section drags you down.',
          'Spend the rest of week 1 reviewing mistakes in Reading and Listening, and building a personal vocabulary bank of 100 academic words. Use spaced repetition flashcards so the words actually stick — a one-time review is not enough.',
        ],
      },
      {
        heading: 'Week 2 — Reading and Listening drills',
        body: [
          'Do one Reading passage and one Listening section every day. The goal in week 2 is not full tests, it is pattern recognition. Every IELTS passage follows predictable question types: matching headings, True/False/Not Given, sentence completion, and multiple choice.',
          'When you get a question wrong, write down the paragraph number and the exact reason you picked the wrong answer. Most Band 6 to Band 7 jumps come from fixing the same three or four reasoning traps.',
        ],
      },
      {
        heading: 'Week 3 — Writing Task 2 structure',
        body: [
          'Band 7 Writing requires a clear position, developed paragraphs, and accurate linking. Memorize a single four-paragraph structure you can reuse: introduction with a clear thesis, two body paragraphs each with one main argument and an example, and a direct conclusion.',
          'Write one Task 2 essay every other day and feed it to an AI evaluator for band-level feedback. Fix the same error in your next essay before moving on.',
        ],
      },
      {
        heading: 'Week 4 — Speaking and full mocks',
        body: [
          'Record yourself answering every Part 2 cue card topic from the last two years. Listen back for fillers ("uh", "you know"), grammar slips, and flat intonation. Use an AI pronunciation tool to catch phonemes you consistently mispronounce.',
          'Take two full mock tests in the final week. If your target is Band 7 overall, you can compensate a Band 6.5 in one skill with a 7.5 in another, so know which skill you rely on.',
        ],
      },
      {
        heading: 'Common Band 7 pitfalls',
        body: [
          'Memorized phrases: examiners penalize obviously rehearsed idioms. Use natural language, not "every cloud has a silver lining" openers.',
          'Task response: answer the exact question asked, not the one you wish was asked. This is the single most common reason people stall at Band 6.5.',
          'Repetition in Speaking: if you use the same linking word twice in thirty seconds, the range score drops.',
        ],
      },
    ],
  },
  {
    slug: 'toeic-900-listening-reading-strategy',
    title: 'TOEIC 900+ Strategy: How to Score High on Listening & Reading',
    description:
      'A proven strategy for scoring 900+ on the TOEIC Listening and Reading test, with part-by-part tactics and time management tips.',
    category: 'TOEIC',
    author: 'NEU Study Editorial',
    publishedAt: '2026-02-28',
    readingMinutes: 9,
    tags: ['TOEIC', '900 Score', 'Strategy'],
    content: [
      {
        heading: 'What 900+ means on TOEIC',
        body: [
          'A TOEIC score of 900 and above places you in the top 5 percent of test takers globally and signals near-native working proficiency. Most multinational employers treat 900+ as a hiring differentiator for roles that involve English communication.',
          'To get there, you cannot afford to lose more than roughly 10 questions across both Listening and Reading combined. Precision matters more than speed alone.',
        ],
      },
      {
        heading: 'Part 5 — the grammar trap',
        body: [
          'Part 5 has 30 sentence completion questions and is the single fastest part to optimize. Most 800 to 900 jumps come from mastering ten grammar patterns: verb tense consistency, subject verb agreement, relative clauses, participles, conditionals, prepositions, comparatives, gerunds vs. infinitives, word form, and parallel structure.',
          'Drill each pattern with 50 targeted questions. Aim to answer each Part 5 item in under 20 seconds on test day.',
        ],
      },
      {
        heading: 'Part 7 — reading comprehension pacing',
        body: [
          'Part 7 is where most candidates lose time and points. For 900+, spend no more than 55 minutes on Part 7 and read every passage in full — skimming shortcuts stop working above 850.',
          'For double and triple passages, always read the questions first, then locate the relevant information across both texts. Many questions require cross-referencing between the main text and an email or chart.',
        ],
      },
      {
        heading: 'Listening parts 3 and 4',
        body: [
          'Parts 3 and 4 are the highest-value listening sections because the questions are previewed on the page. Use the narrator pause to read all three questions for the next conversation before the audio starts.',
          'Train with 1.25x speed audio for the final two weeks. Real TOEIC audio will feel slow and clear by comparison.',
        ],
      },
    ],
  },
  {
    slug: 'hsk-levels-explained',
    title: 'HSK Levels Explained: Which Level Should You Take?',
    description:
      'A complete guide to HSK 1 through HSK 6 — vocabulary counts, expected abilities, exam format, and how to pick the right level for your Chinese proficiency.',
    category: 'HSK',
    author: 'NEU Study Editorial',
    publishedAt: '2026-03-05',
    readingMinutes: 8,
    tags: ['HSK', 'Chinese', 'Levels'],
    content: [
      {
        heading: 'The HSK in one paragraph',
        body: [
          'HSK (Hanyu Shuiping Kaoshi) is the standardized Chinese proficiency test administered by Hanban. It has six levels. HSK 1 and 2 certify survival and basic everyday Chinese; HSK 3 and 4 are the intermediate plateau most learners aim for; HSK 5 and 6 demonstrate academic and professional fluency.',
        ],
      },
      {
        heading: 'HSK 1 — 150 words',
        body: [
          'HSK 1 requires you to understand and use 150 common words and basic phrases. The test has 40 questions split into listening and reading. There is no writing section at this level. It is a realistic goal after 2 to 3 months of casual study.',
        ],
      },
      {
        heading: 'HSK 2 — 300 words',
        body: [
          'HSK 2 doubles the vocabulary to 300 words and introduces simple grammar patterns like measure words and aspect particles. The exam format remains listening plus reading.',
        ],
      },
      {
        heading: 'HSK 3 — 600 words',
        body: [
          'HSK 3 is the first level that adds a writing section. You need 600 words and should be able to handle short paragraphs on daily life, study, and work. Most university exchange programs require HSK 3 minimum.',
        ],
      },
      {
        heading: 'HSK 4 — 1200 words',
        body: [
          'HSK 4 is the sweet spot for professional use. You can discuss a range of topics and read straightforward articles. Chinese-taught undergraduate programs typically require HSK 4.',
        ],
      },
      {
        heading: 'HSK 5 — 2500 words',
        body: [
          'HSK 5 signals advanced ability. You can read newspapers and magazines, watch films, and deliver full speeches. Graduate programs in China generally require HSK 5.',
        ],
      },
      {
        heading: 'HSK 6 — 5000 words',
        body: [
          'HSK 6 is the highest published level and demonstrates near-native command. The test includes complex reading, nuanced listening, and an essay. It is the required level for most PhD programs and language-sensitive employment in China.',
        ],
      },
    ],
  },
  {
    slug: 'spaced-repetition-ai-flashcards',
    title: 'Spaced Repetition + AI Flashcards: The Complete Guide',
    description:
      'How spaced repetition works, why it beats cramming, and how AI-generated flashcards can cut your vocabulary learning time in half.',
    category: 'AI Tools',
    author: 'NEU Study Editorial',
    publishedAt: '2026-03-12',
    readingMinutes: 7,
    tags: ['Flashcards', 'AI', 'Memory'],
    content: [
      {
        heading: 'The forgetting curve',
        body: [
          'In 1885 Hermann Ebbinghaus showed that humans forget roughly 50 percent of new information within an hour and 70 percent within a day — unless they review. This is the forgetting curve, and it is the reason cramming produces such poor long-term retention.',
        ],
      },
      {
        heading: 'How spaced repetition fixes it',
        body: [
          'Spaced repetition schedules reviews at increasing intervals: one day, three days, a week, two weeks, a month. Every time you successfully recall a card, its next review is pushed further out; every time you fail, it is pulled back. This keeps you on the steepest edge of the forgetting curve without wasting time on cards you already know.',
        ],
      },
      {
        heading: 'Why AI-generated cards beat manual ones',
        body: [
          'Manual flashcard creation is the biggest bottleneck for most learners. You spend an hour finding example sentences, translations, and audio for twenty words. AI flashcard generators collapse this to seconds: you paste a word list and get back cards with definitions, IPA pronunciation, example sentences, and optional native audio.',
          'The result is not just speed — it is consistency. Every card follows the same format, so your brain stops wasting energy on layout and focuses on content.',
        ],
      },
      {
        heading: 'A practical daily routine',
        body: [
          'Aim for 20 new cards plus your due reviews every day. This sounds small but compounds to over 7000 words a year. Always review in the morning when recall is strongest, and tag difficult cards so you can run a targeted second session on them in the evening.',
        ],
      },
    ],
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
