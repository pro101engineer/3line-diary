import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteTopic, listEntries, listTopics, saveTopic } from '../db/db';
import { Topic } from '../types';
import { MAX_TOPICS, MAX_TOPIC_NAME, TOPIC_PALETTE, colorName } from '../utils/topics';

const TOPIC_COLORS = TOPIC_PALETTE.map((c) => c.hex);

interface FormProps {
  initial: { name: string; color: string };
  submitLabel: string;
  onSubmit: (name: string, color: string) => Promise<void>;
  onCancel?: () => void;
}

function TopicForm({ initial, submitLabel, onSubmit, onCancel }: FormProps) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name, color);
      setName('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="topic-form">
      <input
        type="text"
        value={name}
        maxLength={MAX_TOPIC_NAME}
        placeholder="주제 이름 (예: 우리 가족, 프로젝트 A)"
        aria-label="주제 이름"
        onChange={(e) => setName(e.target.value)}
      />
      <div className="color-swatches" role="group" aria-label="주제 색">
        {TOPIC_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={'color-swatch' + (c === color ? ' color-swatch-active' : '')}
            style={{ backgroundColor: c }}
            aria-label={colorName(c)}
            aria-pressed={c === color}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      {error && <p className="backup-status backup-status-error">{error}</p>}
      <div className="topic-form-actions">
        {onCancel && (
          <button type="button" className="delete-confirm-cancel" onClick={onCancel} disabled={busy}>
            취소
          </button>
        )}
        <button
          type="button"
          className="topic-submit"
          onClick={handleSubmit}
          disabled={busy || name.trim() === ''}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const [t, entries] = await Promise.all([listTopics(), listEntries()]);
    const c: Record<string, number> = {};
    for (const e of entries) if (e.topicId) c[e.topicId] = (c[e.topicId] ?? 0) + 1;
    setTopics(t);
    setCounts(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(name: string, color: string) {
    await saveTopic({ name, color });
    await load();
  }

  async function handleRename(topic: Topic, name: string, color: string) {
    await saveTopic({ id: topic.id, name, color });
    setEditingId(null);
    await load();
  }

  async function handleDelete(topic: Topic) {
    await deleteTopic(topic.id);
    setDeletingId(null);
    await load();
  }

  if (loading) return null;

  const nextColor = TOPIC_COLORS[topics.length % TOPIC_COLORS.length];

  return (
    <div className="page topics-page">
      <header className="page-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          ← 뒤로
        </button>
        <h1>주제 관리</h1>
        <p className="page-subtitle">
          프로젝트, 사람, 상황별로 일기를 나눠 쓸 수 있어요 ({topics.length} / {MAX_TOPICS}개)
        </p>
      </header>

      {topics.length === 0 ? (
        <p className="empty-message">아직 주제가 없어요. 아래에서 첫 주제를 만들어 보세요.</p>
      ) : (
        <ul className="topic-list">
          {topics.map((topic) => (
            <li key={topic.id} className="topic-row">
              {editingId === topic.id ? (
                <TopicForm
                  initial={{ name: topic.name, color: topic.color }}
                  submitLabel="저장"
                  onSubmit={(name, color) => handleRename(topic, name, color)}
                  onCancel={() => setEditingId(null)}
                />
              ) : deletingId === topic.id ? (
                <div className="delete-confirm">
                  <p>
                    “{topic.name}” 주제를 삭제할까요? 이 주제의 일기 {counts[topic.id] ?? 0}개는 지워지지
                    않고 “주제 없음”으로 남아요.
                  </p>
                  <div className="delete-confirm-actions">
                    <button className="delete-confirm-cancel" onClick={() => setDeletingId(null)}>
                      취소
                    </button>
                    <button className="delete-confirm-ok" onClick={() => handleDelete(topic)}>
                      삭제
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <i className="topic-dot topic-dot-lg" style={{ background: topic.color }} />
                  <div className="topic-row-text">
                    <div className="topic-row-name">{topic.name}</div>
                    <div className="topic-row-count">일기 {counts[topic.id] ?? 0}개</div>
                  </div>
                  <button className="list-text-button" onClick={() => setEditingId(topic.id)}>
                    수정
                  </button>
                  <button className="list-text-button topic-delete" onClick={() => setDeletingId(topic.id)}>
                    삭제
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {topics.length < MAX_TOPICS && (
        <section className="topic-add">
          <h2 className="section-title">새 주제</h2>
          <TopicForm
            key={topics.length}
            initial={{ name: '', color: nextColor }}
            submitLabel="주제 추가"
            onSubmit={handleAdd}
          />
        </section>
      )}
    </div>
  );
}
