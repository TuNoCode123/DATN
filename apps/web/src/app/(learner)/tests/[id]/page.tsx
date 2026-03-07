'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, Tag, Select, Spin, message } from 'antd';
import { ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';

interface QuestionFromAPI {
  id: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  mcqOptions: any;
}

interface QuestionGroupFromAPI {
  id: string;
  questionType: string;
  orderIndex: number;
  contentHtml: string | null;
  matchingOptions: any;
  questions: QuestionFromAPI[];
}

interface SectionFromAPI {
  id: string;
  title: string;
  skill: string;
  orderIndex: number;
  questionCount: number;
  questionGroups: QuestionGroupFromAPI[];
}

interface TestFromAPI {
  id: string;
  title: string;
  examType: string;
  format: string;
  durationMins: number;
  sectionCount: number;
  questionCount: number;
  attemptCount: number;
  commentCount: number;
  description: string | null;
  sections: SectionFromAPI[];
  tags: { tag: { id: string; name: string } }[];
}

const TIME_OPTIONS = [
  { value: 0, label: '-- Chọn thời gian --' },
  { value: 5, label: '5 phút' },
  { value: 10, label: '10 phút' },
  { value: 15, label: '15 phút' },
  { value: 20, label: '20 phút' },
  { value: 30, label: '30 phút' },
  { value: 40, label: '40 phút' },
  { value: 60, label: '60 phút' },
];

function getQuestionTypeBadge(type: string): string {
  const map: Record<string, string> = {
    MULTIPLE_CHOICE: 'Multiple Choice',
    NOTE_FORM_COMPLETION: 'Note/Form Completion',
    TABLE_COMPLETION: 'Table Completion',
    SUMMARY_COMPLETION: 'Summary Completion',
    MATCHING: 'Matching',
  };
  return map[type] || type;
}

export default function TestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.id as string;

  const [mode, setMode] = useState<'practice' | 'full' | 'discussion'>('practice');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [timeLimit, setTimeLimit] = useState(0);
  const [starting, setStarting] = useState(false);

  const { data: test, isLoading } = useQuery({
    queryKey: ['test', testId],
    queryFn: async () => {
      const { data } = await api.get(`/tests/${testId}`);
      return data as TestFromAPI;
    },
  });

  const toggleSection = (sectionId: string) => {
    setSelectedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((s) => s !== sectionId) : [...prev, sectionId]
    );
  };

  const handleStart = async () => {
    if (!test) return;

    const token = localStorage.getItem('accessToken');
    if (!token) {
      message.warning('Vui lòng đăng nhập để làm bài');
      router.push('/login');
      return;
    }

    setStarting(true);
    try {
      const sectionIds = mode === 'full' ? test.sections.map((s) => s.id) : selectedSections;
      const { data: attempt } = await api.post('/attempts', {
        testId: test.id,
        mode: mode === 'full' ? 'FULL_TEST' : 'PRACTICE',
        sectionIds,
        timeLimitMins: timeLimit > 0 ? timeLimit : undefined,
      });
      router.push(`/tests/${testId}/attempt?attemptId=${attempt.id}`);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Không thể bắt đầu bài thi';
      message.error(msg);
    } finally {
      setStarting(false);
    }
  };

  if (isLoading || !test) {
    return (
      <div className="flex justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  // Collect unique question types per section for tag badges
  const sectionTypeTags = (section: SectionFromAPI): string[] => {
    const types = new Set(section.questionGroups.map((g) => g.questionType));
    return Array.from(types).map(
      (t) => `#[${section.skill === 'LISTENING' ? 'Listening' : 'Reading'}] ${getQuestionTypeBadge(t)}`
    );
  };

  return (
    <div className="max-w-3xl">
      {/* Top tags */}
      <div className="flex gap-2 mb-3">
        {test.tags.map((t) => (
          <Tag
            key={t.tag.id}
            style={{
              borderColor: '#1d6fa4',
              color: '#1d6fa4',
              background: 'transparent',
              borderRadius: 4,
              fontSize: 13,
              padding: '1px 8px',
            }}
          >
            #{t.tag.name}
          </Tag>
        ))}
      </div>

      <h1 className="text-2xl font-bold mb-4 text-gray-900">{test.title}</h1>

      <div className="mb-4">
        <span
          style={{
            display: 'inline-block',
            backgroundColor: '#e8f4fd',
            color: '#1d6fa4',
            border: '1px solid #b8d9f0',
            borderRadius: 20,
            padding: '4px 16px',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Thông tin đề thi
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-700 mb-1">
        <ClockCircleOutlined style={{ color: '#555' }} />
        <span>
          Thời gian làm bài: {test.durationMins} phút | {test.sectionCount} phần thi |{' '}
          {test.questionCount} câu hỏi | {test.commentCount} bình luận
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-700 mb-4">
        <UserOutlined style={{ color: '#555' }} />
        <span>{test.attemptCount.toLocaleString()} người đã luyện tập đề thi này</span>
      </div>

      <p className="text-sm mb-6" style={{ color: '#c0392b', fontStyle: 'italic' }}>
        Chú ý: để được quy đổi sang scaled score (ví dụ trên thang điểm 990 cho TOEIC hoặc 9.0 cho IELTS),
        vui lòng chọn chế độ làm FULL TEST.
      </p>

      {/* Mode tabs */}
      <div className="flex gap-6 mb-5" style={{ borderBottom: '1px solid #e5e7eb' }}>
        {[
          { key: 'practice' as const, label: 'Luyện tập' },
          { key: 'full' as const, label: 'Làm full test' },
          { key: 'discussion' as const, label: 'Thảo luận' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            style={{
              paddingBottom: 10,
              fontSize: 15,
              fontWeight: mode === tab.key ? 600 : 400,
              color: mode === tab.key ? '#1d6fa4' : '#6b7280',
              background: 'none',
              border: 'none',
              borderBottomWidth: 2,
              borderBottomStyle: 'solid',
              borderBottomColor: mode === tab.key ? '#1d6fa4' : 'transparent',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Practice mode */}
      {mode === 'practice' && (
        <div>
          <div
            style={{
              backgroundColor: '#f0faf0',
              border: '1px solid #b7ddb7',
              borderRadius: 6,
              padding: '12px 16px',
              marginBottom: 24,
              fontSize: 14,
              color: '#2d6a2d',
              lineHeight: 1.6,
            }}
          >
            <span style={{ marginRight: 8 }}>&#128161;</span>
            <strong>Pro tips:</strong> Hình thức luyện tập từng phần và chọn mức thời gian phù hợp sẽ giúp bạn tập trung vào giải
            đúng các câu hỏi thay vì phải chịu áp lực hoàn thành bài thi.
          </div>

          <p className="text-sm font-semibold mb-3 text-gray-800">Chọn phần thi bạn muốn làm</p>

          <div className="mb-6" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {test.sections.map((section) => (
              <div key={section.id}>
                <Checkbox
                  checked={selectedSections.includes(section.id)}
                  onChange={() => toggleSection(section.id)}
                >
                  <span style={{ fontSize: 14, color: '#111' }}>
                    {section.title} ({section.questionCount} câu hỏi)
                  </span>
                </Checkbox>
                <div style={{ marginLeft: 24, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {sectionTypeTags(section).map((tag) => (
                    <Tag
                      key={tag}
                      style={{
                        backgroundColor: '#eaf1fb',
                        borderColor: '#b3cef0',
                        color: '#2c5f9e',
                        fontSize: 12,
                        borderRadius: 4,
                        padding: '0 6px',
                      }}
                    >
                      {tag}
                    </Tag>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mb-6">
            <p className="text-sm font-semibold mb-2 text-gray-800">
              Giới hạn thời gian (Để trống để làm bài không giới hạn)
            </p>
            <Select
              style={{ width: '100%' }}
              value={timeLimit}
              onChange={(val) => setTimeLimit(val)}
              options={TIME_OPTIONS}
              size="large"
            />
          </div>

          <Button
            type="primary"
            size="large"
            disabled={selectedSections.length === 0}
            loading={starting}
            onClick={handleStart}
            style={{
              backgroundColor: '#1a2f6e',
              borderColor: '#1a2f6e',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: 1,
              height: 44,
              paddingLeft: 32,
              paddingRight: 32,
              borderRadius: 6,
            }}
          >
            LUYỆN TẬP
          </Button>
        </div>
      )}

      {/* Full test mode */}
      {mode === 'full' && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Làm full test với {test.questionCount} câu hỏi trong {test.durationMins} phút.
            Kết quả sẽ được quy đổi sang thang điểm IELTS.
          </p>
          <Button
            type="primary"
            size="large"
            loading={starting}
            onClick={handleStart}
            style={{
              backgroundColor: '#1a2f6e',
              borderColor: '#1a2f6e',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: 1,
              height: 44,
              paddingLeft: 32,
              paddingRight: 32,
              borderRadius: 6,
            }}
          >
            BẮT ĐẦU LÀM BÀI
          </Button>
        </div>
      )}

      {/* Discussion */}
      {mode === 'discussion' && (
        <div className="text-gray-500 text-sm">
          Phần thảo luận sẽ được cập nhật sau.
        </div>
      )}
    </div>
  );
}
