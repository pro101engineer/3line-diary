import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteEntries,
  deleteEntry,
  deleteTopic,
  getEntry,
  importData,
  listEntries,
  listEntriesByDate,
  listTopics,
  saveEntry,
  saveTopic,
} from './db';
import { MAX_PER_DAY, MAX_TOPICS, MAX_TOPIC_NAME, TOPIC_COLORS } from '../utils/topics';

const TEXT = '아침\n점심\n저녁';
const D = '2026-08-29';

async function clearAll() {
  for (const entry of await listEntries()) await deleteEntry(entry.id);
  for (const topic of await listTopics()) await deleteTopic(topic.id);
}

function write(over: Partial<Parameters<typeof saveEntry>[0]> = {}) {
  return saveEntry({ date: D, topicId: null, text: TEXT, photo: null, ...over });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 7, 29, 9, 0, 0));
  await clearAll();
});

afterEach(() => {
  vi.useRealTimers();
});

function tick(minutes = 1) {
  vi.setSystemTime(new Date(Date.now() + minutes * 60_000));
}

describe('saveEntry / getEntry', () => {
  it('저장한 일기를 id로 다시 읽는다', async () => {
    const saved = await write();
    const entry = await getEntry(saved.id);
    expect(entry?.text).toBe(TEXT);
    expect(entry?.date).toBe(D);
    expect(entry?.topicId).toBeNull();
    expect(entry?.photo).toBeNull();
  });

  it('없는 id는 undefined다', async () => {
    expect(await getEntry('nope')).toBeUndefined();
  });

  it('같은 날 여러 개를 쓸 수 있고, 먼저 쓴 순서로 나온다', async () => {
    const a = await write({ text: '첫째' });
    tick();
    const b = await write({ text: '둘째' });
    expect((await listEntriesByDate(D)).map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it(`하루 ${MAX_PER_DAY}개를 넘겨 새로 쓰면 막고, 아무것도 저장하지 않는다`, async () => {
    for (let i = 0; i < MAX_PER_DAY; i++) {
      await write({ text: `${i}` });
      tick();
    }
    await expect(write({ text: '넘침' })).rejects.toThrow(`하루에 최대 ${MAX_PER_DAY}개`);
    expect(await listEntriesByDate(D)).toHaveLength(MAX_PER_DAY);
  });

  it('다른 날짜는 한도에 영향을 주지 않는다', async () => {
    for (let i = 0; i < MAX_PER_DAY; i++) await write();
    await expect(write({ date: '2026-08-30' })).resolves.toBeDefined();
  });

  it('한도가 찬 날에도 있는 일기는 고칠 수 있고, id와 최초 작성 시각을 유지한다', async () => {
    const first = await write({ text: '원래' });
    for (let i = 1; i < MAX_PER_DAY; i++) {
      tick();
      await write();
    }
    tick(30);
    const edited = await write({ id: first.id, text: '고침' });
    expect(edited.id).toBe(first.id);
    expect(edited.createdAt).toBe(first.createdAt);
    expect(edited.updatedAt).toBeGreaterThan(first.updatedAt);
    expect((await getEntry(first.id))?.text).toBe('고침');
    expect(await listEntriesByDate(D)).toHaveLength(MAX_PER_DAY);
  });

  it('주제를 바꿀 수 있다', async () => {
    const topic = await saveTopic({ name: '가족', color: '#d97757' });
    const e = await write();
    await write({ id: e.id, topicId: topic.id });
    expect((await getEntry(e.id))?.topicId).toBe(topic.id);
  });

  it('예전 팔레트 색으로 저장된 주제는 새 색으로 읽힌다', async () => {
    await saveTopic({ name: '옛 주제', color: '#d97757' });
    const [topic] = (await listTopics()).filter((t) => t.name === '옛 주제');
    expect(topic.color).toBe(TOPIC_COLORS[0]);
  });

  it('사진을 null로 저장하면 사진이 지워진다', async () => {
    const e = await write({ photo: new Blob(['사진'], { type: 'image/jpeg' }) });
    expect((await getEntry(e.id))?.photo).not.toBeNull();
    await write({ id: e.id, photo: null });
    expect((await getEntry(e.id))?.photo).toBeNull();
  });

  it('사진을 새로 넘기면 교체한다', async () => {
    const e = await write({ photo: new Blob(['옛날'], { type: 'image/jpeg' }) });
    await write({ id: e.id, photo: new Blob(['새것'], { type: 'image/jpeg' }) });
    expect(await (await getEntry(e.id))!.photo!.text()).toBe('새것');
  });
});

describe('listEntries', () => {
  it('최신 날짜가 먼저, 같은 날에는 먼저 쓴 일기가 먼저 온다', async () => {
    const a = await write({ date: '2026-01-02' });
    const b = await write({ date: '2026-08-29', text: '아침' });
    tick();
    const c = await write({ date: '2026-08-29', text: '저녁' });
    const d = await write({ date: '2026-05-10' });
    expect((await listEntries()).map((e) => e.id)).toEqual([b.id, c.id, d.id, a.id]);
  });

  it('비어 있으면 빈 배열이다', async () => {
    expect(await listEntries()).toEqual([]);
  });
});

describe('deleteEntry / deleteEntries', () => {
  it('해당 일기만 지운다 (같은 날의 다른 일기는 남는다)', async () => {
    const a = await write({ text: '남음' });
    const b = await write({ text: '지움' });
    await deleteEntry(b.id);
    expect((await listEntriesByDate(D)).map((e) => e.id)).toEqual([a.id]);
  });

  it('없는 id를 지워도 오류가 나지 않는다', async () => {
    await expect(deleteEntry('nope')).resolves.toBeUndefined();
  });

  it('고른 일기들만 한꺼번에 지운다', async () => {
    const a = await write({ date: '2026-08-27' });
    const b = await write({ date: '2026-08-28' });
    const c = await write({ date: '2026-08-29' });
    await deleteEntries([a.id, c.id]);
    expect((await listEntries()).map((e) => e.id)).toEqual([b.id]);
  });

  it('빈 목록이나 없는 id를 넘겨도 오류가 나지 않는다', async () => {
    await write();
    await expect(deleteEntries([])).resolves.toBeUndefined();
    await expect(deleteEntries(['nope'])).resolves.toBeUndefined();
    expect(await listEntries()).toHaveLength(1);
  });
});

describe('주제', () => {
  it('주제를 만들고 만든 순서대로 읽는다', async () => {
    await saveTopic({ name: '가족', color: '#111' });
    tick();
    await saveTopic({ name: '프로젝트 A', color: '#222' });
    expect((await listTopics()).map((t) => t.name)).toEqual(['가족', '프로젝트 A']);
  });

  it('이름 앞뒤 공백은 지운다', async () => {
    expect((await saveTopic({ name: '  운동  ', color: '#111' })).name).toBe('운동');
  });

  it('빈 이름과 너무 긴 이름은 거부한다', async () => {
    await expect(saveTopic({ name: '   ', color: '#111' })).rejects.toThrow('이름을 입력');
    await expect(saveTopic({ name: 'a'.repeat(MAX_TOPIC_NAME + 1), color: '#111' })).rejects.toThrow(
      `${MAX_TOPIC_NAME}자까지`
    );
  });

  it('같은 이름(대소문자 무시)은 거부하지만 자기 자신을 고치는 것은 허용한다', async () => {
    const t = await saveTopic({ name: 'Work', color: '#111' });
    await expect(saveTopic({ name: 'work', color: '#222' })).rejects.toThrow('이미 있어요');
    const renamed = await saveTopic({ id: t.id, name: 'Work', color: '#222' });
    expect(renamed.id).toBe(t.id);
    expect(renamed.color).toBe('#222');
    expect(await listTopics()).toHaveLength(1);
  });

  it(`주제는 ${MAX_TOPICS}개까지만 만들 수 있다`, async () => {
    for (let i = 0; i < MAX_TOPICS; i++) await saveTopic({ name: `주제${i}`, color: '#111' });
    await expect(saveTopic({ name: '하나 더', color: '#111' })).rejects.toThrow(`${MAX_TOPICS}개까지`);
  });

  it('주제를 지우면 그 일기는 지워지지 않고 주제 없음이 된다', async () => {
    const a = await saveTopic({ name: 'A', color: '#111' });
    const b = await saveTopic({ name: 'B', color: '#222' });
    const ea = await write({ topicId: a.id, text: 'A의 일기' });
    const eb = await write({ topicId: b.id, text: 'B의 일기' });
    await deleteTopic(a.id);
    expect((await getEntry(ea.id))?.topicId).toBeNull();
    expect((await getEntry(ea.id))?.text).toBe('A의 일기');
    expect((await getEntry(eb.id))?.topicId).toBe(b.id);
    expect((await listTopics()).map((t) => t.id)).toEqual([b.id]);
  });
});

describe('importData', () => {
  function item(over: Record<string, unknown> = {}) {
    return {
      date: D,
      topicId: null,
      text: TEXT,
      photo: null,
      createdAt: 1000,
      updatedAt: 2000,
      ...over,
    };
  }

  it('새 주제를 만들고 일기의 주제를 이어 준다', async () => {
    const result = await importData({
      topics: [{ id: 't1', name: '가족', color: '#111', createdAt: 5 }],
      entries: [item({ id: 'e1', topicId: 't1' })],
    });
    expect(result).toEqual({ added: 1, updated: 0, topicsAdded: 1 });
    expect((await getEntry('e1'))?.topicId).toBe('t1');
    expect((await listTopics())[0].name).toBe('가족');
  });

  it('같은 이름의 주제가 이미 있으면 그 주제에 연결한다', async () => {
    const mine = await saveTopic({ name: '가족', color: '#111' });
    const result = await importData({
      topics: [{ id: 'other-id', name: '가족', color: '#999', createdAt: 5 }],
      entries: [item({ id: 'e1', topicId: 'other-id' })],
    });
    expect(result.topicsAdded).toBe(0);
    expect((await getEntry('e1'))?.topicId).toBe(mine.id);
    expect(await listTopics()).toHaveLength(1);
  });

  it('id가 같은 일기는 덮어쓰고 최초 작성 시각은 더 이른 쪽을 남긴다', async () => {
    const existing = await write({ text: '원래' });
    const result = await importData({
      topics: [],
      entries: [item({ id: existing.id, text: '가져온', createdAt: 1 })],
    });
    expect(result).toEqual({ added: 0, updated: 1, topicsAdded: 0 });
    const after = await getEntry(existing.id);
    expect(after?.text).toBe('가져온');
    expect(after?.createdAt).toBe(1);
    expect(await listEntriesByDate(D)).toHaveLength(1);
  });

  it('id가 없는 옛 백업은 같은 날짜의 주제 없는 일기를 덮어쓴다', async () => {
    const existing = await write({ text: '원래' });
    const result = await importData({ topics: [], entries: [item({ text: '옛 백업' })] });
    expect(result).toEqual({ added: 0, updated: 1, topicsAdded: 0 });
    expect((await getEntry(existing.id))?.text).toBe('옛 백업');
  });

  it('id가 없는 옛 백업이라도 그날 주제 없는 일기가 없으면 새로 추가한다', async () => {
    const topic = await saveTopic({ name: 'A', color: '#111' });
    await write({ topicId: topic.id, text: 'A의 일기' });
    const result = await importData({ topics: [], entries: [item({ text: '옛 백업' })] });
    expect(result).toEqual({ added: 1, updated: 0, topicsAdded: 0 });
    expect(await listEntriesByDate(D)).toHaveLength(2);
  });

  it('사진도 함께 복원한다', async () => {
    await importData({
      topics: [],
      entries: [item({ id: 'e1', photo: new Blob(['사진'], { type: 'image/jpeg' }) })],
    });
    expect(await (await getEntry('e1'))!.photo!.text()).toBe('사진');
  });

  it('빈 백업을 가져와도 아무 일도 없다', async () => {
    await write();
    expect(await importData({ topics: [], entries: [] })).toEqual({ added: 0, updated: 0, topicsAdded: 0 });
    expect(await listEntries()).toHaveLength(1);
  });
});
