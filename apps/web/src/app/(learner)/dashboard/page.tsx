'use client';

import { useQuery } from '@tanstack/react-query';
import { Spin, Tag, Progress } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
  FireOutlined,
  BarChartOutlined,
  RightOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

interface AttemptFromAPI {
  id: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'ABANDONED';
  mode: 'FULL_TEST' | 'PRACTICE';
  scorePercent: number | null;
  correctCount: number | null;
  totalQuestions: number | null;
  startedAt: string;
  submittedAt: string | null;
  timeLimitMins: number | null;
  test: {
    id: string;
    title: string;
    examType: string;
    questionCount: number;
  };
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  IELTS_ACADEMIC: 'IELTS Academic',
  IELTS_GENERAL: 'IELTS General',
  TOEIC_LR: 'TOEIC',
  TOEIC_SW: 'TOEIC SW',
  HSK_1: 'HSK 1', HSK_2: 'HSK 2', HSK_3: 'HSK 3',
  HSK_4: 'HSK 4', HSK_5: 'HSK 5', HSK_6: 'HSK 6',
  TOPIK_I: 'TOPIK I', TOPIK_II: 'TOPIK II',
  JLPT_N5: 'JLPT N5', JLPT_N4: 'JLPT N4', JLPT_N3: 'JLPT N3',
  JLPT_N2: 'JLPT N2', JLPT_N1: 'JLPT N1',
  DIGITAL_SAT: 'Digital SAT',
  ACT: 'ACT',
  THPTQG: 'THPTQG',
};

