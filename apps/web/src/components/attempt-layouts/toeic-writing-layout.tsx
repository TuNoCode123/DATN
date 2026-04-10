'use client';

import { useState } from 'react';
import { RichContent } from '@/components/rich-content';
import { QuestionGroupRenderer } from '@/components/question-renderers';
import type { LayoutProps, QuestionGroupFromAPI } from './types';

interface TabGroup {
  label: string;
  groups: QuestionGroupFromAPI[];
}

function buildTabs(groups: QuestionGroupFromAPI[]): TabGroup[] {
  const tabs: TabGroup[] = [];
  const sorted = [...groups].sort((a, b) => a.orderIndex - b.orderIndex);

  // Group by question type for TOEIC writing
  const writeSentences = sorted.filter(
    (g) => g.questionType === 'WRITE_SENTENCES',
  );
  const respondRequest = sorted.filter(
    (g) => g.questionType === 'RESPOND_WRITTEN_REQUEST',
  );
  const opinionEssay = sorted.filter(
    (g) => g.questionType === 'WRITE_OPINION_ESSAY',
  );

  // Build question range labels
  const getQRange = (groups: QuestionGroupFromAPI[]) => {
    const allQs = groups.flatMap((g) => g.questions);
    if (allQs.length === 0) return '';
    const nums = allQs.map((q) => q.questionNumber).sort((a, b) => a - b);
    return nums.length === 1
      ? `Q${nums[0]}`
      : `Q${nums[0]}-${nums[nums.length - 1]}`;
  };

  if (writeSentences.length > 0) {
    tabs.push({
      label: `${getQRange(writeSentences)} Write Sentences`,
      groups: writeSentences,
    });
  }
  if (respondRequest.length > 0) {
    tabs.push({
      label: `${getQRange(respondRequest)} Respond to Request`,
      groups: respondRequest,
    });
  }
  if (opinionEssay.length > 0) {
    tabs.push({
      label: `${getQRange(opinionEssay)} Opinion Essay`,
      groups: opinionEssay,
    });
  }

  // Fallback: if no recognized types, just show all groups in one tab
  if (tabs.length === 0 && sorted.length > 0) {
    tabs.push({ label: 'Questions', groups: sorted });
  }

  return tabs;
}

export function ToeicWritingLayout({
  section,
  answers,
  onAnswer,
}: LayoutProps) {
  const tabs = buildTabs(section.questionGroups);
  const [activeTab, setActiveTab] = useState(0);

  const currentGroups = tabs[activeTab]?.groups || [];

  return (
    <div className="md:flex-1 md:overflow-y-auto flex flex-col">
      {/* Section instructions */}
      {section.instructions && (
        <div className="px-5 py-3 bg-blue-50 border-b border-slate-200">
          <div className="text-sm text-slate-700 italic leading-relaxed">
            <RichContent html={section.instructions} />
          </div>
        </div>
      )}

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex border-b-2 border-slate-200 bg-white px-2 pt-2">
          {tabs.map((tab, idx) => (
            <button
              key={idx}
              onClick={() => setActiveTab(idx)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-[2px] transition-colors cursor-pointer ${
                idx === activeTab
                  ? 'border-blue-500 text-blue-700 bg-blue-50'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {currentGroups.map((group, idx) => (
          <div key={group.id}>
            {idx > 0 && <hr className="border-t border-slate-200" />}
            <QuestionGroupRenderer
              group={group}
              answers={answers}
              onAnswer={onAnswer}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
