import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { TopicsPage } from './TopicsPage';
import { deleteEntry, deleteTopic, getEntry, listEntries, listTopics, saveEntry, saveTopic } from '../db/db';

beforeEach(async () => {
  for (const entry of await listEntries()) await deleteEntry(entry.id);
  for (const topic of await listTopics()) await deleteTopic(topic.id);
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/topics']}>
      <TopicsPage />
    </MemoryRouter>
  );
}

async function addTopic(name: string) {
  await userEvent.type(screen.getByLabelText('주제 이름'), name);
  await userEvent.click(screen.getByRole('button', { name: '주제 추가' }));
}

describe('TopicsPage', () => {
  it('색 선택 버튼은 색 이름으로 읽히고 선택된 색을 알려 준다', async () => {
    renderPage();
    const coral = await screen.findByRole('button', { name: '코랄' });
    expect(coral.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '갈색' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('주제가 없으면 안내하고 새 주제를 만들 수 있다', async () => {
    renderPage();
    expect(await screen.findByText(/아직 주제가 없어요/)).toBeDefined();

    await addTopic('우리 가족');
    expect(await screen.findByText('우리 가족')).toBeDefined();
    expect(screen.getByText('일기 0개')).toBeDefined();
    expect((await listTopics()).map((t) => t.name)).toEqual(['우리 가족']);
  });

  it('이름이 비어 있으면 추가 버튼을 쓸 수 없다', async () => {
    renderPage();
    await screen.findByText(/아직 주제가 없어요/);
    expect((screen.getByRole('button', { name: '주제 추가' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('같은 이름은 오류 메시지로 알려준다', async () => {
    await saveTopic({ name: '운동', color: '#2a9d8f' });
    renderPage();
    await screen.findByText('운동');
    await addTopic('운동');
    expect(await screen.findByText('같은 이름의 주제가 이미 있어요.')).toBeDefined();
    expect(await listTopics()).toHaveLength(1);
  });

  it('주제별 일기 수를 보여준다', async () => {
    const t = await saveTopic({ name: '프로젝트 A', color: '#4a7fb5' });
    await saveEntry({ date: '2026-08-01', topicId: t.id, text: 'a', photo: null });
    await saveEntry({ date: '2026-08-02', topicId: t.id, text: 'b', photo: null });
    renderPage();
    expect(await screen.findByText('일기 2개')).toBeDefined();
  });

  it('이름을 고칠 수 있다', async () => {
    await saveTopic({ name: '옛 이름', color: '#2a9d8f' });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '수정' }));
    const input = screen.getAllByLabelText('주제 이름')[0];
    await userEvent.clear(input);
    await userEvent.type(input, '새 이름');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('새 이름')).toBeDefined();
    expect((await listTopics()).map((t) => t.name)).toEqual(['새 이름']);
  });

  it('삭제하면 그 주제의 일기는 남고 주제 없음이 된다', async () => {
    const t = await saveTopic({ name: '지울 주제', color: '#c25b8a' });
    const e = await saveEntry({ date: '2026-08-01', topicId: t.id, text: '남는 일기', photo: null });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '삭제' }));
    const confirm = screen.getByText(/주제를 삭제할까요/).closest('.delete-confirm') as HTMLElement;
    expect(confirm.textContent).toContain('일기 1개는 지워지지 않고');
    await userEvent.click(within(confirm).getByRole('button', { name: '삭제' }));

    expect(await screen.findByText(/아직 주제가 없어요/)).toBeDefined();
    expect(await listTopics()).toEqual([]);
    expect((await getEntry(e.id))?.topicId).toBeNull();
  });
});