function scoreColor(score: number): string {
  if (score >= 80) return '#52c41a';
  if (score >= 60) return '#faad14';
  return '#ff4d4f';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const { data: attempts, isLoading } = useQuery<AttemptFromAPI[]>({
    queryKey: ['my-attempts'],
    queryFn: async () => {
      const { data } = await api.get('/attempts');
      return data;
    },
  });

  const submitted = (attempts || []).filter((a) => a.status === 'SUBMITTED');
  const inProgress = (attempts || []).filter((a) => a.status === 'IN_PROGRESS');

  const avgScore =
    submitted.length > 0
      ? submitted.reduce((sum, a) => sum + (a.scorePercent ?? 0), 0) / submitted.length
      : 0;

  const bestScore =
    submitted.length > 0
      ? Math.max(...submitted.map((a) => a.scorePercent ?? 0))
      : 0;

  // Group submitted attempts by examType for the breakdown chart
  const byType: Record<string, { count: number; totalScore: number }> = {};
  for (const a of submitted) {
    const type = a.test.examType;
    if (!byType[type]) byType[type] = { count: 0, totalScore: 0 };
    byType[type].count++;
    byType[type].totalScore += a.scorePercent ?? 0;
  }
  const typeBreakdown = Object.entries(byType)
    .map(([type, { count, totalScore }]) => ({
      type,
      label: EXAM_TYPE_LABELS[type] || type,
      count,
      avgScore: totalScore / count,
    }))
    .sort((a, b) => b.count - a.count);

  const recent = [...submitted]
    .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime())
    .slice(0, 10);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Xin chào, {user?.displayName || user?.email || 'bạn'} 👋
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Theo dõi tiến trình luyện thi của bạn</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spin size="large" />
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={<CheckCircleOutlined style={{ fontSize: 22, color: '#52c41a' }} />}
              label="Đề đã hoàn thành"
              value={submitted.length}
              bg="bg-green-50"
            />
            <StatCard
              icon={<ClockCircleOutlined style={{ fontSize: 22, color: '#faad14' }} />}
              label="Đang làm"
              value={inProgress.length}
              bg="bg-yellow-50"
            />
            <StatCard
              icon={<BarChartOutlined style={{ fontSize: 22, color: '#1677ff' }} />}
              label="Điểm trung bình"
              value={submitted.length > 0 ? `${avgScore.toFixed(1)}%` : '—'}
              bg="bg-blue-50"
            />
            <StatCard
              icon={<TrophyOutlined style={{ fontSize: 22, color: '#f5a623' }} />}
              label="Điểm cao nhất"
              value={submitted.length > 0 ? `${bestScore.toFixed(1)}%` : '—'}
              bg="bg-orange-50"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Score breakdown by exam type */}
            <div className="md:col-span-1 bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <FireOutlined style={{ color: '#ff4d4f' }} /> Theo loại đề
              </h2>
              {typeBreakdown.length === 0 ? (
                <p className="text-sm text-gray-400">Chưa có dữ liệu</p>
              ) : (
                <div className="space-y-3">
                  {typeBreakdown.map(({ type, label, count, avgScore: avg }) => (
                    <div key={type}>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span className="font-medium">{label}</span>
                        <span>{count} bài · {avg.toFixed(0)}%</span>
                      </div>
                      <Progress
                        percent={Math.round(avg)}
                        strokeColor={scoreColor(avg)}
                        trailColor="#f0f0f0"
                        showInfo={false}
                        size="small"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* In-progress attempts */}
            <div className="md:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <ClockCircleOutlined style={{ color: '#faad14' }} /> Đang làm dở
              </h2>
              {inProgress.length === 0 ? (
                <div className="text-sm text-gray-400 py-4 text-center">
                  Không có bài thi nào đang làm dở.{' '}
                  <Link href="/tests" className="text-blue-600 hover:underline">
                    Làm bài mới
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {inProgress.slice(0, 5).map((a) => (
                    <Link
                      key={a.id}
                      href={`/tests/${a.test.id}/attempt?attemptId=${a.id}`}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-yellow-200 bg-yellow-50 hover:bg-yellow-100 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800 leading-tight">{a.test.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Bắt đầu {formatDate(a.startedAt)} · {a.mode === 'FULL_TEST' ? 'Đề đầy đủ' : 'Luyện tập'}
                        </p>
                      </div>
                      <RightOutlined style={{ fontSize: 12, color: '#faad14' }} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent completed attempts */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <CheckCircleOutlined style={{ color: '#52c41a' }} /> Kết quả gần đây
              </h2>
              <Link href="/tests" className="text-xs text-blue-600 hover:underline">
                Xem thêm đề thi
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="text-sm text-gray-400 py-8 text-center">
                Bạn chưa hoàn thành bài thi nào.{' '}
                <Link href="/tests" className="text-blue-600 hover:underline">
                  Làm bài ngay
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left py-2 pr-4 font-medium">Đề thi</th>
                      <th className="text-left py-2 pr-4 font-medium">Loại</th>
                      <th className="text-left py-2 pr-4 font-medium">Chế độ</th>
                      <th className="text-right py-2 pr-4 font-medium">Kết quả</th>
                      <th className="text-right py-2 pr-4 font-medium">Ngày nộp</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recent.map((a) => {
                      const score = a.scorePercent ?? 0;
                      return (
                        <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 pr-4">
                            <span className="font-medium text-gray-800 line-clamp-1">{a.test.title}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <Tag color="geekblue" className="text-xs">
                              {EXAM_TYPE_LABELS[a.test.examType] || a.test.examType}
                            </Tag>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              a.mode === 'FULL_TEST'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {a.mode === 'FULL_TEST' ? 'Đầy đủ' : 'Luyện tập'}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <div className="flex flex-col items-end">
                              <span
                                className="font-semibold text-base"
                                style={{ color: scoreColor(score) }}
                              >
                                {score.toFixed(1)}%
                              </span>
                              <span className="text-xs text-gray-400">
                                {a.correctCount}/{a.totalQuestions} câu
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right text-gray-500 text-xs whitespace-nowrap">
                            {a.submittedAt ? formatDate(a.submittedAt) : '—'}
                          </td>
                          <td className="py-3">
                            <Link
                              href={`/tests/${a.test.id}/result?attemptId=${a.id}`}
                              className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                            >
                              Xem chi tiết
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl p-4 border border-gray-100`}>
      <div className="mb-2">{icon}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
