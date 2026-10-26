import JSZip from 'jszip';
import { load } from 'cheerio';
import { posix } from 'node:path';

const name = node => node?.name?.split(':').at(-1);
const children = node => (node?.children || []).filter(n => n.type === 'tag');
const child = (node, tag) => children(node).find(n => name(n) === tag);
const raw = node => node?.type === 'text' ? node.data : (node?.children || []).map(raw).join('');
const escape = text => text.replace(/[\\{}%&#_$]/g, c => ({ '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '%': '\\%', '&': '\\&', '#': '\\#', '_': '\\_', '$': '\\$' })[c]);
const symbols = { 'σ': '\\sigma ', 'θ': '\\theta ', 'π': '\\pi ', '∈': '\\in ', '×': '\\times ', '−': '-', '≤': '\\leq ', '≥': '\\geq ', '∞': '\\infty ' };
function mathText(text) { return escape(text).replace(/[σθπ∈×−≤≥∞]/g, c => symbols[c]); }
const xmlText = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
function mathML(node) {
  const tag = name(node), parts = children(node);
  const inside = key => mathML(child(node, key));
  if (!node || tag?.endsWith('Pr')) return '';
  if (tag === 't') return `<mtext>${xmlText(raw(node))}</mtext>`;
  const wrapper = { f: 'mfrac', sSub: 'msub', sSup: 'msup', sSubSup: 'msubsup', rad: 'msqrt' }[tag];
  if (wrapper) return `<${wrapper}>${parts.filter(n => !name(n).endsWith('Pr') && name(n) !== 'deg').map(n => `<mrow>${mathML(n)}</mrow>`).join('')}</${wrapper}>`;
  if (tag === 'nary') return `<mrow><munderover><mo>${xmlText(child(child(node, 'naryPr'), 'chr')?.attribs['m:val'] || '∫')}</mo><mrow>${inside('sub')}</mrow><mrow>${inside('sup')}</mrow></munderover>${inside('e')}</mrow>`;
  if (tag === 'm') return `<mtable>${parts.filter(n => name(n) === 'mr').map(row => `<mtr>${children(row).filter(n => name(n) === 'e').map(n => `<mtd>${mathML(n)}</mtd>`).join('')}</mtr>`).join('')}</mtable>`;
  if (tag === 'd') return `<mrow><mo stretchy="true">${xmlText(child(child(node, 'dPr'), 'begChr')?.attribs['m:val'] ?? '(')}</mo>${inside('e')}<mo stretchy="true">${xmlText(child(child(node, 'dPr'), 'endChr')?.attribs['m:val'] ?? ')')}</mo></mrow>`;
  return parts.map(mathML).join('');
}
function math(node) {
  const tag = name(node), parts = children(node);
  const inside = key => math(child(node, key));
  if (!node || tag?.endsWith('Pr')) return '';
  if (tag === 't') return mathText(raw(node));
  if (['r', 'oMath', 'oMathPara', 'e', 'num', 'den', 'sub', 'sup', 'deg', 'lim', 'fName'].includes(tag)) return parts.map(math).join('');
  if (tag === 'f') return `\\frac{${inside('num')}}{${inside('den')}}`;
  if (tag === 'sSub') return `{${inside('e')}}_{${inside('sub')}}`;
  if (tag === 'sSup') return `{${inside('e')}}^{${inside('sup')}}`;
  if (tag === 'sSubSup') return `{${inside('e')}}_{${inside('sub')}}^{${inside('sup')}}`;
  if (tag === 'rad') return `\\sqrt${inside('deg') ? `[${inside('deg')}]` : ''}{${inside('e')}}`;
  if (tag === 'nary') {
    const operator = child(child(node, 'naryPr'), 'chr')?.attribs['m:val'] || '∫';
    const command = { '∫': '\\int', '∑': '\\sum', '∏': '\\prod', '∬': '\\iint' }[operator];
    if (!command) throw Error(`暂不支持 Word 公式运算符 ${operator}，请转为 LaTeX 后导入`);
    return `${command}_{${inside('sub')}}^{${inside('sup')}} ${inside('e')}`;
  }
  if (tag === 'm') return `\\begin{matrix}${parts.filter(n => name(n) === 'mr').map(row => children(row).filter(n => name(n) === 'e').map(math).join(' & ')).join(' \\\\ ')}\\end{matrix}`;
  if (tag === 'd') {
    const prop = child(node, 'dPr');
    const left = child(prop, 'begChr')?.attribs['m:val'] ?? '(';
    const right = child(prop, 'endChr')?.attribs['m:val'] ?? ')';
    const delim = s => s === '{' || s === '}' ? '\\' + s : s || '.';
    return `\\left${delim(left)}${parts.filter(n => name(n) === 'e').map(math).join('\\mid ')}\\right${delim(right)}`;
  }
  if (tag === 'func') return `${inside('fName')}(${inside('e')})`;
  if (tag === 'limLow' || tag === 'limUpp') return `{${inside('e')}}${tag === 'limLow' ? '_' : '^'}{${inside('lim')}}`;
  if (tag === 'eqArr') return `\\begin{aligned}${parts.filter(n => name(n) === 'e').map(math).join(' \\\\ ')}\\end{aligned}`;
  throw Error(`暂不支持 Word 公式结构 ${tag}，请转为 LaTeX 后导入，避免丢失公式`);
}

function tableTex(rows, caption = '') {
  const columns = Math.max(...rows.map(row => row.length));
  const title = caption.replace(/^(?:表\s*\d+|Table\s*\d+)[.．、\s]*/i, '');
  return `\\begin{table}[htbp]\\centering${title ? `\\caption{${escape(title)}}` : ''}\\small\\sbox0{\\begin{tabular}{${'l'.repeat(columns)}}\\hline\n${rows.map(row => row.map(escape).join(' & ') + ' \\\\').join('\n')}\n\\hline\\end{tabular}}\\ifdim\\wd0>\\linewidth\\resizebox{\\linewidth}{!}{\\usebox0}\\else\\usebox0\\fi\\end{table}`;
}

export async function parseDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw Error('DOCX 缺少正文');
  const $ = load(xml, { xml: true });
  const relXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  const rels = new Map();
  if (relXml) {
    const rel = load(relXml, { xml: true });
    rel('Relationship').each((_, n) => { if (n.attribs.TargetMode !== 'External') rels.set(n.attribs.Id, posix.normalize('word/' + n.attribs.Target)); });
  }
  const assets = [], counts = { equation: 0, table: 0, image: 0 };
  const add = (kind, data) => { const id = `${kind}-${++counts[kind]}`; assets.push({ id, kind, ...data }); return `[[PB:${id}]]`; };
  async function walk(node) {
    const tag = name(node);
    if (tag === 'oMathPara' || tag === 'oMath') {
      let tex = math(node);
      const numbered = tex.match(/\s+\((\d+)\)\s*$/);
      if (numbered) tex = tex.slice(0, numbered.index) + `\\tag{${numbered[1]}}`;
      const display = tag === 'oMathPara';
      return add('equation', { tex: display ? `\\[${tex}\\]` : `\\(${tex}\\)`, mathml: `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${display ? 'block' : 'inline'}">${mathML(node)}</math>` });
    }
    if (tag === 'drawing' || tag === 'pict') {
      const embed = $(node).find('*').toArray().find(n => n.attribs?.['r:embed'] || n.attribs?.['r:id']);
      const path = rels.get(embed?.attribs['r:embed'] || embed?.attribs['r:id']);
      const file = path && zip.file(path);
      if (!file) throw Error('DOCX 图片资源缺失或为外链，请先将图片嵌入 Word');
      const extension = path.split('.').at(-1).toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'pdf'].includes(extension)) throw Error(`图片格式 ${extension} 暂不支持排版，请在 Word 中转为 PNG 或 JPEG`);
      return add('image', { extension, base64: await file.async('base64') });
    }
    if (tag === 'tbl') {
      const rows = [];
      for (const tr of children(node).filter(n => name(n) === 'tr')) {
        const cells = [];
        for (const tc of children(tr).filter(n => name(n) === 'tc')) cells.push((await walk(tc)).trim());
        rows.push(cells);
      }
      const previous = raw($(node).prev().get(0)).trim();
      const caption = /^(?:表\s*\d+|Table\s*\d+)/i.test(previous) ? previous : '';
      return add('table', { tex: tableTex(rows, caption), rows, caption });
    }
    if (tag === 't' && node.name.startsWith('w:')) return raw(node);
    if (tag === 'tab') return '\t';
    if (tag === 'br') return '\n';
    if (tag?.endsWith('Pr')) return '';
    const pieces = [];
    for (const nested of children(node)) pieces.push(await walk(nested));
    const content = pieces.join('');
    return content + (tag === 'p' ? '\n\n' : '');
  }
  const body = $('w\\:body').get(0);
  // Sequential traversal keeps numbered assets in document order.
  const blocks = [];
  for (const node of children(body)) blocks.push(await walk(node));
  return { text: blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(), assets, notes: [`保留 ${counts.image} 张图片、${counts.table} 张表格、${counts.equation} 个公式；原始文档可切换预览。`] };
}

