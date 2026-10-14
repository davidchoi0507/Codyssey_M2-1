import React, { useState, useEffect } from 'react';
import { MessageSquareHeart, Loader2, Check } from 'lucide-react';
import { api } from '../../services/api';

/**
 * 마지막 1분 설문 (10/14 회의). 문항은 서버(GET .../survey)가 정하므로 여기서는 받은 대로 그린다.
 * kind: 'job'(발매 준비 작업) | 'track'(바로 공개한 곡, ownerKey 필요)
 */
export default function SurveyPanel({ kind, id, ownerKey = null }) {
  const [view, setView] = useState(null);   // 서버 SurveyView
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!id || String(id).startsWith('demo')) return;
    api.getSurvey(kind, id, ownerKey).then((v) => {
      setView(v);
      setAnswers(v.answers || {});
      setDone(Boolean(v.answers));
      if (kind === 'job' && !v.answers) api.logUsage(id, 'survey_shown');
    }).catch(() => {});
  }, [kind, id, ownerKey]);

  if (!view) return null;

  // 같은 선택지를 다시 누르면 해제 (선택 문항을 비울 수 있게)
  const pick = (qid, value) => setAnswers((a) => ({ ...a, [qid]: a[qid] === value ? undefined : value }));
  const pickRow = (qid, row, value) => setAnswers((a) => {
    const rows = { ...(a[qid] || {}) };
    rows[row] = rows[row] === value ? undefined : value;
    return { ...a, [qid]: rows };
  });

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const v = await api.saveSurvey(kind, id, answers, ownerKey);
      setView(v);
      setDone(true);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const chip = (on) => `px-3 py-1.5 rounded-full text-xs border transition-colors ${on
    ? 'bg-indigo-600 text-white border-indigo-600'
    : 'border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-indigo-400'}`;

  if (!open) {
    return (
      <div className="glass-panel rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-indigo-200 dark:border-indigo-500/30">
        <div className="flex items-center gap-3">
          {done ? <Check className="w-5 h-5 text-emerald-500" /> : <MessageSquareHeart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
          <div>
            <h4 className="font-bold text-sm text-zinc-900 dark:text-white">{done ? '설문에 답해 주셔서 고마워요!' : '1분 설문 — 써 보니 어땠나요?'}</h4>
            {!done && <p className="text-xs text-zinc-500 dark:text-zinc-400">{view.questions.length}문항. 이름·연락처는 받지 않고, 서비스를 고치는 데만 써요.</p>}
          </div>
        </div>
        <button onClick={() => setOpen(true)} className={done ? 'btn-secondary text-xs px-4 py-2' : 'btn-primary text-xs px-4 py-2 shadow-sm'}>
          {done ? '답 고치기' : '답하기'}
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6 space-y-5 border-indigo-200 dark:border-indigo-500/30">
      <div>
        <h4 className="font-extrabold text-base text-zinc-900 dark:text-white">써 보니 어땠나요?</h4>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">어디까지 썼는지는 자동으로 기록돼서 따로 묻지 않아요.</p>
      </div>

      {view.questions.map((q) => (
        <div key={q.id} className="space-y-2">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {q.question} {q.required && <span className="text-xs text-rose-500">(필수)</span>}
          </p>
          {q.type === 'choice' && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(q.options).map(([v, label]) => (
                <button key={v} type="button" onClick={() => pick(q.id, v)} className={chip(answers[q.id] === v)}>{label}</button>
              ))}
            </div>
          )}
          {q.type === 'matrix' && Object.entries(q.rows).map(([row, rowLabel]) => (
            <div key={row} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 w-20">{rowLabel}</span>
              {Object.entries(q.options).map(([v, label]) => (
                <button key={v} type="button" onClick={() => pickRow(q.id, row, v)} className={chip((answers[q.id] || {})[row] === v)}>{label}</button>
              ))}
            </div>
          ))}
          {q.type === 'text' && (
            <textarea
              rows={2}
              maxLength={q.max_length || 500}
              value={answers[q.id] || ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg p-3 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          )}
        </div>
      ))}

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => { setOpen(false); if (kind === 'job' && !done) api.logUsage(id, 'survey_closed'); }}
          className="btn-secondary text-xs px-4 py-2"
        >
          나중에 할게요
        </button>
        <button onClick={submit} disabled={saving} className="btn-primary text-xs px-5 py-2 flex items-center gap-1.5 shadow-sm disabled:opacity-50">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>보내기</span>
        </button>
      </div>
    </div>
  );
}
