/**
 * seed-bundles.ts — seeds 2 IELTS Academic bundles, each with 2 full tests
 *
 * Run: npx ts-node prisma/seed-bundles.ts
 */

import { PrismaClient, ExamType, SectionSkill, QuestionType } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function mcqGroup(sectionId: string, orderIndex: number, qs: { stem: string; opts: [string, string, string] | [string, string, string, string]; answer: string }[], startQ: number, instructions?: string) {
  const group = await prisma.questionGroup.create({ data: { sectionId, questionType: QuestionType.MULTIPLE_CHOICE, orderIndex, instructions } });
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    const labels = ['A', 'B', 'C', 'D'];
    await prisma.question.create({
      data: {
        groupId: group.id,
        questionNumber: startQ + i,
        orderIndex: i,
        stem: q.stem,
        options: q.opts.map((text, j) => ({ label: labels[j], text })),
        correctAnswer: q.answer,
      },
    });
  }
  return group;
}

async function noteCompletionGroup(sectionId: string, orderIndex: number, contentHtml: string, answers: string[], startQ: number) {
  const group = await prisma.questionGroup.create({ data: { sectionId, questionType: QuestionType.NOTE_COMPLETION, orderIndex, instructions: contentHtml } });
  for (let i = 0; i < answers.length; i++) {
    await prisma.question.create({ data: { groupId: group.id, questionNumber: startQ + i, orderIndex: i, correctAnswer: answers[i] } });
  }
}

async function summaryGroup(sectionId: string, orderIndex: number, contentHtml: string, answers: string[], startQ: number) {
  const group = await prisma.questionGroup.create({ data: { sectionId, questionType: QuestionType.SUMMARY_COMPLETION, orderIndex, instructions: contentHtml } });
  for (let i = 0; i < answers.length; i++) {
    await prisma.question.create({ data: { groupId: group.id, questionNumber: startQ + i, orderIndex: i, correctAnswer: answers[i] } });
  }
}

async function tfngGroup(sectionId: string, orderIndex: number, qs: { stem: string; answer: 'TRUE' | 'FALSE' | 'NOT GIVEN' }[], startQ: number, instructions?: string) {
  const group = await prisma.questionGroup.create({ data: { sectionId, questionType: QuestionType.TRUE_FALSE_NOT_GIVEN, orderIndex, instructions } });
  for (let i = 0; i < qs.length; i++) {
    await prisma.question.create({
      data: {
        groupId: group.id, questionNumber: startQ + i, orderIndex: i, stem: qs[i].stem,
        options: [{ label: 'TRUE', text: 'TRUE' }, { label: 'FALSE', text: 'FALSE' }, { label: 'NOT GIVEN', text: 'NOT GIVEN' }],
        correctAnswer: qs[i].answer,
      },
    });
  }
}

// ─── Test A: Listening Practice Test 2 ───────────────────────────────────────

async function createListeningTest2(tagIelts: string, tagListening: string, tagPractice: string) {
  const test = await prisma.test.create({
    data: {
      title: 'IELTS Academic Listening Practice Test 2',
      examType: ExamType.IELTS_ACADEMIC,
      durationMins: 40,
      isPublished: true,
      description: 'Full IELTS Academic Listening test — 4 recordings: sports centre membership, museum audio guide, tutorial on marine pollution, and a university lecture on cognitive load theory.',
      sectionCount: 4,
      questionCount: 40,
      attemptCount: 9340,
      commentCount: 218,
      tags: { create: [{ tagId: tagIelts }, { tagId: tagListening }, { tagId: tagPractice }] },
    },
  });

  // Section 1 — Recording 1: Sports Centre Membership (Note Completion, Q1–10)
  const s1 = await prisma.testSection.create({ data: { testId: test.id, title: 'Recording 1 – Sports Centre Membership', skill: SectionSkill.LISTENING, orderIndex: 0, questionCount: 10 } });
  await noteCompletionGroup(s1.id, 0, `
<h3 style="font-weight:700;margin-bottom:12px">Riverside Sports Centre — New Membership Form</h3>
<table style="border-collapse:collapse;width:100%">
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Member name:</td><td style="padding:6px 12px">{1}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Date of birth:</td><td style="padding:6px 12px">{2}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Contact number:</td><td style="padding:6px 12px">{3}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Email address:</td><td style="padding:6px 12px">{4}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Membership type:</td><td style="padding:6px 12px">{5}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Preferred facility:</td><td style="padding:6px 12px">{6}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Monthly fee:</td><td style="padding:6px 12px">{7}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Start date:</td><td style="padding:6px 12px">{8}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Emergency contact:</td><td style="padding:6px 12px">{9}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Payment method:</td><td style="padding:6px 12px">{10}</td></tr>
</table>`,
    ['Sarah Pemberton', '14 August 1995', '07823 441 906', 's.pemberton@webmail.co.uk', 'family annual', 'swimming pool', '$62', '1 February', 'Michael Pemberton', 'direct debit'], 1);

  // Section 2 — Recording 2: City Museum Audio Guide (MCQ, Q11–20)
  const s2 = await prisma.testSection.create({ data: { testId: test.id, title: 'Recording 2 – City Museum Audio Guide', skill: SectionSkill.LISTENING, orderIndex: 1, questionCount: 10 } });
  await mcqGroup(s2.id, 0, [
    { stem: 'The museum was originally built as', opts: ['a private residence', 'a government building', 'a commercial warehouse', 'a textile factory'], answer: 'A' },
    { stem: 'The Egyptian collection is located on the', opts: ['ground floor', 'first floor', 'second floor', 'third floor'], answer: 'B' },
    { stem: 'Which item in the Ancient Greece gallery is described as unique?', opts: ['a marble statue', 'a bronze helmet', 'a painted vase', 'a gold necklace'], answer: 'C' },
    { stem: 'The guided tours depart', opts: ['every hour on the hour', 'at 10 am and 2 pm only', 'twice in the morning', 'on demand if six or more visitors request one'], answer: 'A' },
    { stem: 'Entry to the temporary photography exhibition requires', opts: ['a separate ticket', 'an advance booking only', 'no additional payment', 'a valid student card'], answer: 'C' },
    { stem: 'The museum café closes at', opts: ['4:30 pm', '5:00 pm', '5:30 pm', '6:00 pm'], answer: 'B' },
    { stem: 'Which service is NOT available in the museum shop?', opts: ['gift wrapping', 'online ordering', 'currency exchange', 'book signing events'], answer: 'C' },
    { stem: 'The lecture series on Friday evenings focuses on', opts: ['local archaeology', 'international art movements', 'natural history', 'contemporary design'], answer: 'A' },
    { stem: 'Children under twelve must be accompanied because', opts: ['some exhibits contain sharp objects', 'the upper galleries have steep stairs', 'certain artworks depict adult themes', 'the building has restricted fire exits'], answer: 'B' },
    { stem: 'Visitors who wish to photograph exhibits must', opts: ['pay a daily photography licence', 'use cameras without flash only', 'obtain written permission in advance', 'sign a photography waiver at reception'], answer: 'B' },
  ], 11);

  // Section 3 — Recording 3: Tutorial – Marine Pollution (Table Completion, Q21–30)
  const s3 = await prisma.testSection.create({ data: { testId: test.id, title: 'Recording 3 – Tutorial: Marine Plastic Pollution', skill: SectionSkill.LISTENING, orderIndex: 2, questionCount: 10 } });
  await noteCompletionGroup(s3.id, 0, `
<h3 style="font-weight:700;margin-bottom:12px">Marine Plastic Pollution — Research Summary</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead><tr>
    <th style="border:1px solid #d1d5db;padding:8px;background:#f3f4f6">Source</th>
    <th style="border:1px solid #d1d5db;padding:8px;background:#f3f4f6">Type of plastic</th>
    <th style="border:1px solid #d1d5db;padding:8px;background:#f3f4f6">Impact</th>
    <th style="border:1px solid #d1d5db;padding:8px;background:#f3f4f6">Proposed solution</th>
  </tr></thead>
  <tbody>
    <tr><td style="border:1px solid #d1d5db;padding:8px">Rivers</td><td style="border:1px solid #d1d5db;padding:8px">{21}</td><td style="border:1px solid #d1d5db;padding:8px">ingested by fish</td><td style="border:1px solid #d1d5db;padding:8px">riparian filtration barriers</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:8px">Fishing industry</td><td style="border:1px solid #d1d5db;padding:8px">discarded nets</td><td style="border:1px solid #d1d5db;padding:8px">{22}</td><td style="border:1px solid #d1d5db;padding:8px">biodegradable net schemes</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:8px">{23}</td><td style="border:1px solid #d1d5db;padding:8px">cosmetic microbeads</td><td style="border:1px solid #d1d5db;padding:8px">absorbed into food chain</td><td style="border:1px solid #d1d5db;padding:8px">{24}</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:8px">Shipping</td><td style="border:1px solid #d1d5db;padding:8px">container spills</td><td style="border:1px solid #d1d5db;padding:8px">{25}</td><td style="border:1px solid #d1d5db;padding:8px">GPS tracking of spill sites</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:8px">Tourism</td><td style="border:1px solid #d1d5db;padding:8px">{26}</td><td style="border:1px solid #d1d5db;padding:8px">reef abrasion</td><td style="border:1px solid #d1d5db;padding:8px">beach clean-up legislation</td></tr>
  </tbody>
</table>
<br/>
<p><strong>Key statistics mentioned:</strong></p>
<ul style="line-height:2">
  <li>By 2050 there will be more plastic than {27} in the ocean by weight.</li>
  <li>The Great Pacific Garbage Patch covers approximately {28} square kilometres.</li>
  <li>Only {29}% of plastic produced globally is recycled.</li>
  <li>Microplastics have been found in human {30} samples.</li>
</ul>`,
    ['single-use packaging', 'entanglement of marine mammals', 'personal care industry', 'legislative microbead ban', 'coral reef degradation', 'single-use bottles', 'fish', '1.6 million', '9', 'blood'], 21);

  // Section 4 — Recording 4: Lecture – Cognitive Load Theory (Summary, Q31–40)
  const s4 = await prisma.testSection.create({ data: { testId: test.id, title: 'Recording 4 – Lecture: Cognitive Load Theory', skill: SectionSkill.LISTENING, orderIndex: 3, questionCount: 10 } });
  await summaryGroup(s4.id, 0, `
<h3 style="font-weight:700;margin-bottom:12px">Cognitive Load Theory — Lecture Notes</h3>
<p style="line-height:2">
  Cognitive Load Theory (CLT), developed by John Sweller in the {31}, proposes that the human working memory has a limited {32} for processing new information.
  CLT identifies three types of load: <em>intrinsic load</em>, which relates to the inherent {33} of the material; <em>extraneous load</em>, caused by poorly designed {34}; and <em>germane load</em>, which refers to the mental effort devoted to forming lasting {35}.
</p>
<p style="line-height:2">
  In educational settings, instructors can reduce extraneous load by eliminating {36} information from study materials.
  The <em>worked-example effect</em> shows that providing fully solved problems initially leads to faster {37} than asking students to solve problems independently from the outset.
  Similarly, the <em>split-attention effect</em> occurs when learners must mentally {38} two sources of information presented separately, which wastes cognitive resources.
</p>
<p style="line-height:2">
  Critics of CLT argue that the theory underestimates the role of {39} in determining optimal learning difficulty.
  Recent revisions acknowledge that as expertise grows, previously complex material creates less {40}, a phenomenon known as the expertise reversal effect.
</p>`,
    ['1980s', 'capacity', 'complexity', 'instructional materials', 'schemas', 'redundant', 'skill acquisition', 'integrate', 'prior knowledge', 'cognitive load'], 31);

  return test;
}

