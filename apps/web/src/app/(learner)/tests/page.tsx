"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input, Button, Spin } from "antd";
import {
  SearchOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  MessageOutlined,
  LeftOutlined,
  RightOutlined,
  BarChartOutlined,
  InfoCircleOutlined,
  UserOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

const EXAM_CATEGORIES = [
  { key: "all", label: "Tất cả" },
  { key: "IELTS_ACADEMIC", label: "IELTS Academic" },
  { key: "IELTS_GENERAL", label: "IELTS General" },
  { key: "TOEIC_LR", label: "TOEIC" },
  { key: "TOEIC_SW", label: "TOEIC SW" },
  { key: "HSK_1", label: "HSK 1" },
  { key: "HSK_2", label: "HSK 2" },
  { key: "HSK_3", label: "HSK 3" },
  { key: "HSK_4", label: "HSK 4" },
  { key: "HSK_5", label: "HSK 5" },
  { key: "HSK_6", label: "HSK 6" },
  { key: "TOPIK_I", label: "TOPIK I" },
  { key: "TOPIK_II", label: "TOPIK II" },
  { key: "JLPT_N5", label: "N5" },
  { key: "JLPT_N4", label: "N4" },
  { key: "JLPT_N3", label: "N3" },
  { key: "JLPT_N2", label: "N2" },
  { key: "JLPT_N1", label: "N1" },
  { key: "DIGITAL_SAT", label: "Digital SAT" },
  { key: "THPTQG", label: "THPTQG" },
  { key: "ACT", label: "ACT" },
];

const FORMAT_TABS = [
  { key: "all", label: "Tất cả" },
  { key: "CONDENSED", label: "Đề rút gọn" },
];

const PAGE_SIZE = 12;

function formatNumber(n: number): string {
  return n.toLocaleString("vi-VN");
}

function UserSidebar() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="w-64 flex-shrink-0">
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
          <UserOutlined style={{ fontSize: 32, color: "#fff" }} />
        </div>
        <p className="font-semibold text-base text-gray-800">
          {user?.displayName || user?.email || "Khách"}
        </p>
        <div className="flex items-start gap-1.5 text-xs text-gray-500 text-center leading-snug">
          <InfoCircleOutlined className="mt-0.5 flex-shrink-0 text-gray-400" />
          <span>
            Bạn chưa tạo mục tiêu cho quá trình luyện thi của mình.{" "}
            <a href="#" className="text-blue-600 hover:underline">
              Tạo ngay.
            </a>
          </span>
        </div>
        <button className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-md py-2 text-sm text-gray-700 hover:border-blue-400 hover:text-blue-600 transition-colors">
          <BarChartOutlined />
          Thống kê kết quả
        </button>
      </div>
    </div>
  );
}

interface TestFromAPI {
  id: string;
  title: string;
  examType: string;
  format: string;
  durationMins: number;
  attemptCount: number;
  commentCount: number;
  sectionCount: number;
  questionCount: number;
  tags: { tag: { id: string; name: string; slug: string } }[];
}

export default function TestsPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeFormat, setActiveFormat] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["tests", activeCategory, activeFormat, searchQuery, currentPage],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      };
      if (activeCategory !== "all") params.examType = activeCategory;
      if (activeFormat !== "all") params.format = activeFormat;
      if (searchQuery) params.search = searchQuery;

      const { data } = await api.get("/tests", { params });
      return data as { data: TestFromAPI[]; total: number; page: number; limit: number };
    },
  });

  const tests = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleSearch() {
    setSearchQuery(inputValue);
    setCurrentPage(1);
  }

  function handleCategoryChange(key: string) {
    setActiveCategory(key);
    setCurrentPage(1);
  }

  function handleFormatChange(key: string) {
    setActiveFormat(key);
    setCurrentPage(1);
  }

  return (
    <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0">
        <h1 className="text-3xl font-bold mb-5">Thư viện đề thi</h1>

        {/* Category filter */}
        <div className="flex flex-wrap gap-x-3 gap-y-2 mb-5">
          {EXAM_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => handleCategoryChange(cat.key)}
              className={`text-sm transition-colors ${
                activeCategory === cat.key
                  ? "bg-blue-600 text-white px-3 py-0.5 rounded"
                  : "text-gray-700 hover:text-blue-600"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="flex gap-0 mb-4">
          <Input
            size="large"
            placeholder="Nhập từ khoá bạn muốn tìm kiếm: tên sách, dạng câu hỏi ..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={handleSearch}
            suffix={
              <SearchOutlined
                className="text-gray-400 cursor-pointer"
                onClick={handleSearch}
              />
            }
            className="rounded-r-none"
          />
        </div>
        <div className="mb-6">
          <Button
            type="primary"
            size="large"
            onClick={handleSearch}
            style={{ backgroundColor: "#1a237e", borderColor: "#1a237e" }}
          >
            Tìm kiếm
          </Button>
        </div>

        {/* Format tabs */}
        <div className="flex gap-8 mb-6 border-b border-gray-200">
          {FORMAT_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleFormatChange(tab.key)}
              className={`pb-2 text-sm font-medium transition-colors relative ${
                activeFormat === tab.key
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {activeFormat === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          ))}
        </div>

        {/* Test grid */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spin size="large" />
          </div>
        ) : tests.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {tests.map((test) => (
              <div
                key={test.id}
                className="group border border-gray-200 rounded-xl p-5 bg-white hover:shadow-lg transition-shadow flex flex-col min-h-[300px]"
              >
                <h3 className="font-bold text-[14px] leading-snug mb-4">
                  {test.title}
                </h3>

                <div className="text-xs text-gray-500 space-y-1 mb-4">
                  <div className="flex flex-wrap items-center gap-x-1">
                    <ClockCircleOutlined className="text-gray-400" />
                    <span>{test.durationMins} phút</span>
                    <span className="text-gray-300">|</span>
                    <TeamOutlined className="text-gray-400" />
                    <span>{formatNumber(test.attemptCount)}</span>
                    <span className="text-gray-300">|</span>
                    <MessageOutlined className="text-gray-400" />
                    <span>{formatNumber(test.commentCount)}</span>
                  </div>
                  <div>
                    {test.sectionCount} phần thi | {test.questionCount} câu hỏi
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-5">
                  {test.tags.map((t) => (
                    <span
                      key={t.tag.id}
                      className="text-xs px-2 py-0.5 rounded border"
                      style={{
                        color: "#35509a",
                        backgroundColor: "#eef1fa",
                        borderColor: "#c5cee8",
                      }}
                    >
                      #{t.tag.name}
                    </span>
                  ))}
                </div>

                <div className="mt-auto">
                  <Link href={`/tests/${test.id}`} className="block">
                    <button
                      className="w-full rounded-md py-2 text-sm font-medium transition-colors border"
                      style={{
                        color: "#35509a",
                        borderColor: "#35509a",
                        backgroundColor: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#35509a";
                        (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                        (e.currentTarget as HTMLButtonElement).style.color = "#35509a";
                      }}
                    >
                      Chi tiết
                    </button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-16">
            Không tìm thấy đề thi nào phù hợp.
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <LeftOutlined style={{ fontSize: 11 }} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 flex items-center justify-center rounded border text-sm transition-colors ${
                  currentPage === page
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-600"
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <RightOutlined style={{ fontSize: 11 }} />
            </button>
          </div>
        )}
      </div>

      <UserSidebar />
    </div>
  );
}
