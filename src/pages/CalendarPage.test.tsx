import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './CalendarPage';
import { deleteEntry, deleteTopic, listEntries, listTopics, saveEntry, saveTopic } from '../db/db';
import { MAX_PER_DAY, TOPIC_COLORS } from '../utils/topics';

const TEXT = '아침\n점심\n저녁';

function write(date: string, over: Partial<Parameters<typeof saveEntry>[0]> = {}) {
  return saveEntry({ date, topicId: null, text: TEXT, photo: null, ...over });
}

beforeEach(async () => {
  for (const entry of await listEntries()) await deleteEntry(entry.id);
  for (const topic of await listTopics()) await deleteTopic(topic.id);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 7, 15, 12, 0, 0)); // 2026-08-15
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPage(initial = '/calendar') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/new/:date" element={<div>새 일기 화면</div>} />
        <Route path="/entry/:id" element={<div>일기 수정 화면</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function userEv() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe('CalendarPage', () => {
  it('이번 달을 열고 기록 개수(일기 수)를 알려준다', async () => {
    await write('2026-08-03');
    await write('2026-08-03', { text: '같은 날 두 번째' });
    await write('2026-08-11');
    await write('2026-07-30'); // 지난달은 세지 않는다
    renderPage();

    expect(await screen.findByText('2026년 8월')).toBeDefined();
    expect(screen.getByText('이번 달에 3개의 기록')).toBeDefined();
  });

  it('일기가 있는 날에 개수를 표시한다', async () => {
    await write('2026-08-03');
    await write('2026-08-03', { text: '둘째' });
    renderPage();

    const marked = await screen.findByLabelText(/^2026년 8월 3일, 일기 2개/);
    expect(marked.className).toContain('calendar-cell-has-entry');
    expect(screen.getByLabelText('2026년 8월 4일').className).not.toContain('calendar-cell-has-entry');
  });

  it('일기마다 주제 색의 점을 찍는다 (주제 없음은 회색 계열)', async () => {
    const topic = await saveTopic({ name: '가족', color: TOPIC_COLORS[0] });
    await write('2026-08-03', { topicId: topic.id });
    vi.setSystemTime(new Date(Date.now() + 1000));
    await write('2026-08-03', { text: '주제 없는 일기' });
    renderPage();

    const cell = await screen.findByLabelText(/^2026년 8월 3일, 일기 2개/);
    const dots = cell.querySelectorAll('.calendar-dot');
    expect(dots).toHaveLength(2);
    expect((dots[0] as HTMLElement).style.background).toContain('rgb(225, 87, 72)');
    expect((dots[1] as HTMLElement).style.background).not.toContain('rgb(225, 87, 72)');
  });

  it('스크린리더가 읽는 이름에 그날 일기의 주제가 들어 있다', async () => {
    const topic = await saveTopic({ name: '가족', color: TOPIC_COLORS[0] });
    await write('2026-08-03', { topicId: topic.id });
    vi.setSystemTime(new Date(Date.now() + 1000));
    await write('2026-08-03', { text: '주제 없는 일기' });
    renderPage();

    expect(await screen.findByLabelText('2026년 8월 3일, 일기 2개: 가족, 주제 없음')).toBeDefined();
  });

  it(`점은 최대 ${MAX_PER_DAY}개까지만 찍는다`, async () => {
    for (let i = 0; i < MAX_PER_DAY; i++) {
      await write('2026-08-03', { text: `${i}` });
      vi.setSystemTime(new Date(Date.now() + 1000));
    }
    renderPage();
    const cell = await screen.findByLabelText(new RegExp(`^2026년 8월 3일, 일기 ${MAX_PER_DAY}개`));
    expect(cell.querySelectorAll('.calendar-dot')).toHaveLength(MAX_PER_DAY);
  });

  it('아직 오지 않은 날은 누를 수 없다', async () => {
    renderPage();
    await screen.findByText('2026년 8월');

    expect((screen.getByLabelText('2026년 8월 16일') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('2026년 8월 15일') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('2026년 8월 14일') as HTMLButtonElement).disabled).toBe(false);
  });

  it('이전 달과 다음 달로 넘길 수 있다', async () => {
    const user = userEv();
    renderPage();
    await screen.findByText('2026년 8월');

    await user.click(screen.getByLabelText('이전 달'));
    expect(screen.getByText('2026년 7월')).toBeDefined();

    await user.click(screen.getByLabelText('다음 달'));
    await user.click(screen.getByLabelText('다음 달'));
    expect(screen.getByText('2026년 9월')).toBeDefined();
  });

  it('달 이름을 누르면 이번 달로 돌아온다', async () => {
    const user = userEv();
    renderPage();
    await screen.findByText('2026년 8월');

    await user.click(screen.getByLabelText('이전 달'));
    await user.click(screen.getByText('2026년 7월'));
    expect(screen.getByText('2026년 8월')).toBeDefined();
  });
});

describe('CalendarPage 날짜 패널', () => {
  it('처음에는 오늘이 선택되어 있고, 일기가 없으면 안내한다', async () => {
    renderPage();
    expect(await screen.findByText('2026년 8월 15일 (토) · 0 / 3개')).toBeDefined();
    expect(screen.getByText('이 날은 아직 쓴 일기가 없어요.')).toBeDefined();
  });

  it('날짜를 누르면 그날의 일기들을 보여준다', async () => {
    const user = userEv();
    await write('2026-08-03', { text: '첫째 일기' });
    vi.setSystemTime(new Date(Date.now() + 1000));
    await write('2026-08-03', { text: '둘째 일기' });
    renderPage();
    await screen.findByText('2026년 8월');

    await user.click(screen.getByLabelText(/^2026년 8월 3일, 일기 2개/));
    expect(screen.getByText('2026년 8월 3일 (월) · 2 / 3개')).toBeDefined();
    expect(screen.getByText('첫째 일기')).toBeDefined();
    expect(screen.getByText('둘째 일기')).toBeDefined();
  });

  it('일기를 누르면 그 일기의 수정 화면으로 간다', async () => {
    const user = userEv();
    await write('2026-08-03', { text: '고칠 일기' });
    renderPage('/calendar?d=2026-08-03');
    await user.click(await screen.findByText('고칠 일기'));
    expect(screen.getByText('일기 수정 화면')).toBeDefined();
  });

  it('일기가 3개 미만이면 "이 날 일기 쓰기"로 새 일기 화면에 간다', async () => {
    const user = userEv();
    renderPage('/calendar?d=2026-08-03');
    await user.click(await screen.findByText('이 날 일기 쓰기'));
    expect(screen.getByText('새 일기 화면')).toBeDefined();
  });

  it(`하루 ${MAX_PER_DAY}개가 차면 쓰기 버튼 대신 안내한다`, async () => {
    for (let i = 0; i < MAX_PER_DAY; i++) {
      await write('2026-08-03', { text: `일기 ${i}` });
      vi.setSystemTime(new Date(Date.now() + 1000));
    }
    renderPage('/calendar?d=2026-08-03');
    const panel = (await screen.findByText(`2026년 8월 3일 (월) · ${MAX_PER_DAY} / ${MAX_PER_DAY}개`)).closest('section')!;
    expect(within(panel).queryByText('이 날 일기 쓰기')).toBeNull();
    expect(within(panel).getByText(`하루에 ${MAX_PER_DAY}개까지 쓸 수 있어요.`)).toBeDefined();
  });

  it('주소의 d 값이 있는 달로 열린다', async () => {
    renderPage('/calendar?d=2026-05-20');
    expect(await screen.findByText('2026년 5월')).toBeDefined();
    expect(screen.getByText('2026년 5월 20일 (수) · 0 / 3개')).toBeDefined();
  });
});
