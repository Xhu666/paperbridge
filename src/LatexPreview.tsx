import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

function bytes(base64: string) { return Uint8Array.from(atob(base64), c => c.charCodeAt(0)); }

export function downloadPdf(base64: string) {
  const url = URL.createObjectURL(new Blob([bytes(base64)], { type: 'application/pdf' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'manuscript.pdf'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PdfPage({ document, pageNumber, width }: { document: PDFDocumentProxy; pageNumber: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false; let task: RenderTask | undefined;
    document.getPage(pageNumber).then(async page => {
      if (cancelled || !ref.current) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const canvas = ref.current;
      canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      task = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await task.promise;
    }).catch(e => { if (!cancelled && e.name !== 'RenderingCancelledException') setError('此页显示失败，请下载 PDF 查看'); });
    return () => { cancelled = true; task?.cancel(); };
  }, [document, pageNumber, width]);
  return <div className="pdf-page">{error ? <p role="alert">{error}</p> : <canvas ref={ref} role="img" aria-label={`排版 PDF 第 ${pageNumber} 页`}/>}<span>{pageNumber} / {document.numPages}</span></div>;
}

export function LatexPreview({ text, pdfBase64, compileError, busy, onSourceChange, onCompile, onDownloadSource }: { text: string; pdfBase64?: string; compileError?: string; busy: boolean; onSourceChange: (text: string) => void; onCompile: () => void; onDownloadSource: () => void }) {
  const [tab, setTab] = useState<'pdf' | 'source'>('pdf');
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null), [error, setError] = useState('');
  const [width, setWidth] = useState(400);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(120, Math.floor(entries[0].contentRect.width - 32))));
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setDocument(null); setError('');
    if (!pdfBase64) return;
    let cancelled = false; let destroy: (() => void) | undefined;
    import('pdfjs-dist').then(async pdfjs => {
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const loading = pdfjs.getDocument({ data: bytes(pdfBase64), isEvalSupported: false, cMapUrl: '/pdf-assets/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdf-assets/standard_fonts/', wasmUrl: '/pdf-assets/wasm/' });
      destroy = () => { void loading.destroy(); };
      const doc = await loading.promise; if (!cancelled) setDocument(doc);
    }).catch(() => { if (!cancelled) setError('PDF 预览加载失败，可下载文件查看'); });
    return () => { cancelled = true; destroy?.(); };
  }, [pdfBase64]);
  return <div className="latex-preview" ref={container}>
    <div className="latex-toolbar"><div role="tablist" aria-label="排版结果"><button role="tab" aria-selected={tab === 'pdf'} onClick={() => setTab('pdf')}>PDF 预览</button><button role="tab" aria-selected={tab === 'source'} onClick={() => setTab('source')}>源码</button></div><button disabled={busy || !text.trim()} onClick={() => { setTab('pdf'); onCompile(); }}>{busy ? '编译中…' : pdfBase64 ? '重新编译' : '编译 PDF'}</button></div>
    {compileError && <p className="compile-error" role="alert">{compileError}</p>}
    {tab === 'source' ? <><label className="output-editor code-editor"><span>修改后重新编译，以更新 PDF。</span><textarea aria-label="LaTeX 源码" disabled={busy} value={text} onChange={e => onSourceChange(e.target.value)} rows={24} spellCheck={false}/></label><button onClick={onDownloadSource}>下载排版工程 .zip</button></> : <div className="pdf-pages" role="tabpanel" aria-label="PDF 预览">{error ? <p role="alert">{error}</p> : document ? Array.from({ length: document.numPages }, (_, i) => <PdfPage key={i} document={document} pageNumber={i + 1} width={width}/>) : <p className="pdf-status" role="status">{busy ? '正在编译 PDF…' : pdfBase64 ? '正在显示 PDF…' : compileError ? '修改源码后可重新编译。' : '点击“编译 PDF”查看排版结果。'}</p>}</div>}
  </div>;
}
