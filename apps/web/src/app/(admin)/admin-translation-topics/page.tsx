'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  useAdminTranslationTopics,
  useCreateTranslationTopic,
  useUpdateTranslationTopic,
  useToggleTranslationTopicPublish,
  useDeleteTranslationTopic,
} from '@/features/admin/hooks/use-admin-translation-topics';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Languages,
  X,
} from 'lucide-react';

interface TopicForm {
  name: string;
  description: string;
  difficulty: string;
  tags: string;
  isPublished: boolean;
}

const EMPTY_FORM: TopicForm = {
  name: '',
  description: '',
  difficulty: 'INTERMEDIATE',
  tags: '',
  isPublished: false,
};

const DIFFICULTY_BADGE: Record<string, string> = {
  BEGINNER: 'bg-emerald-100 text-emerald-800 border-emerald-400',
  INTERMEDIATE: 'bg-amber-100 text-amber-800 border-amber-400',
  ADVANCED: 'bg-red-100 text-red-800 border-red-400',
};

export default function AdminTranslationTopicsPage() {
  const [search, setSearch] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterPublished, setFilterPublished] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TopicForm>(EMPTY_FORM);

  const { data, isLoading } = useAdminTranslationTopics({
    search: search || undefined,
    difficulty: filterDifficulty || undefined,
    isPublished: filterPublished ? filterPublished === 'true' : undefined,
  });

  const createMutation = useCreateTranslationTopic();
  const updateMutation = useUpdateTranslationTopic();
  const togglePublish = useToggleTranslationTopicPublish();
  const deleteMutation = useDeleteTranslationTopic();

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  }

  function openEdit(topic: any) {
    setEditingId(topic.id);
    setForm({
      name: topic.name,
      description: topic.description || '',
      difficulty: topic.difficulty,
      tags: (topic.tags || []).join(', '),
      isPublished: topic.isPublished,
    });
    setShowDialog(true);
  }

  async function handleSave() {
    const payload = {
      name: form.name,
      description: form.description || undefined,
      difficulty: form.difficulty,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      isPublished: form.isPublished,
    };

    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setShowDialog(false);
  }

  async function handleDelete(id: string, name: string) {
    if (confirm(`Delete topic "${name}"? This cannot be undone.`)) {
      await deleteMutation.mutateAsync(id);
    }
  }

  const topics = data?.data || [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Languages className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-black">Translation Topics</h1>
        </div>
        <button
          onClick={openCreate}
          className="brutal-btn-fill px-4 py-2 text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Topic
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search topics..."
            className="w-full pl-9 pr-3 py-2 border-2 border-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <select
          value={filterDifficulty}
          onChange={(e) => setFilterDifficulty(e.target.value)}
          className="px-3 py-2 border-2 border-black rounded-lg text-sm bg-white"
        >
          <option value="">All Difficulties</option>
          <option value="BEGINNER">Beginner</option>
          <option value="INTERMEDIATE">Intermediate</option>
          <option value="ADVANCED">Advanced</option>
        </select>
        <select
          value={filterPublished}
          onChange={(e) => setFilterPublished(e.target.value)}
          className="px-3 py-2 border-2 border-black rounded-lg text-sm bg-white"
        >
          <option value="">All Status</option>
          <option value="true">Published</option>
          <option value="false">Draft</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="brutal-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-black bg-gray-50">
                <th className="text-left px-4 py-3 font-bold">Name</th>
                <th className="text-left px-4 py-3 font-bold">Difficulty</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                <th className="text-left px-4 py-3 font-bold">Tags</th>
                <th className="text-right px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((topic: any) => (
                <tr key={topic.id} className="border-b border-gray-200 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-bold">{topic.name}</div>
                    {topic.description && (
                      <div className="text-xs text-gray-500 truncate max-w-[250px]">
                        {topic.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2 py-0.5 text-xs font-bold border rounded-full', DIFFICULTY_BADGE[topic.difficulty])}>
                      {topic.difficulty.charAt(0) + topic.difficulty.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => togglePublish.mutate(topic.id)}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg border transition-colors',
                        topic.isPublished
                          ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                          : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100',
                      )}
                    >
                      {topic.isPublished ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {topic.isPublished ? 'Published' : 'Draft'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(topic.tags || []).map((t: string) => (
                        <span key={t} className="px-1.5 py-0.5 text-[10px] bg-gray-100 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(topic)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(topic.id, topic.name)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {topics.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    No topics found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="brutal-card w-full max-w-md p-6 bg-white relative">
            <button
              onClick={() => setShowDialog(false)}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-lg font-black mb-4">
              {editingId ? 'Edit Topic' : 'Create Topic'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-black rounded-lg text-sm"
                  placeholder="Topic name"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-black rounded-lg text-sm resize-none"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Difficulty</label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-black rounded-lg text-sm bg-white"
                >
                  <option value="BEGINNER">Beginner</option>
                  <option value="INTERMEDIATE">Intermediate</option>
                  <option value="ADVANCED">Advanced</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Tags (comma separated)</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-black rounded-lg text-sm"
                  placeholder="daily, business, travel"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))}
                  className="w-4 h-4 rounded border-2 border-black"
                />
                <span className="text-sm font-bold">Publish immediately</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowDialog(false)} className="brutal-btn px-4 py-2 text-sm bg-white">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || isSaving}
                className="brutal-btn-fill px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
