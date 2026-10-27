import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import { DiaryEntry, Topic } from '../types';
import {
  MAX_PER_DAY,
  MAX_TOPICS,
  MAX_TOPIC_NAME,
  hasTopicName,
  normalizeTopicColor,
} from '../utils/topics';

interface DiaryDB extends DBSchema {
  entries: {
    key: string; // id
    value: DiaryEntry;
    indexes: { 'by-date': string };
  };
  topics: {
    key: string; // id
    value: Topic;
  };
}

const DB_NAME = 'three-line-diary';
const DB_VERSION = 2;

// 옛 버전 창이 열려 있어 업그레이드가 막혔을 때 / 풀렸을 때 화면에 알리기 위한 이벤트
export const DB_BLOCKED_EVENT = 'diary-db-blocked';
export const DB_READY_EVENT = 'diary-db-ready';

let dbPromise: Promise<IDBPDatabase<DiaryDB>> | null = null;

/** v1(날짜가 키, 하루 1개, 세 칸 `lines`일 수도 있음)의 레코드를 v2 형식으로 바꾼다. */
function migrateLegacyEntry(raw: unknown): DiaryEntry {
  const r = raw as Partial<DiaryEntry> & { lines?: string[] };
  return {
    id: r.id ?? uuidv4(),
    date: r.date as string,
    topicId: r.topicId ?? null,
    photo: r.photo ?? null,
    text: typeof r.text === 'string' ? r.text : (r.lines ?? []).join('\n'),
    createdAt: r.createdAt ?? Date.now(),
    updatedAt: r.updatedAt ?? Date.now(),
  };
}

function getDB(): Promise<IDBPDatabase<DiaryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DiaryDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        let legacy: unknown[] = [];
        if (oldVersion === 1) {
          // 키가 날짜인 옛 저장소를 읽어 두고 새 구조로 다시 만든다. 한 트랜잭션이라 실패하면 통째로 취소된다.
          legacy = await tx.objectStore('entries').getAll();
          db.deleteObjectStore('entries');
        }
        const store = db.createObjectStore('entries', { keyPath: 'id' });
        store.createIndex('by-date', 'date');
        db.createObjectStore('topics', { keyPath: 'id' });
        for (const raw of legacy) store.put(migrateLegacyEntry(raw));
      },
      // 다른 창(옛 버전 등)이 업그레이드·삭제를 기다리고 있으면 이 연결을 닫아 막지 않는다.
      blocking() {
        const closing = dbPromise;
        dbPromise = null;
        closing?.then((db) => db.close());
      },
      // 반대로 다른 창이 옛 연결을 열어 둬서 이 창의 업그레이드가 막혔다.
      blocked() {
        window.dispatchEvent(new Event(DB_BLOCKED_EVENT));
      },
    });
    dbPromise.then(
      () => window.dispatchEvent(new Event(DB_READY_EVENT)),
      () => undefined
    );
  }
  return dbPromise;
}

async function abortQuietly(tx: { abort(): void; done: Promise<void> }): Promise<void> {
  tx.abort();
  await tx.done.catch(() => undefined);
}

function byDateDesc(a: DiaryEntry, b: DiaryEntry): number {
  return b.date.localeCompare(a.date) || a.createdAt - b.createdAt;
}

export async function getEntry(id: string): Promise<DiaryEntry | undefined> {
  const db = await getDB();
  return db.get('entries', id);
}

/** 최신 날짜가 먼저, 같은 날 안에서는 먼저 쓴 일기가 먼저 온다. */
export async function listEntries(): Promise<DiaryEntry[]> {
  const db = await getDB();
  return (await db.getAll('entries')).sort(byDateDesc);
}

