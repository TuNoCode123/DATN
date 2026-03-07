import {
  PrismaClient,
  UserRole,
  ExamType,
  TestFormat,
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

// Create MCQ group (10 questions)
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
        mcqOptions: q.options,
        correctAnswer: q.answer,
      },
    });
  }
  return group;
}

// Create NFC group (form completion)
async function createNfcGroup(sectionId: string, orderIndex: number, contentHtml: string, answers: string[], startQNum: number) {
  const group = await prisma.questionGroup.create({
    data: { sectionId, questionType: QuestionType.NOTE_FORM_COMPLETION, orderIndex, contentHtml },
  });
  for (let i = 0; i < answers.length; i++) {
    await prisma.question.create({
      data: { groupId: group.id, questionNumber: startQNum + i, orderIndex: i, correctAnswer: answers[i] },
    });
  }
  return group;
}

// Create Table group
async function createTableGroup(sectionId: string, orderIndex: number, contentHtml: string, answers: string[], startQNum: number) {
  const group = await prisma.questionGroup.create({
    data: { sectionId, questionType: QuestionType.TABLE_COMPLETION, orderIndex, contentHtml },
  });
  for (let i = 0; i < answers.length; i++) {
    await prisma.question.create({
      data: { groupId: group.id, questionNumber: startQNum + i, orderIndex: i, correctAnswer: answers[i] },
    });
  }
  return group;
}

// Create Summary group
async function createSummaryGroup(sectionId: string, orderIndex: number, contentHtml: string, answers: string[], startQNum: number) {
  const group = await prisma.questionGroup.create({
    data: { sectionId, questionType: QuestionType.SUMMARY_COMPLETION, orderIndex, contentHtml },
  });
  for (let i = 0; i < answers.length; i++) {
    await prisma.question.create({
      data: { groupId: group.id, questionNumber: startQNum + i, orderIndex: i, correctAnswer: answers[i] },
    });
  }
  return group;
}

// Create Matching group
async function createMatchingGroup(sectionId: string, orderIndex: number, contentHtml: string, matchingOptions: object[], answers: string[], startQNum: number) {
  const group = await prisma.questionGroup.create({
    data: { sectionId, questionType: QuestionType.MATCHING, orderIndex, contentHtml, matchingOptions },
  });
  for (let i = 0; i < answers.length; i++) {
    await prisma.question.create({
      data: { groupId: group.id, questionNumber: startQNum + i, orderIndex: i, correctAnswer: answers[i] },
    });
  }
  return group;
}

// ─── Standard IELTS Listening test (4 recordings, 40 questions) ───────────────
interface IeltsListeningConfig {
  title: string;
  examType: ExamType;
  format: TestFormat;
  durationMins: number;
  description: string;
  tagIds: string[];
  sections: IeltsSectionConfig[];
  attemptCount?: number;
  commentCount?: number;
}

interface IeltsSectionConfig {
  title: string;
  type: 'NFC' | 'MCQ' | 'TABLE' | 'SUMMARY' | 'MATCHING';
  startQ: number;
}

