import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Version } from './model';

async function originalStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('paperbridge-originals', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveOriginalFile(id: string, file: File) {
  const db = await originalStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('files', 'readwrite');
      transaction.objectStore('files').put(file, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
async function loadOriginalFile(id: string) {
  const db = await originalStore();
  try {
    return await new Promise<File | undefined>((resolve, reject) => {
      const request = db.transaction('files').objectStore('files').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export function OriginalDocument({ version, forceText, attach, children }: { version: Version; forceText: boolean; attach: (id: string) => void; children: ReactNode }) {
  const [view, setView] = useState<'original' | 'text'>(version.id === version.originalFileId ? 'original' : 'text');
  const [file, setFile] = useState<File>(), [error, setError] = useState(''), [loading, setLoading] = useState(false), [scale, setScale] = useState(1);
  const host = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const preview = view === 'original' && !forceText;
  useEffect(() => {
    let cancelled = false;
    if (version.originalFileId) loadOriginalFile(version.originalFileId).then(f => { if (!cancelled) setFile(f); }).catch(() => { if (!cancelled) setError('无法读取本机原文件，请重新关联'); });
    return () => { cancelled = true; };
  }, [version.originalFileId]);
  useEffect(() => {
    if (!preview || !file || !host.current) return;
    let cancelled = false;
    let url = '';
    const target = host.current;
    setLoading(true); setError('');
    if (/\.pdf$/i.test(file.name)) {
      url = URL.createObjectURL(file);
      const frame = document.createElement('iframe'); frame.src = url; frame.title = '原始 PDF 文档';
      target.replaceChildren(frame); setLoading(false);
    } else {
      import('docx-preview').then(async ({ renderAsync }) => {
        if (cancelled) return;
        await renderAsync(file, target, undefined, { inWrapper: true, useBase64URL: true, renderAltChunks: false });
        if (!cancelled) setLoading(false);
      }).catch(() => { if (!cancelled) { setError('此文档无法在浏览器预览，请使用 Word 查看原文件'); setLoading(false); } });
    }
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); target.replaceChildren(); };
  }, [file, preview]);
  useEffect(() => {
    if (!viewport.current || !preview) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / 850)));
    observer.observe(viewport.current); return () => observer.disconnect();
  }, [preview]);
  const supportsOriginal = /\.(docx|pdf)$/i.test(version.name) || !!file;
  if (!supportsOriginal) return children;
  return <div className="document-view">
    <div className="document-tabs" role="tablist" aria-label="稿件视图">
      <button role="tab" aria-selected={!preview} onClick={() => setView('text')}>当前正文</button>
      <button role="tab" aria-selected={preview} disabled={forceText} onClick={() => setView('original')}>原始文档</button>
    </div>
    {preview ? <div className="original-viewport" ref={viewport} role="tabpanel" aria-label="原始文档预览">
      {file ? <><p className="original-caption">{file.name} · 上传时的原文件{version.id !== version.originalFileId ? '，不含后续正文修订' : ''}</p>{loading && <p role="status">正在显示文档…</p>}<div className={`original-render ${/\.pdf$/i.test(file.name) ? 'original-pdf' : ''}`} style={{ zoom: /\.pdf$/i.test(file.name) ? 1 : scale }} ref={host}/></> : <div className="compact-empty"><p>此版本尚未保存原文件</p><span>关联原始 DOCX 或 PDF 后可查看图表与公式，当前正文不会改变。</span><button onClick={() => input.current?.click()}>关联原文件</button></div>}
      {error && <p role="alert">{error}</p>}
    </div> : children}
    <input ref={input} hidden type="file" accept=".docx,.pdf" onChange={async e => {
      const f = e.target.files?.[0]; if (!f) return;
      try { await saveOriginalFile(version.id, f); setFile(f); attach(version.id); setError(''); } catch { setError('原文件保存失败，请检查浏览器本机存储空间'); }
    }}/>
  </div>;
}
