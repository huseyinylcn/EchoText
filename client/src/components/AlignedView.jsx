import { Fragment, memo, useMemo, useState } from 'react';

function groupParagraphs(segments) {
  const paragraphs = [];
  segments.forEach((segment, index) => {
    const paragraph = (paragraphs[segment.p] ??= { first: index, last: index, items: [] });
    paragraph.last = index;
    paragraph.items.push({ ...segment, index });
  });
  return paragraphs.filter(Boolean);
}

// Yalnızca vurgulanan cümleyi içeren satırlar yeniden çizilsin diye memo kullanıyoruz.
const ParagraphRow = memo(function ParagraphRow({ items, activeIndex, onActivate }) {
  const renderSide = (key) =>
    items.map(({ index, [key]: text }) => (
      <Fragment key={index}>
        <span
          className={`seg${index === activeIndex ? ' active' : ''}${text == null ? ' pending' : ''}`}
          onMouseEnter={() => onActivate(index)}
          onClick={() => onActivate(index)}
        >
          {text ?? '…'}
        </span>{' '}
      </Fragment>
    ));

  return (
    <div className="aligned-row">
      <p className="aligned-cell" lang="en">
        {renderSide('en')}
      </p>
      <p className="aligned-cell" lang="tr">
        {renderSide('tr')}
      </p>
    </div>
  );
});

/**
 * İngilizce ve Türkçe metni paragraf paragraf yan yana gösterir. Bir cümlenin
 * üzerine gelindiğinde (dokunmatik ekranda dokunulduğunda) iki taraftaki karşılığı vurgulanır.
 */
export default function AlignedView({ segments }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const paragraphs = useMemo(() => groupParagraphs(segments), [segments]);

  return (
    <div className="aligned" onMouseLeave={() => setActiveIndex(null)}>
      <div className="aligned-head">
        <span>İngilizce (orijinal)</span>
        <span>Türkçe</span>
      </div>
      {paragraphs.map((paragraph) => (
        <ParagraphRow
          key={paragraph.first}
          items={paragraph.items}
          activeIndex={
            activeIndex !== null && activeIndex >= paragraph.first && activeIndex <= paragraph.last
              ? activeIndex
              : null
          }
          onActivate={setActiveIndex}
        />
      ))}
    </div>
  );
}