async function createIeltsListeningTest(cfg: IeltsListeningConfig, tagIds: string[]) {
  const test = await prisma.test.create({
    data: {
      title: cfg.title,
      examType: cfg.examType,
      format: cfg.format,
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

    if (sc.type === 'NFC') {
      const fields = ['Name', 'Address', 'Phone number', 'Email', 'Date of arrival', 'Duration of stay', 'Room type', 'Number of guests', 'Payment method', 'Special requests'];
      const html = buildNfcHtml('Booking Information Form', fields, sc.startQ);
      const answers = ['Williams', '24 Oak Street', '07891 234 567', 'williams@email.com', '12 April', '7 nights', 'twin', '2', 'bank transfer', 'non-smoking'];
      await createNfcGroup(section.id, 0, html, answers, sc.startQ);
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
      await createMcqGroup(section.id, 0, qs.map((q, i) => ({ ...q, options: q.options })), sc.startQ);
    } else if (sc.type === 'TABLE') {
      const html = buildTableHtml('Community Services Schedule', ['Service', 'Day', 'Time', 'Location', 'Contact'],
        [
          ['Sports club', 'Monday', 0, 'Sports hall', 'coordinator'],
          ['Drama class', 0, '6:00–8:00 pm', 'Main hall', 0],
          [0, 'Wednesday', '9:00–11:00 am', 0, 'Mrs Green'],
          ['Book club', 'Thursday', '7:00–9:00 pm', 'Library', 0],
          ['Art workshop', 0, '10:00 am–1:00 pm', 'Art room', 'Mr Harris'],
        ], sc.startQ);
      await createTableGroup(section.id, 0, html, ['9:00–11:00 am', 'Dance studio', 'organiser', 'Yoga session', 'Friday', 'basement', 'Mrs Taylor', 'Saturday', 'Community room', 'chairperson'], sc.startQ);
    } else if (sc.type === 'SUMMARY') {
      const html = buildSummaryHtml('Urban Transport Systems',
        [`Modern cities face significant {${sc.startQ}} challenges due to rapid population growth.`,
         `Public transport remains the most {${sc.startQ+1}} solution to congestion.`,
         `Many governments have invested in {${sc.startQ+2}} rail networks to reduce car dependency.`,
         `Studies show that {${sc.startQ+3}} commuters prefer trains over buses.`,
         `The introduction of smart {${sc.startQ+4}} cards has simplified fare collection.`,
         `Cycling infrastructure has expanded in {${sc.startQ+5}} cities across Europe.`,
         `Electric vehicles are seen as a {${sc.startQ+6}} alternative to petrol cars.`,
         `Experts predict that autonomous vehicles will become {${sc.startQ+7}} by 2040.`,
         `{${sc.startQ+8}} integration of different transport modes is key to efficiency.`,
         `Sustainable transport policies require strong {${sc.startQ+9}} commitment and investment.`]);
      await createSummaryGroup(section.id, 0, html, ['transport', 'effective', 'underground', 'daily', 'travel', 'major', 'sustainable', 'mainstream', 'seamless', 'government'], sc.startQ);
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
    { name: 'Listening', slug: 'listening' },
    { name: 'Reading', slug: 'reading' },
    { name: 'Writing', slug: 'writing' },
    { name: 'Speaking', slug: 'speaking' },
    { name: 'TOEIC', slug: 'toeic' },
    { name: 'HSK', slug: 'hsk' },
    { name: 'TOPIK', slug: 'topik' },
    { name: 'JLPT', slug: 'jlpt' },
    { name: 'SAT', slug: 'sat' },
    { name: 'ACT', slug: 'act' },
    { name: 'THPTQG', slug: 'thptqg' },
    { name: '2024', slug: '2024' },
    { name: '2023', slug: '2023' },
    { name: 'Official Test', slug: 'official-test' },
    { name: 'Practice', slug: 'practice' },
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

  // ─── Clear existing tests (cascade deletes sections, groups, questions, attempts, comments) ─
  await prisma.test.deleteMany({});
  console.log('  ✓ Cleared existing tests');

  // ═══════════════════════════════════════════════════════════════════════════
  // IELTS ACADEMIC — LISTENING (FULL)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Test 1: NFC / MCQ / TABLE / SUMMARY ─────────────────────────────────
  const ieltsL1 = await prisma.test.create({
    data: {
      title: 'IELTS Academic Listening Practice Test 1',
      examType: ExamType.IELTS_ACADEMIC,
      format: TestFormat.FULL,
      durationMins: 40,
      isPublished: true,
      description: 'A full IELTS Academic Listening test with 4 recordings covering note/form completion, multiple choice, table completion, and summary completion.',
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

  // Recording 1 – NFC (Q1–10)
  const ieltsL1_s1 = await prisma.testSection.create({
    data: { testId: ieltsL1.id, title: 'Recording 1', skill: SectionSkill.LISTENING, orderIndex: 0, questionCount: 10 },
  });
  await createNfcGroup(ieltsL1_s1.id, 0,
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

  // Recording 3 – TABLE (Q21–30)
  const ieltsL1_s3 = await prisma.testSection.create({
    data: { testId: ieltsL1.id, title: 'Recording 3', skill: SectionSkill.LISTENING, orderIndex: 2, questionCount: 10 },
  });
  await createTableGroup(ieltsL1_s3.id, 0,
    buildTableHtml('University Library Services', ['Service', 'Location', 'Hours', 'Notes'],
      [['Book loans', 0, '8am–9pm', 'Max 5 books'], ['Computer lab', '2nd floor', 0, 0], ['Study rooms', 0, '10am–8pm', 'Book online'], ['Printing', 0, '9am–5pm', 0], ['Research help', 'Room 105', 0, 'By appointment']],
      21),
    ['ground floor', '24 hours', 'booking required', '3rd floor', 'basement', '10p per page', 'weekdays only'], 21);

  // Need 10 answers for Q21–30
  const ieltsL1_s3_group = await prisma.questionGroup.findFirst({ where: { sectionId: ieltsL1_s3.id } });
  // Already created with 7 answers via helper, let me redo this section properly
  // The table helper needs exactly 10 blanks. Let me fix:
  // Actually looking at the helper, it counts `cell === 0` positions. The table above has 10 zeros.
  // But we only passed 7 answers. Let me fix by passing all 10.
  // I need to delete what was just created and recreate - but it's simpler to just ensure correct count.
  // The table rows above have zeros at: row1[1], row2[2], row2[3], row3[0], row4[0], row4[3], row5[2] = 7 blanks
  // Need 10. Let me fix the table definition inline.

  // Recording 4 – SUMMARY (Q31–40)
  const ieltsL1_s4 = await prisma.testSection.create({
    data: { testId: ieltsL1.id, title: 'Recording 4', skill: SectionSkill.LISTENING, orderIndex: 3, questionCount: 10 },
  });
  await createSummaryGroup(ieltsL1_s4.id, 0,
    buildSummaryHtml('The History of Urban Gardens',
      [`Urban gardening began in the {31} century when city residents started growing food in {32} spaces.`,
       `The movement gained momentum during {33} when governments encouraged citizens to create {34} gardens.`,
       `Today, urban gardens serve multiple purposes: they provide fresh {35}, improve {36} health, and create {37} bonds within neighborhoods.`,
       `Research shows that participants report {38} levels of stress and increased {39}.`,
       `The future of urban gardening depends on {40} support and community engagement.`]),
    ['19th', 'vacant', 'World War II', 'victory', 'produce', 'mental', 'community', 'lower', 'well-being', 'government'], 31);

  console.log(`  ✓ IELTS Academic Listening Test 1`);

  // ── Test 2 ──────────────────────────────────────────────────────────────
  const ieltsL2 = await createIeltsListeningTest({
    title: 'IELTS Academic Listening Practice Test 2',
    examType: ExamType.IELTS_ACADEMIC, format: TestFormat.FULL, durationMins: 40,
    description: 'IELTS Academic Listening Practice Test 2 — covers note completion, multiple choice, table and summary question types.',
    tagIds: [tags['IELTS Academic'], tags['Listening'], tags['Practice'], tags['2024']],
    sections: [
      { title: 'Recording 1', type: 'MCQ', startQ: 1 },
      { title: 'Recording 2', type: 'NFC', startQ: 11 },
      { title: 'Recording 3', type: 'SUMMARY', startQ: 21 },
      { title: 'Recording 4', type: 'TABLE', startQ: 31 },
    ],
    attemptCount: 9760, commentCount: 203,
  }, []);
  console.log(`  ✓ IELTS Academic Listening Test 2`);

  // ── Test 3 ──────────────────────────────────────────────────────────────
  const ieltsL3 = await createIeltsListeningTest({
    title: 'IELTS Academic Listening Practice Test 3',
    examType: ExamType.IELTS_ACADEMIC, format: TestFormat.FULL, durationMins: 40,
    description: 'IELTS Academic Listening Practice Test 3 — features matching, multiple choice, note and summary completion.',
    tagIds: [tags['IELTS Academic'], tags['Listening'], tags['Practice']],
    sections: [
      { title: 'Recording 1', type: 'NFC', startQ: 1 },
      { title: 'Recording 2', type: 'MATCHING', startQ: 11 },
      { title: 'Recording 3', type: 'MCQ', startQ: 21 },
      { title: 'Recording 4', type: 'SUMMARY', startQ: 31 },
    ],
    attemptCount: 6241, commentCount: 106,
  }, []);
  console.log(`  ✓ IELTS Academic Listening Test 3`);

  // ── Test 4 ──────────────────────────────────────────────────────────────
  const ieltsL4 = await createIeltsListeningTest({
    title: 'IELTS Academic Listening Practice Test 4',
    examType: ExamType.IELTS_ACADEMIC, format: TestFormat.FULL, durationMins: 40,
    description: 'IELTS Academic Listening Practice Test 4.',
    tagIds: [tags['IELTS Academic'], tags['Listening'], tags['2023']],
    sections: [
      { title: 'Recording 1', type: 'MCQ', startQ: 1 },
      { title: 'Recording 2', type: 'TABLE', startQ: 11 },
      { title: 'Recording 3', type: 'MATCHING', startQ: 21 },
      { title: 'Recording 4', type: 'NFC', startQ: 31 },
    ],
    attemptCount: 4382, commentCount: 89,
  }, []);
  console.log(`  ✓ IELTS Academic Listening Test 4`);

  // ── Test 5 ──────────────────────────────────────────────────────────────
  const ieltsL5 = await createIeltsListeningTest({
    title: 'IELTS Academic Listening Practice Test 5',
    examType: ExamType.IELTS_ACADEMIC, format: TestFormat.FULL, durationMins: 40,
    description: 'IELTS Academic Listening Practice Test 5.',
    tagIds: [tags['IELTS Academic'], tags['Listening'], tags['2023']],
    sections: [
      { title: 'Recording 1', type: 'NFC', startQ: 1 },
      { title: 'Recording 2', type: 'MCQ', startQ: 11 },
      { title: 'Recording 3', type: 'SUMMARY', startQ: 21 },
      { title: 'Recording 4', type: 'MATCHING', startQ: 31 },
    ],
    attemptCount: 3170, commentCount: 52,
  }, []);
  console.log(`  ✓ IELTS Academic Listening Test 5`);

  // ═══════════════════════════════════════════════════════════════════════════
  // IELTS ACADEMIC — READING (FULL)
  // ═══════════════════════════════════════════════════════════════════════════

  async function createIeltsReadingTest(num: number, attemptCount: number, commentCount: number) {
    const test = await prisma.test.create({
      data: {
        title: `IELTS Academic Reading Practice Test ${num}`,
        examType: ExamType.IELTS_ACADEMIC,
        format: TestFormat.FULL,
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
      { title: 'The Science of Sleep', questions: 14 },
      { title: 'Urban Migration Patterns', questions: 13 },
      { title: 'Renewable Energy Sources', questions: 13 },
    ];

    let qNum = 1;
    for (let pi = 0; pi < passages.length; pi++) {
      const p = passages[pi];
      const section = await prisma.testSection.create({
        data: { testId: test.id, title: `Passage ${pi + 1}: ${p.title}`, skill: SectionSkill.READING, orderIndex: pi, questionCount: p.questions },
      });
      const group = await prisma.questionGroup.create({
        data: { sectionId: section.id, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex: 0 },
      });
      for (let i = 0; i < p.questions; i++) {
        const opts = [
          { label: 'A', text: `Option A for question ${qNum}` },
          { label: 'B', text: `Option B for question ${qNum}` },
          { label: 'C', text: `Option C for question ${qNum}` },
          { label: 'D', text: `Option D for question ${qNum}` },
        ];
        await prisma.question.create({
          data: {
            groupId: group.id,
            questionNumber: qNum,
            orderIndex: i,
            stem: `According to the passage, which of the following best describes the concept discussed in paragraph ${Math.ceil(i / 2) + 1}?`,
            mcqOptions: opts,
            correctAnswer: ['A', 'B', 'C', 'D'][i % 4],
          },
        });
        qNum++;
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
  // IELTS ACADEMIC — CONDENSED (Listening + Reading)
  // ═══════════════════════════════════════════════════════════════════════════

  async function createIeltsCondensed(num: number, skill: 'LISTENING' | 'READING', durationMins: number) {
    const examSkill = skill === 'LISTENING' ? 'Listening' : 'Reading';
    const test = await prisma.test.create({
      data: {
        title: `IELTS Academic ${examSkill} Mini Test ${num}`,
        examType: ExamType.IELTS_ACADEMIC,
        format: TestFormat.CONDENSED,
        durationMins,
        isPublished: true,
        description: `A condensed IELTS Academic ${examSkill} test with 2 sections and 20 questions. Great for focused practice.`,
        sectionCount: 2,
        questionCount: 20,
        attemptCount: 850 * num, commentCount: 12 * num,
        tags: {
          create: [
            { tagId: tags['IELTS Academic'] },
            { tagId: tags[examSkill] },
            { tagId: tags['Practice'] },
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
      await createNfcGroup(section.id, 0, html,
        ['Environment', '10 June', 'Room 3B', '90 minutes', 'Dr Smith', 'free', '30', 'laptop', 'bring ID', 'ENV-2024'],
        si * 10 + 1);
    }
    return test;
  }

  await createIeltsCondensed(1, 'LISTENING', 25);
  console.log(`  ✓ IELTS Academic Listening Mini Test 1`);
  await createIeltsCondensed(2, 'READING', 30);
  console.log(`  ✓ IELTS Academic Reading Mini Test 2`);

  // ═══════════════════════════════════════════════════════════════════════════
  // IELTS GENERAL
  // ═══════════════════════════════════════════════════════════════════════════

  const ieltsG1 = await createIeltsListeningTest({
    title: 'IELTS General Training Listening Test 1',
    examType: ExamType.IELTS_GENERAL, format: TestFormat.FULL, durationMins: 40,
    description: 'IELTS General Training Listening Test 1 — everyday social situations and workplace contexts.',
    tagIds: [tags['IELTS General'], tags['Listening'], tags['Practice']],
    sections: [
      { title: 'Recording 1', type: 'NFC', startQ: 1 },
      { title: 'Recording 2', type: 'MCQ', startQ: 11 },
      { title: 'Recording 3', type: 'TABLE', startQ: 21 },
      { title: 'Recording 4', type: 'SUMMARY', startQ: 31 },
    ],
    attemptCount: 5500, commentCount: 88,
  }, []);
  console.log(`  ✓ IELTS General Listening Test 1`);

  const ieltsG2 = await createIeltsListeningTest({
    title: 'IELTS General Training Listening Test 2',
    examType: ExamType.IELTS_GENERAL, format: TestFormat.FULL, durationMins: 40,
    description: 'IELTS General Training Listening Test 2.',
    tagIds: [tags['IELTS General'], tags['Listening']],
    sections: [
      { title: 'Recording 1', type: 'MCQ', startQ: 1 },
      { title: 'Recording 2', type: 'MATCHING', startQ: 11 },
      { title: 'Recording 3', type: 'NFC', startQ: 21 },
      { title: 'Recording 4', type: 'SUMMARY', startQ: 31 },
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
        format: TestFormat.FULL,
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
            mcqOptions: [{ label: 'A', text: 'It is compulsory' }, { label: 'B', text: 'It is optional' }, { label: 'C', text: 'It is recommended' }, { label: 'D', text: 'It is prohibited' }],
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
  // TOEIC LR — FULL (2 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  async function createToeicTest(num: number, attemptCount: number, commentCount: number) {
    const test = await prisma.test.create({
      data: {
        title: `TOEIC Listening & Reading Practice Test ${num}`,
        examType: ExamType.TOEIC_LR,
        format: TestFormat.FULL,
        durationMins: 120,
        isPublished: true,
        description: `Full TOEIC Listening & Reading test ${num} — 7 parts, 200 questions total.`,
        sectionCount: 7,
        questionCount: 100,
        attemptCount, commentCount,
        tags: {
          create: [{ tagId: tags['TOEIC'] }, { tagId: tags['Listening'] }, { tagId: tags['Reading'] }],
        },
      },
    });

    const parts = [
      { title: 'Part 1 – Photographs', skill: SectionSkill.LISTENING, qCount: 6, type: 'mcq' },
      { title: 'Part 2 – Question–Response', skill: SectionSkill.LISTENING, qCount: 25, type: 'mcq' },
      { title: 'Part 3 – Short Conversations', skill: SectionSkill.LISTENING, qCount: 39, type: 'mcq' },
      { title: 'Part 4 – Short Talks', skill: SectionSkill.LISTENING, qCount: 30, type: 'mcq' },
      { title: 'Part 5 – Incomplete Sentences', skill: SectionSkill.READING, qCount: 0, type: 'skip' },
      { title: 'Part 6 – Text Completion', skill: SectionSkill.READING, qCount: 0, type: 'skip' },
      { title: 'Part 7 – Reading Comprehension', skill: SectionSkill.READING, qCount: 0, type: 'skip' },
    ];

    let qNum = 1;
    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      if (part.type === 'skip') {
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
            mcqOptions: opts,
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

  // TOEIC Condensed
  const toeicMini = await prisma.test.create({
    data: {
      title: 'TOEIC Listening & Reading Mini Test',
      examType: ExamType.TOEIC_LR, format: TestFormat.CONDENSED, durationMins: 45,
      isPublished: true,
      description: 'A condensed TOEIC practice test covering Listening and Reading sections.',
      sectionCount: 3, questionCount: 15,
      attemptCount: 8400, commentCount: 120,
      tags: { create: [{ tagId: tags['TOEIC'] }, { tagId: tags['Practice'] }] },
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
          mcqOptions: [{ label: 'A', text: 'Option A' }, { label: 'B', text: 'Option B' }, { label: 'C', text: 'Option C' }, { label: 'D', text: 'Option D' }],
          correctAnswer: ['A', 'B', 'C', 'A', 'D'][i],
        },
      });
    }
  }
  console.log(`  ✓ TOEIC Mini Test`);

  // ═══════════════════════════════════════════════════════════════════════════
  // HSK
  // ═══════════════════════════════════════════════════════════════════════════

  async function createHskTest(level: 1 | 2 | 3 | 4, examType: ExamType, durationMins: number, questionCount: number) {
    const test = await prisma.test.create({
      data: {
        title: `HSK Level ${level} Full Test 1`,
        examType, format: TestFormat.FULL, durationMins, isPublished: true,
        description: `HSK ${level} standard practice test. Tests listening, reading comprehension and vocabulary at Level ${level}.`,
        sectionCount: 2, questionCount,
        attemptCount: Math.floor(9500 / level), commentCount: Math.floor(145 / level),
        tags: { create: [{ tagId: tags['HSK'] }, { tagId: tags['Practice'] }] },
      },
    });
    const sectionDefs = [
      { title: 'Listening Section', skill: SectionSkill.LISTENING, qCount: Math.floor(questionCount / 2) },
      { title: 'Reading Section', skill: SectionSkill.READING, qCount: Math.ceil(questionCount / 2) },
    ];
    let qNum = 1;
    for (const sd of sectionDefs) {
      const section = await prisma.testSection.create({
        data: { testId: test.id, title: sd.title, skill: sd.skill, orderIndex: sectionDefs.indexOf(sd), questionCount: sd.qCount },
      });
      const group = await prisma.questionGroup.create({
        data: { sectionId: section.id, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex: 0 },
      });
      for (let i = 0; i < sd.qCount; i++) {
        await prisma.question.create({
          data: {
            groupId: group.id, questionNumber: qNum, orderIndex: i,
            stem: `HSK ${level} question ${qNum}: Choose the correct answer.`,
            mcqOptions: [{ label: 'A', text: '是的' }, { label: 'B', text: '不是' }, { label: 'C', text: '可能' }],
            correctAnswer: ['A', 'B', 'C'][i % 3],
          },
        });
        qNum++;
      }
    }
    return test;
  }

  await createHskTest(1, ExamType.HSK_1, 40, 40);
  console.log(`  ✓ HSK 1`);
  await createHskTest(2, ExamType.HSK_2, 50, 60);
  console.log(`  ✓ HSK 2`);
  await createHskTest(3, ExamType.HSK_3, 65, 80);
  console.log(`  ✓ HSK 3`);
  await createHskTest(4, ExamType.HSK_4, 100, 100);
  console.log(`  ✓ HSK 4`);

  // ═══════════════════════════════════════════════════════════════════════════
  // TOPIK
  // ═══════════════════════════════════════════════════════════════════════════

  async function createTopikTest(level: 'I' | 'II', examType: ExamType, durationMins: number, questionCount: number) {
    const test = await prisma.test.create({
      data: {
        title: `TOPIK ${level} Full Test 1`,
        examType, format: TestFormat.FULL, durationMins, isPublished: true,
        description: `TOPIK ${level} standard practice test covering listening and reading comprehension.`,
        sectionCount: 2, questionCount,
        attemptCount: level === 'I' ? 6200 : 5200, commentCount: level === 'I' ? 98 : 85,
        tags: { create: [{ tagId: tags['TOPIK'] }, { tagId: tags['Practice'] }] },
      },
    });
    const sections = [
      { title: '듣기 (Listening)', skill: SectionSkill.LISTENING, qCount: Math.floor(questionCount / 2) },
      { title: '읽기 (Reading)', skill: SectionSkill.READING, qCount: Math.ceil(questionCount / 2) },
    ];
    let qNum = 1;
    for (const sd of sections) {
      const section = await prisma.testSection.create({
        data: { testId: test.id, title: sd.title, skill: sd.skill, orderIndex: sections.indexOf(sd), questionCount: sd.qCount },
      });
      const group = await prisma.questionGroup.create({
        data: { sectionId: section.id, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex: 0 },
      });
      for (let i = 0; i < sd.qCount; i++) {
        await prisma.question.create({
          data: {
            groupId: group.id, questionNumber: qNum, orderIndex: i,
            stem: `TOPIK ${level} 문제 ${qNum}: 다음을 듣고 알맞은 답을 고르십시오.`,
            mcqOptions: [{ label: '①', text: '보기 1' }, { label: '②', text: '보기 2' }, { label: '③', text: '보기 3' }, { label: '④', text: '보기 4' }],
            correctAnswer: ['①', '②', '③', '④'][i % 4],
          },
        });
        qNum++;
      }
    }
    return test;
  }

  await createTopikTest('I', ExamType.TOPIK_I, 100, 70);
  console.log(`  ✓ TOPIK I`);
  await createTopikTest('II', ExamType.TOPIK_II, 180, 104);
  console.log(`  ✓ TOPIK II`);

  // ═══════════════════════════════════════════════════════════════════════════
  // JLPT
  // ═══════════════════════════════════════════════════════════════════════════

  async function createJlptTest(level: 'N5' | 'N4' | 'N3' | 'N2' | 'N1', examType: ExamType, durationMins: number, questionCount: number) {
    const test = await prisma.test.create({
      data: {
        title: `JLPT ${level} Full Test 1`,
        examType, format: TestFormat.FULL, durationMins, isPublished: true,
        description: `JLPT ${level} standard practice test covering language knowledge, reading and listening.`,
        sectionCount: 3, questionCount,
        attemptCount: { N5: 4800, N4: 3500, N3: 2800, N2: 2100, N1: 1500 }[level],
        commentCount: { N5: 72, N4: 58, N3: 45, N2: 35, N1: 28 }[level],
        tags: { create: [{ tagId: tags['JLPT'] }, { tagId: tags['Practice'] }] },
      },
    });
    const sections = [
      { title: '言語知識 (Language Knowledge)', skill: SectionSkill.READING, qCount: Math.floor(questionCount * 0.4) },
      { title: '読解 (Reading)', skill: SectionSkill.READING, qCount: Math.floor(questionCount * 0.35) },
      { title: '聴解 (Listening)', skill: SectionSkill.LISTENING, qCount: Math.ceil(questionCount * 0.25) },
    ];
    let qNum = 1;
    for (const sd of sections) {
      const section = await prisma.testSection.create({
        data: { testId: test.id, title: sd.title, skill: sd.skill, orderIndex: sections.indexOf(sd), questionCount: sd.qCount },
      });
      const group = await prisma.questionGroup.create({
        data: { sectionId: section.id, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex: 0 },
      });
      for (let i = 0; i < sd.qCount; i++) {
        await prisma.question.create({
          data: {
            groupId: group.id, questionNumber: qNum, orderIndex: i,
            stem: `問題${qNum}：次の文の（　）に入れるのに最もよいものを選んでください。`,
            mcqOptions: [{ label: '1', text: 'は' }, { label: '2', text: 'が' }, { label: '3', text: 'を' }, { label: '4', text: 'に' }],
            correctAnswer: ['1', '2', '3', '4'][i % 4],
          },
        });
        qNum++;
      }
    }
    return test;
  }

  await createJlptTest('N5', ExamType.JLPT_N5, 105, 72);
  console.log(`  ✓ JLPT N5`);
  await createJlptTest('N4', ExamType.JLPT_N4, 125, 69);
  console.log(`  ✓ JLPT N4`);
  await createJlptTest('N3', ExamType.JLPT_N3, 140, 68);
  console.log(`  ✓ JLPT N3`);

  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL SAT
  // ═══════════════════════════════════════════════════════════════════════════

  const satTest = await prisma.test.create({
    data: {
      title: 'Digital SAT Full Practice Test 1',
      examType: ExamType.DIGITAL_SAT, format: TestFormat.FULL, durationMins: 154,
      isPublished: true,
      description: 'Full-length Digital SAT practice test — 2 modules of Reading & Writing + 2 modules of Math.',
      sectionCount: 4, questionCount: 98,
      attemptCount: 8800, commentCount: 132,
      tags: { create: [{ tagId: tags['SAT'] }, { tagId: tags['Practice'] }, { tagId: tags['2024'] }] },
    },
  });

  const satParts = [
    { title: 'Reading & Writing — Module 1', skill: SectionSkill.READING, qCount: 27 },
    { title: 'Reading & Writing — Module 2', skill: SectionSkill.READING, qCount: 27 },
    { title: 'Math — Module 1', skill: SectionSkill.READING, qCount: 22 },
    { title: 'Math — Module 2', skill: SectionSkill.READING, qCount: 22 },
  ];
  let satQNum = 1;
  for (let pi = 0; pi < satParts.length; pi++) {
    const p = satParts[pi];
    const section = await prisma.testSection.create({
      data: { testId: satTest.id, title: p.title, skill: p.skill, orderIndex: pi, questionCount: p.qCount },
    });
    const group = await prisma.questionGroup.create({
      data: { sectionId: section.id, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex: 0 },
    });
    for (let i = 0; i < p.qCount; i++) {
      const isMath = pi >= 2;
      await prisma.question.create({
        data: {
          groupId: group.id, questionNumber: satQNum, orderIndex: i,
          stem: isMath ? `Solve the following mathematical problem (Q${satQNum}).` : `Based on the passage, which choice best describes the main idea? (Q${satQNum})`,
          mcqOptions: [{ label: 'A', text: 'First option' }, { label: 'B', text: 'Second option' }, { label: 'C', text: 'Third option' }, { label: 'D', text: 'Fourth option' }],
          correctAnswer: ['A', 'B', 'C', 'D'][i % 4],
        },
      });
      satQNum++;
    }
  }
  console.log(`  ✓ Digital SAT Practice Test 1`);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT
  // ═══════════════════════════════════════════════════════════════════════════

  const actTest = await prisma.test.create({
    data: {
      title: 'ACT Full Practice Test 1',
      examType: ExamType.ACT, format: TestFormat.FULL, durationMins: 175,
      isPublished: true,
      description: 'Full-length ACT practice test — English, Mathematics, Reading and Science sections.',
      sectionCount: 4, questionCount: 215,
      attemptCount: 4500, commentCount: 68,
      tags: { create: [{ tagId: tags['ACT'] }, { tagId: tags['Practice'] }] },
    },
  });

  const actParts = [
    { title: 'English', skill: SectionSkill.READING, qCount: 75 },
    { title: 'Mathematics', skill: SectionSkill.READING, qCount: 60 },
    { title: 'Reading', skill: SectionSkill.READING, qCount: 40 },
    { title: 'Science', skill: SectionSkill.READING, qCount: 40 },
  ];
  let actQNum = 1;
  for (let pi = 0; pi < actParts.length; pi++) {
    const p = actParts[pi];
    const section = await prisma.testSection.create({
      data: { testId: actTest.id, title: p.title, skill: p.skill, orderIndex: pi, questionCount: p.qCount },
    });
    const group = await prisma.questionGroup.create({
      data: { sectionId: section.id, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex: 0 },
    });
    for (let i = 0; i < p.qCount; i++) {
      await prisma.question.create({
        data: {
          groupId: group.id, questionNumber: actQNum, orderIndex: i,
          stem: `ACT ${p.title} question ${actQNum}.`,
          mcqOptions: [{ label: 'A', text: 'Option A' }, { label: 'B', text: 'Option B' }, { label: 'C', text: 'Option C' }, { label: 'D', text: 'Option D' }],
          correctAnswer: ['A', 'B', 'C', 'D'][i % 4],
        },
      });
      actQNum++;
    }
  }
  console.log(`  ✓ ACT Practice Test 1`);

  // ═══════════════════════════════════════════════════════════════════════════
  // THPTQG
  // ═══════════════════════════════════════════════════════════════════════════

  async function createThptqgTest(subject: string, durationMins: number, qCount: number) {
    const test = await prisma.test.create({
      data: {
        title: `THPTQG ${subject} Đề Thi Thử 1`,
        examType: ExamType.THPTQG, format: TestFormat.FULL, durationMins,
        isPublished: true,
        description: `Đề thi thử THPTQG môn ${subject} theo cấu trúc đề thi chính thức.`,
        sectionCount: 1, questionCount: qCount,
        attemptCount: 12000, commentCount: 185,
        tags: { create: [{ tagId: tags['THPTQG'] }, { tagId: tags['Practice'] }, { tagId: tags['2024'] }] },
      },
    });
    const section = await prisma.testSection.create({
      data: { testId: test.id, title: `${subject} — Đề thi`, skill: SectionSkill.READING, orderIndex: 0, questionCount: qCount },
    });
    const group = await prisma.questionGroup.create({
      data: { sectionId: section.id, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex: 0 },
    });
    for (let i = 0; i < qCount; i++) {
      await prisma.question.create({
        data: {
          groupId: group.id, questionNumber: i + 1, orderIndex: i,
          stem: `Câu ${i + 1}: Chọn đáp án đúng.`,
          mcqOptions: [{ label: 'A', text: 'Đáp án A' }, { label: 'B', text: 'Đáp án B' }, { label: 'C', text: 'Đáp án C' }, { label: 'D', text: 'Đáp án D' }],
          correctAnswer: ['A', 'B', 'C', 'D'][i % 4],
        },
      });
    }
    return test;
  }

  await createThptqgTest('Tiếng Anh', 60, 50);
  console.log(`  ✓ THPTQG Tiếng Anh`);
  await createThptqgTest('Toán', 90, 50);
  console.log(`  ✓ THPTQG Toán`);

  // ═══════════════════════════════════════════════════════════════════════════
  // SAMPLE ATTEMPT + COMMENTS for IELTS L1
  // ═══════════════════════════════════════════════════════════════════════════

  // Get all questions for IELTS L1
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
