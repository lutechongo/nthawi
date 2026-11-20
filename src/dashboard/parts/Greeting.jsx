import { useEffect, useState } from 'react';
import { Avatar } from '../../ui/kit.jsx';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Your photo plus a greeting that types itself out with a cursor, once each time it changes.
 * The line underneath fades in when typing is done.
 */
export default function Greeting({ title, sub, settings, onProfile }) {
  const [shown, setShown] = useState(() => (reduced() ? title.length : 0));
  const [typing, setTyping] = useState(!reduced());
  const [caret, setCaret] = useState(!reduced());

  useEffect(() => {
    if (reduced()) {
      setShown(title.length);
      return;
    }
    setShown(0);
    setTyping(true);
    setCaret(true);
    let i = 0;
    let timer;
    let hide;
    const tick = () => {
      i += 1;
      setShown(i);
      if (i < title.length) {
        // A little human rhythm: pause slightly after commas and spaces.
        const ch = title[i - 1];
        timer = setTimeout(tick, ch === ',' ? 160 : ch === ' ' ? 70 : 48 + Math.random() * 30);
      } else {
        setTyping(false);
        hide = setTimeout(() => setCaret(false), 4200);
      }
    };
    timer = setTimeout(tick, 300);
    return () => {
      clearTimeout(timer);
      clearTimeout(hide);
    };
  }, [title]);

  return (
    <div className="greet-wrap">
      <button className="greet-photo" onClick={onProfile} aria-label="Your profile" title="Your profile">
        <Avatar settings={settings} size={56} radius={19} fontSize={19} />
      </button>
      <div className="greet">
        <h1 className="greet-title" aria-label={title}>
          <span aria-hidden="true">{title.slice(0, shown)}</span>
          {caret && <span className={`greet-caret ${typing ? 'typing' : ''}`} aria-hidden="true" />}
        </h1>
        <p className={`greet-sub ${typing ? '' : 'in'}`} title={sub}>
          {sub}
        </p>
      </div>
    </div>
  );
}