// ─── Test B: Reading Practice Test 2 ─────────────────────────────────────────

async function createReadingTest2(tagIelts: string, tagReading: string, tagPractice: string) {
  const test = await prisma.test.create({
    data: {
      title: 'IELTS Academic Reading Practice Test 2',
      examType: ExamType.IELTS_ACADEMIC,
      durationMins: 60,
      isPublished: true,
      description: 'IELTS Academic Reading Practice Test 2 — 3 passages: The History of Glass (14q), Bioelectric Medicine (13q), The Value of Urban Green Spaces (13q).',
      sectionCount: 3,
      questionCount: 40,
      attemptCount: 6821,
      commentCount: 145,
      tags: { create: [{ tagId: tagIelts }, { tagId: tagReading }, { tagId: tagPractice }] },
    },
  });

  // ── Passage 1: The History of Glass ──────────────────────────────────────
  const p1 = await prisma.testSection.create({ data: { testId: test.id, title: 'Passage 1: The History of Glass', skill: SectionSkill.READING, orderIndex: 0, questionCount: 14 } });
  await prisma.passage.create({
    data: {
      sectionId: p1.id, title: 'The History of Glass', orderIndex: 0,
      contentHtml: `
<h3>The History of Glass</h3>
<p><strong>A</strong> Few materials have shaped human civilisation as profoundly as glass. Its story begins not in a workshop but in nature: obsidian, a volcanic glass formed when lava cools rapidly, was among the first cutting tools fashioned by early humans. Fulgurite — glass created when lightning strikes sand — provided another naturally occurring form that prehistoric people encountered. Yet it was not until around 3500 BCE, in Mesopotamia and ancient Egypt, that humans first produced manufactured glass, initially as a glaze on ceramic vessels and stone beads.</p>
<p><strong>B</strong> The first hollow glass vessels emerged in Egypt around 1500 BCE, created through a labour-intensive technique called core-forming. Craftsmen wound molten glass around a clay or dung core, which was later scraped out once the glass cooled. These early containers were small, expensive, and reserved for the elite — holding perfumes, oils, and cosmetics. Their intricate coloured patterns, achieved by dragging a pointed tool through bands of applied glass threads, mark them as objects of extraordinary artisanal skill.</p>
<p><strong>C</strong> The most transformative development in glassmaking came in the first century BCE with the invention of glassblowing, most likely in the Syro-Palestinian region. By inserting a hollow iron blowpipe into molten glass and inflating it with breath, craftsmen could produce vessels of remarkable thinness and variety in a fraction of the time previously required. This innovation spread rapidly throughout the Roman Empire, democratising glass from a luxury item into a commodity accessible to ordinary households.</p>
<p><strong>D</strong> Roman glassmakers pushed the craft further still. The Portland Vase, dating to around 5–25 CE and now housed in the British Museum, represents the pinnacle of cameo glass technique: a layer of white glass was applied over a cobalt-blue base, then painstakingly carved to reveal mythological scenes in relief. Window glass, too, emerged during this period — cast rather than blown — allowing light into buildings while keeping out the elements, a functional application that would eventually reshape architecture across the ancient world.</p>
<p><strong>E</strong> Following the decline of Rome, the centre of glassmaking expertise migrated to Byzantium and the Islamic world. Islamic craftsmen perfected enamelling and gilding on glass, producing mosque lamps of breath-taking beauty. Venice, after acquiring glassworkers from the Byzantine capital Constantinople, established its own dominant tradition on the island of Murano from the thirteenth century onward. The Venetians guarded their techniques with extraordinary jealousy — craftsmen who shared trade secrets with outsiders risked imprisonment or death, while those who remained on Murano were granted noble status and other privileges.</p>
<p><strong>F</strong> The Industrial Revolution brought mechanisation to glassmaking, but the defining modern breakthrough arrived in 1959 when Sir Alastair Pilkington invented the float glass process. Molten glass is poured onto a bath of liquid tin, across which it spreads into a perfectly flat, fire-polished sheet. Float glass now accounts for the vast majority of architectural and automotive glass produced worldwide, and the fundamental process remains virtually unchanged more than six decades later.</p>`,
    },
  });

  // TFNG Q1–6
  await tfngGroup(p1.id, 0, [
    { stem: 'Obsidian was the first glass deliberately manufactured by humans.', answer: 'FALSE' },
    { stem: 'Core-formed glass vessels were mainly used by wealthy people in ancient Egypt.', answer: 'TRUE' },
    { stem: 'Glassblowing was invented in Rome and then spread to the Middle East.', answer: 'FALSE' },
    { stem: 'The Portland Vase is currently on display at the Louvre museum in Paris.', answer: 'FALSE' },
    { stem: 'Venetian glassmakers on Murano were given certain social advantages in return for secrecy.', answer: 'TRUE' },
    { stem: 'The float glass process was developed over a period of several decades.', answer: 'NOT GIVEN' },
  ], 1, 'Do the following statements agree with the information in the passage? Write TRUE, FALSE, or NOT GIVEN.');

  // MCQ Q7–10
  await mcqGroup(p1.id, 1, [
    { stem: 'What does the writer suggest about core-forming as a production method?', opts: ['It was simple enough for untrained workers.', 'It was extremely time-consuming.', 'It produced very fragile results.', 'It was originally developed in Mesopotamia.'], answer: 'B' },
    { stem: 'According to the passage, what was the main significance of glassblowing?', opts: ['It enabled the production of decorative cameo glass.', 'It made glass products available to more people.', 'It allowed Roman craftsmen to make window glass.', 'It spread the Roman Empire\'s influence more widely.'], answer: 'B' },
    { stem: 'What does the writer say about the Islamic glassmaking tradition?', opts: ['It was derived directly from Roman techniques.', 'It was later surpassed by Venetian craftsmen.', 'It produced notable decorative religious objects.', 'It declined after the fall of Byzantium.'], answer: 'C' },
    { stem: 'Which of the following best describes the float glass process?', opts: ['Glass is blown into flat moulds for uniformity.', 'Molten glass spreads across liquid tin to form flat sheets.', 'Glass is chemically treated to remove surface imperfections.', 'Thin glass layers are pressed together under high temperature.'], answer: 'B' },
  ], 7);

  // Summary Completion Q11–14
  await summaryGroup(p1.id, 2, `
<h3 style="font-weight:700;margin-bottom:12px">Complete the summary below. Choose NO MORE THAN TWO WORDS from the passage for each answer.</h3>
<p style="line-height:2">
  The earliest manufactured glass appeared as a {11} on ceramic objects. The invention of glassblowing, probably originating in the {12} region, allowed much faster production. In Venice, glassmakers were confined to the island of Murano and forbidden from revealing their {13}. The modern era of flat glass production was transformed by Alastair Pilkington's float glass process, in which molten glass is spread over a bath of liquid {14}.
</p>`,
    ['glaze', 'Syro-Palestinian', 'trade secrets', 'tin'], 11);

  // ── Passage 2: Bioelectric Medicine ──────────────────────────────────────
  const p2 = await prisma.testSection.create({ data: { testId: test.id, title: 'Passage 2: Bioelectric Medicine', skill: SectionSkill.READING, orderIndex: 1, questionCount: 13 } });
  await prisma.passage.create({
    data: {
      sectionId: p2.id, title: 'Bioelectric Medicine', orderIndex: 0,
      contentHtml: `
<h3>Bioelectric Medicine</h3>
<p><strong>A</strong> The human body runs on electricity. Every heartbeat, every muscular contraction, every thought depends on the precisely orchestrated movement of charged ions across cell membranes. For centuries, physicians could observe the consequences of electrical malfunction — seizures, arrhythmias, paralysis — but lacked the tools to intervene at this level. Bioelectric medicine is changing that, using precisely targeted electrical signals to treat conditions that have proved resistant to drugs.</p>
<p><strong>B</strong> The most established bioelectric therapy is the cardiac pacemaker, first successfully implanted in a human in 1958. Modern pacemakers are sophisticated devices that continuously monitor the heart's electrical activity and deliver corrective pulses only when needed. Deep brain stimulation (DBS), approved for Parkinson's disease in 2002, works on similar principles: electrodes implanted in specific brain structures deliver high-frequency electrical pulses that disrupt the abnormal neural firing patterns responsible for tremor and rigidity.</p>
<p><strong>C</strong> A more recent and arguably more transformative application targets the vagus nerve — the longest cranial nerve in the human body, running from the brainstem through the thorax to the abdomen. The vagus nerve is a primary conduit of the inflammatory reflex: signals travelling along it can suppress the immune system's production of cytokines, the proteins responsible for inflammation. By implanting a small device on the vagus nerve, researchers have achieved remission in patients with rheumatoid arthritis and Crohn's disease who had not responded to conventional medication.</p>
<p><strong>D</strong> The potential of bioelectric medicine extends beyond nerve stimulation. Researchers at the Tufts University have demonstrated that manipulating the bioelectric state of cells — altering their membrane voltage — can direct tissue regeneration in frogs with amputated limbs and even induce the regrowth of eyes in blind tadpoles. These findings suggest that the body contains a bioelectric blueprint that governs the shape and identity of its tissues, largely independent of genetic instructions.</p>
<p><strong>E</strong> Commercial development in this space is accelerating. In 2013, GlaxoSmithKline launched a dedicated bioelectronics research unit, announcing an ambition to develop "electroceuticals" — implantable devices that regulate the electrical activity of nerve fibres to treat disease. The term was coined partly to distinguish these interventions from traditional pharmaceuticals and to signal a new therapeutic paradigm. Critics, however, caution that the leap from laboratory findings in amphibians to clinical applications in humans involves enormous complexity, and that many current results may not replicate in mammalian nervous systems.</p>
<p><strong>F</strong> Alongside implantable devices, a parallel field of non-invasive bioelectric therapy is developing. Transcranial direct current stimulation (tDCS) uses a weak electrical current passed through scalp electrodes to modulate neuronal excitability. Studies have reported benefits for depression, chronic pain, and stroke rehabilitation. The simplicity and low cost of tDCS devices have led to a growing market of consumer headsets — a development that raises serious safety and ethical concerns among clinicians, who worry about unregulated self-experimentation.</p>`,
    },
  });

  // MCQ Q15–19
  await mcqGroup(p2.id, 0, [
    { stem: 'What does the writer say about cardiac pacemakers in paragraph B?', opts: ['They were the first bioelectric devices ever developed.', 'They only deliver pulses when the heart rate is consistently abnormal.', 'They permanently suppress the heart\'s natural electrical activity.', 'They are no longer considered leading bioelectric devices.'], answer: 'B' },
    { stem: 'How does vagus nerve stimulation reduce inflammation?', opts: ['It directly destroys the cytokines causing the immune response.', 'It raises the membrane voltage of immune cells.', 'It uses nerve signals to suppress cytokine production.', 'It redirects blood flow away from inflamed tissue.'], answer: 'C' },
    { stem: 'What is the significance of the Tufts University findings mentioned in paragraph D?', opts: ['They confirm that genetic instructions alone control body shape.', 'They demonstrate that electrical signals can guide tissue regrowth.', 'They show that bioelectric therapy is more effective than surgery.', 'They explain why humans cannot regenerate lost limbs.'], answer: 'B' },
    { stem: 'What concern do critics raise in paragraph E?', opts: ['Bioelectronics research is underfunded.', 'Electroceuticals are less safe than conventional pharmaceuticals.', 'Animal study results may not translate to human treatment.', 'GlaxoSmithKline holds a monopoly on the field.'], answer: 'C' },
    { stem: 'The writer\'s attitude to consumer tDCS headsets can best be described as', opts: ['enthusiastic but cautious.', 'strongly supportive.', 'largely indifferent.', 'implicitly concerned.'], answer: 'D' },
  ], 15);

  // TFNG Q20–24
  await tfngGroup(p2.id, 1, [
    { stem: 'Deep brain stimulation works by eliminating abnormal neural cells permanently.', answer: 'FALSE' },
    { stem: 'The vagus nerve connects the brain to several organs including the abdomen.', answer: 'TRUE' },
    { stem: 'Bioelectric manipulation has been used to restore sight in blind human patients.', answer: 'FALSE' },
    { stem: 'The word "electroceuticals" was created to differentiate this approach from drug-based treatment.', answer: 'TRUE' },
    { stem: 'The tDCS consumer market is currently regulated by an international health authority.', answer: 'NOT GIVEN' },
  ], 20, 'Do the following statements agree with the claims of the writer? Write TRUE, FALSE or NOT GIVEN.');

  // Summary Q25–27
  await summaryGroup(p2.id, 2, `
<h3 style="font-weight:700;margin-bottom:12px">Complete the summary. Use NO MORE THAN TWO WORDS from the passage.</h3>
<p style="line-height:2">
  Bioelectric medicine treats disease using targeted {25} rather than drugs. The vagus nerve acts as a key pathway in the {26}, allowing implanted devices to reduce inflammation in autoimmune conditions. A non-invasive alternative, {27}, passes a mild current through the scalp to adjust how active neurons are.
</p>`,
    ['electrical signals', 'inflammatory reflex', 'transcranial direct current stimulation'], 25);

  // ── Passage 3: The Value of Urban Green Spaces ────────────────────────────
  const p3 = await prisma.testSection.create({ data: { testId: test.id, title: 'Passage 3: The Value of Urban Green Spaces', skill: SectionSkill.READING, orderIndex: 2, questionCount: 13 } });
  await prisma.passage.create({
    data: {
      sectionId: p3.id, title: 'The Value of Urban Green Spaces', orderIndex: 0,
      contentHtml: `
<h3>The Value of Urban Green Spaces</h3>
<p><strong>A</strong> As the world's cities grow ever larger and denser, the question of whether to preserve and create green spaces within them has acquired fresh urgency. Parks, street trees, community gardens, and even small roadside planters have been shown to deliver a range of measurable benefits — environmental, physiological, psychological, and economic — that planners and policymakers are only beginning to fully account for.</p>
<p><strong>B</strong> On the environmental side, urban vegetation performs multiple services simultaneously. Trees absorb carbon dioxide and release oxygen, improving local air quality. Their canopies intercept rainfall, reducing the volume of water entering drainage systems and lowering the risk of urban flooding — an increasingly critical function as extreme weather events become more frequent. Research from the University of Manchester found that increasing tree cover in urban areas by 10 per cent could reduce surface water runoff by almost 6 per cent. Street trees also create shade that moderates the urban heat island effect, whereby cities absorb and retain heat due to their concentration of dark, impermeable surfaces.</p>
<p><strong>C</strong> The health benefits of green spaces are equally well-documented. A 2019 meta-analysis published in <em>The Lancet Planetary Health</em> examined data from over 100 studies across 20 countries and concluded that individuals living within 300 metres of a green space had significantly lower rates of type 2 diabetes, cardiovascular disease, and premature mortality. The mechanisms proposed include increased physical activity — people near parks walk more — reduced stress through restorative attention, and lower exposure to air pollutants.</p>
<p><strong>D</strong> The psychological dimension has attracted particular attention from researchers in environmental psychology. Studies employing neuroimaging have found that walks in natural settings reduce activity in the subgenual prefrontal cortex, a brain region associated with rumination — the repetitive, negative self-focused thinking associated with depression. Other research demonstrates that even brief exposure to nature — a window view of trees, or the presence of indoor plants — measurably reduces self-reported stress and improves performance on tasks requiring sustained concentration.</p>
<p><strong>E</strong> Green spaces also generate significant economic value, though this is among the most contested and difficult dimensions to quantify. Property values near parks are consistently higher than equivalent properties farther away: analyses in London, New York, and Melbourne have found premiums ranging from 6 to 17 per cent. Urban trees contribute to this effect but also reduce municipal costs through energy savings (buildings shaded by trees require less cooling) and prolonged road surface lifespan (tree cover slows pavement deterioration caused by thermal expansion).</p>
<p><strong>F</strong> Critics of green space provision point to the phenomenon of "green gentrification" — the process by which neighbourhood improvements, including park development, drive up property values and rents, ultimately displacing the lower-income residents who might have benefited most. Research in US cities found that new park developments were associated with rent increases of up to 8 per cent within 400 metres within five years. Addressing this tension requires deliberate policy intervention: participatory planning processes, affordable housing commitments, and community land trusts have all been proposed as mechanisms to ensure that environmental improvements are equitably shared.</p>`,
    },
  });

  // MCQ Q28–31
  await mcqGroup(p3.id, 0, [
    { stem: 'What does the University of Manchester research demonstrate?', opts: ['Urban trees reduce carbon dioxide by 10 per cent.', 'A moderate increase in tree cover noticeably decreases flooding risk.', 'Street trees are most effective in reducing industrial air pollution.', 'Urban heat islands form primarily because of a lack of rainfall.'], answer: 'B' },
    { stem: 'According to paragraph C, why might people living near parks have better health?', opts: ['Parks provide cleaner drinking water sources.', 'They tend to exercise more and experience less stress.', 'They are socially more active within their communities.', 'Parks reduce the risk of communicable diseases spreading.'], answer: 'B' },
    { stem: 'What do neuroimaging studies of nature walks reveal?', opts: ['They reduce the total volume of grey matter in stress-related brain regions.', 'They permanently eliminate symptoms of clinical depression.', 'They lower activity in a brain area linked to repetitive negative thinking.', 'They improve short-term memory more than physical exercise does.'], answer: 'C' },
    { stem: 'What concern does paragraph F raise about park development?', opts: ['Parks are too expensive to maintain in low-income areas.', 'Green space creation can indirectly force out poorer residents.', 'Environmental improvements worsen local road infrastructure.', 'Wealthy residents oppose the construction of new parks.'], answer: 'B' },
  ], 28);

  // TFNG Q32–36
  await tfngGroup(p3.id, 1, [
    { stem: 'Urban green spaces can reduce the cost of cooling buildings in summer.', answer: 'TRUE' },
    { stem: 'The economic value of urban green spaces is straightforward to calculate accurately.', answer: 'FALSE' },
    { stem: 'Property near parks in all three cities studied commanded the same percentage premium.', answer: 'FALSE' },
    { stem: 'Participatory planning is the most effective solution to green gentrification.', answer: 'NOT GIVEN' },
    { stem: 'Even viewing trees through a window can have a positive effect on stress levels.', answer: 'TRUE' },
  ], 32, 'Do the following statements agree with the information in the passage? Write TRUE, FALSE or NOT GIVEN.');

  // Summary Q37–40
  await summaryGroup(p3.id, 2, `
<h3 style="font-weight:700;margin-bottom:12px">Complete the summary. Choose NO MORE THAN TWO WORDS from the passage for each answer.</h3>
<p style="line-height:2">
  Urban vegetation helps manage flooding by intercepting {37} before it enters drains. Green spaces reduce the {38} effect that makes cities warmer than surrounding areas. Property values near parks are typically higher, a premium that reflects both amenity value and lower {39} costs. However, rising property values linked to park development can result in {40}, whereby lower-income residents are priced out of improved neighbourhoods.
</p>`,
    ['rainfall', 'urban heat island', 'energy', 'green gentrification'], 37);

  return test;
}

