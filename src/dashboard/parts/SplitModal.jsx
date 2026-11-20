import { useState } from 'react';
import { send, sessionDuration } from '../../shared/store.js';
import { fmtClock, fmtHM, toDateInput, combineDateTime } from '../../shared/time.js';
import { Modal, useToast } from '../../ui/kit.jsx';

/** Split one session into two at a chosen time (e.g. it was really two tasks). */
export default function SplitModal({ session: s, onClose }) {
  const toast = useToast();
  const mid = s.start + Math.round((s.end - s.start) / 2 / 60000) * 60000;
  const [time, setTime] = useState(fmtClock(mid));
  const [error, setError] = useState('');
  const at = combineDateTime(toDateInput(s.start), time);
  const raw = s.end - s.start;
  const total = sessionDuration(s);
  const first = at > s.start && at < s.end ? total * ((at - s.start) / raw) : 0;
  const ok = at > s.start + 60000 && at < s.end - 60000;

  const save = async () => {
    try {
      await send('session:split', { id: s.id, at });
      toast('Session split in two. Rename either part from its ⋯ menu.');
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Modal
      title="Split session"
      sub={`${s.title} · ${fmtClock(s.start)} – ${fmtClock(s.end)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!ok}>Split</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="split-at">Split at</label>
        <input id="split-at" type="time" className="input input-time" value={time} min={fmtClock(s.start)} max={fmtClock(s.end)} onChange={(e) => (setTime(e.target.value), setError(''))} />
      </div>
      {ok ? (
        <div className="row" style={{ gap: 12 }}>
          <div className="card grow" style={{ padding: 12, boxShadow: 'none' }}>
            <div className="caption">First part</div>
            <div className="tnum" style={{ fontWeight: 600 }}>{fmtClock(s.start)} – {time} · {fmtHM(first)}</div>
          </div>
          <div className="card grow" style={{ padding: 12, boxShadow: 'none' }}>
            <div className="caption">Second part</div>
            <div className="tnum" style={{ fontWeight: 600 }}>{time} – {fmtClock(s.end)} · {fmtHM(total - first)}</div>
          </div>
        </div>
      ) : (
        <p className="caption" style={{ color: 'var(--danger)' }}>Pick a time between {fmtClock(s.start + 60000)} and {fmtClock(s.end - 60000)}.</p>
      )}
      {error && <p className="caption" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    </Modal>
  );
}
