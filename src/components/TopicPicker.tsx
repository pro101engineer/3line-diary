import { Link } from 'react-router-dom';
import { Topic } from '../types';
import { NO_TOPIC_COLOR, NO_TOPIC_LABEL } from '../utils/topics';
import { ChipRow } from './ChipRow';

const NONE = 'none';

interface Props {
  topics: Topic[];
  value: string | null;
  onChange: (topicId: string | null) => void;
}

export function TopicPicker({ topics, value, onChange }: Props) {
  const options = [
    { key: NONE, label: NO_TOPIC_LABEL, color: NO_TOPIC_COLOR },
    ...topics.map((t) => ({ key: t.id, label: t.name, color: t.color })),
  ];

  return (
    <div className="topic-picker">
      <ChipRow
        options={options}
        value={value ?? NONE}
        onChange={(key) => onChange(key === NONE ? null : key)}
        ariaLabel="일기 주제"
        scrollable
      >
        <Link className="chip chip-link topic-manage-link" to="/topics">
          {topics.length === 0 ? '+ 주제 만들기' : '주제 관리'}
        </Link>
      </ChipRow>
    </div>
  );
}
