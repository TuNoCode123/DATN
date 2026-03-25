import {
  PrismaClient,
  UserRole,
  ExamType,
  SectionSkill,
  QuestionType,
  AttemptMode,
  AttemptStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNfcHtml(title: string, fields: string[], startQ: number): string {
  const rows = fields
    .map((label, i) => `<tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">${label}:</td><td style="padding:6px 12px">{${startQ + i}}</td></tr>`)
    .join('\n');
  return `<h3 style="font-weight:700;margin-bottom:12px">${title}</h3>\n<table style="border-collapse:collapse;width:100%">\n${rows}\n</table>`;
}

function buildTableHtml(title: string, headers: string[], rows: (string | number)[][], startQ: number): string {
  let q = startQ;
  const thead = `<thead><tr>${headers.map(h => `<th style="border:1px solid #d1d5db;padding:8px;background:#f3f4f6;text-align:left">${h}</th>`).join('')}</tr></thead>`;
  const tbody = rows.map(row =>
    `<tr>${row.map(cell => {
      if (cell === 0) { const token = `{${q++}}`; return `<td style="border:1px solid #d1d5db;padding:8px">${token}</td>`; }
      return `<td style="border:1px solid #d1d5db;padding:8px">${cell}</td>`;
    }).join('')}</tr>`
  ).join('\n');
  return `<h3 style="font-weight:700;margin-bottom:12px">${title}</h3>\n<table style="width:100%;border-collapse:collapse;font-size:13px">\n${thead}\n<tbody>${tbody}</tbody>\n</table>`;
}

function buildSummaryHtml(title: string, sentences: string[]): string {
  return `<h3 style="font-weight:700;margin-bottom:12px">${title}</h3>\n<p style="line-height:2">${sentences.join(' ')}</p>`;
}

// Create MCQ group
async function createMcqGroup(sectionId: string, orderIndex: number, questions: { stem: string; options: { label: string; text: string }[]; answer: string }[], startQNum: number) {
  const group = await prisma.questionGroup.create({
    data: { sectionId, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex },
  });
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await prisma.question.create({
      data: {
        groupId: group.id,
        questionNumber: startQNum + i,
        orderIndex: i,
        stem: q.stem,
        options: q.options,
        correctAnswer: q.answer,
      },
    });
  }
  return group;
}

// Create Fill-in-blank group (covers form/note/table/summary completion)
async function createFillInBlankGroup(sectionId: string, orderIndex: number, instructions: string, answers: string[], startQNum: number) {
  const group = await prisma.questionGroup.create({
    data: { sectionId, questionType: QuestionType.NOTE_COMPLETION, orderIndex, instructions },
  });
  for (let i = 0; i < answers.length; i++) {
    await prisma.question.create({
      data: { groupId: group.id, questionNumber: startQNum + i, orderIndex: i, correctAnswer: answers[i] },
    });
  }
  return group;
}

// Create Matching group
async function createMatchingGroup(sectionId: string, orderIndex: number, instructions: string, matchingOptions: object[], answers: string[], startQNum: number) {
  const group = await prisma.questionGroup.create({
    data: { sectionId, questionType: QuestionType.MATCHING_FEATURES, orderIndex, instructions, matchingOptions },
  });
  for (let i = 0; i < answers.length; i++) {
    await prisma.question.create({
      data: { groupId: group.id, questionNumber: startQNum + i, orderIndex: i, correctAnswer: answers[i] },
    });
  }
  return group;
}

// Create TFNG group
async function createTfngGroup(sectionId: string, orderIndex: number, questions: { stem: string; answer: string }[], startQNum: number) {
  const group = await prisma.questionGroup.create({
    data: { sectionId, questionType: QuestionType.TRUE_FALSE_NOT_GIVEN, orderIndex },
  });
  for (let i = 0; i < questions.length; i++) {
    await prisma.question.create({
      data: {
        groupId: group.id,
        questionNumber: startQNum + i,
        orderIndex: i,
        stem: questions[i].stem,
        options: [{ label: 'TRUE', text: 'TRUE' }, { label: 'FALSE', text: 'FALSE' }, { label: 'NOT GIVEN', text: 'NOT GIVEN' }],
        correctAnswer: questions[i].answer,
      },
    });
  }
  return group;
}

// ─── Standard IELTS Listening test (4 recordings, 40 questions) ───────────────
interface IeltsListeningConfig {
  title: string;
  examType: ExamType;
  durationMins: number;
  description: string;
  tagIds: string[];
  sections: IeltsSectionConfig[];
  attemptCount?: number;
  commentCount?: number;
}

interface IeltsSectionConfig {
  title: string;
  type: 'FILL_IN_BLANK' | 'MCQ' | 'MATCHING';
  startQ: number;
}

