import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { OriginalDocument, saveOriginalFile } from './OriginalDocument';
import { LatexPreview, downloadPdf } from './LatexPreview';
import { ReferenceResults, ReferenceDownloads } from './ReferenceResults';
import { actions, blankTask, download, integrateSummary, paragraphs, readTask, removeVersion, version, type ApiPrefs, type Evidence, type Issue, type Module, type Output, type Reply, type Task, type SourceAsset, type Version } from './model';

function SourceAssetView({ asset }: { asset: SourceAsset }) {
  if (asset.kind === 'image') return <img className="source-image" src={`data:image/${asset.extension === 'jpg' ? 'jpeg' : asset.extension};base64,${asset.base64}`} alt="原文实验图"/>;
  if (asset.kind === 'table') return <span className="source-table" role="table">{asset.rows?.map((row, i) => <span role="row" key={i}>{row.map((cell, j) => <span role={i ? 'cell' : 'columnheader'} key={j}>{cell}</span>)}</span>)}</span>;
  const parsed = new DOMParser().parseFromString(asset.mathml || '', 'application/xml');
  const allowed = new Set(['math', 'mrow', 'mtext', 'mo', 'mi', 'mn', 'mfrac', 'msub', 'msup', 'msubsup', 'msqrt', 'mroot', 'munderover', 'mtable', 'mtr', 'mtd']);
  function render(node: Node, key: number): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof Element) || !allowed.has(node.localName)) return null;
    return createElement(node.localName, { key, ...(node.localName === 'math' ? { display: 'block' } : {}) }, Array.from(node.childNodes).map(render));
  }
  return <span className="source-equation">{render(parsed.documentElement, 0)}</span>;
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    upload: <><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M4 15v5h16v-5"/></>,
    download: <><path d="M12 4v12m-4-4 4 4 4-4"/><path d="M4 17v3h16v-3"/></>,
    settings: <><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6m8 0v6m-7 0v6"/></>,
    file: <><path d="M14 3H5v18h14V8z"/><path d="M14 3v6h5M8 13h8m-8 4h6"/></>,
    translate: <><path d="M3 5h11M8 3v2m3 0c0 6-4 9-8 11m1-8c2 4 4 6 8 8M14 21l4-12 4 12m-7-3h6"/></>,
    check: <><path d="m4 7 2 2 4-5m3 3h7M4 15l2 2 4-5m3 3h7M13 20h7"/></>,
    summary: <><path d="M4 5h16M4 10h16M4 15h10M4 20h7"/></>,
    reference: <><path d="M4 4h6v7H4zm10 0h6v7h-6zM10 11c0 4-2 6-5 7m15-7c0 4-2 6-5 7"/></>,
    code: <><path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/></>,
    review: <><path d="M14 3H5v18h14v-7M8 8h3M8 12h2"/><path d="m13 11 7-7 2 2-7 7-3 1z"/></>,
    reply: <><path d="M9 4 3 10l6 6m-6-6h11a6 6 0 0 1 6 6v4"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    copy: <><path d="M9 8h11v13H9zM15 8V3H4v13h5"/></>,
    tick: <path d="m4 12 5 5L20 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.file}</svg>;
}

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="modal" onCancel={close} aria-label={title}><div className="modal-top"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="关闭"><Icon name="close"/></button></div>{children}</dialog>;
}

async function request<T>(path: string, data: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal });
  const result = await response.json(); if (!response.ok) throw Error(result.error || '请求失败'); return result;
}

