import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EntryCard } from '../components/EntryCard';
import { useThumbURLs } from '../hooks/useThumbURLs';
import { listEntries, listTopics } from '../db/db';
import { DiaryEntry, Topic } from '../types';
import { formatKorean, todayISO } from '../utils/date';
import {
  addMonths,
  buildMonthGrid,
  currentYearMonth,
  monthLabel,
  WEEKDAY_LABELS,
  YearMonth,
} from '../utils/calendar';
import { MAX_PER_DAY, topicColor, topicMap, topicName } from '../utils/topics';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DOTS = MAX_PER_DAY;

/** 스크린리더가 날짜와 함께 그날 일기의 주제 이름까지 읽도록 한다. */
function cellLabel(date: string, list: DiaryEntry[], topicsById: Map<string, Topic>): string {
  const [y, m, d] = date.split('-').map(Number);
  const base = `${y}년 ${m}월 ${d}일`;
  if (list.length === 0) return base;
  const names = list.map((e) => topicName(e.topicId ? topicsById.get(e.topicId) : null));
  return `${base}, 일기 ${list.length}개: ${names.join(', ')}`;
}

function monthOf(date: string): YearMonth {
  const [year, month] = date.split('-').map(Number);
  return { year, month };
}

export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const paramDate = params.get('d');
  const selectedDate = paramDate && DATE_RE.test(paramDate) ? paramDate : today;

  const [cursor, setCursor] = useState<YearMonth>(() =>
    paramDate && DATE_RE.test(paramDate) ? monthOf(paramDate) : currentYearMonth()
  );
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const thumbURLs = useThumbURLs(entries);

  useEffect(() => {
    Promise.all([listEntries(), listTopics()]).then(([e, t]) => {
      setEntries(e);
      setTopics(t);
      setLoading(false);
    });
  }, []);

  const topicsById = useMemo(() => topicMap(topics), [topics]);
  const byDate = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.createdAt - b.createdAt);
    return map;
  }, [entries]);

  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const monthCount = useMemo(() => {
    const prefix = `${cursor.year}-${String(cursor.month).padStart(2, '0')}`;
    return entries.filter((e) => e.date.startsWith(prefix)).length;
  }, [entries, cursor]);

  if (loading) return null;

  const dayEntries = byDate.get(selectedDate) ?? [];
  const dayFull = dayEntries.length >= MAX_PER_DAY;

  return (
    <div className="page calendar-page">
      <header className="page-header">
        <h1>달력</h1>
        <p className="page-subtitle">이번 달에 {monthCount}개의 기록</p>
      </header>

      <div className="calendar-nav">
        <button
          type="button"
          className="calendar-nav-button"
          aria-label="이전 달"
          onClick={() => setCursor((c) => addMonths(c, -1))}
        >
          ‹
        </button>
        <button
          type="button"
          className="calendar-nav-label"
          onClick={() => setCursor(currentYearMonth())}
        >
          {monthLabel(cursor)}
        </button>
        <button
          type="button"
          className="calendar-nav-button"
          aria-label="다음 달"
          onClick={() => setCursor((c) => addMonths(c, 1))}
        >
          ›
        </button>
      </div>

      <div className="calendar-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {weeks.flat().map((cell) => {
          const list = byDate.get(cell.date) ?? [];
          const isFuture = cell.date > today;
          const classes = ['calendar-cell'];
          if (!cell.inMonth) classes.push('calendar-cell-outside');
          if (cell.date === today) classes.push('calendar-cell-today');
          if (list.length > 0) classes.push('calendar-cell-has-entry');
          if (cell.date === selectedDate) classes.push('calendar-cell-selected');

          return (
            <button
              key={cell.date}
              type="button"
              className={classes.join(' ')}
              disabled={isFuture}
              aria-label={cellLabel(cell.date, list, topicsById)}
              onClick={() => setParams({ d: cell.date }, { replace: true })}
            >
              <span className="calendar-day">{cell.day}</span>
              <span className="calendar-dots">
                {list.slice(0, MAX_DOTS).map((e) => (
                  <i
                    key={e.id}
                    className="calendar-dot"
                    style={{ background: topicColor(e.topicId ? topicsById.get(e.topicId) : null) }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <section className="day-panel">
        <h2 className="section-title">
          {formatKorean(selectedDate)} · {dayEntries.length} / {MAX_PER_DAY}개
        </h2>
        {dayEntries.length > 0 && (
          <ul className="entry-list">
            {dayEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                topic={entry.topicId ? topicsById.get(entry.topicId) : undefined}
                thumbURL={thumbURLs[entry.id]}
                onClick={() => navigate(`/entry/${entry.id}`)}
              />
            ))}
          </ul>
        )}
        {dayEntries.length === 0 && <p className="calendar-hint">이 날은 아직 쓴 일기가 없어요.</p>}
        {selectedDate > today ? (
          <p className="calendar-hint">아직 오지 않은 날은 쓸 수 없어요.</p>
        ) : dayFull ? (
          <p className="calendar-hint">하루에 {MAX_PER_DAY}개까지 쓸 수 있어요.</p>
        ) : (
          <button className="save-button" onClick={() => navigate(`/new/${selectedDate}`)}>
            이 날 일기 쓰기
          </button>
        )}
      </section>
    </div>
  );
}
