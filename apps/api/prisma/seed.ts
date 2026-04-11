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

// ─── CLI arg parsing ─────────────────────────────────────────────────────────
// Usage:
//   npx prisma db seed                  → seed all (ielts + toeic + hsk)
//   npx prisma db seed -- --only ielts  → seed IELTS only
//   npx prisma db seed -- --only toeic  → seed TOEIC only
//   npx prisma db seed -- --only hsk     → seed HSK only
//   npx prisma db seed -- --only credits → seed credit packages only

type SeedTarget = 'all' | 'ielts' | 'toeic' | 'hsk' | 'credits';

function parseSeedTarget(): SeedTarget {
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf('--only');
  if (onlyIdx !== -1 && args[onlyIdx + 1]) {
    const target = args[onlyIdx + 1].toLowerCase();
    if (['ielts', 'toeic', 'hsk', 'credits'].includes(target)) {
      return target as SeedTarget;
    }
  }
  return 'all';
}

// ─── Base seed (users + tags) ───────────────────────────────────────────────

async function seedBase() {
  console.log('Seeding base data (users + tags)...');

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
    { name: 'HSK', slug: 'hsk' },
    { name: 'HSK 5', slug: 'hsk-5' },
    { name: 'Chinese', slug: 'chinese' },
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
  return { admin, student1, student2, tags, tagDefs };
}

// ─── Credit Packages ─────────────────────────────────────────────────────────