// ─── Test C: Listening Practice Test 3 ───────────────────────────────────────

async function createListeningTest3(tagIelts: string, tagListening: string, tagPractice: string) {
  const test = await prisma.test.create({
    data: {
      title: 'IELTS Academic Listening Practice Test 3',
      examType: ExamType.IELTS_ACADEMIC,
      durationMins: 40,
      isPublished: true,
      description: 'IELTS Academic Listening Practice Test 3 — 4 recordings: hotel booking, local council meeting, student group project discussion, and a lecture on the domestication of plants.',
      sectionCount: 4,
      questionCount: 40,
      attemptCount: 7542,
      commentCount: 163,
      tags: { create: [{ tagId: tagIelts }, { tagId: tagListening }, { tagId: tagPractice }] },
    },
  });

  // Section 1: Hotel Reservation (Note Completion, Q1–10)
  const s1 = await prisma.testSection.create({ data: { testId: test.id, title: 'Recording 1 – Hotel Reservation', skill: SectionSkill.LISTENING, orderIndex: 0, questionCount: 10 } });
  await noteCompletionGroup(s1.id, 0, `
<h3 style="font-weight:700;margin-bottom:12px">Harbourview Hotel — Reservation Confirmation</h3>
<table style="border-collapse:collapse;width:100%">
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Guest name:</td><td style="padding:6px 12px">{1}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Reservation number:</td><td style="padding:6px 12px">{2}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Room type:</td><td style="padding:6px 12px">{3}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Number of rooms:</td><td style="padding:6px 12px">{4}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Check-in date:</td><td style="padding:6px 12px">{5}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Check-out date:</td><td style="padding:6px 12px">{6}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Breakfast included:</td><td style="padding:6px 12px">{7}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Special request:</td><td style="padding:6px 12px">{8}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Total cost per night:</td><td style="padding:6px 12px">{9}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:500;white-space:nowrap">Deposit paid:</td><td style="padding:6px 12px">{10}</td></tr>
</table>`,
    ['Dr Helena Vasquez', 'HBV-20491', 'deluxe sea-view double', '2', '7 September', '11 September', 'yes — continental', 'ground floor room', '$185', '$370'], 1);

  // Section 2: Local Council Meeting — New Cycle Lanes (MCQ, Q11–20)
  const s2 = await prisma.testSection.create({ data: { testId: test.id, title: 'Recording 2 – Council Meeting: New Cycle Lanes', skill: SectionSkill.LISTENING, orderIndex: 1, questionCount: 10 } });
  await mcqGroup(s2.id, 0, [
    { stem: 'The main reason for introducing the new cycle lanes is to', opts: ['reduce traffic congestion in the business district', 'meet national government cycling targets', 'respond to a petition signed by local residents', 'replace an existing bus route that was discontinued'], answer: 'B' },
    { stem: 'The proposed cycle lanes will be separated from traffic by', opts: ['raised kerbs only', 'painted lines on the road surface', 'concrete barriers and raised kerbs', 'flexible plastic posts'], answer: 'D' },
    { stem: 'Residents in Park Street are concerned mainly about', opts: ['the loss of on-street parking spaces', 'noise from increased bicycle traffic', 'safety for pedestrians at junctions', 'the cost of the scheme to local taxpayers'], answer: 'A' },
    { stem: 'The council officer states that the scheme will be funded by', opts: ['a national cycling infrastructure grant', 'local business improvement rates', 'a combination of council tax and external grants', 'road toll revenues from the bypass'], answer: 'A' },
    { stem: 'The councillor suggests that the scheme will be trialled for a period of', opts: ['six months', 'one year', 'eighteen months', 'two years'], answer: 'B' },
    { stem: 'Which change to the original plan was agreed at the meeting?', opts: ['Reducing the total length of the cycle network', 'Delaying the start of construction by three months', 'Adding a new crossing point outside the secondary school', 'Removing the section through the market area'], answer: 'C' },
    { stem: 'The chair of the transport committee believes the biggest benefit will be', opts: ['a reduction in road accidents involving cyclists', 'lower emissions from private car use', 'increased footfall for town centre shops', 'improved journey times for bus passengers'], answer: 'B' },
    { stem: 'Local businesses will be informed about construction disruption by', opts: ['door-to-door visits from council officers', 'weekly email updates and a project website', 'posters displayed in the town hall', 'announcements in the local newspaper'], answer: 'B' },
    { stem: 'At the close of the meeting, a resident objects that the consultation period was', opts: ['too short and not properly advertised', 'held at an inconvenient time of year', 'only available online and therefore excluding older residents', 'not properly recorded in council minutes'], answer: 'A' },
    { stem: 'The council agrees to publish the final construction timeline by', opts: ['the end of the current month', 'the next full council meeting', 'within three working weeks', 'before the summer recess'], answer: 'C' },
  ], 11);

  // Section 3: Group Project Discussion (Note Completion, Q21–30)
  const s3 = await prisma.testSection.create({ data: { testId: test.id, title: 'Recording 3 – Student Group Project Discussion', skill: SectionSkill.LISTENING, orderIndex: 2, questionCount: 10 } });
  await noteCompletionGroup(s3.id, 0, `
<h3 style="font-weight:700;margin-bottom:12px">Group Project: Consumer Behaviour in Online Retail</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead><tr>
    <th style="border:1px solid #d1d5db;padding:8px;background:#f3f4f6">Section</th>
    <th style="border:1px solid #d1d5db;padding:8px;background:#f3f4f6">Assigned to</th>
    <th style="border:1px solid #d1d5db;padding:8px;background:#f3f4f6">Deadline</th>
    <th style="border:1px solid #d1d5db;padding:8px;background:#f3f4f6">Notes</th>
  </tr></thead>
  <tbody>
    <tr><td style="border:1px solid #d1d5db;padding:8px">Literature review</td><td style="border:1px solid #d1d5db;padding:8px">{21}</td><td style="border:1px solid #d1d5db;padding:8px">15th</td><td style="border:1px solid #d1d5db;padding:8px">focus on post-pandemic data</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:8px">Survey design</td><td style="border:1px solid #d1d5db;padding:8px">Marcus and {22}</td><td style="border:1px solid #d1d5db;padding:8px">{23}</td><td style="border:1px solid #d1d5db;padding:8px">max 20 questions</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:8px">Data analysis</td><td style="border:1px solid #d1d5db;padding:8px">whole group</td><td style="border:1px solid #d1d5db;padding:8px">29th</td><td style="border:1px solid #d1d5db;padding:8px">use {24} for statistics</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:8px">Written report</td><td style="border:1px solid #d1d5db;padding:8px">{25}</td><td style="border:1px solid #d1d5db;padding:8px">6th</td><td style="border:1px solid #d1d5db;padding:8px">APA referencing required</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:8px">Presentation</td><td style="border:1px solid #d1d5db;padding:8px">everyone</td><td style="border:1px solid #d1d5db;padding:8px">{26}</td><td style="border:1px solid #d1d5db;padding:8px">12 minutes, allow 3 for questions</td></tr>
  </tbody>
</table>
<br/>
<p><strong>Additional decisions:</strong></p>
<ul style="line-height:2">
  <li>Survey will be distributed via {27} and the university intranet.</li>
  <li>Target respondent group: {28} aged 18–35.</li>
  <li>Minimum sample size agreed: {29} completed responses.</li>
  <li>Group will meet again on {30} to review progress.</li>
</ul>`,
    ['Priya', 'Jonah', '20th', 'SPSS', 'Marcus', '13th', 'social media', 'online shoppers', '150', 'the 27th'], 21);

  // Section 4: Lecture – Domestication of Plants (Summary, Q31–40)
  const s4 = await prisma.testSection.create({ data: { testId: test.id, title: 'Recording 4 – Lecture: Domestication of Plants', skill: SectionSkill.LISTENING, orderIndex: 3, questionCount: 10 } });
  await summaryGroup(s4.id, 0, `
<h3 style="font-weight:700;margin-bottom:12px">The Domestication of Plants — Lecture Notes</h3>
<p style="line-height:2">
  Plant domestication — the process by which wild species were gradually modified through {31} selection to suit human needs — began independently in multiple regions around 10,000 years ago during the {32} period.
  Early farmers selected plants with desirable traits, such as larger {33}, reduced seed dispersal, and uniform ripening, traits that made harvesting more {34} but also rendered the plants dependent on humans for reproduction.
</p>
<p style="line-height:2">
  The earliest domesticated crops, including wheat, barley, and {35}, originated in the Fertile Crescent.
  Genetic studies have revealed that the domestication of wheat likely occurred in a small area near the {36} Mountains in what is now Turkey.
  Rice was independently domesticated in the {37} River Valley in China, while maize was developed from a wild grass called {38} in southern Mexico.
</p>
<p style="line-height:2">
  Modern agriculture faces the paradox that, while domestication dramatically increased yields, it also severely reduced {39} diversity by concentrating cultivation on a small number of high-performing varieties.
  Seed banks, such as the Svalbard Global Seed Vault in {40}, preserve samples of thousands of crop varieties against the risk of catastrophic crop failure.
</p>`,
    ['artificial', 'Neolithic', 'seeds', 'efficient', 'legumes', 'Karacadağ', 'Yangtze', 'teosinte', 'genetic', 'Norway'], 31);

  return test;
}

