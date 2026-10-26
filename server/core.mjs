import { diffArrays } from 'diff';

export function resolveApi(settings = {}, defaults = {}) {
  const custom = settings.mode === 'custom';
  const base = new URL(custom ? settings.baseUrl : defaults.baseUrl);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw Error('请输入有效的 HTTP(S) 服务根地址');
  const key = custom ? settings.apiKey?.trim() : defaults.apiKey;
  const model = settings.model?.trim() || defaults.model;
  if (!key) throw Error(custom ? '自定义 API 需要填写自己的 API Key' : '默认 API 未配置，请打开 API 设置');
  if (!model) throw Error('请填写模型名称');
  return { baseUrl: base.href.replace(/\/$/, ''), apiKey: key, model };
}

export function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { throw Error('模型未返回有效 JSON，请重试；已有内容已保留'); }
}

export function evidencePacket(original, revised) {
  if (!original?.text?.trim() || !revised?.text?.trim()) throw Error('需要同时提供原始论文和修改稿');
  const chunks = text => text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const before = chunks(original.text), after = chunks(revised.text);
  const operations = diffArrays(before, after, { comparator: (a, b) => a.replace(/\s+/g, ' ') === b.replace(/\s+/g, ' ') });
  let oldPos = 0, newPos = 0;
  const changes = [];
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    if (!op.added && !op.removed) { oldPos += op.value.length; newPos += op.value.length; continue; }
    const originalStart = oldPos, revisedStart = newPos;
    let oldText = '', newText = '';
    if (op.removed) {
      oldText = op.value.join('\n\n'); oldPos += op.value.length;
      if (operations[i + 1]?.added) { const next = operations[++i]; newText = next.value.join('\n\n'); newPos += next.value.length; }
    } else { newText = op.value.join('\n\n'); newPos += op.value.length; }
    changes.push({ change_id: `REV-${String(changes.length + 1).padStart(3, '0')}`, change_type: oldText && newText ? 'modified' : oldText ? 'deleted' : 'added', section: '', original_location: { page: '', paragraph: oldText ? String(originalStart + 1) : '', label: '' }, revised_location: { page: '', paragraph: newText ? String(revisedStart + 1) : '', label: '' }, original_text: oldText, revised_text: newText, observable_change: '确定性段落差异；修改目的及意见解决状态待核对', evidence_quality: 'high', alignment_confidence: oldText && newText ? 'medium' : 'high', notes: '段落以空行分隔；相邻删除和新增合并展示，不推断移动或修改目的。' });
  }
  return { packet_type: 'revision_evidence_packet', schema_version: '1.0', original_document: { filename: original.name, title: before[0], extraction_status: 'complete', notes: '基于用户确认的正文文本，页码未映射' }, revised_document: { filename: revised.name, title: after[0], extraction_status: 'complete', notes: '基于用户确认的正文文本，页码未映射' }, revision_summary: { substantive_change_count: changes.length, added_count: changes.filter(c => c.change_type === 'added').length, deleted_count: changes.filter(c => c.change_type === 'deleted').length, modified_count: changes.filter(c => c.change_type === 'modified').length, moved_count: 0, formatting_only_count: 0, main_changed_sections: [], global_notes: '空白差异已忽略；段落对齐可能合并相邻修改，不作语义解决判断。' }, changes, unchanged_relevant_sections: [], unresolved_comparison_issues: ['未提取页码和行号；无变化不代表审稿意见已解决。'] };
}