async function seedCreditPackages() {
  console.log('\n── Credit Packages ──');
  const creditPackages = [
    { id: 'pkg_starter',  name: 'Starter',  description: '200 credits',              priceUsd: '2.00',  baseCredits: 200,  bonusCredits: 0,    sortOrder: 1 },
    { id: 'pkg_standard', name: 'Standard', description: '500 + 50 bonus credits',   priceUsd: '5.00',  baseCredits: 500,  bonusCredits: 50,   sortOrder: 2 },
    { id: 'pkg_plus',     name: 'Plus',     description: '1,000 + 200 bonus',        priceUsd: '10.00', baseCredits: 1000, bonusCredits: 200,  sortOrder: 3 },
    { id: 'pkg_pro',      name: 'Pro',      description: '2,000 + 600 bonus',        priceUsd: '20.00', baseCredits: 2000, bonusCredits: 600,  sortOrder: 4 },
    { id: 'pkg_mega',     name: 'Mega',     description: '5,000 + 2,000 bonus',      priceUsd: '50.00', baseCredits: 5000, bonusCredits: 2000, sortOrder: 5 },
  ];
  for (const pkg of creditPackages) {
    await prisma.creditPackage.upsert({
      where: { id: pkg.id },
      update: { ...pkg, active: true },
      create: { ...pkg, active: true },
    });
  }
  console.log(`  ✓ Seeded ${creditPackages.length} credit packages`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const target = parseSeedTarget();
  console.log(`\nSeed target: ${target.toUpperCase()}\n`);

  if (target === 'credits') {
    await seedCreditPackages();
    console.log('\nSeed completed successfully!');
    return;
  }

  const { admin, student1, student2, tags, tagDefs } = await seedBase();

  // Only clear tests for the targeted exam types (not all)
  if (target === 'all') {
    await prisma.test.deleteMany({});
    console.log('  ✓ Cleared all existing tests');
  } else if (target === 'ielts') {
    await prisma.test.deleteMany({ where: { examType: { in: ['IELTS_ACADEMIC', 'IELTS_GENERAL'] } } });
    console.log('  ✓ Cleared existing IELTS tests');
  } else if (target === 'toeic') {
    await prisma.test.deleteMany({ where: { examType: { in: ['TOEIC_LR', 'TOEIC_SW'] } } });
    console.log('  ✓ Cleared existing TOEIC tests');
  } else if (target === 'hsk') {
    await prisma.test.deleteMany({ where: { examType: { in: ['HSK_1', 'HSK_2', 'HSK_3', 'HSK_4', 'HSK_5', 'HSK_6'] } } });
    console.log('  ✓ Cleared existing HSK tests');
  }

  // ─── IELTS ──────────────────────────────────────────────────────────────────
  let ieltsL1: { id: string } | undefined;

  if (target === 'all' || target === 'ielts') {
  console.log('\n── IELTS Tests ──');

  // ═══════════════════════════════════════════════════════════════════════════
  // IELTS ACADEMIC — LISTENING
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Test 1: Fill-in-blank / MCQ / Fill-in-blank (table) / Fill-in-blank (summary) ─
  ieltsL1 = await prisma.test.create({
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

  } // end if (ielts)

  // ─── TOEIC ──────────────────────────────────────────────────────────────────
  if (target === 'all' || target === 'toeic') {
  console.log('\n── TOEIC Tests ──');

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

  } // end if (toeic)

  // ═══════════════════════════════════════════════════════════════════════════
  // SAMPLE ATTEMPT + COMMENTS for IELTS L1 (only when seeding ielts or all)
  // ═══════════════════════════════════════════════════════════════════════════

  if ((target === 'all' || target === 'ielts') && ieltsL1) {
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
  } // end if (ielts) — sample attempt

  // ─── HSK ──────────────────────────────────────────────────────────────────
  if (target === 'all' || target === 'hsk') {

  // ═══════════════════════════════════════════════════════════════════════════════
  // HSK 5 Seed Test — Listening (45q) + Reading (45q) + Writing (10q) = 100q
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log('\n── HSK 5 Test ──');

  const hsk5Test = await prisma.test.create({
    data: {
      title: 'HSK 5 模拟考试 (Mock Test)',
      examType: ExamType.HSK_5,
      durationMins: 125,
      description: 'HSK 5 full mock test — Listening (45q) + Reading (45q) + Writing (10q). Pass: 180/300.',
      isPublished: true,
      tags: {
        create: [
          { tagId: tags['HSK'] },
          { tagId: tags['HSK 5'] },
          { tagId: tags['Chinese'] },
          { tagId: tags['Practice'] },
        ],
      },
    },
  });

  // ── Listening Section (45 questions) ──
  const hskListening = await prisma.testSection.create({
    data: {
      testId: hsk5Test.id,
      title: '听力 Listening',
      skill: SectionSkill.LISTENING,
      orderIndex: 0,
      instructions: 'HSK 5 听力理解 — 共45题。每段录音播放一次，听完后选择正确答案。',
      questionCount: 45,
    },
  });

  // Listening Part 1 (15q) — Short dialogues
  const hskL1Questions = [
    { stem: '男的为什么没去参加聚会？', options: [{ label: 'A', text: '他生病了' }, { label: 'B', text: '他要加班' }, { label: 'C', text: '他忘记了' }, { label: 'D', text: '他不想去' }], answer: 'B' },
    { stem: '女的对这个方案有什么看法？', options: [{ label: 'A', text: '完全赞同' }, { label: 'B', text: '有些担心' }, { label: 'C', text: '强烈反对' }, { label: 'D', text: '没有意见' }], answer: 'B' },
    { stem: '他们打算什么时候出发？', options: [{ label: 'A', text: '今天下午' }, { label: 'B', text: '明天早上' }, { label: 'C', text: '后天下午' }, { label: 'D', text: '下个星期' }], answer: 'B' },
    { stem: '男的建议女的怎么做？', options: [{ label: 'A', text: '继续等待' }, { label: 'B', text: '换一份工作' }, { label: 'C', text: '直接找经理谈' }, { label: 'D', text: '先去休息' }], answer: 'C' },
    { stem: '这件衣服为什么打折？', options: [{ label: 'A', text: '换季促销' }, { label: 'B', text: '有小瑕疵' }, { label: 'C', text: '库存太多' }, { label: 'D', text: '店庆活动' }], answer: 'A' },
    { stem: '女的最近在忙什么？', options: [{ label: 'A', text: '准备考试' }, { label: 'B', text: '写毕业论文' }, { label: 'C', text: '找工作' }, { label: 'D', text: '学开车' }], answer: 'B' },
    { stem: '男的觉得这部电影怎么样？', options: [{ label: 'A', text: '特效很好' }, { label: 'B', text: '剧情太长' }, { label: 'C', text: '演员演得好' }, { label: 'D', text: '故事无聊' }], answer: 'C' },
    { stem: '女的为什么迟到了？', options: [{ label: 'A', text: '路上堵车' }, { label: 'B', text: '闹钟没响' }, { label: 'C', text: '公交车晚点' }, { label: 'D', text: '走错了路' }], answer: 'A' },
    { stem: '他们讨论的话题是什么？', options: [{ label: 'A', text: '旅游计划' }, { label: 'B', text: '搬家问题' }, { label: 'C', text: '孩子教育' }, { label: 'D', text: '健康饮食' }], answer: 'C' },
    { stem: '男的为什么要换手机？', options: [{ label: 'A', text: '太旧了' }, { label: 'B', text: '屏幕坏了' }, { label: 'C', text: '存储不够' }, { label: 'D', text: '想要新功能' }], answer: 'B' },
    { stem: '女的觉得这家餐厅怎么样？', options: [{ label: 'A', text: '菜好吃但贵' }, { label: 'B', text: '便宜但难吃' }, { label: 'C', text: '环境好味道好' }, { label: 'D', text: '服务态度差' }], answer: 'A' },
    { stem: '男的什么时候开始学中文的？', options: [{ label: 'A', text: '高中时期' }, { label: 'B', text: '大学一年级' }, { label: 'C', text: '来中国以后' }, { label: 'D', text: '小学时候' }], answer: 'C' },
    { stem: '女的今天为什么不高兴？', options: [{ label: 'A', text: '考试没考好' }, { label: 'B', text: '和朋友吵架了' }, { label: 'C', text: '丢了钱包' }, { label: 'D', text: '被领导批评了' }], answer: 'D' },
    { stem: '他们决定周末做什么？', options: [{ label: 'A', text: '去爬山' }, { label: 'B', text: '在家看电影' }, { label: 'C', text: '去博物馆' }, { label: 'D', text: '去逛街' }], answer: 'C' },
    { stem: '男的推荐了什么书？', options: [{ label: 'A', text: '历史小说' }, { label: 'B', text: '科技杂志' }, { label: 'C', text: '心理学教材' }, { label: 'D', text: '旅游指南' }], answer: 'A' },
  ];
  await createMcqGroup(hskListening.id, 0, hskL1Questions, 1);

  // Listening Part 2 (15q) — Longer dialogues
  const hskL2Questions = [
    { stem: '根据对话，公司最近有什么变化？', options: [{ label: 'A', text: '搬到新办公室' }, { label: 'B', text: '增加了新部门' }, { label: 'C', text: '换了新经理' }, { label: 'D', text: '改了上班时间' }], answer: 'A' },
    { stem: '女的对搬家有什么意见？', options: [{ label: 'A', text: '非常期待' }, { label: 'B', text: '不太方便' }, { label: 'C', text: '无所谓' }, { label: 'D', text: '坚决反对' }], answer: 'B' },
    { stem: '男的说新办公室有什么优点？', options: [{ label: 'A', text: '面积更大' }, { label: 'B', text: '交通方便' }, { label: 'C', text: '附近有公园' }, { label: 'D', text: '租金便宜' }], answer: 'A' },
    { stem: '这段话主要讲的是什么？', options: [{ label: 'A', text: '环境保护' }, { label: 'B', text: '城市规划' }, { label: 'C', text: '传统文化' }, { label: 'D', text: '科技发展' }], answer: 'A' },
    { stem: '说话人认为解决问题的关键是什么？', options: [{ label: 'A', text: '政府投资' }, { label: 'B', text: '个人意识' }, { label: 'C', text: '技术创新' }, { label: 'D', text: '国际合作' }], answer: 'B' },
    { stem: '根据这段话，哪个说法是正确的？', options: [{ label: 'A', text: '情况在改善' }, { label: 'B', text: '问题越来越严重' }, { label: 'C', text: '已经解决了' }, { label: 'D', text: '和以前一样' }], answer: 'A' },
    { stem: '女的为什么想换工作？', options: [{ label: 'A', text: '工资太低' }, { label: 'B', text: '没有发展空间' }, { label: 'C', text: '工作太累' }, { label: 'D', text: '同事关系不好' }], answer: 'B' },
    { stem: '男的给了什么建议？', options: [{ label: 'A', text: '先忍耐' }, { label: 'B', text: '去进修' }, { label: 'C', text: '跳槽' }, { label: 'D', text: '找领导谈' }], answer: 'B' },
    { stem: '女的最终决定怎么做？', options: [{ label: 'A', text: '接受建议' }, { label: 'B', text: '继续考虑' }, { label: 'C', text: '马上辞职' }, { label: 'D', text: '不做改变' }], answer: 'A' },
    { stem: '这个实验的目的是什么？', options: [{ label: 'A', text: '测试新材料' }, { label: 'B', text: '研究动物行为' }, { label: 'C', text: '分析水质' }, { label: 'D', text: '观察植物生长' }], answer: 'D' },
    { stem: '实验的结果说明了什么？', options: [{ label: 'A', text: '光照很重要' }, { label: 'B', text: '温度是关键' }, { label: 'C', text: '水分最重要' }, { label: 'D', text: '土壤影响大' }], answer: 'A' },
    { stem: '接下来他们要做什么？', options: [{ label: 'A', text: '重复实验' }, { label: 'B', text: '写报告' }, { label: 'C', text: '改变条件再试' }, { label: 'D', text: '停止研究' }], answer: 'C' },
    { stem: '男的对这个消息有什么反应？', options: [{ label: 'A', text: '很惊讶' }, { label: 'B', text: '早就知道了' }, { label: 'C', text: '不太在意' }, { label: 'D', text: '有点担心' }], answer: 'A' },
    { stem: '女的说的"另一方面"指的是什么？', options: [{ label: 'A', text: '经济影响' }, { label: 'B', text: '文化意义' }, { label: 'C', text: '社会效果' }, { label: 'D', text: '个人利益' }], answer: 'C' },
    { stem: '他们最后达成了什么共识？', options: [{ label: 'A', text: '需要更多信息' }, { label: 'B', text: '支持这个计划' }, { label: 'C', text: '反对这个提议' }, { label: 'D', text: '各自保留意见' }], answer: 'A' },
  ];
  await createMcqGroup(hskListening.id, 1, hskL2Questions, 16);

  // Listening Part 3 (15q) — Monologues
  const hskL3Questions = [
    { stem: '这段话主要介绍了什么？', options: [{ label: 'A', text: '一种传统艺术' }, { label: 'B', text: '一个历史人物' }, { label: 'C', text: '一项科学发现' }, { label: 'D', text: '一座古老建筑' }], answer: 'A' },
    { stem: '这种艺术最初出现在哪个时期？', options: [{ label: 'A', text: '唐朝' }, { label: 'B', text: '宋朝' }, { label: 'C', text: '明朝' }, { label: 'D', text: '清朝' }], answer: 'B' },
    { stem: '说话人认为它的价值在于什么？', options: [{ label: 'A', text: '经济价值' }, { label: 'B', text: '文化传承' }, { label: 'C', text: '艺术欣赏' }, { label: 'D', text: '技术创新' }], answer: 'B' },
    { stem: '这篇报道讲的是什么事件？', options: [{ label: 'A', text: '自然灾害' }, { label: 'B', text: '体育比赛' }, { label: 'C', text: '科技展览' }, { label: 'D', text: '音乐节' }], answer: 'C' },
    { stem: '有多少家企业参加了这次活动？', options: [{ label: 'A', text: '不到100家' }, { label: 'B', text: '大约200家' }, { label: 'C', text: '超过300家' }, { label: 'D', text: '将近500家' }], answer: 'C' },
    { stem: '最受欢迎的展品是什么？', options: [{ label: 'A', text: '智能手机' }, { label: 'B', text: '人工智能机器人' }, { label: 'C', text: '新能源汽车' }, { label: 'D', text: '虚拟现实设备' }], answer: 'B' },
    { stem: '教授主要讲了什么内容？', options: [{ label: 'A', text: '语言学习方法' }, { label: 'B', text: '大脑发育规律' }, { label: 'C', text: '儿童心理特点' }, { label: 'D', text: '教育制度改革' }], answer: 'A' },
    { stem: '根据研究，什么年龄学语言最好？', options: [{ label: 'A', text: '3岁以前' }, { label: 'B', text: '6到12岁' }, { label: 'C', text: '12到18岁' }, { label: 'D', text: '没有年龄限制' }], answer: 'B' },
    { stem: '教授对成年人学语言的态度是什么？', options: [{ label: 'A', text: '完全没希望' }, { label: 'B', text: '困难但可能' }, { label: 'C', text: '和孩子一样容易' }, { label: 'D', text: '更有优势' }], answer: 'B' },
    { stem: '这段广告在宣传什么？', options: [{ label: 'A', text: '健身房' }, { label: 'B', text: '在线课程' }, { label: 'C', text: '旅游线路' }, { label: 'D', text: '保健产品' }], answer: 'C' },
    { stem: '这个产品/服务的特点是什么？', options: [{ label: 'A', text: '价格便宜' }, { label: 'B', text: '专为家庭设计' }, { label: 'C', text: '全天候服务' }, { label: 'D', text: '限量供应' }], answer: 'B' },
    { stem: '优惠活动截止到什么时候？', options: [{ label: 'A', text: '本周末' }, { label: 'B', text: '月底' }, { label: 'C', text: '下个月' }, { label: 'D', text: '年底' }], answer: 'B' },
    { stem: '讲座的主题是什么？', options: [{ label: 'A', text: '健康生活方式' }, { label: 'B', text: '职业规划' }, { label: 'C', text: '人际关系' }, { label: 'D', text: '时间管理' }], answer: 'D' },
    { stem: '说话人认为最重要的原则是什么？', options: [{ label: 'A', text: '设定目标' }, { label: 'B', text: '学会拒绝' }, { label: 'C', text: '制定计划' }, { label: 'D', text: '保持自律' }], answer: 'B' },
    { stem: '说话人最后给出了什么建议？', options: [{ label: 'A', text: '多读书' }, { label: 'B', text: '每天记日记' }, { label: 'C', text: '找到适合自己的方法' }, { label: 'D', text: '向别人学习' }], answer: 'C' },
  ];
  await createMcqGroup(hskListening.id, 2, hskL3Questions, 31);
  console.log('  ✓ HSK 5 Listening section (45q)');

  // ── Reading Section (45 questions) ──
  const hskReading = await prisma.testSection.create({
    data: {
      testId: hsk5Test.id,
      title: '阅读 Reading',
      skill: SectionSkill.READING,
      orderIndex: 1,
      instructions: 'HSK 5 阅读理解 — 共45题。',
      questionCount: 45,
    },
  });

  // Reading Part 1 (15q) — Fill in the blanks (passage with {n} tokens)
  const readingPassage1 = await prisma.passage.create({
    data: {
      sectionId: hskReading.id,
      title: '完成句子 — 选词填空',
      contentHtml: `<div style="line-height:2;font-size:15px">
<p>中国的茶文化有着 {46} 的历史。早在几千年前，人们就发现了茶叶的 {47}。 喝茶不仅能 {48} 身体，还能让人放松心情。</p>
<p>不同地区的人喝茶的 {49} 也不一样。南方人喜欢喝绿茶，北方人 {50} 喝花茶。 近年来，年轻人越来越喜欢喝 {51} 茶饮料。</p>
<p>专家 {52} ，每天适量饮茶对健康有好处，但不宜喝太 {53} 的茶。 泡茶的水温也很 {54}，不同的茶叶需要不同的温度。 总之，茶是中国人生活中不可 {55} 的一部分。</p>
<p>有些人认为喝茶会 {56} 睡眠，其实只要不在睡前喝就 {57} 了。 茶里含有的成分能帮助 {58} 注意力，提高工作 {59}。 因此，很多人习惯在下午 {60} 的时候泡一杯茶。</p>
</div>`,
      orderIndex: 0,
    },
  });
  const readP1Group = await prisma.questionGroup.create({
    data: {
      sectionId: hskReading.id,
      passageId: readingPassage1.id,
      questionType: QuestionType.MULTIPLE_CHOICE,
      orderIndex: 0,
      instructions: '请选择正确的词语填入文中空白处。',
    },
  });
  const readP1Answers = [
    { stem: '{46}', options: [{ label: 'A', text: '长期' }, { label: 'B', text: '悠久' }, { label: 'C', text: '古老' }, { label: 'D', text: '漫长' }], answer: 'B' },
    { stem: '{47}', options: [{ label: 'A', text: '功能' }, { label: 'B', text: '好处' }, { label: 'C', text: '作用' }, { label: 'D', text: '效果' }], answer: 'B' },
    { stem: '{48}', options: [{ label: 'A', text: '保护' }, { label: 'B', text: '增强' }, { label: 'C', text: '促进' }, { label: 'D', text: '维持' }], answer: 'C' },
    { stem: '{49}', options: [{ label: 'A', text: '方法' }, { label: 'B', text: '习惯' }, { label: 'C', text: '方式' }, { label: 'D', text: '爱好' }], answer: 'B' },
    { stem: '{50}', options: [{ label: 'A', text: '偏好' }, { label: 'B', text: '一般' }, { label: 'C', text: '往往' }, { label: 'D', text: '更加' }], answer: 'C' },
    { stem: '{51}', options: [{ label: 'A', text: '新型' }, { label: 'B', text: '特殊' }, { label: 'C', text: '时尚' }, { label: 'D', text: '新式' }], answer: 'A' },
    { stem: '{52}', options: [{ label: 'A', text: '建议' }, { label: 'B', text: '表示' }, { label: 'C', text: '认为' }, { label: 'D', text: '指出' }], answer: 'B' },
    { stem: '{53}', options: [{ label: 'A', text: '浓' }, { label: 'B', text: '多' }, { label: 'C', text: '热' }, { label: 'D', text: '苦' }], answer: 'A' },
    { stem: '{54}', options: [{ label: 'A', text: '关键' }, { label: 'B', text: '讲究' }, { label: 'C', text: '重要' }, { label: 'D', text: '严格' }], answer: 'C' },
    { stem: '{55}', options: [{ label: 'A', text: '分离' }, { label: 'B', text: '缺少' }, { label: 'C', text: '离开' }, { label: 'D', text: '代替' }], answer: 'B' },
    { stem: '{56}', options: [{ label: 'A', text: '影响' }, { label: 'B', text: '打扰' }, { label: 'C', text: '妨碍' }, { label: 'D', text: '破坏' }], answer: 'A' },
    { stem: '{57}', options: [{ label: 'A', text: '好' }, { label: 'B', text: '行' }, { label: 'C', text: '对' }, { label: 'D', text: '可以' }], answer: 'B' },
    { stem: '{58}', options: [{ label: 'A', text: '提高' }, { label: 'B', text: '加强' }, { label: 'C', text: '集中' }, { label: 'D', text: '保持' }], answer: 'C' },
    { stem: '{59}', options: [{ label: 'A', text: '水平' }, { label: 'B', text: '效率' }, { label: 'C', text: '能力' }, { label: 'D', text: '质量' }], answer: 'B' },
    { stem: '{60}', options: [{ label: 'A', text: '困倦' }, { label: 'B', text: '疲劳' }, { label: 'C', text: '无聊' }, { label: 'D', text: '休息' }], answer: 'A' },
  ];
  for (let i = 0; i < readP1Answers.length; i++) {
    const q = readP1Answers[i];
    await prisma.question.create({
      data: { groupId: readP1Group.id, questionNumber: 46 + i, orderIndex: i, stem: q.stem, options: q.options, correctAnswer: q.answer },
    });
  }

  // Reading Part 2 (15q) — Reading comprehension with passages
  const readingPassage2 = await prisma.passage.create({
    data: {
      sectionId: hskReading.id,
      title: '阅读理解 — 短文1',
      contentHtml: `<div style="line-height:2;font-size:15px">
<p>近年来，共享经济在中国发展迅速。从共享单车到共享汽车，从共享办公空间到共享充电宝，各种共享模式不断涌现。这种新的商业模式改变了人们的消费习惯，也对传统行业产生了深远的影响。</p>
<p>共享经济的核心理念是"使用而非拥有"。通过互联网平台，人们可以方便地租用各种物品和服务，不必花大量金钱购买。这不仅降低了消费门槛，也减少了资源浪费。</p>
<p>然而，共享经济也面临一些挑战。产品质量参差不齐、用户隐私保护不足、行业监管不完善等问题仍需解决。只有建立健全的法律法规体系，才能促进共享经济的健康发展。</p>
</div>`,
      orderIndex: 1,
    },
  });
  const readP2Group = await prisma.questionGroup.create({
    data: {
      sectionId: hskReading.id,
      passageId: readingPassage2.id,
      questionType: QuestionType.MULTIPLE_CHOICE,
      orderIndex: 1,
      instructions: '根据短文内容，选择正确答案。',
    },
  });
  const readP2Questions = [
    { stem: '共享经济在中国发展得怎么样？', options: [{ label: 'A', text: '发展缓慢' }, { label: 'B', text: '发展迅速' }, { label: 'C', text: '刚刚起步' }, { label: 'D', text: '已经衰退' }], answer: 'B' },
    { stem: '共享经济的核心理念是什么？', options: [{ label: 'A', text: '多买多用' }, { label: 'B', text: '节约时间' }, { label: 'C', text: '使用而非拥有' }, { label: 'D', text: '先试后买' }], answer: 'C' },
    { stem: '共享经济的好处不包括以下哪项？', options: [{ label: 'A', text: '降低消费门槛' }, { label: 'B', text: '减少资源浪费' }, { label: 'C', text: '提高产品质量' }, { label: 'D', text: '方便租用服务' }], answer: 'C' },
    { stem: '共享经济面临哪些挑战？', options: [{ label: 'A', text: '技术落后' }, { label: 'B', text: '用户太少' }, { label: 'C', text: '监管不完善' }, { label: 'D', text: '价格太高' }], answer: 'C' },
    { stem: '作者认为共享经济健康发展需要什么？', options: [{ label: 'A', text: '更多投资' }, { label: 'B', text: '技术创新' }, { label: 'C', text: '完善法律法规' }, { label: 'D', text: '国际合作' }], answer: 'C' },
  ];
  for (let i = 0; i < readP2Questions.length; i++) {
    const q = readP2Questions[i];
    await prisma.question.create({
      data: { groupId: readP2Group.id, questionNumber: 61 + i, orderIndex: i, stem: q.stem, options: q.options, correctAnswer: q.answer },
    });
  }

  // Reading passage 3
  const readingPassage3 = await prisma.passage.create({
    data: {
      sectionId: hskReading.id,
      title: '阅读理解 — 短文2',
      contentHtml: `<div style="line-height:2;font-size:15px">
<p>睡眠是人体恢复精力的重要方式。研究表明，成年人每天需要7到8个小时的睡眠。然而，现代社会中，很多人存在睡眠不足的问题。熬夜加班、刷手机、压力过大都是导致睡眠质量下降的原因。</p>
<p>长期睡眠不足会带来严重的健康问题。首先，它会削弱免疫系统，使人更容易生病。其次，注意力和记忆力也会明显下降，影响工作和学习效率。此外，睡眠不足还与肥胖、心脏病等慢性疾病有关。</p>
<p>改善睡眠质量并不难。专家建议：保持规律的作息时间，睡前一小时不使用电子设备，营造安静舒适的睡眠环境，适当运动但避免在睡前剧烈运动。养成良好的睡眠习惯，对提高生活质量非常重要。</p>
</div>`,
      orderIndex: 2,
    },
  });
  const readP3Group = await prisma.questionGroup.create({
    data: {
      sectionId: hskReading.id,
      passageId: readingPassage3.id,
      questionType: QuestionType.MULTIPLE_CHOICE,
      orderIndex: 2,
      instructions: '根据短文内容，选择正确答案。',
    },
  });
  const readP3Questions = [
    { stem: '成年人每天需要多少小时的睡眠？', options: [{ label: 'A', text: '5到6小时' }, { label: 'B', text: '7到8小时' }, { label: 'C', text: '9到10小时' }, { label: 'D', text: '因人而异' }], answer: 'B' },
    { stem: '以下哪个不是睡眠不足的原因？', options: [{ label: 'A', text: '熬夜加班' }, { label: 'B', text: '适当运动' }, { label: 'C', text: '刷手机' }, { label: 'D', text: '压力大' }], answer: 'B' },
    { stem: '睡眠不足首先会影响什么？', options: [{ label: 'A', text: '免疫系统' }, { label: 'B', text: '消化系统' }, { label: 'C', text: '运动能力' }, { label: 'D', text: '社交能力' }], answer: 'A' },
    { stem: '以下哪项不是专家的建议？', options: [{ label: 'A', text: '保持规律作息' }, { label: 'B', text: '睡前喝咖啡' }, { label: 'C', text: '不用电子设备' }, { label: 'D', text: '适当运动' }], answer: 'B' },
    { stem: '这篇文章的主要目的是什么？', options: [{ label: 'A', text: '批评现代人的生活方式' }, { label: 'B', text: '推销助眠产品' }, { label: 'C', text: '强调睡眠的重要性' }, { label: 'D', text: '介绍医学研究' }], answer: 'C' },
  ];
  for (let i = 0; i < readP3Questions.length; i++) {
    const q = readP3Questions[i];
    await prisma.question.create({
      data: { groupId: readP3Group.id, questionNumber: 66 + i, orderIndex: i, stem: q.stem, options: q.options, correctAnswer: q.answer },
    });
  }

  // Reading Part 3 (15q) — More comprehension passages
  const readingPassage4 = await prisma.passage.create({
    data: {
      sectionId: hskReading.id,
      title: '阅读理解 — 短文3',
      contentHtml: `<div style="line-height:2;font-size:15px">
<p>"断舍离"是一种源自日本的生活哲学，近年来在中国也非常流行。它的核心思想是：断绝不需要的东西，舍弃多余的废物，脱离对物品的执着。通过减少物品的数量，让生活变得更加简单、轻松。</p>
<p>很多人在实践"断舍离"后发现，扔掉那些很久不用的东西，不但没有感到损失，反而觉得心情更加愉悦。因为杂乱的环境会无形中增加人的心理负担，而整洁的空间则能带来内心的平静。</p>
<p>当然，"断舍离"并不是让人什么都不买，而是学会理性消费。在购买物品之前，先问自己：这个东西我真的需要吗？它能给我的生活带来什么价值？只买真正需要的、能提升生活品质的物品，才是"断舍离"的真谛。</p>
</div>`,
      orderIndex: 3,
    },
  });
  const readP4Group = await prisma.questionGroup.create({
    data: {
      sectionId: hskReading.id,
      passageId: readingPassage4.id,
      questionType: QuestionType.MULTIPLE_CHOICE,
      orderIndex: 3,
      instructions: '根据短文内容，选择正确答案。',
    },
  });
  const readP4Questions = [
    { stem: '"断舍离"最初来自哪个国家？', options: [{ label: 'A', text: '中国' }, { label: 'B', text: '韩国' }, { label: 'C', text: '日本' }, { label: 'D', text: '美国' }], answer: 'C' },
    { stem: '"断舍离"的核心思想是什么？', options: [{ label: 'A', text: '多买好东西' }, { label: 'B', text: '减少物品简化生活' }, { label: 'C', text: '收藏有价值的东西' }, { label: 'D', text: '只买便宜的东西' }], answer: 'B' },
    { stem: '实践"断舍离"的人通常有什么感受？', options: [{ label: 'A', text: '后悔扔东西' }, { label: 'B', text: '心情更愉悦' }, { label: 'C', text: '感到空虚' }, { label: 'D', text: '生活更无聊' }], answer: 'B' },
    { stem: '杂乱的环境会带来什么影响？', options: [{ label: 'A', text: '创造灵感' }, { label: 'B', text: '提高效率' }, { label: 'C', text: '增加心理负担' }, { label: 'D', text: '帮助记忆' }], answer: 'C' },
    { stem: '"断舍离"的真谛是什么？', options: [{ label: 'A', text: '什么都不买' }, { label: 'B', text: '只买最贵的' }, { label: 'C', text: '理性消费' }, { label: 'D', text: '回归自然' }], answer: 'C' },
    { stem: '文章中"执着"的意思最接近？', options: [{ label: 'A', text: '认真' }, { label: 'B', text: '坚持' }, { label: 'C', text: '放不下' }, { label: 'D', text: '喜欢' }], answer: 'C' },
    { stem: '买东西前应该先问自己什么？', options: [{ label: 'A', text: '价格贵不贵' }, { label: 'B', text: '别人有没有' }, { label: 'C', text: '是否真的需要' }, { label: 'D', text: '颜色好不好看' }], answer: 'C' },
    { stem: '这段文字最适合的标题是？', options: [{ label: 'A', text: '日本文化在中国' }, { label: 'B', text: '学会"断舍离"' }, { label: 'C', text: '如何省钱' }, { label: 'D', text: '整理房间的方法' }], answer: 'B' },
    { stem: '下面哪种行为符合"断舍离"精神？', options: [{ label: 'A', text: '看到打折就买' }, { label: 'B', text: '收集各种纪念品' }, { label: 'C', text: '只买必需品' }, { label: 'D', text: '把旧东西藏起来' }], answer: 'C' },
    { stem: '根据文章，以下哪个说法是正确的？', options: [{ label: 'A', text: '断舍离在中国不流行' }, { label: 'B', text: '整洁的环境有利于心理健康' }, { label: 'C', text: '断舍离就是极简主义' }, { label: 'D', text: '物品越多越幸福' }], answer: 'B' },
  ];
  for (let i = 0; i < readP4Questions.length; i++) {
    const q = readP4Questions[i];
    await prisma.question.create({
      data: { groupId: readP4Group.id, questionNumber: 71 + i, orderIndex: i, stem: q.stem, options: q.options, correctAnswer: q.answer },
    });
  }

  // Reading remaining 10 questions (81-90) — short texts
  const readP5Questions = [
    { stem: '"世上无难事，只怕有心人"这句话的意思是？', options: [{ label: 'A', text: '世界上没有困难' }, { label: 'B', text: '有决心就能克服困难' }, { label: 'C', text: '困难让人害怕' }, { label: 'D', text: '不要做难的事' }], answer: 'B' },
    { stem: '下面哪个词最适合形容春天？', options: [{ label: 'A', text: '万物复苏' }, { label: 'B', text: '骄阳似火' }, { label: 'C', text: '秋高气爽' }, { label: 'D', text: '冰天雪地' }], answer: 'A' },
    { stem: '"纸上谈兵"比喻什么？', options: [{ label: 'A', text: '在纸上画画' }, { label: 'B', text: '只说不做没有实践' }, { label: 'C', text: '军事训练' }, { label: 'D', text: '写文章' }], answer: 'B' },
    { stem: '通知的主要内容是什么？', options: [{ label: 'A', text: '放假安排' }, { label: 'B', text: '会议时间变更' }, { label: 'C', text: '考试通知' }, { label: 'D', text: '招聘信息' }], answer: 'B' },
    { stem: '这则广告在推荐什么？', options: [{ label: 'A', text: '一本书' }, { label: 'B', text: '一部电影' }, { label: 'C', text: '一个手机应用' }, { label: 'D', text: '一门课程' }], answer: 'C' },
  ];
  await createMcqGroup(hskReading.id, 4, readP5Questions, 81);
  const readP6Questions = [
    { stem: '根据这封信，作者写信的目的是？', options: [{ label: 'A', text: '感谢帮助' }, { label: 'B', text: '提出建议' }, { label: 'C', text: '投诉服务' }, { label: 'D', text: '请求原谅' }], answer: 'C' },
    { stem: '图表显示销售量什么时候最高？', options: [{ label: 'A', text: '第一季度' }, { label: 'B', text: '第二季度' }, { label: 'C', text: '第三季度' }, { label: 'D', text: '第四季度' }], answer: 'D' },
    { stem: '这段对话发生在什么地方？', options: [{ label: 'A', text: '医院' }, { label: 'B', text: '银行' }, { label: 'C', text: '学校' }, { label: 'D', text: '超市' }], answer: 'B' },
    { stem: '"画蛇添足"的意思是？', options: [{ label: 'A', text: '做事很快' }, { label: 'B', text: '多此一举' }, { label: 'C', text: '非常仔细' }, { label: 'D', text: '创意十足' }], answer: 'B' },
    { stem: '这则新闻的核心信息是什么？', options: [{ label: 'A', text: '经济增长放缓' }, { label: 'B', text: '新政策发布' }, { label: 'C', text: '国际关系变化' }, { label: 'D', text: '科技突破' }], answer: 'B' },
  ];
  await createMcqGroup(hskReading.id, 5, readP6Questions, 86);
  console.log('  ✓ HSK 5 Reading section (45q)');

  // ── Writing Section (10 questions: 8 reorder + 1 keyword + 1 picture) ──
  const hskWriting = await prisma.testSection.create({
    data: {
      testId: hsk5Test.id,
      title: '书写 Writing',
      skill: SectionSkill.WRITING,
      orderIndex: 2,
      instructions: 'HSK 5 书写 — 第一部分：排列顺序（8题），第二部分：写作（2题）。',
      questionCount: 10,
    },
  });

  // Writing Part 1 (8q) — Sentence Reorder
  const reorderGroup = await prisma.questionGroup.create({
    data: {
      sectionId: hskWriting.id,
      questionType: QuestionType.SENTENCE_REORDER,
      orderIndex: 0,
      instructions: '请把下面的词语排列成一个完整的句子。',
    },
  });
  const reorderQuestions = [
    { fragments: ['结果将在', '公布', '月底', '录取'], answer: '录取结果将在月底公布' },
    { fragments: ['受到', '大家', '他的演讲', '欢迎', '了'], answer: '他的演讲受到了大家欢迎' },
    { fragments: ['对', '这份工作', '满意', '非常', '我'], answer: '我对这份工作非常满意' },
    { fragments: ['汽油的', '上涨', '价格', '又', '了'], answer: '汽油的价格又上涨了' },
    { fragments: ['只要', '就能', '成功', '坚持', '努力'], answer: '只要坚持努力就能成功' },
    { fragments: ['他', '三年', '在北京', '了', '已经', '住了'], answer: '他已经在北京住了三年了' },
    { fragments: ['使人', '的', '运动', '适当', '更加', '健康'], answer: '适当的运动使人更加健康' },
    { fragments: ['这本书', '很大', '的', '影响', '对我'], answer: '这本书对我的影响很大' },
  ];
  for (let i = 0; i < reorderQuestions.length; i++) {
    const q = reorderQuestions[i];
    await prisma.question.create({
      data: {
        groupId: reorderGroup.id,
        questionNumber: 91 + i,
        orderIndex: i,
        correctAnswer: q.answer,
        metadata: {
          type: 'SENTENCE_REORDER',
          fragments: q.fragments,
          hskLevel: 5,
          charSet: 'simplified',
        },
      },
    });
  }

  // Writing Part 2a (1q) — Keyword Composition
  const keywordGroup = await prisma.questionGroup.create({
    data: {
      sectionId: hskWriting.id,
      questionType: QuestionType.KEYWORD_COMPOSITION,
      orderIndex: 1,
      instructions: '请结合下列词语，写一篇80字左右的短文。',
    },
  });
  await prisma.question.create({
    data: {
      groupId: keywordGroup.id,
      questionNumber: 99,
      orderIndex: 0,
      stem: '请结合下列词语（要全部使用，顺序不分先后），写一篇80字左右的短文。',
      metadata: {
        type: 'KEYWORD_COMPOSITION',
        keywords: ['博物馆', '保存', '讲解员', '丰富', '值得'],
        minChars: 60,
        maxChars: 100,
        hskLevel: 5,
        charSet: 'simplified',
      },
    },
  });

  // Writing Part 2b (1q) — Picture Composition
  const pictureGroup = await prisma.questionGroup.create({
    data: {
      sectionId: hskWriting.id,
      questionType: QuestionType.PICTURE_COMPOSITION,
      orderIndex: 2,
      instructions: '请结合这张图片，写一篇80字左右的短文。',
    },
  });
  await prisma.question.create({
    data: {
      groupId: pictureGroup.id,
      questionNumber: 100,
      orderIndex: 0,
      stem: '请结合这张图片写一篇80字左右的短文。',
      metadata: {
        type: 'PICTURE_COMPOSITION',
        minChars: 60,
        maxChars: 100,
        hskLevel: 5,
        charSet: 'simplified',
        imageAlt: 'A family sitting together at a dinner table, sharing a meal and smiling.',
      },
    },
  });
  console.log('  ✓ HSK 5 Writing section (10q: 8 reorder + 1 keyword + 1 picture)');

  // Update test counts
  await prisma.test.update({
    where: { id: hsk5Test.id },
    data: { sectionCount: 3, questionCount: 100 },
  });
  console.log('  ✓ HSK 5 test complete (100 questions)');

  } // end if (hsk)

  await seedCreditPackages();

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
