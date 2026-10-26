import { download, type Output } from './model';

export function ReferenceResults({ data, fresh, busy, locate }: { data: Output; fresh: boolean; busy: boolean; locate: (paragraph: number) => void }) {
  return <div className="reference-results">
    {!data.entries ? <p className="notice">这是旧版引用结果，重新处理后可逐条核对文献与正文。</p> : data.entries.length === 0 ? <p>未识别到参考文献。请在正文中补充已有文献后重新处理。</p> : <>
      <p className="muted small">{data.entries.length} 篇文献</p>
      <ol className="reference-list">{data.entries.map(entry => <li key={entry.key}>
        <p className="reference-text">{entry.formatted}</p>
        <code className="reference-key">{entry.key}</code>
        <div className="reference-locations">{entry.citations.length ? entry.citations.map((citation, i) => <button key={i} className="plain" title={citation.quote} disabled={!fresh || busy} onClick={() => locate(citation.paragraph)}>第 {citation.paragraph} 段引用</button>) : <span className="muted small">未找到可核对的正文引用</span>}</div>
        {!!entry.missing.length && <p className="reference-missing">待补充：{entry.missing.join('、')}</p>}
        <details><summary>引用代码（可选）</summary><p className="pre-wrap">{entry.original}</p><p className="muted small">正文引用示例</p><pre>{`\\cite{${entry.key}}`}</pre><p className="muted small">LaTeX</p><pre>{entry.tex}</pre><p className="muted small">BibTeX</p><pre>{entry.bib}</pre></details>
      </li>)}</ol>
    </>}
    {!data.entries && <details><summary>查看旧版源码</summary><pre>{data.tex}</pre><pre>{data.bib}</pre></details>}
  </div>;
}

export function ReferenceDownloads({ data }: { data: Output }) {
  return <div className="button-row"><button disabled={!data.tex} onClick={() => download('references.tex', data.tex || '')}>下载 .tex</button><button disabled={!data.bib} onClick={() => download('references.bib', data.bib || '')}>下载 .bib</button></div>;
}
