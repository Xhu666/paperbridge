export type Module = 'process' | 'review' | 'reply';
export type Action = 'translate' | 'check' | 'summary' | 'references' | 'latex';
export interface SourceAsset { id: string; kind: 'image' | 'table' | 'equation'; extension?: string; base64?: string; tex?: string; mathml?: string; rows?: string[][] }
export interface Version { id: string; name: string; text: string; time: string; originalFileId?: string; assets?: SourceAsset[] }
export interface Issue { id: string; paragraph: number; original: string; suggestion: string; reason: string; type: string; certainty: string; located: boolean; status: 'pending' | 'accepted' | 'ignored' }
export interface Comment { id: string; title: string; original: string; type: string; priority: string; suggestion: string }
export interface ReviewItem { level: string; type: string; stars: number; location: string; summary: string; suggestion: string }
export interface ReferenceEntry { key: string; original: string; formatted: string; tex: string; bib: string; missing: string[]; citations: { paragraph: number; quote: string }[] }
export interface Output { assets?: SourceAsset[]; entries?: ReferenceEntry[]; text?: string; pdfBase64?: string; compileError?: string; abstract?: string; keywords?: string; conclusion?: string; tex?: string; bib?: string; letter?: string; brief?: string; fit?: string; response?: string; stance?: string; issues?: Issue[]; comments?: Comment[]; reviewItems?: ReviewItem[]; notes?: string[]; meta?: { model: string; generatedAt: string } }
export interface SavedOutput { versionId: string; data: Output; confirmed: boolean; integrated?: boolean; seen?: boolean; context?: string }
export interface Change { change_id: string; change_type: string; original_text: string; revised_text: string; original_location: { paragraph: string }; revised_location: { paragraph: string } }
export interface Evidence { changes: Change[]; revision_summary: { substantive_change_count: number }; unresolved_comparison_issues: string[] }
export interface Reply { original: Version | null; revised: Version | null; commentsText: string; comments: Comment[]; selected: string; responses: Record<string, { data: Output; confirmed: boolean; originalId: string; revisedId: string }>; evidence: Evidence | null }
export interface Task { schema: 1; title: string; module: Module; action: Action; versions: Version[]; currentId: string; domain: string; glossary: string; results: Record<string, SavedOutput>; journal: { name: string; confirmed: boolean; url: string; guideline: string; source?: { url: string; fetchedAt: string } }; reply: Reply }
export interface ApiPrefs { mode: 'default' | 'custom'; baseUrl: string; model: string }
export const actions: { id: Action; name: string; hint: string; icon: string }[] = [
  { id: 'summary', name: '摘要与结论', hint: '从正文提取要点', icon: 'summary' },
  { id: 'check', name: '术语检查', hint: '定位并逐项确认', icon: 'check' },
  { id: 'references', name: '参考文献', hint: '逐条整理与引用核对', icon: 'reference' },
  { id: 'translate', name: '中译英', hint: '保留结构与术语', icon: 'translate' },
  { id: 'latex', name: 'LaTeX 排版', hint: '整合并预览 PDF', icon: 'code' },
];
export const blankTask = (): Task => ({ schema: 1, title: '', module: 'process', action: 'translate', versions: [], currentId: '', domain: '自动识别', glossary: '', results: {}, journal: { name: '', confirmed: false, url: '', guideline: '' }, reply: { original: null, revised: null, commentsText: '', comments: [], selected: '', responses: {}, evidence: null } });
export const version = (text: string, name: string): Version => ({ id: crypto.randomUUID(), text: text.trim(), name, time: new Date().toISOString() });
export function removeVersion(task: Task, id: string): Task {
  const versions = task.versions.filter(v => v.id !== id);
  const linkedReply = task.reply.original?.id === id || task.reply.revised?.id === id;
  return { ...task, versions, currentId: task.currentId === id ? versions.at(-1)?.id || '' : task.currentId,
    title: versions.length ? task.title : '',
    results: Object.fromEntries(Object.entries(task.results).filter(([, result]) => result.versionId !== id)),
    reply: linkedReply ? { ...task.reply, original: task.reply.original?.id === id ? null : task.reply.original, revised: task.reply.revised?.id === id ? null : task.reply.revised, responses: {}, evidence: null } : task.reply };
}
export const paragraphs = (text: string) => text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
export function integrateSummary(text: string, data: Output): string {
  if (![data.abstract, data.keywords, data.conclusion].every(s => s?.trim())) throw Error('请补齐摘要、关键词和结论后再插入正文');
  const prefix = '(?:(?:\\d+(?:\\.\\d+)*[.、．]?|[一二三四五六七八九十]+[、．.])\\s*)?';
  const heading = (names: string) => new RegExp('^\\s*' + prefix + '(?:' + names + ')\\s*[:：]?\\s*$', 'i');
  const abstract = heading('摘\\s*要|abstract');
  const conclusion = heading('结论(?:与展望)?|总结(?:与展望)?|conclusions?');
  const intro = heading('引言|绪论|前言|introduction');
  const back = heading('参考文献|致谢|基金(?:项目|信息)?|references|acknowledg(?:e)?ments?|funding');
  const section = new RegExp('^\\s*' + '(?:\\d+(?:\\.\\d+)*[.、．]?\\s+\\S|[一二三四五六七八九十]+[、．.]\\s*\\S)');
  const keyword = /^\s*(?:关键词|关 键 词|keywords?)\s*[:：]?/i;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (abstract.test(line) || conclusion.test(line)) { skipping = true; continue; }
    if (skipping && (intro.test(line) || back.test(line) || section.test(line) || keyword.test(line))) skipping = false;
    if (!skipping && !keyword.test(line)) kept.push(line);
  }
  let body = kept.join('\n').trim();
  const bodyLines = body.split('\n');
  const start = bodyLines.findIndex(line => intro.test(line) || section.test(line));
  // 无章节标题时保留首段作为题名，其后插入摘要。
  const insertAt = start >= 0 ? start : Math.min(bodyLines.findIndex(line => !line.trim()) + 1 || 1, bodyLines.length);
  bodyLines.splice(insertAt, 0, `摘要\n\n${data.abstract!.trim()}\n\n关键词：${data.keywords!.trim()}\n`);
  const end = bodyLines.findIndex(line => back.test(line) || /^\s*本研究.*(?:基金|项目|支持)/.test(line));
  bodyLines.splice(end >= 0 ? end : bodyLines.length, 0, `\n结论\n\n${data.conclusion!.trim()}\n`);
  return bodyLines.join('\n').trim();
}
export function readTask(value: unknown): Task {
  const t = value as Task;
  if (!t || t.schema !== 1 || !Array.isArray(t.versions) || !t.results || !t.journal || !t.reply || !Array.isArray(t.reply.comments) || !t.reply.responses) throw Error('不是有效的 PaperBridge 任务备份');
  if (t.versions.some(v => typeof v.text !== 'string' || typeof v.id !== 'string') || !['process', 'review', 'reply'].includes(t.module) || !actions.some(a => a.id === t.action)) throw Error('任务内容结构不正确');
  if ([t.reply.original, t.reply.revised].some(v => v && (typeof v.text !== 'string' || typeof v.id !== 'string'))) throw Error('稿件版本信息不正确');
  return { schema: 1, title: t.title, module: t.module, action: t.action, versions: t.versions, currentId: t.currentId, domain: t.domain, glossary: t.glossary, results: t.results, journal: t.journal, reply: t.reply };
}
export function download(name: string, text: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
