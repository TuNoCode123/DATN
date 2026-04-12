export type HskLevel = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  vocabCount: number;
  characterCount: number;
  studyHours: string;
  description: string;
  abilities: string[];
  examFormat: string;
  sampleWords: { hanzi: string; pinyin: string; meaning: string }[];
  targetAudience: string;
  tips: string[];
};

export const HSK_LEVELS: HskLevel[] = [
  {
    level: 1,
    vocabCount: 150,
    characterCount: 174,
    studyHours: '60–120',
    description:
      'HSK 1 certifies that you can understand and use very simple Chinese phrases, meet basic needs for communication, and lay a foundation for further Chinese learning.',
    abilities: [
      'Introduce yourself and others',
      'Ask and answer simple personal questions',
      'Understand familiar daily expressions',
      'Read and write basic Chinese characters',
    ],
    examFormat:
      'HSK 1 has two sections: Listening (20 questions, 15 min) and Reading (20 questions, 17 min). Total test time is 40 minutes. No writing section at this level.',
    sampleWords: [
      { hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'hello' },
      { hanzi: '谢谢', pinyin: 'xiè xie', meaning: 'thank you' },
      { hanzi: '学生', pinyin: 'xué shēng', meaning: 'student' },
      { hanzi: '中国', pinyin: 'Zhōng guó', meaning: 'China' },
      { hanzi: '朋友', pinyin: 'péng you', meaning: 'friend' },
      { hanzi: '水', pinyin: 'shuǐ', meaning: 'water' },
    ],
    targetAudience:
      'Complete beginners after 1 semester of Chinese study or roughly 60 hours of self-study.',
    tips: [
      'Master pinyin and tones before tackling characters',
      'Drill the 150 words with spaced repetition daily',
      'Watch children\'s shows with Chinese subtitles for listening exposure',
    ],
  },
  {
    level: 2,
    vocabCount: 300,
    characterCount: 347,
    studyHours: '120–240',
    description:
      'HSK 2 indicates an elementary command of Chinese — you can communicate in simple everyday situations requiring direct exchange of information on familiar topics.',
    abilities: [
      'Communicate in simple familiar contexts',
      'Handle basic travel situations',
      'Understand short dialogues on common topics',
      'Write short sentences about yourself',
    ],
    examFormat:
      'Listening (35 questions, 25 min) and Reading (25 questions, 22 min). Total time 55 minutes.',
    sampleWords: [
      { hanzi: '时间', pinyin: 'shí jiān', meaning: 'time' },
      { hanzi: '火车', pinyin: 'huǒ chē', meaning: 'train' },
      { hanzi: '生日', pinyin: 'shēng rì', meaning: 'birthday' },
      { hanzi: '昨天', pinyin: 'zuó tiān', meaning: 'yesterday' },
      { hanzi: '可能', pinyin: 'kě néng', meaning: 'possible' },
      { hanzi: '觉得', pinyin: 'jué de', meaning: 'to feel/think' },
    ],
    targetAudience:
      'Learners with 2 semesters of Chinese or 120+ hours of self-study.',
    tips: [
      'Start forming complete sentences with measure words',
      'Introduce basic aspect particles like 了 and 过',
      'Practice Part 1 listening (matching pictures) daily for quick wins',
    ],
  },
  {
    level: 3,
    vocabCount: 600,
    characterCount: 617,
    studyHours: '240–480',
    description:
      'HSK 3 marks the entry to intermediate Chinese. You can handle basic communication needs in daily life, academic, and professional affairs, and travel in Chinese-speaking regions independently.',
    abilities: [
      'Manage most communication needs in daily life',
      'Handle short, direct exchanges on routine work matters',
      'Describe experiences, events, and dreams briefly',
      'Write short paragraphs with connectors',
    ],
    examFormat:
      'Listening (40 questions, 35 min), Reading (30 questions, 30 min), and Writing (10 questions, 15 min). Total 90 minutes. Writing appears for the first time at this level.',
    sampleWords: [
      { hanzi: '办公室', pinyin: 'bàn gōng shì', meaning: 'office' },
      { hanzi: '经常', pinyin: 'jīng cháng', meaning: 'often' },
      { hanzi: '简单', pinyin: 'jiǎn dān', meaning: 'simple' },
      { hanzi: '重要', pinyin: 'zhòng yào', meaning: 'important' },
      { hanzi: '决定', pinyin: 'jué dìng', meaning: 'to decide' },
      { hanzi: '其实', pinyin: 'qí shí', meaning: 'actually' },
    ],
    targetAudience:
      'Learners after 1 year of Chinese classes. Minimum level for most university exchange programs.',
    tips: [
      'Build a 600-word core using frequency-ranked flashcards',
      'Practice writing characters by hand — HSK 3 has a writing section',
      'Read short graded texts to train paragraph-level comprehension',
    ],
  },
  {
    level: 4,
    vocabCount: 1200,
    characterCount: 1064,
    studyHours: '480–720',
    description:
      'HSK 4 demonstrates intermediate proficiency. Test-takers can converse in Chinese on a wide range of topics and communicate fluently with native speakers.',
    abilities: [
      'Discuss a wide range of topics including abstract ones',
      'Read newspapers, magazines, and watch TV programs',
      'Deliver presentations in Chinese',
      'Write coherent paragraphs on familiar topics',
    ],
    examFormat:
      'Listening (45 questions, 30 min), Reading (40 questions, 40 min), and Writing (15 questions, 25 min). Total 105 minutes.',
    sampleWords: [
      { hanzi: '经验', pinyin: 'jīng yàn', meaning: 'experience' },
      { hanzi: '吸引', pinyin: 'xī yǐn', meaning: 'to attract' },
      { hanzi: '过程', pinyin: 'guò chéng', meaning: 'process' },
      { hanzi: '温度', pinyin: 'wēn dù', meaning: 'temperature' },
      { hanzi: '而且', pinyin: 'ér qiě', meaning: 'moreover' },
      { hanzi: '适合', pinyin: 'shì hé', meaning: 'to suit' },
    ],
    targetAudience:
      'Learners after 2 years of Chinese. Required for Chinese-taught undergraduate programs at most universities in China.',
    tips: [
      'Focus on the 600 new words added since HSK 3',
      'Read one short news article per day and extract unknown words',
      'Practice writing 80-word responses under timed conditions',
    ],
  },
  {
    level: 5,
    vocabCount: 2500,
    characterCount: 1685,
    studyHours: '720–1200',
    description:
      'HSK 5 demonstrates advanced proficiency. Candidates can read Chinese newspapers and magazines, enjoy Chinese films and TV, and deliver full speeches in Chinese.',
    abilities: [
      'Read newspapers and magazines fluently',
      'Understand films, TV, and radio broadcasts',
      'Give full speeches and discussions in Chinese',
      'Write structured essays of 600+ characters',
    ],
    examFormat:
      'Listening (45 questions, 30 min), Reading (45 questions, 45 min), and Writing (10 questions, 40 min). Total 125 minutes.',
    sampleWords: [
      { hanzi: '观念', pinyin: 'guān niàn', meaning: 'concept, notion' },
      { hanzi: '争取', pinyin: 'zhēng qǔ', meaning: 'to strive for' },
      { hanzi: '成就', pinyin: 'chéng jiù', meaning: 'achievement' },
      { hanzi: '充分', pinyin: 'chōng fèn', meaning: 'sufficient' },
      { hanzi: '辅导', pinyin: 'fǔ dǎo', meaning: 'to tutor' },
      { hanzi: '预防', pinyin: 'yù fáng', meaning: 'to prevent' },
    ],
    targetAudience:
      'Learners after 2+ years of intensive study. Required for graduate programs at Chinese universities.',
    tips: [
      'Read one Chinese opinion article daily — People\'s Daily or Zhihu long posts',
      'Practice the sentence-rearranging writing task, which trips most candidates',
      'Shadow one news podcast clip daily for listening speed',
    ],
  },
  {
    level: 6,
    vocabCount: 5000,
    characterCount: 2663,
    studyHours: '1200+',
    description:
      'HSK 6 is the highest published level and certifies near-native proficiency. Test-takers can easily understand written and oral Chinese and express themselves in both forms fluently and effectively.',
    abilities: [
      'Read complex academic and literary texts',
      'Understand nuanced spoken Chinese including idioms',
      'Write 400+ character structured essays',
      'Discuss professional and academic topics at native level',
    ],
    examFormat:
      'Listening (50 questions, 35 min), Reading (50 questions, 50 min), and Writing (1 essay, 45 min). Total 140 minutes. The essay requires summarizing a 1000-character source text in 400 characters.',
    sampleWords: [
      { hanzi: '彻底', pinyin: 'chè dǐ', meaning: 'thorough' },
      { hanzi: '恰当', pinyin: 'qià dàng', meaning: 'appropriate' },
      { hanzi: '渗透', pinyin: 'shèn tòu', meaning: 'to permeate' },
      { hanzi: '推断', pinyin: 'tuī duàn', meaning: 'to infer' },
      { hanzi: '举世闻名', pinyin: 'jǔ shì wén míng', meaning: 'world-famous' },
      { hanzi: '一丝不苟', pinyin: 'yī sī bù gǒu', meaning: 'meticulous' },
    ],
    targetAudience:
      'Advanced learners aiming for PhD programs, professional translation work, or language-sensitive employment in China.',
    tips: [
      'Read one full Chinese novel or academic paper per month',
      'Practice chengyu (four-character idioms) weekly — they appear in every reading passage',
      'Time yourself on the 400-character summary task; pacing is the hardest part',
    ],
  },
];

export function getHskLevel(level: number): HskLevel | undefined {
  return HSK_LEVELS.find((l) => l.level === level);
}
