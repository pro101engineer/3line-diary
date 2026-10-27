import { Topic } from '../types';

// 하루에 쓸 수 있는 일기 수. 하루 1~3개가 부담 없이 오래 쓰기 좋은 양이다.
export const MAX_PER_DAY = 3;
export const MAX_TOPICS = 12;
export const MAX_TOPIC_NAME = 12;

// 색약(적록·청황)에서도 서로 구분되도록 고른 색. 가장 비슷한 두 색의 차이(ΔE)가 정상 시야 32, 적록색약 12 이상이다.
export const TOPIC_PALETTE = [
  { hex: '#e15748', name: '코랄' },
  { hex: '#9e871a', name: '머스터드' },
  { hex: '#507920', name: '초록' },
  { hex: '#008082', name: '청록' },
  { hex: '#008de9', name: '파랑' },
  { hex: '#7956b8', name: '보라' },
  { hex: '#de559b', name: '핑크' },
  { hex: '#634320', name: '갈색' },
];
export const TOPIC_COLORS = TOPIC_PALETTE.map((c) => c.hex);

// 예전 팔레트(같은 순서)로 저장된 주제 색은 읽을 때 새 색으로 바꿔 보여 준다.
const LEGACY_COLORS = ['#d97757', '#c9a227', '#6a994e', '#2a9d8f', '#4a7fb5', '#7b6cb5', '#c25b8a', '#8a8378'];

export function normalizeTopicColor(color: string): string {
  const i = LEGACY_COLORS.indexOf(color.toLowerCase());
  return i >= 0 ? TOPIC_COLORS[i] : color;
}

/** 스크린리더용 색 이름. 팔레트에 없는 색이면 "색 #hex" */
export function colorName(color: string): string {
  return TOPIC_PALETTE.find((c) => c.hex === color.toLowerCase())?.name ?? `색 ${color}`;
}

// 주제가 없는 일기를 표시하는 색 (흰 바탕에서 3:1 이상)
export const NO_TOPIC_COLOR = '#8a8378';
export const NO_TOPIC_LABEL = '주제 없음';

export function topicColor(topic: Topic | undefined | null): string {
  return topic?.color ?? NO_TOPIC_COLOR;
}

export function topicName(topic: Topic | undefined | null): string {
  return topic?.name ?? NO_TOPIC_LABEL;
}

export function topicMap(topics: Topic[]): Map<string, Topic> {
  return new Map(topics.map((t) => [t.id, t]));
}

/** 같은 이름(대소문자·앞뒤 공백 무시)의 주제가 이미 있는지 */
export function hasTopicName(topics: Topic[], name: string, exceptId?: string): boolean {
  const n = name.trim().toLowerCase();
  return topics.some((t) => t.id !== exceptId && t.name.trim().toLowerCase() === n);
}
