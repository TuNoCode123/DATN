"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, Select, InputNumber, DatePicker, Button, Popconfirm, App } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  EXAM_TYPE_GROUPS,
  EXAM_TYPE_LABELS,
  ExamType,
  getScoreFormat,
} from "@/lib/exam-types";

export interface GoalDTO {
  id: string;
  examType: ExamType;
  targetScore: number;
  targetDate: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: GoalDTO | null;
}

export function GoalModal({ open, onClose, initial }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial);

  const [examType, setExamType] = useState<ExamType>(initial?.examType ?? "IELTS_ACADEMIC");
  const [targetScore, setTargetScore] = useState<number | null>(initial?.targetScore ?? null);
  const [targetDate, setTargetDate] = useState<Dayjs | null>(
    initial?.targetDate ? dayjs(initial.targetDate) : null,
  );

  useEffect(() => {
    if (open) {
      setExamType(initial?.examType ?? "IELTS_ACADEMIC");
      setTargetScore(initial?.targetScore ?? null);
      setTargetDate(initial?.targetDate ? dayjs(initial.targetDate) : null);
    }
  }, [open, initial]);

  const fmt = useMemo(() => getScoreFormat(examType), [examType]);

  // Reset score when exam type changes if outside new range
  useEffect(() => {
    if (targetScore != null && (targetScore < fmt.min || targetScore > fmt.max)) {
      setTargetScore(null);
    }
  }, [examType, fmt.min, fmt.max, targetScore]);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (targetScore == null) throw new Error("Please enter a target score");
      if (!targetDate) throw new Error("Please pick a target date");
      const { data } = await api.put("/goals/me", {
        examType,
        targetScore,
        targetDate: targetDate.toISOString(),
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals", "me"] });
      message.success(isEdit ? "Goal updated" : "Goal set");
      onClose();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || err?.message || "Failed to save goal");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete("/goals/me");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals", "me"] });
      message.success("Goal removed");
      onClose();
    },
    onError: () => message.error("Failed to remove goal"),
  });

  const ielts = fmt.step === 0.5;
  const ieltsOptions = useMemo(() => {
    if (!ielts) return [];
    const out: { value: number; label: string }[] = [];
    for (let v = 4.0; v <= fmt.max; v += 0.5) out.push({ value: v, label: v.toFixed(1) });
    return out;
  }, [ielts, fmt.max]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={isEdit ? "Edit learning goal" : "Set a learning goal"}
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {isEdit && (
              <Popconfirm
                title="Remove this goal?"
                description="This will clear your current learning goal."
                onConfirm={() => deleteMutation.mutate()}
                okText="Remove"
                cancelText="Cancel"
              >
                <Button danger loading={deleteMutation.isPending}>
                  Delete goal
                </Button>
              </Popconfirm>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              loading={upsertMutation.isPending}
              onClick={() => upsertMutation.mutate()}
            >
              {isEdit ? "Save" : "Set goal"}
            </Button>
          </div>
        </div>
      }
      destroyOnClose
    >
      <div className="space-y-4 py-2">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5">Exam type</label>
          <Select
            className="w-full"
            value={examType}
            onChange={(v) => setExamType(v as ExamType)}
            options={EXAM_TYPE_GROUPS.map((g) => ({
              label: g.label,
              options: g.options.map((opt) => ({ value: opt, label: EXAM_TYPE_LABELS[opt] })),
            }))}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5">
            Target {fmt.label.toLowerCase()} ({fmt.min}–{fmt.max}
            {fmt.unit})
          </label>
          {ielts ? (
            <Select
              className="w-full"
              placeholder="Select target band"
              value={targetScore ?? undefined}
              onChange={(v) => setTargetScore(v as number)}
              options={ieltsOptions}
            />
          ) : (
            <InputNumber
              className="w-full"
              min={fmt.min}
              max={fmt.max}
              step={fmt.step}
              value={targetScore ?? undefined}
              onChange={(v) => setTargetScore(v as number)}
              placeholder={`Enter target ${fmt.label.toLowerCase()}`}
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5">Target date</label>
          <DatePicker
            className="w-full"
            value={targetDate}
            onChange={(d) => setTargetDate(d)}
            disabledDate={(d) => d && d.isBefore(dayjs().startOf("day"))}
            placeholder="Pick your exam / deadline date"
          />
        </div>
      </div>
    </Modal>
  );
}