function ApiSettings({ initial, apiKey, defaults, close, save }: { initial: ApiPrefs; apiKey: string; defaults: { configured: boolean; model: string; baseUrl: string }; close: () => void; save: (prefs: ApiPrefs, key: string) => void }) {
  const [prefs, setPrefs] = useState(initial), [key, setKey] = useState(apiKey), [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [models, setModels] = useState<string[]>([]);
  const settings = { ...prefs, apiKey: key };
  async function test(list = false) {
    setBusy(true); setStatus('');
    try {
      if (list) { const r = await request<{ models: string[] }>('models', { settings }); setModels(r.models); setStatus(`读取到 ${r.models.length} 个模型`); }
      else { const r = await request<{ model: string; message: string }>('test', { settings }); setStatus(`连接成功，模型：${r.model}`); }
    } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="API 设置" close={close}><div className="segmented"><button className={prefs.mode === 'default' ? 'active' : ''} onClick={() => { setPrefs({ mode: 'default', baseUrl: defaults.baseUrl, model: defaults.model }); setStatus(''); }}>项目默认配置</button><button className={prefs.mode === 'custom' ? 'active' : ''} onClick={() => { setPrefs({ ...prefs, mode: 'custom' }); setStatus(''); }}>自定义 API</button></div>
    <fieldset disabled={busy}><label className="field">服务根地址<input type="url" disabled={prefs.mode === 'default'} value={prefs.mode === 'default' ? defaults.baseUrl : prefs.baseUrl} onChange={e => setPrefs({ ...prefs, baseUrl: e.target.value })} placeholder="HTTP(S) 地址，保留服务商要求的 /v1 路径"/></label>
      <label className="field">模型名称<input list="models" value={prefs.model} onChange={e => setPrefs({ ...prefs, model: e.target.value })} placeholder="服务商提供的模型 ID"/><datalist id="models">{models.map(m => <option key={m} value={m}/>)}</datalist></label>
      {prefs.mode === 'custom' ? <label className="field">API Key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="输入此服务的 Key"/><span>仅在当前页面使用，刷新后需重新填写。</span></label> : <p className="muted">{defaults.configured ? '密钥由本地后端读取，页面不会显示或保存。' : '默认密钥未配置，请改用自定义 API。'}</p>}
    </fieldset>
    {status && <p className="inline-status" role="status">{status}</p>}
    <div className="modal-actions"><button disabled={busy} onClick={() => test(true)}>读取模型</button><button disabled={busy} onClick={() => test()}>{busy ? '连接中…' : '测试连接'}</button><button className="primary" disabled={busy || !prefs.model.trim() || (prefs.mode === 'custom' && (!key.trim() || !prefs.baseUrl.trim()))} onClick={() => save(prefs, key)}>保存配置</button></div>
  </Modal>;
}

export default function App() {
  const [task, setTask] = useState<Task>(() => { try { const t = localStorage.getItem('paperbridge-task'); return t ? readTask(JSON.parse(t)) : blankTask(); } catch { return blankTask(); } });
  const [prefs, setPrefs] = useState<ApiPrefs>(() => { try { const p = JSON.parse(localStorage.getItem('paperbridge-api') || '{}'); return { mode: p.mode === 'custom' ? 'custom' : 'default', baseUrl: p.baseUrl || '', model: p.model || '' }; } catch { return { mode: 'default', baseUrl: '', model: '' }; } });
  const [apiKey, setApiKey] = useState('');
  const [defaults, setDefaults] = useState({ configured: false, model: '', baseUrl: '' });
  const [apiOpen, setApiOpen] = useState(false), [editor, setEditor] = useState<'paper' | 'comments' | 'revised' | null>(null), [draft, setDraft] = useState('');
  const [jobs, setJobs] = useState<Record<string, string>>({}), [jobErrors, setJobErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState(''), [toast, setToast] = useState(''), [saveError, setSaveError] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null), [phonePane, setPhonePane] = useState('source'), [focus, setFocus] = useState(''), [reviewFilter, setReviewFilter] = useState('all'), [inputsOpen, setInputsOpen] = useState(false);
  const controllers = useRef(new Map<string, AbortController>()), uploadRef = useRef<HTMLInputElement>(null), restoreRef = useRef<HTMLInputElement>(null), uploadTarget = useRef<'paper' | 'comments' | 'revised'>('paper');
  const scope = task.module === 'process' ? `process:${task.action}` : task.module;
  const activeScope = useRef(scope); activeScope.current = scope;
  const busy = jobs[scope] || '', anyBusy = Object.keys(jobs).length > 0;
  const visibleError = error || jobErrors[scope];
  const current = task.versions.find(v => v.id === task.currentId);
  const saved = task.results[task.module === 'review' ? 'review' : task.action];
  const journalContext = JSON.stringify([task.journal.name, task.journal.guideline, task.journal.source]);
  const savedFresh = !!saved && saved.versionId === current?.id && (task.module !== 'review' || saved.context === journalContext);
  const comment = task.reply.comments.find(c => c.id === task.reply.selected);
  const response = task.reply.responses[task.reply.selected];
  const responseFresh = !!response && response.originalId === task.reply.original?.id && response.revisedId === task.reply.revised?.id;
  const settings = { ...prefs, model: prefs.model || defaults.model, apiKey };
  const ready = prefs.mode === 'custom' ? !!prefs.baseUrl && !!apiKey && !!prefs.model : defaults.configured;

  useEffect(() => { fetch('/api/config').then(r => r.json()).then(setDefaults).catch(() => setError('本地后端未连接，请从 npm run dev 启动')); }, []);
  useEffect(() => { try { localStorage.setItem('paperbridge-task', JSON.stringify(task)); setSaveError(false); } catch { setSaveError(true); } }, [task]);
  useEffect(() => { try { localStorage.setItem('paperbridge-api', JSON.stringify(prefs)); } catch { /* 配置仅保留在内存 */ } }, [prefs]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (highlight !== null) document.getElementById(`paragraph-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [highlight]);

  useEffect(() => {
    if (!saved || saved.seen || task.module === 'reply') return;
    const key = task.module === 'review' ? 'review' : task.action;
    setTask(t => ({ ...t, results: { ...t.results, [key]: { ...t.results[key], seen: true } } }));
  }, [scope, saved]);

  function addVersion(text: string, name: string, originalFileId = current?.originalFileId, assets = current?.assets) {
    const v = { ...version(text, name), originalFileId, assets };
    if (originalFileId && originalFileId !== current?.originalFileId) v.id = originalFileId;
    setTask(t => ({ ...t, versions: [...t.versions, v], currentId: v.id, title: t.title || paragraphs(text)[0]?.slice(0, 60) || '未命名论文' })); setHighlight(null);
  }
  function deleteCurrentVersion() {
    if (!current || anyBusy) return;
    if (!confirm(`删除当前 V${task.versions.findIndex(v => v.id === current.id) + 1}（${current.name}）及其关联处理结果？原始文件不受影响，删除后只能通过任务备份恢复。`)) return;
    setTask(t => removeVersion(t, current.id));
    setHighlight(null); setError(''); setJobErrors({}); setToast('当前版本已删除');
  }
  function confirmOutput() {
    if (!saved || !savedFresh || !current || (saved.confirmed && (task.module !== 'process' || task.action !== 'summary' || saved.integrated))) return;
    const key = task.module === 'review' ? 'review' : task.action;
    if (task.module === 'process' && key === 'summary') {
      try {
        const v = { ...version(integrateSummary(current.text, saved.data), current.name), originalFileId: current.originalFileId, assets: current.assets };
        setTask(t => ({ ...t, versions: [...t.versions, v], currentId: v.id, results: { ...t.results, summary: { ...saved, versionId: v.id, confirmed: true, integrated: true } } }));
        setHighlight(null); setPhonePane('source'); setToast(`已插入正文并保存为 V${task.versions.length + 1}`);
      } catch (e) { setError((e as Error).message); }
    } else setTask(t => ({ ...t, results: { ...t.results, [key]: { ...saved, confirmed: true } } }));
  }
  function updateReply(patch: Partial<Reply>) { setTask(t => ({ ...t, reply: { ...t.reply, ...patch } })); }
  function enter(module: Module) { setTask(t => ({ ...t, module, reply: module === 'reply' && !t.reply.original && current ? { ...t.reply, original: { ...current } } : t.reply })); setError(''); setPhonePane('source'); }
  async function work<T>(label: string, fn: (signal: AbortSignal) => Promise<T>, done: (result: T) => void) {
    if (controllers.current.has(scope)) return;
    const controller = new AbortController(); controllers.current.set(scope, controller);
    setJobs(j => ({ ...j, [scope]: label })); setJobErrors(e => ({ ...e, [scope]: '' })); setError('');
    try { done(await fn(controller.signal)); }
    catch (e) { setJobErrors(errors => ({ ...errors, [scope]: (e as Error).name === 'AbortError' ? '已停止等待，已有结果保留。模型服务可能仍在完成请求。' : (e as Error).message })); }
    finally { controllers.current.delete(scope); setJobs(j => { const next = { ...j }; delete next[scope]; return next; }); }
  }
  function run(action: string, extra: Record<string, unknown> = {}) {
    if (!current) { setError('请先上传或粘贴论文正文'); return; }
    if (!ready) { setApiOpen(true); return; }
    const sourceId = current.id;
    const replySnapshot = { selected: task.reply.selected, originalId: task.reply.original?.id, revisedId: task.reply.revised?.id };
    const confirmed = Object.fromEntries(Object.entries(task.results).filter(([k, r]) => k !== 'review' && r.confirmed && r.versionId === sourceId).map(([k, r]) => { const { pdfBase64, compileError, assets, ...content } = r.data; return [k, content]; }));
    work('正在处理，请稍候', signal => request<Output>('process', { settings, action, assets: current.assets, paper: current.text, domain: task.domain, glossary: task.glossary, confirmed, ...extra }, signal), result => {
      if (action === 'analyze') updateReply({ comments: result.comments || [], selected: result.comments?.[0]?.id || '', responses: {} });
      else if (action === 'response') setTask(t => ({ ...t, reply: { ...t.reply, responses: { ...t.reply.responses, [replySnapshot.selected]: { data: result, confirmed: false, originalId: replySnapshot.originalId!, revisedId: replySnapshot.revisedId! } } } }));
      else setTask(t => ({ ...t, results: { ...t.results, [action === 'refine' ? 'review' : action]: { versionId: sourceId, context: action === 'review' || action === 'refine' ? journalContext : undefined, data: action === 'refine' ? { ...t.results.review?.data, ...result, reviewItems: result.reviewItems } : result, confirmed: false, seen: activeScope.current === scope } } }));
      if (activeScope.current === scope) setPhonePane('result');
      setToast(`${actions.find(a => a.id === action)?.name || (action === 'review' || action === 'refine' ? '模拟审稿' : '审稿回复')}处理完成，请核对后确认`);
    });
  }
  function changeOutput(field: keyof Output, value: string) {
    const key = task.module === 'review' ? 'review' : task.action;
    setTask(t => ({ ...t, results: { ...t.results, [key]: { ...t.results[key], data: { ...t.results[key].data, [field]: value, ...(key === 'latex' && field === 'text' ? { pdfBase64: undefined, compileError: undefined } : {}) }, confirmed: false } } }));
  }
  async function downloadLatexSource() {
    const output = task.results.latex?.data;
    if (!output?.text) return;
    try {
      const result = await request<{ zipBase64: string }>('latex-source', { text: output.text, assets: output.assets });
      const bytes = Uint8Array.from(atob(result.zipBase64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const a = document.createElement('a'); a.href = url; a.download = 'paperbridge-elsevier.zip'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message); }
  }
  function compileOutput() {
    const result = task.results.latex;
    if (!result?.data.text) return;
    work('正在编译 PDF', signal => request<{ pdfBase64: string }>('latex-compile', { text: result.data.text, assets: result.data.assets }, signal), compiled => setTask(t => ({ ...t, results: { ...t.results, latex: { ...result, confirmed: false, data: { ...result.data, ...compiled, compileError: undefined, notes: result.data.notes?.filter(n => !/未.*编译/.test(n)) } } } })));
  }
  function openEditor(target: 'paper' | 'comments' | 'revised') { setDraft(target === 'paper' ? current?.text || '' : target === 'comments' ? task.reply.commentsText : task.reply.revised?.text || ''); setEditor(target); }
  function saveEditor() {
    if (!draft.trim()) return;
    if (editor === 'paper') addVersion(draft, current?.name || '手动输入.txt');
    if (editor === 'comments') updateReply({ commentsText: draft.trim(), comments: [], selected: '', responses: {} });
    if (editor === 'revised') updateReply({ revised: version(draft, '修改稿.txt'), evidence: null });
    setEditor(null);
  }
  function upload(target: 'paper' | 'comments' | 'revised') { uploadTarget.current = target; uploadRef.current!.value = ''; uploadRef.current?.click(); }
  async function readFile(file: File, target: 'paper' | 'comments' | 'revised') {
    const form = new FormData(); form.append('file', file);
    const originalFileId = target === 'paper' && /\.(docx|pdf)$/i.test(file.name) ? crypto.randomUUID() : undefined;
    work('正在读取文件', async signal => { const r = await fetch('/api/parse', { method: 'POST', body: form, signal }); const result = await r.json(); if (!r.ok) throw Error(result.error); if (originalFileId) await saveOriginalFile(originalFileId, file); return result as { text: string; name: string; notes: string[]; assets?: SourceAsset[] }; }, r => {
      if (target === 'paper') addVersion(r.text, r.name, originalFileId, r.assets);
      if (target === 'comments') updateReply({ commentsText: r.text, comments: [], selected: '', responses: {} });
      if (target === 'revised') updateReply({ revised: version(r.text, r.name), evidence: null });
      setToast(r.notes[0] || `已读取 ${r.name}`);
    });
  }
  function applyIssue(issue: Issue) {
    if (!current || !saved || saved.versionId !== current.id) return;
    const p = paragraphs(current.text); const i = issue.paragraph - 1;
    if (!p[i]?.includes(issue.original) || p[i].split(issue.original).length !== 2) { setError('原文定位不唯一，请手动编辑，避免错位替换'); return; }
    p[i] = p[i].replace(issue.original, issue.suggestion);
    addVersion(p.join('\n\n'), current.name);
    setTask(t => ({ ...t, results: { ...t.results, check: { ...t.results.check, data: { ...t.results.check.data, issues: t.results.check.data.issues?.map(x => x.id === issue.id ? { ...x, status: 'accepted' } : x) } } } }));
    setToast('已生成新版本；继续检查前请重新运行');
  }
  function pinOriginal() {
    if (!current) return;
    if (task.reply.original && !confirm('替换送审原稿后，现有回复将需要重新核对。继续？')) return;
    updateReply({ original: { ...current }, evidence: null });
  }
  function exportReplies() {
    const items = task.reply.comments.filter(c => { const r = task.reply.responses[c.id]; return r?.confirmed && r.originalId === task.reply.original?.id && r.revisedId === task.reply.revised?.id; });
    download('response-to-reviewers.md', '# Response to the Reviewers\n\n' + items.map(c => `## Comment ${c.id}\n\n${c.original}\n\n### Response\n\n${task.reply.responses[c.id].data.response}`).join('\n\n'));
  }
  const confirmedReplies = task.reply.comments.filter(c => { const r = task.reply.responses[c.id]; return r?.confirmed && r.originalId === task.reply.original?.id && r.revisedId === task.reply.revised?.id; }).length;

  return <div className="app">
    <header className="topbar"><a className="brand" href="/" aria-label="PaperBridge 论文桥"><img src="/mark.svg" width="30" height="30" alt=""/><strong>PaperBridge</strong><span>论文桥</span></a><div className="top-tools"><span className="save-state">{saveError ? '本机存储不足，请备份' : '已保存在本机'}</span><button className="api-button" aria-label="API 设置" onClick={() => setApiOpen(true)}><span className={`status-dot ${ready ? 'ready' : ''}`}/><span>{ready ? (prefs.model || defaults.model) : '配置 API'}</span><span className="api-mobile-label">API 设置</span><Icon name="settings"/></button></div></header>
    <div className={`frame ${inputsOpen ? 'inputs-open' : ''}`}><aside className="sidebar">
      <nav className="module-nav" aria-label="功能模块">{([{ id: 'process', name: '论文加工', icon: 'file' }, { id: 'review', name: '模拟审稿', icon: 'review' }, { id: 'reply', name: '审稿回复', icon: 'reply' }] as const).map(m => <button key={m.id} className={task.module === m.id ? 'selected' : ''} aria-current={task.module === m.id ? 'page' : undefined} onClick={() => enter(m.id)}><Icon name={m.icon}/>{m.name}{(m.id === 'process' ? Object.keys(jobs).some(key => key.startsWith('process:')) : !!jobs[m.id]) && <small className="job-indicator">处理中</small>}</button>)}</nav>
      <div className="sidebar-content"><button className="inputs-close plain" onClick={() => setInputsOpen(false)}><Icon name="close" size={16}/>收起资料</button><button className="upload-area" disabled={!!busy} onClick={() => upload('paper')} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy && e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0], 'paper'); }}><Icon name="upload" size={24}/><strong>{current ? '添加论文版本' : '上传论文'}</strong><span>PDF、DOCX、TXT</span></button>
        <button className="plain full" disabled={!!busy} onClick={() => openEditor('paper')}>{current ? '编辑正文' : '粘贴正文'}</button>
        <label className="field compact">正文版本<select disabled={!!busy || !current} value={task.currentId} onChange={e => { setTask({ ...task, currentId: e.target.value }); setHighlight(null); }}>{!current && <option value="">暂无稿件</option>}{task.versions.map((v, i) => <option key={v.id} value={v.id}>V{i + 1} · {v.name}</option>)}</select></label><button className="plain" disabled={!current || anyBusy} onClick={deleteCurrentVersion}>删除当前版本</button>
        {task.module === 'process' && <><div className="tool-list">{actions.map(a => <button className={task.action === a.id ? 'selected' : ''} key={a.id} onClick={() => { setTask(t => ({ ...t, action: a.id, results: t.results[a.id] ? { ...t.results, [a.id]: { ...t.results[a.id], seen: true } } : t.results })); setError(''); }}><Icon name={a.icon}/><span>{a.name}<small>{a.hint}</small></span>{jobs[`process:${a.id}`] ? <small className="job-indicator">处理中</small> : task.results[a.id] && !task.results[a.id].seen && !(task.module === 'process' && task.action === a.id) && <span className="done-mark" title="有新结果，点击查看" aria-label="有未查看的新结果">•</span>}</button>)}</div><label className="field compact">专业领域<select disabled={!!busy} value={task.domain} onChange={e => setTask({ ...task, domain: e.target.value })}>{['自动识别', '计算机科学', '工程技术', '生命科学', '社会科学', '其他'].map(d => <option key={d}>{d}</option>)}</select></label><details className="glossary"><summary>术语对照表</summary><textarea aria-label="术语对照表" disabled={!!busy} value={task.glossary} onChange={e => setTask({ ...task, glossary: e.target.value })} placeholder="神经网路 = 神经网络"/></details></>}
        {task.module === 'review' && <fieldset disabled={!!busy} className="review-settings"><label className="field">目标期刊<input value={task.journal.name} onChange={e => setTask({ ...task, journal: { ...task.journal, name: e.target.value, confirmed: false } })} placeholder="输入期刊全称"/></label><label className="checkbox"><input type="checkbox" disabled={!task.journal.name.trim()} checked={task.journal.confirmed} onChange={e => setTask({ ...task, journal: { ...task.journal, confirmed: e.target.checked } })}/>已确认期刊全称</label><label className="field">官网 / 投稿指南<input type="url" value={task.journal.url} onChange={e => setTask({ ...task, journal: { ...task.journal, url: e.target.value } })} placeholder="https://…"/></label><button className="full" disabled={!task.journal.url.trim()} onClick={() => work('正在读取公开指南', signal => request<{ text: string; url: string; fetchedAt: string }>('journal', { url: task.journal.url }, signal), r => setTask(t => ({ ...t, journal: { ...t.journal, guideline: r.text, source: { url: r.url, fetchedAt: r.fetchedAt } } }))) }>读取指南</button><label className="field">指南内容<textarea value={task.journal.guideline} onChange={e => setTask({ ...task, journal: { ...task.journal, guideline: e.target.value, source: undefined } })} placeholder="也可直接粘贴官方指南" rows={5}/></label><span className="muted small">{task.journal.source ? '已读取公开页面' : '未提供指南时，仅进行一般评审。'}</span></fieldset>}
        {task.module === 'reply' && <div className="reply-inputs">
          <div className="reply-material">
            <div className="material-label"><span>送审原稿</span><span className={task.reply.original ? 'material-status ready' : 'material-status'}>{task.reply.original ? '已固定' : '待提供'}</span></div>
            <p className="material-file" title={task.reply.original?.name}>{task.reply.original?.name || '选择正文版本后固定原稿'}</p>
            <div className="material-actions"><button disabled={!!busy || !current} onClick={pinOriginal}>使用当前版本</button></div>
          </div>
          <div className="reply-material">
            <div className="material-label"><span>审稿意见</span><span className={task.reply.commentsText ? 'material-status ready' : 'material-status'}>{task.reply.commentsText ? '已录入' : '待提供'}</span></div>
            <p className="material-file">{task.reply.commentsText ? `${task.reply.commentsText.length.toLocaleString()} 字意见` : '上传文件或粘贴意见原文'}</p>
            <div className="material-actions"><button aria-label="上传审稿意见" disabled={!!busy} onClick={() => upload('comments')}><Icon name="upload" size={14}/>上传</button><button aria-label="粘贴审稿意见" disabled={!!busy} onClick={() => openEditor('comments')}>粘贴</button></div>
            {task.results.review?.data.letter && <button className="material-import" disabled={!!busy} onClick={() => updateReply({ commentsText: task.results.review.data.letter!, comments: [], selected: '', responses: {} })}>导入模拟审稿意见<Icon name="arrow" size={14}/></button>}
          </div>
          <div className="reply-material">
            <div className="material-label"><span>修改稿</span><span className={task.reply.revised ? 'material-status ready' : 'material-status'}>{task.reply.revised ? '已提供' : '待提供'}</span></div>
            <p className="material-file" title={task.reply.revised?.name}>{task.reply.revised?.name || '上传文件或粘贴修改后正文'}</p>
            <div className="material-actions"><button aria-label="上传修改稿" disabled={!!busy} onClick={() => upload('revised')}><Icon name="upload" size={14}/>上传</button><button aria-label="粘贴修改稿" disabled={!!busy} onClick={() => openEditor('revised')}>粘贴</button></div>
            {task.reply.original && task.reply.revised && <button className="material-import" disabled={!!busy} onClick={() => work('正在比对两个版本', signal => request<Evidence>('evidence', { original: task.reply.original, revised: task.reply.revised }, signal), r => updateReply({ evidence: r }))}>查看修订差异<Icon name="arrow" size={14}/></button>}
          </div>
        </div>}
      </div><div className="sidebar-bottom"><div><button className="plain" disabled={!!busy} onClick={() => download('paperbridge-task.json', JSON.stringify(task, null, 2), 'application/json')}>备份任务</button><button className="plain" disabled={anyBusy} onClick={() => restoreRef.current?.click()}>恢复任务</button></div></div>
    </aside>
    <main className="sheet"><div className="taskbar"><div className="task-name"><span className="document-glyph"><Icon name="file" size={20}/></span><h1>{task.title || '未命名论文'}</h1><button className="plain rename" disabled={!!busy} onClick={() => { const title = prompt('论文任务名称', task.title); if (title?.trim()) setTask({ ...task, title: title.trim() }); }}>重命名</button></div><button className="icon-button" title="下载当前正文" aria-label="下载当前正文" disabled={!current} onClick={() => download('manuscript.txt', current!.text)}><Icon name="download"/></button></div>
      <div className="workspace-toolbar"><div className="toolbar-context"><button className="materials-toggle" aria-expanded={inputsOpen} onClick={() => setInputsOpen(!inputsOpen)}><Icon name="settings" size={16}/>资料</button><span>{task.module === 'process' ? actions.find(a => a.id === task.action)?.name : task.module === 'review' ? '模拟审稿' : '逐条回复'}</span></div><div>{busy ? <><span className="working" role="status">{busy}</span><button onClick={() => controllers.current.get(scope)?.abort()}>停止等待</button></> : task.module === 'process' ? <button className="primary" disabled={!current} onClick={() => run(task.action)}>开始处理<Icon name="arrow" size={16}/></button> : task.module === 'review' ? <button className="primary" disabled={!current || !task.journal.confirmed} onClick={() => run('review', { journal: task.journal.name, journalConfirmed: task.journal.confirmed, guideline: task.journal.guideline, source: task.journal.source })}>开始审稿<Icon name="arrow" size={16}/></button> : <><button className={comment ? undefined : "primary"} disabled={!task.reply.original || !task.reply.commentsText.trim()} onClick={() => run('analyze', { paper: task.reply.original!.text, comments: task.reply.commentsText })}>拆解审稿意见</button>{comment && <button className="primary" disabled={!task.reply.original || !task.reply.revised} onClick={() => run('response', { paper: task.reply.original!.text, original: task.reply.original, revised: task.reply.revised, comment, language: '英文' })}>{response ? '重新生成此条回复' : '比对并生成此条回复'}<Icon name="arrow" size={16}/></button>}</>}</div></div>
      {visibleError && <div className="error-box" role="alert">{visibleError}<button onClick={() => { setError(''); setJobErrors(e => ({ ...e, [scope]: '' })); }} aria-label="关闭错误"><Icon name="close" size={16}/></button></div>}
      <div className="phone-tabs"><button className={phonePane === 'source' ? 'active' : ''} onClick={() => setPhonePane('source')}>{task.module === 'reply' ? '意见与证据' : '论文正文'}</button><button className={phonePane === 'result' ? 'active' : ''} onClick={() => setPhonePane('result')}>{task.module === 'reply' ? '回复' : '处理结果'}</button></div>
      <div className={`panes show-${phonePane} ${task.module === 'reply' ? 'reply-panes' : ''}`}>
        <section className="source-pane" aria-label={task.module === 'reply' ? '审稿意见与修订证据' : '论文正文'}>
          {task.module !== 'reply' ? <><div className="pane-bar"><span>{current ? `V${task.versions.findIndex(v => v.id === current.id) + 1} 原文` : '论文正文'}</span><button className="plain" disabled={!!busy} onClick={() => openEditor('paper')}>编辑</button></div>{current ? <OriginalDocument key={current.id} version={current} forceText={highlight !== null} attach={id => setTask(t => ({ ...t, versions: t.versions.map(v => v.id === current.id ? { ...v, originalFileId: id } : v) }))}>{<article className="manuscript" tabIndex={0} aria-label="可滚动的论文正文">{paragraphs(current.text).map((p, i) => <p id={`paragraph-${i}`} key={`${current.id}-${i}`} className={highlight === i ? 'highlight' : ''}>{p.split(/(\[\[PB:[a-z]+-\d+\]\])/g).map((part, j) => { const asset = current.assets?.find(a => part === `[[PB:${a.id}]]`); return asset ? <SourceAssetView key={j} asset={asset}/> : part; })}</p>)}</article>}</OriginalDocument> : <div className="source-empty"><div className="paper-outline"><Icon name="file" size={40}/></div><p>从一份论文开始</p><span>上传文件，或将正文粘贴到这里。</span><button disabled={!!busy} onClick={() => openEditor('paper')}>粘贴论文正文</button></div>}<div className="pane-foot"><span>{current ? `${current.text.length.toLocaleString()} 字符` : '支持文本型 PDF、DOCX 和 TXT'}</span><span>{current ? '原稿始终保留' : '扫描件请先 OCR'}</span></div></> : <><div className="pane-bar"><span>{task.reply.comments.length ? `${task.reply.comments.length} 条审稿意见` : '审稿意见'}</span><button className="plain" disabled={!!busy} onClick={() => openEditor('comments')}>编辑原文</button></div><div className="reply-source" tabIndex={0}>{task.reply.comments.length ? <><div className="comment-list">{task.reply.comments.map(c => <button key={c.id} disabled={!!busy} className={c.id === task.reply.selected ? 'active' : ''} onClick={() => updateReply({ selected: c.id })}><span>{c.id}</span><span>{c.title}</span>{task.reply.responses[c.id]?.confirmed && task.reply.responses[c.id]?.originalId === task.reply.original?.id && task.reply.responses[c.id]?.revisedId === task.reply.revised?.id && <Icon name="tick" size={15}/>}</button>)}</div>{comment && <div className="comment-detail"><div className="comment-meta">{comment.type} / {comment.priority}</div><blockquote>{comment.original}</blockquote><p>{comment.suggestion}</p></div>}</> : <div className="compact-empty"><p>保留审稿意见原文，逐条回应。</p><span>上传原稿与意见后，点击右上角“拆解审稿意见”。</span></div>}{task.reply.evidence && <details className="evidence" open><summary>{task.reply.evidence.changes.length} 处文本差异</summary><p className="muted small">段落比对不代表意见已解决，页码需另行核对。</p>{task.reply.evidence.changes.map(c => <div className="diff-unit" key={c.change_id}><span>{c.change_id} / {c.change_type}</span>{c.original_text && <del>{c.original_text}</del>}{c.revised_text && <ins>{c.revised_text}</ins>}</div>)}{!task.reply.evidence.changes.length && <p>未检测到正文变化。</p>}</details>}</div><div className="pane-foot"><span>{task.reply.original ? '送审原稿已固定' : '等待原稿'}</span><span>{task.reply.revised ? '修改稿已提供' : '等待修改稿'}</span></div></>}
        </section>
        <section className="result-pane" aria-label="处理结果" aria-busy={!!busy}>
          {task.module !== 'reply' ? <><div className="pane-bar"><span>{saved ? (savedFresh ? saved.confirmed ? '已确认' : '待核对' : '输入已变更，请重新处理') : '处理结果'}</span>{saved && <div className="button-row"><button className="plain" onClick={() => { navigator.clipboard.writeText((task.module === 'process' && task.action === 'references' && saved.data.entries ? saved.data.entries.map((entry, i) => `[${i + 1}] ${entry.formatted}`).join('\n\n') : '') || saved.data.text || saved.data.letter || Object.entries(saved.data).filter(([k]) => ['abstract', 'keywords', 'conclusion', 'tex', 'bib'].includes(k)).map(([, v]) => v).join('\n\n')).then(() => setToast('已复制')).catch(() => setError('无法访问剪贴板，请手动复制')); }}><Icon name="copy" size={15}/>复制</button></div>}</div>{saved ? <div className="output-body" tabIndex={0}>{task.module === 'review' ? <><p className="notice">AI 模拟审稿，非期刊编辑部意见。</p>{saved.data.brief && <details><summary>期刊依据与匹配度</summary><p className="pre-wrap">{saved.data.brief}</p><p className="pre-wrap">{saved.data.fit}</p></details>}<OutputEditor label="模拟审稿信" value={saved.data.letter || ''} onChange={v => changeOutput('letter', v)} disabled={!!busy}/>{saved.data.reviewItems && <details className="review-items"><summary>按问题浏览（{saved.data.reviewItems.length}）</summary><label className="field">筛选意见<select value={reviewFilter} onChange={e => setReviewFilter(e.target.value)}><option value="all">全部意见</option><option value="Major">主要问题</option><option value="Minor">次要问题</option></select></label>{saved.data.reviewItems.filter(item => reviewFilter === 'all' || item.level === reviewFilter).map((item, i) => <div className="review-item" key={i}><div className="comment-meta">{item.level} / {item.type} / 重要程度 {item.stars} / 5</div><p>{item.summary}</p><span className="muted small">{item.location}</span><p className="muted">{item.suggestion}</p></div>)}</details>}<div className="refine"><label htmlFor="focus">调整或追问</label><div><input id="focus" value={focus} disabled={!!busy} onChange={e => setFocus(e.target.value)} placeholder="例如：更关注实验可重复性"/><button disabled={!!busy || !focus.trim() || !savedFresh} onClick={() => run('refine', { journal: task.journal.name, guideline: task.journal.guideline, previous: saved.data.letter, instruction: focus })}>发送</button></div></div></> : task.action === 'check' ? <><p className="muted small">建议仅在你确认后写入新版本。</p>{saved.data.issues?.map(issue => <div key={issue.id} className="issue"><button className="issue-location" disabled={!issue.located || !savedFresh} onClick={() => { setHighlight(issue.paragraph - 1); setPhonePane('source'); }}>第 {issue.paragraph} 段 / {issue.type}<span>{issue.located ? '定位原文' : '位置待确认'}</span></button><div className="replacement"><del>{issue.original}</del><ins>{issue.suggestion || '删除此片段'}</ins></div><p>{issue.reason}</p><div className="issue-actions"><span>{issue.certainty}</span><button disabled={!!busy || !issue.located || issue.status !== 'pending' || !savedFresh} onClick={() => applyIssue(issue)}>{issue.status === 'accepted' ? '已接受' : '接受修改'}</button><button className="plain" disabled={!!busy || issue.status !== 'pending' || !savedFresh} onClick={() => setTask(t => ({ ...t, results: { ...t.results, check: { ...saved, data: { ...saved.data, issues: saved.data.issues?.map(x => x.id === issue.id ? { ...x, status: 'ignored' } : x) } } } }))}>{issue.status === 'ignored' ? '已忽略' : '忽略'}</button></div></div>)}{saved.data.issues?.length === 0 && <p>未发现需要修改的术语问题。</p>}</> : task.action === 'summary' ? <>{(['abstract', 'keywords', 'conclusion'] as const).map((key, i) => <OutputEditor key={key} label={['摘要', '关键词', '结论'][i]} value={saved.data[key] || ''} onChange={v => changeOutput(key, v)} disabled={!!busy} compact={key === 'keywords'}/>)}</> : task.action === 'references' ? <ReferenceResults data={saved.data} fresh={savedFresh} busy={!!busy} locate={paragraph => { setHighlight(paragraph - 1); setPhonePane('source'); }}/> : task.action === 'latex' ? <LatexPreview text={saved.data.text || ''} pdfBase64={saved.data.pdfBase64} compileError={saved.data.compileError} busy={!!busy} onSourceChange={v => changeOutput('text', v)} onCompile={compileOutput} onDownloadSource={downloadLatexSource}/> : <OutputEditor label="英文译文" value={saved.data.text || ''} onChange={v => changeOutput('text', v)} disabled={!!busy}/>}
              {!!saved.data.notes?.length && <details className="notes"><summary>待确认事项（{saved.data.notes.length}）</summary><ul>{saved.data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></details>}{saved.data.meta && <p className="generation-meta">{saved.data.meta.model} / {new Date(saved.data.meta.generatedAt).toLocaleString('zh-CN')}</p>}
            </div> : <div className="result-empty"><span className="result-symbol"><Icon name={task.module === 'review' ? 'review' : actions.find(a => a.id === task.action)?.icon || 'file'} size={28}/></span><p>{task.module === 'review' ? '从期刊要求，回看你的论文。' : task.action === 'translate' ? '让研究准确地抵达另一种语言。' : actions.find(a => a.id === task.action)?.hint}</p><span>{task.module === 'review' ? '填写并确认期刊后，开始模拟审稿。' : current ? '点击“开始处理”，结果将在这里呈现。' : '添加论文后，在这里查看处理结果。'}</span></div>}
            <div className="result-footer">{saved ? <><button disabled={!!busy || !savedFresh || (saved.confirmed && (task.module !== 'process' || task.action !== 'summary' || saved.integrated)) || (task.module === 'process' && task.action === 'latex' && !saved.data.pdfBase64)} onClick={confirmOutput}>{saved.confirmed && (task.module !== 'process' || task.action !== 'summary' || saved.integrated) ? <><Icon name="tick" size={15}/>{task.module === 'process' && task.action === 'summary' ? '已保存到正文版本' : '已确认此结果'}</> : task.module === 'process' && task.action === 'summary' ? '插入正文并保存新版本' : '确认此结果'}</button>{task.module === 'process' && task.action === 'references' ? <ReferenceDownloads data={saved.data}/> : <button onClick={() => { const d = saved.data; if (task.module === 'process' && task.action === 'latex' && d.pdfBase64) { downloadPdf(d.pdfBase64); return; } if (task.module === 'process' && task.action === 'latex') { void downloadLatexSource(); return; } const content = task.module === 'review' ? `# AI 模拟审稿意见\n\n${d.letter}` : task.action === 'summary' ? saved.integrated && saved.confirmed ? (task.versions.find(v => v.id === saved.versionId)?.text || '') : integrateSummary(task.versions.find(v => v.id === saved.versionId)?.text || '', d) : task.action === 'check' ? JSON.stringify(d.issues, null, 2) : d.text || [d.tex, d.bib].join('\n\n'); download(task.module === 'review' ? 'simulated-review.md' : task.action === 'latex' ? 'manuscript.tex' : task.action + '.txt', content); }}><Icon name="download" size={16}/>{task.module === 'process' && task.action === 'latex' ? saved.data.pdfBase64 ? '下载 PDF' : '下载排版工程' : '下载'}</button>}</> : <span className="muted small">结果由你选择的模型生成，请核验事实。</span>}</div>
          </> : <><div className="pane-bar"><span>{comment ? `${comment.id} 回复` : '逐条回复'}</span>{response && <span className={responseFresh ? 'muted small' : 'stale small'}>{responseFresh ? response.confirmed ? '已确认' : '草稿待核对' : '稿件已变更，请重新生成'}</span>}</div><div className="output-body" tabIndex={0}>{comment ? <>{response ? <><p className="notice">{response.data.stance}；请核对回复与实际修改。</p><OutputEditor label="回复正文" value={response.data.response || ''} disabled={!!busy || !responseFresh} onChange={value => setTask(t => ({ ...t, reply: { ...t.reply, responses: { ...t.reply.responses, [t.reply.selected]: { ...response, data: { ...response.data, response: value }, confirmed: false } } } }))}/>{!!response.data.notes?.length && <ul className="notes">{response.data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}<button disabled={!!busy || !responseFresh || response.confirmed} onClick={() => updateReply({ responses: { ...task.reply.responses, [task.reply.selected]: { ...response, confirmed: true } } })}>{response.confirmed ? '已确认此回复' : '确认此回复'}</button></> : <div className="compact-empty"><p>以实际修订作为回复依据。</p><span>提供修改稿后生成，缺少证据的内容会保留待确认标记。</span></div>}</> : <div className="compact-empty"><p>每条意见，都有据可答。</p><span>先在左侧提供原稿、意见与修改稿。</span></div>}</div><div className="result-footer"><span className="muted small">已确认 {confirmedReplies} / {task.reply.comments.length}</span><button disabled={!confirmedReplies || !!busy} onClick={exportReplies}><Icon name="download" size={16}/>导出已确认回复</button></div></>}
        </section>
      </div>
    </main></div>
    <input hidden ref={uploadRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f, uploadTarget.current); }}/>
    <input hidden ref={restoreRef} type="file" accept=".json" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const restored = readTask(JSON.parse(await f.text())); if (confirm('恢复会替换当前页面的任务。请先备份需要保留的内容。继续？')) { setTask(restored); setToast('任务已恢复，API Key 不包含在备份中'); } } catch (e) { setError((e as Error).message); } }}/>
    {apiOpen && <ApiSettings initial={{ ...prefs, model: prefs.model || defaults.model, baseUrl: prefs.baseUrl || defaults.baseUrl }} apiKey={apiKey} defaults={defaults} close={() => setApiOpen(false)} save={(p, key) => { setPrefs(p); setApiKey(p.mode === 'custom' ? key : ''); setApiOpen(false); setToast('API 配置已更新'); }}/ >}
    {editor && <Modal title={editor === 'paper' ? '编辑论文正文' : editor === 'comments' ? '审稿意见原文' : '修改后论文'} close={() => setEditor(null)}><label className="field">{editor === 'paper' ? '保留标题，段落之间空一行' : '粘贴完整文本'}<textarea autoFocus className="document-editor" value={draft} onChange={e => setDraft(e.target.value)} placeholder="在这里粘贴内容…"/></label><div className="modal-actions"><button onClick={() => setEditor(null)}>取消</button><button className="primary" disabled={!draft.trim()} onClick={saveEditor}>{editor === 'paper' ? '保存为新版本' : '保存内容'}</button></div></Modal>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

function OutputEditor({ label, value, onChange, disabled, compact, code }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; compact?: boolean; code?: boolean }) {
  return <label className={`output-editor ${code ? 'code-editor' : ''}`}><span>{label}</span><textarea aria-label={label} disabled={disabled} value={value} onChange={e => onChange(e.target.value)} rows={compact ? 3 : Math.min(26, Math.max(9, Math.ceil(value.length / 40)))} spellCheck={false}/></label>;
}