async function createIeltsListeningTest(cfg: IeltsListeningConfig, tagIds: string[]) {
  const test = await prisma.test.create({
    data: {
      title: cfg.title,
      examType: cfg.examType,
      durationMins: cfg.durationMins,
      isPublished: true,
      description: cfg.description,
      sectionCount: cfg.sections.length,
      questionCount: cfg.sections.length * 10,
      attemptCount: cfg.attemptCount || 0,
      commentCount: cfg.commentCount || 0,
      tags: { create: tagIds.map(tagId => ({ tagId })) },
    },
  });

  for (let si = 0; si < cfg.sections.length; si++) {
    const sc = cfg.sections[si];
    const section = await prisma.testSection.create({
      data: {
        testId: test.id,
        title: sc.title,
        skill: SectionSkill.LISTENING,
        orderIndex: si,
        questionCount: 10,
      },
    });

    if (sc.type === 'FILL_IN_BLANK') {
      const fields = ['Name', 'Address', 'Phone number', 'Email', 'Date of arrival', 'Duration of stay', 'Room type', 'Number of guests', 'Payment method', 'Special requests'];
      const html = buildNfcHtml('Booking Information Form', fields, sc.startQ);
      const answers = ['Williams', '24 Oak Street', '07891 234 567', 'williams@email.com', '12 April', '7 nights', 'twin', '2', 'bank transfer', 'non-smoking'];
      await createFillInBlankGroup(section.id, 0, html, answers, sc.startQ);
    } else if (sc.type === 'MCQ') {
      const qs = [
        { stem: 'What is the main purpose of the speaker\'s talk?', options: [{ label: 'A', text: 'to inform' }, { label: 'B', text: 'to persuade' }, { label: 'C', text: 'to entertain' }], answer: 'A' },
        { stem: 'According to the speaker, the main problem is', options: [{ label: 'A', text: 'lack of funding' }, { label: 'B', text: 'poor planning' }, { label: 'C', text: 'staff shortage' }], answer: 'B' },
        { stem: 'The new policy will come into effect', options: [{ label: 'A', text: 'next month' }, { label: 'B', text: 'next quarter' }, { label: 'C', text: 'next year' }], answer: 'C' },
        { stem: 'Which group will benefit most from the changes?', options: [{ label: 'A', text: 'local businesses' }, { label: 'B', text: 'students' }, { label: 'C', text: 'elderly residents' }], answer: 'B' },
        { stem: 'The speaker recommends that participants should', options: [{ label: 'A', text: 'register in advance' }, { label: 'B', text: 'bring their own equipment' }, { label: 'C', text: 'arrive early' }], answer: 'A' },
        { stem: 'The cost of the programme is', options: [{ label: 'A', text: 'free of charge' }, { label: 'B', text: '$25 per session' }, { label: 'C', text: '$100 per month' }], answer: 'A' },
        { stem: 'Where will the sessions be held?', options: [{ label: 'A', text: 'at the community centre' }, { label: 'B', text: 'at the university' }, { label: 'C', text: 'online' }], answer: 'C' },
        { stem: 'The duration of each session is', options: [{ label: 'A', text: '30 minutes' }, { label: 'B', text: '45 minutes' }, { label: 'C', text: '60 minutes' }], answer: 'B' },
        { stem: 'Participants will receive', options: [{ label: 'A', text: 'a certificate' }, { label: 'B', text: 'a study guide' }, { label: 'C', text: 'both A and B' }], answer: 'C' },
        { stem: 'To join the programme, participants must', options: [{ label: 'A', text: 'pass an entrance test' }, { label: 'B', text: 'complete an application form' }, { label: 'C', text: 'pay a deposit' }], answer: 'B' },
      ];
      await createMcqGroup(section.id, 0, qs, sc.startQ);
    } else if (sc.type === 'MATCHING') {
      const options = [
        { label: 'A', text: 'The speaker agrees completely' },
        { label: 'B', text: 'The speaker partially agrees' },
        { label: 'C', text: 'The speaker disagrees' },
        { label: 'D', text: 'The speaker has no opinion' },
        { label: 'E', text: 'The speaker is unsure' },
      ];
      const html = `<p style="font-weight:700;margin-bottom:12px">What does the speaker say about each topic?</p>
<p style="margin-bottom:6px">${sc.startQ}. The importance of recycling</p>
<p style="margin-bottom:6px">${sc.startQ+1}. Reducing plastic waste</p>
<p style="margin-bottom:6px">${sc.startQ+2}. Government environmental policy</p>
<p style="margin-bottom:6px">${sc.startQ+3}. Individual responsibility</p>
<p style="margin-bottom:6px">${sc.startQ+4}. Corporate sustainability</p>
<p style="margin-bottom:6px">${sc.startQ+5}. International agreements</p>
<p style="margin-bottom:6px">${sc.startQ+6}. Renewable energy investment</p>
<p style="margin-bottom:6px">${sc.startQ+7}. Carbon offset programmes</p>
<p style="margin-bottom:6px">${sc.startQ+8}. Public transport funding</p>
<p style="margin-bottom:6px">${sc.startQ+9}. Environmental education</p>`;
      await createMatchingGroup(section.id, 0, html, options, ['A', 'A', 'B', 'A', 'C', 'B', 'A', 'C', 'B', 'A'], sc.startQ);
    }
  }

  return test;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding database...');

  // ─── Users ──────────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('admin123', 10);
  const studentPassword = await bcrypt.hash('student123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', passwordHash: adminPassword, displayName: 'Admin', role: UserRole.ADMIN },
  });

  const student1 = await prisma.user.upsert({
    where: { email: 'student1@example.com' },
    update: {},
    create: { email: 'student1@example.com', passwordHash: studentPassword, displayName: 'Student One', role: UserRole.STUDENT },
  });

  const student2 = await prisma.user.upsert({
    where: { email: 'student2@example.com' },
    update: {},
    create: { email: 'student2@example.com', passwordHash: studentPassword, displayName: 'Student Two', role: UserRole.STUDENT },
  });

  console.log('  ✓ Users');

  // ─── Tags ────────────────────────────────────────────────────────────────────
  const tagDefs = [
    { name: 'IELTS Academic', slug: 'ielts-academic' },
    { name: 'IELTS General', slug: 'ielts-general' },
    { name: 'TOEIC LR', slug: 'toeic-lr' },
    { name: 'Listening', slug: 'listening' },
    { name: 'Reading', slug: 'reading' },
    { name: 'Writing', slug: 'writing' },
    { name: 'Speaking', slug: 'speaking' },
    { name: 'Official Test', slug: 'official-test' },
    { name: 'Practice', slug: 'practice' },
    { name: '2024', slug: '2024' },
    { name: '2025', slug: '2025' },
    { name: 'Mini Test', slug: 'mini-test' },
  ];

  const tags: Record<string, string> = {};
  for (const def of tagDefs) {
    const tag = await prisma.tag.upsert({
      where: { slug: def.slug },
      update: {},
      create: def,
    });
    tags[def.name] = tag.id;
  }

  console.log('  ✓ Tags');

  // ─── Clear existing tests ─
  await prisma.test.deleteMany({});
  console.log('  ✓ Cleared existing tests');

  // ═══════════════════════════════════════════════════════════════════════════
  // IELTS ACADEMIC — LISTENING
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Test 1: Fill-in-blank / MCQ / Fill-in-blank (table) / Fill-in-blank (summary) ─
  const ieltsL1 = await prisma.test.create({
    data: {
      title: 'IELTS Academic Listening Practice Test 1',
      examType: ExamType.IELTS_ACADEMIC,
      durationMins: 40,
      isPublished: true,
      description: 'A full IELTS Academic Listening test with 4 recordings covering form completion, multiple choice, table completion, and summary completion.',
      sectionCount: 4,
      questionCount: 40,
      attemptCount: 14608,
      commentCount: 364,
      tags: {
        create: [
          { tagId: tags['IELTS Academic'] },
          { tagId: tags['Listening'] },
          { tagId: tags['Practice'] },
          { tagId: tags['2024'] },
        ],
      },
    },
  });

  // Recording 1 – Form completion (Q1–10)
  const ieltsL1_s1 = await prisma.testSection.create({
    data: { testId: ieltsL1.id, title: 'Recording 1', skill: SectionSkill.LISTENING, orderIndex: 0, questionCount: 10 },
  });
  await createFillInBlankGroup(ieltsL1_s1.id, 0,
    buildNfcHtml('Accommodation Booking Form', ['Name', 'Phone', 'Email', 'Check-in date', 'Number of nights', 'Room type', 'Number of guests', 'Special requests', 'Payment method', 'Total cost'], 1),
    ['Johnson', '0412 555 789', 'johnson@email.com', '15 March', '3', 'double', '2', 'sea view', 'credit card', '$450'], 1);

  // Recording 2 – MCQ (Q11–20)
  const ieltsL1_s2 = await prisma.testSection.create({
    data: { testId: ieltsL1.id, title: 'Recording 2', skill: SectionSkill.LISTENING, orderIndex: 1, questionCount: 10 },
  });
  await createMcqGroup(ieltsL1_s2.id, 0, [
    { stem: 'What is the main topic of the lecture?', options: [{ label: 'A', text: 'Marine biology' }, { label: 'B', text: 'Climate change' }, { label: 'C', text: 'Urban planning' }], answer: 'B' },
    { stem: 'The speaker mentions that temperatures have risen by', options: [{ label: 'A', text: '1 degree' }, { label: 'B', text: '1.5 degrees' }, { label: 'C', text: '2 degrees' }], answer: 'B' },
    { stem: 'Which country is used as a case study?', options: [{ label: 'A', text: 'Australia' }, { label: 'B', text: 'Japan' }, { label: 'C', text: 'Norway' }], answer: 'A' },
    { stem: 'The main cause of coral bleaching is', options: [{ label: 'A', text: 'pollution' }, { label: 'B', text: 'overfishing' }, { label: 'C', text: 'rising water temperature' }], answer: 'C' },
    { stem: 'What percentage of reefs are affected?', options: [{ label: 'A', text: '50%' }, { label: 'B', text: '65%' }, { label: 'C', text: '80%' }], answer: 'B' },
    { stem: 'The recovery period for damaged reefs is approximately', options: [{ label: 'A', text: '5 years' }, { label: 'B', text: '10 years' }, { label: 'C', text: '15 years' }], answer: 'C' },
    { stem: 'Which solution does the speaker recommend most?', options: [{ label: 'A', text: 'Reducing emissions' }, { label: 'B', text: 'Artificial reefs' }, { label: 'C', text: 'Marine reserves' }], answer: 'A' },
    { stem: 'The funding for research comes mainly from', options: [{ label: 'A', text: 'government grants' }, { label: 'B', text: 'private donations' }, { label: 'C', text: 'university budgets' }], answer: 'A' },
    { stem: 'How many researchers are involved in the project?', options: [{ label: 'A', text: '25' }, { label: 'B', text: '40' }, { label: 'C', text: '60' }], answer: 'B' },
    { stem: 'The next phase of the study will focus on', options: [{ label: 'A', text: 'deep sea ecosystems' }, { label: 'B', text: 'coastal erosion' }, { label: 'C', text: 'fish migration patterns' }], answer: 'C' },
  ], 11);

  // Recording 3 – Table completion (Q21–30)
  const ieltsL1_s3 = await prisma.testSection.create({
    data: { testId: ieltsL1.id, title: 'Recording 3', skill: SectionSkill.LISTENING, orderIndex: 2, questionCount: 10 },
  });
  await createFillInBlankGroup(ieltsL1_s3.id, 0,
    buildTableHtml('University Library Services', ['Service', 'Location', 'Hours', 'Notes'],
      [['Book loans', 0, '8am–9pm', 'Max 5 books'], ['Computer lab', '2nd floor', 0, 0], ['Study rooms', 0, '10am–8pm', 'Book online'], ['Printing', 0, '9am–5pm', 0], ['Research help', 'Room 105', 0, 'By appointment']],
      21),
    ['ground floor', '24 hours', 'booking required', '3rd floor', 'basement', '10p per page', 'weekdays only'], 21);

  // Recording 4 – Summary completion (Q31–40)
  const ieltsL1_s4 = await prisma.testSection.create({
    data: { testId: ieltsL1.id, title: 'Recording 4', skill: SectionSkill.LISTENING, orderIndex: 3, questionCount: 10 },
  });
  await createFillInBlankGroup(ieltsL1_s4.id, 0,
    buildSummaryHtml('The History of Urban Gardens',
      [`Urban gardening began in the {31} century when city residents started growing food in {32} spaces.`,
       `The movement gained momentum during {33} when governments encouraged citizens to create {34} gardens.`,
       `Today, urban gardens serve multiple purposes: they provide fresh {35}, improve {36} health, and create {37} bonds within neighborhoods.`,
       `Research shows that participants report {38} levels of stress and increased {39}.`,
       `The future of urban gardening depends on {40} support and community engagement.`]),
    ['19th', 'vacant', 'World War II', 'victory', 'produce', 'mental', 'community', 'lower', 'well-being', 'government'], 31);

  console.log(`  ✓ IELTS Academic Listening Test 1`);

  // ── Test 2 ──────────────────────────────────────────────────────────────
  await createIeltsListeningTest({
    title: 'IELTS Academic Listening Practice Test 2',
    examType: ExamType.IELTS_ACADEMIC, durationMins: 40,
    description: 'IELTS Academic Listening Practice Test 2 — covers note completion, multiple choice, and matching question types.',
    tagIds: [tags['IELTS Academic'], tags['Listening'], tags['Practice'], tags['2024']],
    sections: [
      { title: 'Recording 1', type: 'MCQ', startQ: 1 },
      { title: 'Recording 2', type: 'FILL_IN_BLANK', startQ: 11 },
      { title: 'Recording 3', type: 'FILL_IN_BLANK', startQ: 21 },
      { title: 'Recording 4', type: 'MATCHING', startQ: 31 },
    ],
    attemptCount: 9760, commentCount: 203,
  }, []);
  console.log(`  ✓ IELTS Academic Listening Test 2`);

  // ── Test 3 ──────────────────────────────────────────────────────────────
  await createIeltsListeningTest({
    title: 'IELTS Academic Listening Practice Test 3',
    examType: ExamType.IELTS_ACADEMIC, durationMins: 40,
    description: 'IELTS Academic Listening Practice Test 3 — features matching, multiple choice, fill-in-blank and summary completion.',
    tagIds: [tags['IELTS Academic'], tags['Listening'], tags['Practice']],
    sections: [
      { title: 'Recording 1', type: 'FILL_IN_BLANK', startQ: 1 },
      { title: 'Recording 2', type: 'MATCHING', startQ: 11 },
      { title: 'Recording 3', type: 'MCQ', startQ: 21 },
      { title: 'Recording 4', type: 'FILL_IN_BLANK', startQ: 31 },
    ],
    attemptCount: 6241, commentCount: 106,
  }, []);
  console.log(`  ✓ IELTS Academic Listening Test 3`);

  // ── Test 4 ──────────────────────────────────────────────────────────────
  await createIeltsListeningTest({
    title: 'IELTS Academic Listening Practice Test 4',
    examType: ExamType.IELTS_ACADEMIC, durationMins: 40,
    description: 'IELTS Academic Listening Practice Test 4.',
    tagIds: [tags['IELTS Academic'], tags['Listening'], tags['2024']],
    sections: [
      { title: 'Recording 1', type: 'MCQ', startQ: 1 },
      { title: 'Recording 2', type: 'FILL_IN_BLANK', startQ: 11 },
      { title: 'Recording 3', type: 'MATCHING', startQ: 21 },
      { title: 'Recording 4', type: 'FILL_IN_BLANK', startQ: 31 },
    ],
    attemptCount: 4382, commentCount: 89,
  }, []);
  console.log(`  ✓ IELTS Academic Listening Test 4`);

  // ── Test 5 ──────────────────────────────────────────────────────────────
  await createIeltsListeningTest({
    title: 'IELTS Academic Listening Practice Test 5',
    examType: ExamType.IELTS_ACADEMIC, durationMins: 40,
    description: 'IELTS Academic Listening Practice Test 5.',
    tagIds: [tags['IELTS Academic'], tags['Listening'], tags['2025']],
    sections: [
      { title: 'Recording 1', type: 'FILL_IN_BLANK', startQ: 1 },
      { title: 'Recording 2', type: 'MCQ', startQ: 11 },
      { title: 'Recording 3', type: 'FILL_IN_BLANK', startQ: 21 },
      { title: 'Recording 4', type: 'MATCHING', startQ: 31 },
    ],
    attemptCount: 3170, commentCount: 52,
  }, []);
  console.log(`  ✓ IELTS Academic Listening Test 5`);

  // ═══════════════════════════════════════════════════════════════════════════
  // IELTS ACADEMIC — READING
  // ═══════════════════════════════════════════════════════════════════════════

  async function createIeltsReadingTest(num: number, attemptCount: number, commentCount: number) {
    const test = await prisma.test.create({
      data: {
        title: `IELTS Academic Reading Practice Test ${num}`,
        examType: ExamType.IELTS_ACADEMIC,
        durationMins: 60,
        isPublished: true,
        description: `IELTS Academic Reading Practice Test ${num} — 3 passages with 40 questions total.`,
        sectionCount: 3,
        questionCount: 40,
        attemptCount, commentCount,
        tags: {
          create: [
            { tagId: tags['IELTS Academic'] },
            { tagId: tags['Reading'] },
            { tagId: tags['Practice'] },
          ],
        },
      },
    });

    const passages = [
      {
        title: 'The Science of Sleep',
        questions: 14,
        passageContent: `<h3>The Science of Sleep</h3>
<p><strong>A</strong> Sleep is one of the most fundamental biological processes, yet it remains one of the least understood. For centuries, sleep was dismissed as a passive state — a mere absence of wakefulness. However, modern neuroscience has revealed that the sleeping brain is far from idle. During sleep, the brain cycles through distinct stages, each serving critical functions for physical health, cognitive performance, and emotional regulation.</p>
<p><strong>B</strong> The sleep cycle consists of two main types: non-rapid eye movement (NREM) sleep and rapid eye movement (REM) sleep. NREM sleep is further divided into three stages, progressing from light drowsiness to deep, restorative sleep. Stage 3, often called "slow-wave sleep," is when the body repairs tissues, builds bone and muscle, and strengthens the immune system. REM sleep, which typically occurs about 90 minutes after falling asleep, is characterised by vivid dreaming and heightened brain activity similar to wakefulness.</p>
<p><strong>C</strong> Research conducted at Harvard Medical School has demonstrated that sleep plays a vital role in memory consolidation. During NREM sleep, the brain replays and reorganises information acquired during the day, transferring it from short-term to long-term storage. REM sleep, meanwhile, appears to facilitate creative problem-solving and the integration of new knowledge with existing mental frameworks.</p>
<p><strong>D</strong> The consequences of sleep deprivation are both immediate and cumulative. In the short term, even one night of poor sleep can impair attention, decision-making, and reaction time to levels comparable to alcohol intoxication. Chronically insufficient sleep has been linked to an increased risk of cardiovascular disease, diabetes, obesity, and depression. A landmark study published in the journal <em>Nature</em> found that participants who slept fewer than six hours per night showed accelerated cognitive decline over a ten-year period.</p>
<p><strong>E</strong> Despite the mounting evidence of sleep's importance, modern lifestyles increasingly encroach upon it. Artificial lighting, screen use before bedtime, irregular work schedules, and the cultural glorification of "hustle" have all contributed to what some researchers call a global sleep crisis. The World Health Organization estimates that two-thirds of adults in developed nations fail to obtain the recommended eight hours of sleep per night.</p>
<p><strong>F</strong> Addressing this crisis will require both individual behaviour change and systemic interventions. Sleep hygiene practices — such as maintaining a consistent schedule, limiting caffeine intake, and creating a dark, cool sleeping environment — can significantly improve sleep quality. At the policy level, later school start times, restrictions on shift-work scheduling, and public health campaigns have all shown promise in promoting healthier sleep habits across populations.</p>`,
        groups: [
          { type: 'TFNG' as const, count: 5, startQ: 0 },
          { type: 'MCQ' as const, count: 5, startQ: 0 },
          { type: 'FILL_IN_BLANK' as const, count: 4, startQ: 0 },
        ],
      },
      {
        title: 'Urban Migration Patterns',
        questions: 13,
        passageContent: `<h3>Urban Migration Patterns</h3>
<p><strong>A</strong> The movement of people from rural areas to cities — urbanisation — is one of the defining trends of the 21st century. According to the United Nations, approximately 56% of the world's population currently lives in urban areas, a figure projected to rise to 68% by 2050. This shift is particularly pronounced in developing nations across Asia and Africa, where cities are expanding at unprecedented rates.</p>
<p><strong>B</strong> The primary drivers of rural-to-urban migration are economic. Cities offer greater employment opportunities, higher wages, and access to services such as healthcare and education that may be scarce in rural communities. In many developing countries, the mechanisation of agriculture has reduced the need for farm labour, pushing displaced workers toward urban centres in search of alternative livelihoods.</p>
<p><strong>C</strong> However, rapid urbanisation brings significant challenges. Infrastructure in many fast-growing cities cannot keep pace with population increases, resulting in overcrowded housing, inadequate sanitation, and strained transportation networks. Informal settlements — often called slums — house an estimated one billion people globally, many of whom lack access to clean water, electricity, or secure land tenure.</p>
<p><strong>D</strong> Environmental consequences are equally concerning. Urban areas account for approximately 70% of global carbon dioxide emissions. The conversion of green spaces to built environments disrupts local ecosystems, increases the urban heat island effect, and exacerbates flood risk through the loss of natural drainage. Air pollution in major cities such as Delhi, Beijing, and Lagos regularly exceeds WHO guidelines by significant margins.</p>
<p><strong>E</strong> Some researchers argue that urbanisation, if properly managed, can yield substantial benefits. Dense urban living is inherently more resource-efficient than dispersed rural settlement, requiring less infrastructure per capita for services like water supply and transportation. Cities also serve as engines of innovation, bringing together diverse populations whose interactions drive technological advancement, cultural production, and economic growth.</p>`,
        groups: [
          { type: 'MCQ' as const, count: 5, startQ: 0 },
          { type: 'MATCHING' as const, count: 5, startQ: 0 },
          { type: 'FILL_IN_BLANK' as const, count: 3, startQ: 0 },
        ],
      },
      {
        title: 'Renewable Energy Sources',
        questions: 13,
        passageContent: `<h3>Renewable Energy Sources</h3>
<p><strong>A</strong> The global energy landscape is undergoing a fundamental transformation. Driven by concerns over climate change, air pollution, and the finite nature of fossil fuels, governments and industries worldwide are investing heavily in renewable energy technologies. Solar, wind, hydroelectric, and geothermal power now account for approximately 30% of global electricity generation, a figure that has doubled in the past decade.</p>
<p><strong>B</strong> Solar photovoltaic (PV) technology has experienced the most dramatic cost reduction of any energy source in history. The price of solar panels has fallen by over 90% since 2010, making solar power cost-competitive with coal and natural gas in most markets. China currently leads global solar manufacturing and installation, followed by the United States, India, and the European Union.</p>
<p><strong>C</strong> Wind energy has similarly matured into a mainstream power source. Onshore wind farms are now among the cheapest sources of new electricity generation globally. Offshore wind, while more expensive, offers higher and more consistent wind speeds, and its costs are declining rapidly as turbine technology improves and installation techniques become more efficient.</p>
<p><strong>D</strong> Despite these advances, the intermittent nature of solar and wind power presents a significant integration challenge. Unlike fossil fuel plants, which can generate electricity on demand, solar and wind output depends on weather conditions. Energy storage technologies — particularly lithium-ion batteries — are critical to bridging this gap, and their costs have fallen by approximately 85% since 2010.</p>
<p><strong>E</strong> The transition to renewable energy also raises important questions about materials and supply chains. The production of solar panels, wind turbines, and batteries requires significant quantities of minerals such as lithium, cobalt, copper, and rare earth elements. Ensuring sustainable and ethical sourcing of these materials, while developing recycling infrastructure for end-of-life equipment, will be essential challenges for the coming decades.</p>`,
        groups: [
          { type: 'TFNG' as const, count: 5, startQ: 0 },
          { type: 'MCQ' as const, count: 4, startQ: 0 },
          { type: 'FILL_IN_BLANK' as const, count: 4, startQ: 0 },
        ],
      },
    ];

    let qNum = 1;
    for (let pi = 0; pi < passages.length; pi++) {
      const p = passages[pi];
      const section = await prisma.testSection.create({
        data: {
          testId: test.id,
          title: `Passage ${pi + 1}: ${p.title}`,
          skill: SectionSkill.READING,
          orderIndex: pi,
          questionCount: p.questions,
        },
      });

      // Create passage record
      await prisma.passage.create({
        data: {
          sectionId: section.id,
          title: p.title,
          contentHtml: p.passageContent,
          orderIndex: 0,
        },
      });

      let groupIdx = 0;
      for (const gDef of p.groups) {
        if (gDef.type === 'TFNG') {
          const tfngQuestions = [];
          for (let i = 0; i < gDef.count; i++) {
            tfngQuestions.push({
              stem: `Statement ${qNum}: The passage states a claim about the topic discussed in the text.`,
              answer: ['TRUE', 'FALSE', 'NOT GIVEN'][i % 3],
            });
            qNum++;
          }
          await createTfngGroup(section.id, groupIdx, tfngQuestions, qNum - gDef.count);
        } else if (gDef.type === 'MCQ') {
          const mcqQuestions = [];
          for (let i = 0; i < gDef.count; i++) {
            mcqQuestions.push({
              stem: `According to the passage, which of the following best describes the concept discussed in paragraph ${Math.ceil((i + 1) / 2)}?`,
              options: [
                { label: 'A', text: `Option A for question ${qNum}` },
                { label: 'B', text: `Option B for question ${qNum}` },
                { label: 'C', text: `Option C for question ${qNum}` },
                { label: 'D', text: `Option D for question ${qNum}` },
              ],
              answer: ['A', 'B', 'C', 'D'][i % 4],
            });
            qNum++;
          }
          await createMcqGroup(section.id, groupIdx, mcqQuestions, qNum - gDef.count);
        } else if (gDef.type === 'MATCHING') {
          const matchingOpts = [
            { label: 'A', text: 'Paragraph A' }, { label: 'B', text: 'Paragraph B' },
            { label: 'C', text: 'Paragraph C' }, { label: 'D', text: 'Paragraph D' },
            { label: 'E', text: 'Paragraph E' },
          ];
          const html = Array.from({ length: gDef.count }, (_, i) =>
            `<p>${qNum + i}. A statement that matches information from one of the paragraphs.</p>`
          ).join('\n');
          const answers = Array.from({ length: gDef.count }, (_, i) => ['A', 'B', 'C', 'D', 'E'][i % 5]);
          await createMatchingGroup(section.id, groupIdx, html, matchingOpts, answers, qNum);
          qNum += gDef.count;
        } else if (gDef.type === 'FILL_IN_BLANK') {
          const sentences = Array.from({ length: gDef.count }, (_, i) =>
            `The text mentions that {${qNum + i}} is an important factor.`
          );
          const html = buildSummaryHtml('Summary Completion', sentences);
          const answers = ['technology', 'infrastructure', 'sustainability', 'innovation'].slice(0, gDef.count);
          await createFillInBlankGroup(section.id, groupIdx, html, answers, qNum);
          qNum += gDef.count;
        }
        groupIdx++;
      }
    }
    return test;
  }

  await createIeltsReadingTest(1, 7960, 164);
  console.log(`  ✓ IELTS Academic Reading Test 1`);
  await createIeltsReadingTest(2, 3460, 94);
  console.log(`  ✓ IELTS Academic Reading Test 2`);
  await createIeltsReadingTest(3, 2647, 64);
  console.log(`  ✓ IELTS Academic Reading Test 3`);

  // ═══════════════════════════════════════════════════════════════════════════
  // IELTS ACADEMIC — MINI TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  async function createIeltsMini(num: number, skill: 'LISTENING' | 'READING', durationMins: number) {
    const examSkill = skill === 'LISTENING' ? 'Listening' : 'Reading';
    const test = await prisma.test.create({
      data: {
        title: `IELTS Academic ${examSkill} Mini Test ${num}`,
        examType: ExamType.IELTS_ACADEMIC,
        durationMins,
        isPublished: true,
        description: `A short IELTS Academic ${examSkill} test with 2 sections and 20 questions. Great for focused practice.`,
        sectionCount: 2,
        questionCount: 20,
        attemptCount: 850 * num, commentCount: 12 * num,
        tags: {
          create: [
            { tagId: tags['IELTS Academic'] },
            { tagId: tags[examSkill] },
            { tagId: tags['Practice'] },
            { tagId: tags['Mini Test'] },
          ],
        },
      },
    });

    for (let si = 0; si < 2; si++) {
      const section = await prisma.testSection.create({
        data: {
          testId: test.id,
          title: skill === 'LISTENING' ? `Recording ${si + 1}` : `Passage ${si + 1}`,
          skill: SectionSkill[skill],
          orderIndex: si,
          questionCount: 10,
        },
      });
      const html = buildNfcHtml(`Section ${si + 1} Form`, ['Topic', 'Date', 'Location', 'Duration', 'Contact', 'Fee', 'Capacity', 'Equipment', 'Notes', 'Reference'], si * 10 + 1);
      await createFillInBlankGroup(section.id, 0, html,
        ['Environment', '10 June', 'Room 3B', '90 minutes', 'Dr Smith', 'free', '30', 'laptop', 'bring ID', 'ENV-2024'],
        si * 10 + 1);
    }
    return test;
  }

  await createIeltsMini(1, 'LISTENING', 25);
  console.log(`  ✓ IELTS Academic Listening Mini Test 1`);
  await createIeltsMini(2, 'READING', 30);
  console.log(`  ✓ IELTS Academic Reading Mini Test 2`);

  // ═══════════════════════════════════════════════════════════════════════════
  // IELTS GENERAL
  // ═══════════════════════════════════════════════════════════════════════════

  await createIeltsListeningTest({
    title: 'IELTS General Training Listening Test 1',
    examType: ExamType.IELTS_GENERAL, durationMins: 40,
    description: 'IELTS General Training Listening Test 1 — everyday social situations and workplace contexts.',
    tagIds: [tags['IELTS General'], tags['Listening'], tags['Practice']],
    sections: [
      { title: 'Recording 1', type: 'FILL_IN_BLANK', startQ: 1 },
      { title: 'Recording 2', type: 'MCQ', startQ: 11 },
      { title: 'Recording 3', type: 'FILL_IN_BLANK', startQ: 21 },
      { title: 'Recording 4', type: 'FILL_IN_BLANK', startQ: 31 },
    ],
    attemptCount: 5500, commentCount: 88,
  }, []);
  console.log(`  ✓ IELTS General Listening Test 1`);

  await createIeltsListeningTest({
    title: 'IELTS General Training Listening Test 2',
    examType: ExamType.IELTS_GENERAL, durationMins: 40,
    description: 'IELTS General Training Listening Test 2.',
    tagIds: [tags['IELTS General'], tags['Listening']],
    sections: [
      { title: 'Recording 1', type: 'MCQ', startQ: 1 },
      { title: 'Recording 2', type: 'MATCHING', startQ: 11 },
      { title: 'Recording 3', type: 'FILL_IN_BLANK', startQ: 21 },
      { title: 'Recording 4', type: 'FILL_IN_BLANK', startQ: 31 },
    ],
    attemptCount: 3200, commentCount: 47,
  }, []);
  console.log(`  ✓ IELTS General Listening Test 2`);

  // IELTS General Reading
  async function createIeltsGeneralReading(num: number) {
    const test = await prisma.test.create({
      data: {
        title: `IELTS General Training Reading Test ${num}`,
        examType: ExamType.IELTS_GENERAL,
        durationMins: 60,
        isPublished: true,
        description: `IELTS General Training Reading Test ${num} — 3 sections covering everyday reading materials.`,
        sectionCount: 3,
        questionCount: 40,
        attemptCount: 4800 - num * 800, commentCount: 75 - num * 10,
        tags: {
          create: [
            { tagId: tags['IELTS General'] },
            { tagId: tags['Reading'] },
          ],
        },
      },
    });
    const sectionTitles = ['Section 1: Workplace Notices', 'Section 2: Job Descriptions', 'Section 3: Extended Text'];
    const questionCounts = [14, 13, 13];
    let qNum = 1;
    for (let i = 0; i < 3; i++) {
      const section = await prisma.testSection.create({
        data: { testId: test.id, title: sectionTitles[i], skill: SectionSkill.READING, orderIndex: i, questionCount: questionCounts[i] },
      });
      const group = await prisma.questionGroup.create({
        data: { sectionId: section.id, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex: 0 },
      });
      for (let j = 0; j < questionCounts[i]; j++) {
        await prisma.question.create({
          data: {
            groupId: group.id, questionNumber: qNum, orderIndex: j,
            stem: `What is stated about the topic in this section? (Q${qNum})`,
            options: [{ label: 'A', text: 'It is compulsory' }, { label: 'B', text: 'It is optional' }, { label: 'C', text: 'It is recommended' }, { label: 'D', text: 'It is prohibited' }],
            correctAnswer: ['A', 'B', 'C', 'D'][j % 4],
          },
        });
        qNum++;
      }
    }
    return test;
  }

  await createIeltsGeneralReading(1);
  console.log(`  ✓ IELTS General Reading Test 1`);

  // ═══════════════════════════════════════════════════════════════════════════
  // TOEIC LR (2 full tests + 1 mini)
  // ═══════════════════════════════════════════════════════════════════════════

  async function createToeicTest(num: number, attemptCount: number, commentCount: number) {
    const test = await prisma.test.create({
      data: {
        title: `TOEIC Listening & Reading Practice Test ${num}`,
        examType: ExamType.TOEIC_LR,
        durationMins: 120,
        isPublished: true,
        description: `Full TOEIC Listening & Reading test ${num} — 7 parts, 200 questions total.`,
        sectionCount: 7,
        questionCount: 100,
        attemptCount, commentCount,
        tags: {
          create: [{ tagId: tags['TOEIC LR'] }, { tagId: tags['Listening'] }, { tagId: tags['Reading'] }],
        },
      },
    });

    const parts = [
      { title: 'Part 1 – Photographs', skill: SectionSkill.LISTENING, qCount: 6 },
      { title: 'Part 2 – Question–Response', skill: SectionSkill.LISTENING, qCount: 25 },
      { title: 'Part 3 – Short Conversations', skill: SectionSkill.LISTENING, qCount: 39 },
      { title: 'Part 4 – Short Talks', skill: SectionSkill.LISTENING, qCount: 30 },
      { title: 'Part 5 – Incomplete Sentences', skill: SectionSkill.READING, qCount: 0 },
      { title: 'Part 6 – Text Completion', skill: SectionSkill.READING, qCount: 0 },
      { title: 'Part 7 – Reading Comprehension', skill: SectionSkill.READING, qCount: 0 },
    ];

    let qNum = 1;
    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      if (part.qCount === 0) {
        await prisma.testSection.create({
          data: { testId: test.id, title: part.title, skill: part.skill, orderIndex: pi, questionCount: 0 },
        });
        continue;
      }
      const section = await prisma.testSection.create({
        data: { testId: test.id, title: part.title, skill: part.skill, orderIndex: pi, questionCount: part.qCount },
      });
      const group = await prisma.questionGroup.create({
        data: { sectionId: section.id, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex: 0 },
      });
      for (let i = 0; i < part.qCount; i++) {
        const opts = pi === 0
          ? [{ label: 'A', text: 'A woman is sitting at a desk' }, { label: 'B', text: 'A man is carrying boxes' }, { label: 'C', text: 'People are standing near a window' }, { label: 'D', text: 'A vehicle is parked outside' }]
          : [{ label: 'A', text: `Response A for Q${qNum}` }, { label: 'B', text: `Response B for Q${qNum}` }, { label: 'C', text: `Response C for Q${qNum}` }];
        await prisma.question.create({
          data: {
            groupId: group.id, questionNumber: qNum, orderIndex: i,
            stem: pi === 0 ? `Look at the photo. What best describes the scene?` : `Choose the best response to the statement or question.`,
            options: opts,
            correctAnswer: ['A', 'B', 'C', 'D'][i % (pi === 0 ? 4 : 3)],
          },
        });
        qNum++;
      }
    }
    return test;
  }

  await createToeicTest(1, 32000, 450);
  console.log(`  ✓ TOEIC LR Practice Test 1`);
  await createToeicTest(2, 21000, 380);
  console.log(`  ✓ TOEIC LR Practice Test 2`);

  // TOEIC Mini Test
  const toeicMini = await prisma.test.create({
    data: {
      title: 'TOEIC Listening & Reading Mini Test',
      examType: ExamType.TOEIC_LR, durationMins: 45,
      isPublished: true,
      description: 'A short TOEIC practice test covering Listening and Reading sections.',
      sectionCount: 3, questionCount: 15,
      attemptCount: 8400, commentCount: 120,
      tags: { create: [{ tagId: tags['TOEIC LR'] }, { tagId: tags['Practice'] }, { tagId: tags['Mini Test'] }] },
    },
  });
  for (let si = 0; si < 3; si++) {
    const titles = ['Part 1 – Photos', 'Part 2 – Question-Response', 'Part 5 – Incomplete Sentences'];
    const skills = [SectionSkill.LISTENING, SectionSkill.LISTENING, SectionSkill.READING];
    const section = await prisma.testSection.create({
      data: { testId: toeicMini.id, title: titles[si], skill: skills[si], orderIndex: si, questionCount: 5 },
    });
    const group = await prisma.questionGroup.create({
      data: { sectionId: section.id, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex: 0 },
    });
    for (let i = 0; i < 5; i++) {
      const qNum = si * 5 + i + 1;
      await prisma.question.create({
        data: {
          groupId: group.id, questionNumber: qNum, orderIndex: i,
          stem: `TOEIC sample question ${qNum}`,
          options: [{ label: 'A', text: 'Option A' }, { label: 'B', text: 'Option B' }, { label: 'C', text: 'Option C' }, { label: 'D', text: 'Option D' }],
          correctAnswer: ['A', 'B', 'C', 'A', 'D'][i],
        },
      });
    }
  }
  console.log(`  ✓ TOEIC Mini Test`);

  // ═══════════════════════════════════════════════════════════════════════════
  // SAMPLE ATTEMPT + COMMENTS for IELTS L1
  // ═══════════════════════════════════════════════════════════════════════════

  const ieltsL1Sections = await prisma.testSection.findMany({
    where: { testId: ieltsL1.id },
    include: { questionGroups: { include: { questions: true } } },
  });

  const allQ = ieltsL1Sections.flatMap(s => s.questionGroups.flatMap(g => g.questions));

  const attempt = await prisma.userAttempt.create({
    data: {
      userId: student1.id,
      testId: ieltsL1.id,
      mode: AttemptMode.FULL_TEST,
      status: AttemptStatus.SUBMITTED,
      timeLimitMins: 40,
      submittedAt: new Date(),
      totalQuestions: allQ.length,
      correctCount: Math.floor(allQ.length * 0.8),
      scorePercent: 80,
      bandScore: 7.5,
      sectionScores: {
        listening: { correct: 32, total: 40, band: 7.5 },
      },
      sections: {
        create: ieltsL1Sections.map(s => ({ sectionId: s.id })),
      },
    },
  });

  await prisma.test.update({
    where: { id: ieltsL1.id },
    data: { attemptCount: { increment: 1 } },
  });

  const comment1 = await prisma.comment.create({
    data: {
      testId: ieltsL1.id, userId: student1.id,
      body: 'This test was really helpful for my preparation! The recording quality was great.',
      likeCount: 3,
    },
  });
  await prisma.comment.create({
    data: {
      testId: ieltsL1.id, userId: student2.id,
      body: 'I found Section 3 quite challenging. Does anyone have tips for table completion questions?',
      likeCount: 1,
    },
  });
  await prisma.comment.create({
    data: {
      testId: ieltsL1.id, userId: student2.id,
      parentId: comment1.id,
      body: 'Agreed! I scored 8/10 on Recording 1 thanks to this practice.',
    },
  });
  await prisma.test.update({
    where: { id: ieltsL1.id },
    data: { commentCount: 3 },
  });

  console.log(`  ✓ Sample attempt + comments`);

  // ─── Summary ────────────────────────────────────────────────────────────────
  const testCount = await prisma.test.count();
  const questionCount = await prisma.question.count();
  console.log('\nSeed completed successfully!');
  console.log(`  - Users: 3 (admin, student1, student2)`);
  console.log(`  - Tags: ${tagDefs.length}`);
  console.log(`  - Tests: ${testCount}`);
  console.log(`  - Questions: ${questionCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