// ─── Test D: Reading Practice Test 3 ─────────────────────────────────────────

async function createReadingTest3(tagIelts: string, tagReading: string, tagPractice: string) {
  const test = await prisma.test.create({
    data: {
      title: 'IELTS Academic Reading Practice Test 3',
      examType: ExamType.IELTS_ACADEMIC,
      durationMins: 60,
      isPublished: true,
      description: 'IELTS Academic Reading Practice Test 3 — 3 passages: The Psychology of Decision Fatigue (14q), Rewilding Europe (13q), and The Ocean Carbon Pump (13q).',
      sectionCount: 3,
      questionCount: 40,
      attemptCount: 5908,
      commentCount: 129,
      tags: { create: [{ tagId: tagIelts }, { tagId: tagReading }, { tagId: tagPractice }] },
    },
  });

  // ── Passage 1: The Psychology of Decision Fatigue ─────────────────────────
  const p1 = await prisma.testSection.create({ data: { testId: test.id, title: 'Passage 1: The Psychology of Decision Fatigue', skill: SectionSkill.READING, orderIndex: 0, questionCount: 14 } });
  await prisma.passage.create({
    data: {
      sectionId: p1.id, title: 'The Psychology of Decision Fatigue', orderIndex: 0,
      contentHtml: `
<h3>The Psychology of Decision Fatigue</h3>
<p><strong>A</strong> Every decision we make, however trivial, draws on the same finite pool of mental energy. Choosing what to eat for breakfast, responding to emails, resolving a workplace dispute — each act of deliberation consumes cognitive resources that are not immediately replenished. As the day wears on and the cumulative burden of choices grows, the quality of our decisions declines in predictable ways. This phenomenon, known as decision fatigue, has been documented across settings from judicial hearings to supermarket aisles, with implications for everything from public health to legal reform.</p>
<p><strong>B</strong> The term was popularised following a landmark study of Israeli parole hearings conducted by Shai Danziger and colleagues, published in 2011. Analysing over 1,100 parole decisions made by experienced judges across a single day, the researchers found a striking pattern: prisoners who appeared early in a session were granted parole roughly 65 per cent of the time, while those appearing at the end received favourable rulings only about 10 per cent of the time. After each break — whether for a meal or rest — the approval rate reset to its morning high. The researchers interpreted this as evidence that judges, when mentally depleted, defaulted to the status quo: the safer, cognitively cheaper choice of denial.</p>
<p><strong>C</strong> The neurological basis of decision fatigue is linked to the prefrontal cortex, the brain region responsible for executive function — including planning, impulse control, and complex reasoning. Research using functional magnetic resonance imaging (fMRI) has shown that sustained decision-making reduces glucose availability in this region. Studies in which participants consumed glucose-containing drinks between decision rounds showed measurably improved performance, lending support to the "ego depletion" model proposed by Roy Baumeister in the 1990s, which compared willpower to a muscle that tires with use.</p>
<p><strong>D</strong> Not all researchers accept the ego depletion model, however. A large-scale pre-registered replication study in 2016 failed to reproduce Baumeister's original findings, prompting a significant debate within psychology about the replicability of depletion effects. Critics argue that what appears to be cognitive fatigue may instead reflect motivational shifts — people who believe they are tired make poorer choices because they expect to perform worse, not because their resources are genuinely exhausted. This distinction matters for intervention: if fatigue is motivational rather than metabolic, glucose drinks would not help.</p>
<p><strong>E</strong> Regardless of the mechanism, the practical effects of decision fatigue are well-attested. In medical settings, physicians are more likely to prescribe unnecessary medications or order superfluous tests later in the day, when the cognitive demand of careful individualised diagnosis exceeds their available attention. Supermarkets exploit the phenomenon through store layouts that place high-margin impulse purchases near checkouts, where shoppers, already fatigued from navigating the store, have diminished resistance to unplanned buying.</p>
<p><strong>F</strong> Strategies for managing decision fatigue operate at both individual and systemic levels. Individually, the most effective approach is temporal — reserving the most consequential decisions for periods of peak cognitive function, typically the morning. Simplifying or automating recurring low-stakes choices (selecting a standard weekly meal plan, for example) preserves mental resources for decisions that genuinely require deliberation. At the systemic level, redesigning environments to reduce unnecessary decision points — as the nudge architecture literature proposes — can protect both individuals and institutions from the costs of depleted judgement.</p>`,
    },
  });

  // TFNG Q1–6
  await tfngGroup(p1.id, 0, [
    { stem: 'Decision fatigue affects only high-stakes decisions that require deep deliberation.', answer: 'FALSE' },
    { stem: 'In Danziger\'s study, parole approval rates recovered after judges took a break.', answer: 'TRUE' },
    { stem: 'The researchers in the parole study concluded that judges were deliberately biased against later applicants.', answer: 'FALSE' },
    { stem: 'fMRI studies have shown that sustained decision-making affects glucose levels in the prefrontal cortex.', answer: 'TRUE' },
    { stem: 'The 2016 replication study confirmed all of Baumeister\'s original ego depletion findings.', answer: 'FALSE' },
    { stem: 'Physicians make more diagnostic errors in the morning than in the afternoon.', answer: 'NOT GIVEN' },
  ], 1, 'Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.');

  // MCQ Q7–10
  await mcqGroup(p1.id, 1, [
    { stem: 'What does the Danziger study suggest about the judges\' default decision?', opts: ['Denial was the outcome that required the least mental effort.', 'Granting parole was seen as more legally appropriate.', 'Judges were unconsciously prejudiced against certain ethnic groups.', 'Earlier cases were inherently weaker applications.'], answer: 'A' },
    { stem: 'Critics of the ego depletion model suggest that poor late-day decision-making may be caused by', opts: ['a genuine reduction in blood glucose in the prefrontal cortex', 'a shift in what people expect of their own performance', 'accumulated exposure to emotionally draining interactions', 'a lack of physical exercise during the working day'], answer: 'B' },
    { stem: 'According to paragraph E, supermarkets place items near checkouts because', opts: ['these products are most relevant to shoppers completing their trip', 'shoppers have less resistance to impulse purchases after a long shop', 'checkout areas have the most prominent display space', 'high-margin products are better protected near staff'], answer: 'B' },
    { stem: 'Which strategy does the passage NOT mention for managing decision fatigue?', opts: ['Completing important decisions in the morning', 'Automating routine low-stakes choices', 'Redesigning environments to have fewer decision points', 'Taking regular glucose supplements throughout the day'], answer: 'D' },
  ], 7);

  // Summary Q11–14
  await summaryGroup(p1.id, 2, `
<h3 style="font-weight:700;margin-bottom:12px">Complete the summary. Choose NO MORE THAN TWO WORDS from the passage.</h3>
<p style="line-height:2">
  Decision fatigue is the tendency for the {11} of our choices to worsen as we make more of them. Baumeister's {12} model compared this to a muscle growing tired. An alternative view suggests the effect is primarily {13} — driven by expectations rather than depleted resources. At a systemic level, {14} architecture has been proposed as a way to reduce the number of unnecessary decisions people face.
</p>`,
    ['quality', 'ego depletion', 'motivational', 'nudge'], 11);

  // ── Passage 2: Rewilding Europe ──────────────────────────────────────────
  const p2 = await prisma.testSection.create({ data: { testId: test.id, title: 'Passage 2: Rewilding Europe', skill: SectionSkill.READING, orderIndex: 1, questionCount: 13 } });
  await prisma.passage.create({
    data: {
      sectionId: p2.id, title: 'Rewilding Europe', orderIndex: 0,
      contentHtml: `
<h3>Rewilding Europe</h3>
<p><strong>A</strong> For most of the past two centuries, conservation has meant protecting what remains of nature from further human damage — holding the line against extinction, preventing habitat loss, maintaining the status quo. Rewilding represents a fundamentally different ambition: not merely to arrest decline but to actively restore lost ecological complexity, allowing landscapes to recover their natural processes and, in time, to become places where large wild animals roam once again.</p>
<p><strong>B</strong> The intellectual foundations of rewilding draw heavily on the concept of the trophic cascade — the series of effects that ripple through an ecosystem when a top predator is introduced or removed. The best-documented example is the reintroduction of grey wolves to Yellowstone National Park in the United States in 1995. Within years, elk populations that had been overgrazing riverbanks began to avoid certain areas out of fear, allowing vegetation to recover. Regenerating riverside trees stabilised riverbanks, reducing erosion and altering the course of rivers. This sequence — predator influences prey behaviour, which restores vegetation, which reshapes physical landscape — has been called the "ecology of fear."</p>
<p><strong>C</strong> In Europe, rewilding efforts have focused on a different set of keystone species. The Eurasian lynx has been successfully reintroduced to Switzerland, Slovenia, and the Carpathians, where it helps regulate deer populations. Beavers — once extinct across much of the continent — have returned to the UK, Germany, and the Netherlands, dramatically transforming riparian habitats through their dam-building. The European bison, the continent's largest land mammal, teetered on the brink of extinction with only a handful surviving in zoos in the 1920s; today, rewilding programmes have established free-ranging herds across Poland, Romania, and Germany.</p>
<p><strong>D</strong> Proponents argue that rewilded landscapes deliver measurable benefits beyond their ecological value. Wetlands created by beaver activity store significant quantities of carbon and reduce downstream flooding. Restored forests sequester carbon from the atmosphere. In regions where rural economies have stagnated due to agricultural abandonment, rewilding-based ecotourism has generated new income and employment, with visitors travelling specifically to see wolves, lynx, and bison in their natural habitats.</p>
<p><strong>E</strong> Critics raise several objections. Farmers whose livestock is taken by wolves and lynx bear a disproportionate economic burden, and while compensation schemes exist, they are often slow, bureaucratic, and inadequate. More philosophically, some ecologists question whether the concept of a "natural baseline" to restore toward is coherent, since European landscapes have been continuously shaped by human activity for millennia. What counts as "natural" in a continent where almost no primary forest survives?</p>
<p><strong>F</strong> Nonetheless, momentum behind rewilding is growing. The European Union's Biodiversity Strategy, adopted in 2020, commits to restoring degraded ecosystems across 30 per cent of the EU's land and sea area by 2030. Rewilding Europe, an NGO established in 2011, is working across eight rewilding areas covering more than a million hectares. The evidence from projects already underway suggests that, given space, time, and the return of its missing species, nature can recover more rapidly and dramatically than many conservationists once believed.</p>`,
    },
  });

  // MCQ Q15–19
  await mcqGroup(p2.id, 0, [
    { stem: 'How does the writer distinguish rewilding from traditional conservation?', opts: ['Rewilding focuses on preventing habitat loss rather than species recovery.', 'Traditional conservation is more scientifically rigorous.', 'Rewilding aims to rebuild ecological complexity rather than just prevent further loss.', 'Traditional conservation does not involve reintroducing extinct species.'], answer: 'C' },
    { stem: 'The "ecology of fear" describes a situation in which', opts: ['wolves directly eliminate deer through predation.', 'predator presence changes prey behaviour and thereby transforms the landscape.', 'humans become reluctant to enter habitats containing large carnivores.', 'elk populations develop genetic resistance to predation over generations.'], answer: 'B' },
    { stem: 'What evidence does the writer provide for the economic benefits of rewilding?', opts: ['Improved crop yields on farmland adjacent to rewilded areas', 'Tourism income in regions where large wild animals have returned', 'Rising property values in villages near rewilded landscapes', 'Reduced government spending on traditional nature reserves'], answer: 'B' },
    { stem: 'What philosophical objection to rewilding is raised in paragraph E?', opts: ['There is no scientific evidence that trophic cascades occur in Europe.', 'European farmers should receive full market value for lost livestock.', 'It is unclear what a genuinely natural European landscape would look like.', 'Rewilding organisations have insufficient funding to be effective.'], answer: 'C' },
    { stem: 'The EU Biodiversity Strategy mentioned in paragraph F aims to', opts: ['eradicate invasive species from all member state territories', 'create a continuous wildlife corridor from Portugal to Ukraine', 'restore damaged ecosystems across 30% of land and sea areas', 'fund the reintroduction of large predators in every EU country'], answer: 'C' },
  ], 15);

  // TFNG Q20–24
  await tfngGroup(p2.id, 1, [
    { stem: 'Grey wolves were absent from Yellowstone for several decades before 1995.', answer: 'NOT GIVEN' },
    { stem: 'Beaver reintroduction has helped reduce flooding in some European rivers.', answer: 'TRUE' },
    { stem: 'European bison were completely extinct in the wild by the 1920s.', answer: 'TRUE' },
    { stem: 'Farmers are generally satisfied with the existing compensation schemes for livestock losses.', answer: 'FALSE' },
    { stem: 'The EU Biodiversity Strategy was agreed before the Rewilding Europe NGO was founded.', answer: 'FALSE' },
  ], 20, 'Do the following statements agree with the claims of the writer? Write TRUE, FALSE or NOT GIVEN.');

  // Summary Q25–27
  await summaryGroup(p2.id, 2, `
<h3 style="font-weight:700;margin-bottom:12px">Complete the summary. Use NO MORE THAN TWO WORDS from the passage.</h3>
<p style="line-height:2">
  Rewilding seeks to restore lost {25} by reintroducing keystone species that trigger ecological change.
  The most cited example is the reintroduction of wolves to Yellowstone, which altered the behaviour of {26} and ultimately changed the physical course of rivers.
  In Europe, beavers are considered particularly valuable because their dam-building creates {27} habitats that store carbon and reduce flooding.
</p>`,
    ['ecological complexity', 'elk', 'riparian'], 25);

  // ── Passage 3: The Ocean Carbon Pump ─────────────────────────────────────
  const p3 = await prisma.testSection.create({ data: { testId: test.id, title: 'Passage 3: The Ocean Carbon Pump', skill: SectionSkill.READING, orderIndex: 2, questionCount: 13 } });
  await prisma.passage.create({
    data: {
      sectionId: p3.id, title: 'The Ocean Carbon Pump', orderIndex: 0,
      contentHtml: `
<h3>The Ocean Carbon Pump</h3>
<p><strong>A</strong> The world's oceans absorb approximately 25 per cent of the carbon dioxide released by human activities every year, making them the planet's single largest active carbon sink. This extraordinary capacity depends on two interconnected mechanisms: the solubility pump and the biological pump. Understanding how these systems operate — and how they are responding to climate change — is one of the most pressing problems in Earth science.</p>
<p><strong>B</strong> The solubility pump is the simpler of the two. Carbon dioxide dissolves more readily in cold water than in warm water, so the frigid surface waters of the polar seas absorb disproportionate quantities of CO₂ from the atmosphere. This carbon-rich water then sinks — because cold water is denser — and is transported by deep ocean currents on a global circuit that can keep carbon sequestered for centuries or even millennia before the water eventually upwells back to the surface. The weakening of this thermohaline circulation, driven by freshwater input from melting ice sheets, threatens to reduce the solubility pump's efficiency.</p>
<p><strong>C</strong> The biological pump is more complex and arguably more important. At the ocean surface, microscopic photosynthetic organisms called phytoplankton absorb CO₂ from the water (and indirectly from the atmosphere) to build organic molecules, just as land plants do. When phytoplankton die, are eaten by zooplankton, or aggregate into clumps, a fraction of the organic carbon they contain sinks as particles — the so-called "marine snow" — into the deep ocean. If this carbon reaches depths below 1,000 metres before it is decomposed by bacteria, it can remain out of the atmosphere for hundreds of years.</p>
<p><strong>D</strong> The efficiency of the biological pump is not fixed. It varies with ocean temperature, nutrient availability, and the community structure of the marine food web. Warmer surface waters are more stratified, reducing the upward mixing of nutrient-rich deep water that phytoplankton depend upon. Research published in <em>Nature</em> in 2021 projected that, under high-emission scenarios, ocean warming could reduce global phytoplankton biomass by up to 17 per cent by the end of the century — a decline that would significantly weaken the biological pump and create a dangerous feedback loop, as less carbon absorption would accelerate atmospheric warming.</p>
<p><strong>E</strong> One controversial proposed solution to this problem is ocean iron fertilisation. Iron is a limiting nutrient for phytoplankton across vast areas of the Southern Ocean. Adding iron to these regions has been shown in experimental patches to stimulate large phytoplankton blooms. Proponents argue that on a large scale, this could massively increase the export of carbon to the deep ocean. Critics, however, warn that stimulating phytoplankton growth may shift species composition in unpredictable ways, promote oxygen-depleted dead zones as decomposing biomass consumes oxygen, and release other greenhouse gases including nitrous oxide.</p>
<p><strong>F</strong> More cautious intervention strategies focus on protecting the existing biological pump. Marine protected areas in high-productivity zones, reduced nutrient pollution from agriculture and sewage (which causes eutrophication in coastal waters), and measures to rebuild fish populations — which play important roles in transporting carbon through the water column via excretion and carcass sinking — are all proposed as lower-risk means of preserving ocean carbon cycling at a time when it is under unprecedented stress.</p>`,
    },
  });

  // MCQ Q28–31
  await mcqGroup(p3.id, 0, [
    { stem: 'Why does the solubility pump work more effectively in polar seas?', opts: ['Polar seas contain more dissolved minerals that attract CO₂.', 'Cold water dissolves carbon dioxide more efficiently than warm water.', 'Stronger winds in polar regions push more CO₂ into the water.', 'Phytoplankton are more active in cold polar waters.'], answer: 'B' },
    { stem: 'What does the phrase "marine snow" refer to?', opts: ['Frozen sea water particles forming in polar winters', 'Microscopic organisms floating near the ocean surface', 'Sinking organic particles that carry carbon into the deep ocean', 'Fragments of sea ice drifting in ocean currents'], answer: 'C' },
    { stem: 'According to paragraph D, how might climate change weaken the biological pump?', opts: ['By reducing the number of zooplankton that feed on phytoplankton', 'By warming surface water and limiting the nutrients available to phytoplankton', 'By increasing ocean acidity to levels that kill phytoplankton directly', 'By accelerating the thermohaline circulation and bringing up more warm water'], answer: 'B' },
    { stem: 'What is the main risk of large-scale ocean iron fertilisation according to critics?', opts: ['It would accelerate the solubility pump to dangerous levels.', 'It could produce unpredictable ecological changes and new greenhouse gases.', 'It would require prohibitively expensive extraction of iron from seabeds.', 'It could eliminate deep-sea species that rely on low-nutrient conditions.'], answer: 'B' },
  ], 28);

  // TFNG Q32–36
  await tfngGroup(p3.id, 1, [
    { stem: 'Carbon sequestered below 1,000 metres of ocean depth can remain out of the atmosphere for centuries.', answer: 'TRUE' },
    { stem: 'The thermohaline circulation is currently functioning more efficiently than it was 50 years ago.', answer: 'FALSE' },
    { stem: 'Ocean iron fertilisation experiments have successfully demonstrated a phytoplankton bloom response.', answer: 'TRUE' },
    { stem: 'Marine protected areas have already reduced the rate of ocean warming in productive ocean zones.', answer: 'NOT GIVEN' },
    { stem: 'Fish contribute to ocean carbon transport through excretion and the sinking of their carcasses.', answer: 'TRUE' },
  ], 32, 'Do the following statements agree with the information in the passage? Write TRUE, FALSE or NOT GIVEN.');

  // Summary Q37–40
  await summaryGroup(p3.id, 2, `
<h3 style="font-weight:700;margin-bottom:12px">Complete the summary. Choose NO MORE THAN TWO WORDS from the passage.</h3>
<p style="line-height:2">
  The oceans absorb around 25 per cent of human CO₂ emissions through two main mechanisms. The {37} pump relies on cold water's greater ability to dissolve CO₂, which then sinks and is circulated in deep ocean currents. The biological pump is driven by {38}, microscopic organisms that convert CO₂ into organic carbon at the ocean surface. If this carbon sinks deep enough before {39} breaks it down, it stays out of the atmosphere for a long time. Ocean warming threatens this system by increasing {40}, which cuts off the supply of nutrients to surface phytoplankton.
</p>`,
    ['solubility', 'phytoplankton', 'bacteria', 'stratification'], 37);

  return test;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Seeding IELTS Bundles ──\n');

  // Get tag IDs
  const tagIelts = await prisma.tag.findUnique({ where: { slug: 'ielts-academic' } });
  const tagListening = await prisma.tag.findUnique({ where: { slug: 'listening' } });
  const tagReading = await prisma.tag.findUnique({ where: { slug: 'reading' } });
  const tagPractice = await prisma.tag.findUnique({ where: { slug: 'practice' } });

  if (!tagIelts || !tagListening || !tagReading || !tagPractice) {
    throw new Error('Required tags not found. Run main seed first (npx prisma db seed).');
  }

  // Remove previously seeded bundle tests if they exist
  await prisma.test.deleteMany({
    where: {
      title: {
        in: [
          'IELTS Academic Listening Practice Test 2',
          'IELTS Academic Reading Practice Test 2',
          'IELTS Academic Listening Practice Test 3',
          'IELTS Academic Reading Practice Test 3',
        ],
      },
    },
  });

  // Remove previously seeded bundles
  await prisma.testBundle.deleteMany({
    where: {
      title: {
        in: ['IELTS Academic Practice Set 1', 'IELTS Academic Practice Set 2'],
      },
    },
  });

  console.log('Creating tests...');
  const testA = await createListeningTest2(tagIelts.id, tagListening.id, tagPractice.id);
  console.log('  ✓ IELTS Academic Listening Practice Test 2');

  const testB = await createReadingTest2(tagIelts.id, tagReading.id, tagPractice.id);
  console.log('  ✓ IELTS Academic Reading Practice Test 2');

  const testC = await createListeningTest3(tagIelts.id, tagListening.id, tagPractice.id);
  console.log('  ✓ IELTS Academic Listening Practice Test 3');

  const testD = await createReadingTest3(tagIelts.id, tagReading.id, tagPractice.id);
  console.log('  ✓ IELTS Academic Reading Practice Test 3');

  console.log('\nCreating bundles...');

  const bundle1 = await prisma.testBundle.create({
    data: {
      title: 'IELTS Academic Practice Set 1',
      description: 'A complete IELTS Academic practice set including a full Listening test (sports centre, city museum, marine pollution tutorial, cognitive load lecture) and a full Reading test (The History of Glass, Bioelectric Medicine, Urban Green Spaces). Ideal for timed, exam-condition practice.',
      examType: ExamType.IELTS_ACADEMIC,
      isPublished: true,
      orderIndex: 0,
    },
  });

  await prisma.test.update({ where: { id: testA.id }, data: { bundleId: bundle1.id, bundleOrder: 0 } });
  await prisma.test.update({ where: { id: testB.id }, data: { bundleId: bundle1.id, bundleOrder: 1 } });
  console.log('  ✓ Bundle 1: IELTS Academic Practice Set 1 (Listening 2 + Reading 2)');

  const bundle2 = await prisma.testBundle.create({
    data: {
      title: 'IELTS Academic Practice Set 2',
      description: 'A complete IELTS Academic practice set including a full Listening test (hotel booking, council meeting, group project, plant domestication lecture) and a full Reading test (Decision Fatigue, Rewilding Europe, The Ocean Carbon Pump). Suitable for candidates targeting Band 7+.',
      examType: ExamType.IELTS_ACADEMIC,
      isPublished: true,
      orderIndex: 1,
    },
  });

  await prisma.test.update({ where: { id: testC.id }, data: { bundleId: bundle2.id, bundleOrder: 0 } });
  await prisma.test.update({ where: { id: testD.id }, data: { bundleId: bundle2.id, bundleOrder: 1 } });
  console.log('  ✓ Bundle 2: IELTS Academic Practice Set 2 (Listening 3 + Reading 3)');

  const totalQ = await prisma.question.count();
  const totalTests = await prisma.test.count();
  const totalBundles = await prisma.testBundle.count();

  console.log('\nBundle seed completed!');
  console.log(`  - Total tests in DB:    ${totalTests}`);
  console.log(`  - Total bundles in DB:  ${totalBundles}`);
  console.log(`  - Total questions in DB: ${totalQ}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