export async function listEntriesByDate(date: string): Promise<DiaryEntry[]> {
  const db = await getDB();
  const list = await db.getAllFromIndex('entries', 'by-date', date);
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export interface EntryInput {
  id?: string; // 있으면 그 일기를 고친다
  date: string;
  topicId: string | null;
  text: string;
  photo: Blob | null;
}

export async function saveEntry(input: EntryInput): Promise<DiaryEntry> {
  const db = await getDB();
  const tx = db.transaction('entries', 'readwrite');
  const existing = input.id ? await tx.store.get(input.id) : undefined;
  if (!existing) {
    const sameDay = await tx.store.index('by-date').count(input.date);
    if (sameDay >= MAX_PER_DAY) {
      await abortQuietly(tx);
      throw new Error(`하루에 최대 ${MAX_PER_DAY}개까지 쓸 수 있어요.`);
    }
  }
  const now = Date.now();
  const entry: DiaryEntry = {
    id: existing?.id ?? input.id ?? uuidv4(),
    date: input.date,
    topicId: input.topicId,
    photo: input.photo,
    text: input.text,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await tx.store.put(entry);
  await tx.done;
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('entries', id);
}

export async function deleteEntries(ids: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('entries', 'readwrite');
  for (const id of ids) tx.store.delete(id);
  await tx.done;
}

export async function listTopics(): Promise<Topic[]> {
  const db = await getDB();
  const topics = await db.getAll('topics');
  return topics
    .map((t) => ({ ...t, color: normalizeTopicColor(t.color) }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export interface TopicInput {
  id?: string; // 있으면 그 주제를 고친다
  name: string;
  color: string;
}

export async function saveTopic(input: TopicInput): Promise<Topic> {
  const name = input.name.trim();
  if (!name) throw new Error('주제 이름을 입력해 주세요.');
  if (name.length > MAX_TOPIC_NAME) throw new Error(`주제 이름은 ${MAX_TOPIC_NAME}자까지 쓸 수 있어요.`);

  const db = await getDB();
  const tx = db.transaction('topics', 'readwrite');
  const all = await tx.store.getAll();
  const existing = input.id ? all.find((t) => t.id === input.id) : undefined;
  if (hasTopicName(all, name, existing?.id)) {
    await abortQuietly(tx);
    throw new Error('같은 이름의 주제가 이미 있어요.');
  }
  if (!existing && all.length >= MAX_TOPICS) {
    await abortQuietly(tx);
    throw new Error(`주제는 ${MAX_TOPICS}개까지 만들 수 있어요.`);
  }
  const topic: Topic = {
    id: existing?.id ?? uuidv4(),
    name,
    color: input.color,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await tx.store.put(topic);
  await tx.done;
  return topic;
}

/** 주제를 지운다. 그 주제의 일기는 지우지 않고 "주제 없음"으로 남긴다. */
export async function deleteTopic(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['entries', 'topics'], 'readwrite');
  tx.objectStore('topics').delete(id);
  const entries = tx.objectStore('entries');
  for (const entry of await entries.getAll()) {
    if (entry.topicId === id) entries.put({ ...entry, topicId: null });
  }
  await tx.done;
}

export interface ImportTopic {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface ImportItem {
  id?: string; // 옛 백업(버전 2 이하)에는 없다
  date: string;
  topicId: string | null;
  text: string;
  photo: Blob | null;
  createdAt: number;
  updatedAt: number;
}

export interface ImportResult {
  added: number;
  updated: number;
  topicsAdded: number;
}

/**
 * 백업에서 복원한다.
 * - 주제: 같은 id나 같은 이름이 이미 있으면 기존 주제를 쓰고, 없으면 새로 만든다.
 * - 일기: id가 같으면 덮어쓴다. id가 없는 옛 백업은 같은 날짜의 "주제 없음" 일기를 덮어쓰고, 없으면 새로 만든다.
 * 덮어쓸 때는 최초 작성 시각을 더 이른 쪽으로 남긴다.
 */
export async function importData(data: {
  topics: ImportTopic[];
  entries: ImportItem[];
}): Promise<ImportResult> {
  const db = await getDB();
  const tx = db.transaction(['entries', 'topics'], 'readwrite');
  const topicStore = tx.objectStore('topics');
  const entryStore = tx.objectStore('entries');

  const topics = await topicStore.getAll();
  const topicIdMap = new Map<string, string | null>();
  let topicsAdded = 0;
  for (const t of data.topics) {
    const same = topics.find((x) => x.id === t.id) ?? topics.find((x) => hasTopicName([x], t.name));
    if (same) {
      topicIdMap.set(t.id, same.id);
    } else {
      const created: Topic = { id: t.id, name: t.name, color: t.color, createdAt: t.createdAt };
      topicStore.put(created);
      topics.push(created);
      topicIdMap.set(t.id, created.id);
      topicsAdded++;
    }
  }

  const existing = await entryStore.getAll();
  const byId = new Map(existing.map((e) => [e.id, e]));
  let added = 0;
  let updated = 0;
  for (const item of data.entries) {
    const topicId = item.topicId ? (topicIdMap.get(item.topicId) ?? null) : null;
    let target = item.id ? byId.get(item.id) : undefined;
    if (!item.id) {
      target = existing
        .filter((e) => e.date === item.date && e.topicId === null)
        .sort((a, b) => a.createdAt - b.createdAt)[0];
    }
    const entry: DiaryEntry = {
      id: target?.id ?? item.id ?? uuidv4(),
      date: item.date,
      topicId,
      photo: item.photo,
      text: item.text,
      createdAt: Math.min(target?.createdAt ?? item.createdAt, item.createdAt),
      updatedAt: item.updatedAt,
    };
    if (target) {
      updated++;
      existing[existing.indexOf(target)] = entry;
    } else {
      added++;
      existing.push(entry);
    }
    byId.set(entry.id, entry);
    entryStore.put(entry);
  }

  await tx.done;
  return { added, updated, topicsAdded };
}