export function validateResult(action, result, input) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error('模型返回结构不正确');
  if (result.notes !== undefined && (!Array.isArray(result.notes) || result.notes.some(note => typeof note !== 'string'))) throw Error('模型待确认事项格式不正确，请重试');
  const strings = { translate: ['text'], summary: ['abstract', 'keywords', 'conclusion'], latex: ['text'], review: ['letter', 'brief', 'fit'], refine: ['letter'], response: ['response', 'stance'] }[action] || [];
  for (const key of strings) if (typeof result[key] !== 'string') throw Error(`模型结果缺少 ${key}，请重试`);
  if (action === 'latex') {
    for (const [key, title, heading, environment] of [
      ['abstract', '摘要', /(?:^|\n)\s*(?:摘要|Abstract)\s*[:：]?\s*(?:\n|$)/i, /\\begin\{abstract\}/],
      ['keywords', '关键词', /(?:^|\n)\s*(?:关键词|Keywords?)\s*[:：]?/i, /\\begin\{keywords?\}/],
    ]) {
      if (!heading.test(input.paper) && !input.confirmed?.summary?.[key] && environment.test(result.text)) {
        const block = key === 'abstract' ? /\\begin\{abstract\}[\s\S]*?\\end\{abstract\}/g : /\\begin\{keywords?\}[\s\S]*?\\end\{keywords?\}/g;
        result.text = result.text.replace(block, '');
        result.notes = [...(result.notes || []), `原文未提供${title}，已移除模型在模板中补写的对应内容。`];
      }
    }
  }
  if (action === 'references') {
    if (!Array.isArray(result.entries)) throw Error('模型未返回逐条参考文献，请重试');
    const keys = new Set();
    const paragraphs = input.paper.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    result.entries = result.entries.map(entry => {
      if (['key', 'original', 'formatted', 'tex', 'bib'].some(k => typeof entry[k] !== 'string' || !entry[k].trim()) || !Array.isArray(entry.missing) || entry.missing.some(v => typeof v !== 'string') || !Array.isArray(entry.citations)) throw Error('参考文献条目不完整，请重试');
      if (!input.paper.includes(entry.original)) throw Error('参考文献原始条目无法对应论文，请重试');
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_:-]*$/.test(entry.key) || keys.has(entry.key)) throw Error('文献引用键无效或重复，请重试');
      keys.add(entry.key);
      const texKeys = [...entry.tex.matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/g)].map(m => m[1]);
      const bibKeys = [...entry.bib.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)].map(m => m[1]);
      if (texKeys.length !== 1 || texKeys[0] !== entry.key || bibKeys.length !== 1 || bibKeys[0] !== entry.key) throw Error('LaTeX 与 BibTeX 引用键不一致，请重试');
      const citations = entry.citations.flatMap(c => {
        if (typeof c.quote !== 'string' || !c.quote.trim()) return [];
        const matches = paragraphs.flatMap((p, i) => p.includes(c.quote) && !p.includes(entry.original) ? [i + 1] : []);
        const paragraph = matches.length === 1 ? matches[0] : c.paragraph;
        return matches.includes(paragraph) ? [{ paragraph, quote: c.quote }] : [];
      });
      return { ...entry, citations };
    });
    result.tex = result.entries.length ? '\\begin{thebibliography}{99}\n' + result.entries.map(e => e.tex).join('\n\n') + '\n\\end{thebibliography}' : '';
    result.bib = result.entries.map(e => e.bib).join('\n\n');
  }
  if (action === 'review') {
    if (!Array.isArray(result.reviewItems) || result.reviewItems.some(item => !['Major', 'Minor'].includes(item.level) || !Number.isInteger(item.stars) || item.stars < 1 || item.stars > 5 || ['type', 'location', 'summary', 'suggestion'].some(key => typeof item[key] !== 'string'))) throw Error('模型意见条目格式不正确，请重试');
  }
  if (action === 'check') {
    if (!Array.isArray(result.issues)) throw Error('模型未返回问题列表');
    const paragraphs = input.paper.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    result.issues = result.issues.map((issue, i) => {
      if (typeof issue.original !== 'string' || !issue.original || typeof issue.suggestion !== 'string') throw Error('模型返回了无效的修改建议');
      const matches = paragraphs.flatMap((p, index) => p.includes(issue.original) ? [index] : []);
      const index = matches.length === 1 ? matches[0] : issue.paragraph - 1;
      const p = paragraphs[index];
      return { ...issue, paragraph: index + 1, id: `I${i + 1}`, located: !!p && p.split(issue.original).length === 2, status: 'pending' };
    });
  }
  if (action === 'analyze') {
    if (!Array.isArray(result.comments) || !result.comments.length) throw Error('未能拆解出审稿意见');
    for (const c of result.comments) if (typeof c.original !== 'string' || !input.comments.includes(c.original)) throw Error('模型未保留审稿意见原文，请重试');
    result.comments = result.comments.map((c, i) => ({ ...c, id: `C${i + 1}` }));
  }
  return result;
}