export function resolveAssets(text, assets = []) {
  let resolved = text;
  for (const asset of assets) {
    if (!/^(image|equation|table)-\d+$/.test(asset.id)) throw Error('素材编号无效');
    const placeholder = `\\PBasset{${asset.id}}`;
    if (resolved.split(placeholder).length !== 2) throw Error(`排版结果遗漏或重复原文素材 ${asset.id}，请重新生成或在源码中补回对应标记`);
    let tableCaption = asset.caption || '';
    if (asset.kind === 'table') {
      const at = resolved.indexOf(placeholder);
      const preceding = resolved.slice(0, at);
      const caption = preceding.match(/(?:^|\n\n)((?:表\s*\d+|Table\s*\d+)[^\n]*)\s*$/i);
      if (caption) { tableCaption = tableCaption || caption[1]; resolved = preceding.slice(0, caption.index) + '\n\n' + resolved.slice(at); }
    }
    const replacement = asset.kind === 'image' ? `\\begin{center}\\includegraphics[width=0.85\\linewidth]{${asset.id}.${asset.extension}}\\end{center}` : asset.kind === 'table' && asset.rows ? tableTex(asset.rows, tableCaption) : asset.tex;
    resolved = resolved.replaceAll(placeholder, () => replacement);
  }
  if (/\\PBasset\{|\[\[PB:/.test(resolved)) throw Error('排版结果包含无法对应原文件的素材标记');
  return resolved;
}
