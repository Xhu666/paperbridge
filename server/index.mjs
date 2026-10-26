import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { load } from 'cheerio';
import { parseDocx } from './docx.mjs';
import { PDFParse } from 'pdf-parse';
import { resolveApi, parseJson, evidencePacket, validateResult } from './core.mjs';
import { promptFor } from './prompts.mjs';
import { compileLatex, sourceArchive } from './latex.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const defaults = { baseUrl: process.env.LLM_BASE_URL || '', apiKey: process.env.LLM_API_KEY || '', model: process.env.LLM_MODEL || 'DeepSeek-V4-Flash-0731' };
const port = Number(process.env.PORT || 5190);
const production = process.argv.includes('--production');
const vite = production ? null : await (await import('vite')).createServer({ root, server: { middlewareMode: true, hmr: { port: port + 1, host: '127.0.0.1' } }, appType: 'spa' });

async function body(req, limit = 24 * 1024 * 1024) {
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > limit) throw Error('上传内容不能超过 24 MB'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}
async function upstream(settings, suffix, payload) {
  const api = resolveApi(settings, defaults);
  const response = await fetch(api.baseUrl + suffix, { method: payload ? 'POST' : 'GET', headers: { Authorization: `Bearer ${api.apiKey}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify({ model: api.model, ...payload }) } : {}), redirect: 'error', signal: AbortSignal.timeout(180000) });
  if (!response.ok) {
    let detail = '';
    try { const value = await response.json(); detail = String(value.error?.message || value.message || '').replaceAll(api.apiKey, '[隐藏]'); } catch { /* 非 JSON 错误仅展示状态 */ }
    throw Error(`模型服务 HTTP ${response.status}${detail ? '：' + detail.slice(0, 250) : ''}`);
  }
  return response.json();
}
async function chat(settings, system, input, maxTokens) {
  const value = await upstream(settings, '/chat/completions', { messages: [{ role: 'system', content: system }, { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) }], ...(maxTokens ? { max_tokens: maxTokens } : resolveApi(settings, defaults).model.startsWith('DeepSeek') ? { max_tokens: 32768 } : {}), temperature: 0.2, ...(resolveApi(settings, defaults).model.startsWith('DeepSeek') ? { thinking: { type: 'disabled' } } : {}) });
  const choice = value.choices?.[0];
  if (choice?.finish_reason === 'length') throw Error('模型服务截断了输出，未保存不完整结果。当前模型或服务商的单次输出额度不足，请换用更大输出额度的模型或分章处理');
  if (!choice?.message?.content?.trim()) throw Error('模型返回空内容，请检查模型设置后重试');
  return { text: choice.message.content, model: value.model, usage: value.usage };
}
function privateAddress(address) {
  if (isIP(address) === 4) return /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|23\d\.)/.test(address);
  return !/^2[0-9a-f]{3}:/i.test(address);
}
async function publicPage(raw) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('请输入公开的期刊官网 HTTP(S) 地址');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some(x => privateAddress(x.address))) throw Error('期刊资料只支持公开网站地址');
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { Accept: 'text/html,text/plain', 'User-Agent': 'PaperBridge/1.0' } });
  if (response.status >= 300 && response.status < 400) throw Error('官网发生跳转，请填写跳转后的最终地址或粘贴指南');
  if (!response.ok) throw Error(`官网访问失败（HTTP ${response.status}），请粘贴指南`);
  if (!/text\/(html|plain)/i.test(response.headers.get('content-type') || '')) throw Error('此地址不是文本网页，请上传或粘贴指南');
  const reader = response.body.getReader(); let bytes = 0; const chunks = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw Error('网页过大，请粘贴需要的投稿指南'); } chunks.push(Buffer.from(value)); }
  const $ = load(Buffer.concat(chunks).toString('utf8')); $('script,style,nav,footer,header,noscript,svg').remove();
  const text = ($('main').text() || $('article').text() || $('body').text()).replace(/[\t ]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  if (text.length < 80) throw Error('网页未提供足够文本，请粘贴指南');
  if (text.length > 60000) throw Error('网页文字超过 6 万字，请粘贴相关指南段落');
  return { text, url: url.href, fetchedAt: new Date().toISOString() };
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname.startsWith('/api/')) {
    const host = req.headers.host;
    const origin = req.headers.origin;
    const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowed.includes(host) || (origin && !allowed.map(h => `http://${h}`).includes(origin))) return send(res, 403, { error: '不允许的请求来源' });
    try {
      if (pathname === '/api/config' && req.method === 'GET') return send(res, 200, { configured: !!defaults.apiKey, baseUrl: defaults.baseUrl, model: defaults.model });
      if (req.method !== 'POST') return send(res, 405, { error: '不支持的请求方法' });
      if (pathname === '/api/parse') {
        const buffer = await body(req);
        const form = await new Request('http://localhost/upload', { method: 'POST', headers: { 'Content-Type': req.headers['content-type'] || '' }, body: buffer }).formData();
        const file = form.get('file');
        if (!file || typeof file === 'string') throw Error('请选择文件');
        if (file.size > 20 * 1024 * 1024) throw Error('文件不能超过 20 MB');
        const bytes = Buffer.from(await file.arrayBuffer()); const extension = extname(file.name).toLowerCase(); let text = '', notes = [], assets = [];
        if (extension === '.txt' || extension === '.md') text = bytes.toString('utf8');
        else if (extension === '.docx') { const result = await parseDocx(bytes); text = result.text; notes = result.notes; assets = result.assets; }
        else if (extension === '.pdf') { const parser = new PDFParse({ data: new Uint8Array(bytes) }); try { const result = await parser.getText(); text = result.pages.map(p => p.text).join('\n\n'); } finally { await parser.destroy(); } notes.push('已提取 PDF 文本，复杂表格、公式和阅读顺序请核对；段落定位不代表原文件页码。'); }
        else throw Error('支持 TXT、MD、DOCX 和文本型 PDF');
        if (!text.trim()) throw Error('未提取到文字；扫描件请先 OCR 或粘贴正文');
        return send(res, 200, { text: text.trim(), name: file.name, notes, assets });
      }
      if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: '接口需要 JSON 请求' });
      const data = JSON.parse((await body(req, 32 * 1024 * 1024)).toString('utf8'));
      if (pathname === '/api/test') { const result = await chat(data.settings, '仅回复 OK', '连接测试', 128); return send(res, 200, { model: result.model, message: result.text }); }
      if (pathname === '/api/models') { const result = await upstream(data.settings, '/models'); return send(res, 200, { models: result.data.map(m => m.id) }); }
      if (pathname === '/api/journal') return send(res, 200, await publicPage(data.url));
      if (pathname === '/api/evidence') return send(res, 200, evidencePacket(data.original, data.revised));
      if (pathname === '/api/latex-compile') return send(res, 200, await compileLatex(data.text, data.assets));
      if (pathname === '/api/latex-source') return send(res, 200, { zipBase64: await sourceArchive(data.text, data.assets) });
      if (pathname === '/api/process') {
        const { settings, action, assets = [], ...input } = data;
        if (assets.length) input.sourceAssets = assets.map(({ base64, mathml, ...asset }) => asset);
        if (typeof input.paper !== 'string' || !input.paper.trim()) throw Error('请先提供论文正文');
        if (input.paper.length > 150000) throw Error('首版单次支持 15 万字符以内正文，请分章节处理');
        if (action === 'review' && (!input.journal?.trim() || !input.journalConfirmed)) throw Error('请填写并确认目标期刊');
        if (action === 'response') { input.REVISION_EVIDENCE_PACKET = evidencePacket(input.original, input.revised); if (!input.comment?.original) throw Error('请先选择一条审稿意见'); }
        const layoutRules = action === 'latex' ? '\n本次文档章节权限（必须遵守）：' + JSON.stringify({ abstract: /(?:^|\n)\s*(?:摘要|Abstract)\s*[:：]?\s*(?:\n|$)/i.test(input.paper) || !!input.confirmed?.summary?.abstract, keywords: /(?:^|\n)\s*(?:关键词|Keywords?)\s*[:：]?/i.test(input.paper) || !!input.confirmed?.summary?.keywords, conclusion: /(?:^|\n)\s*(?:[0-9.、\s]*)(?:结论|总结|Conclusions?)\s*(?:\n|$)/i.test(input.paper) || !!input.confirmed?.summary?.conclusion }) + '。false 的章节绝对不能生成，即使 elsarticle 示例通常包含它们；不得补写正文中缺失的信息，也不得润色、修正或扩写原句。' : '';
        const result = await chat(settings, promptFor(action) + layoutRules, input);
        const output = validateResult(action, parseJson(result.text), input);
        if (action === 'latex') {
          output.assets = assets;
          try { Object.assign(output, await compileLatex(output.text, assets)); }
          catch (error) { output.compileError = error.message; }
        }
        return send(res, 200, { ...output, meta: { model: result.model, generatedAt: new Date().toISOString(), usage: result.usage } });
      }
      return send(res, 404, { error: '接口不存在' });
    } catch (error) { return send(res, 400, { error: error.name === 'TimeoutError' ? '请求超时，已有结果保留，请稍后重试' : error.message === 'fetch failed' ? '无法连接服务，请检查 API 地址和网络' : error.message }); }
  }
  if (pathname.startsWith('/pdf-assets/')) {
    if (!/^\/pdf-assets\/(cmaps|standard_fonts|wasm)\/[a-zA-Z0-9_-]+\.(bcmap|ttf|pfb|wasm)$/.test(pathname)) { res.writeHead(404); return res.end(); }
    try {
      const file = await readFile(resolve(root, 'node_modules/pdfjs-dist', pathname.slice('/pdf-assets/'.length)));
      res.writeHead(200, { 'Content-Type': pathname.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' }); return res.end(file);
    } catch { res.writeHead(404); return res.end(); }
  }
  if (vite) return vite.middlewares(req, res);
  try {
    const dist = resolve(root, 'dist'); const path = resolve(dist, '.' + decodeURIComponent(pathname));
    if (path !== dist && !path.startsWith(dist + sep)) { res.writeHead(403); return res.end(); }
    const target = extname(path) ? path : resolve(dist, 'index.html');
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }[extname(target)] || 'application/octet-stream';
    const file = await readFile(target); res.writeHead(200, { 'Content-Type': mime }); res.end(file);
  } catch { res.writeHead(404); res.end('未找到文件，请先运行 npm run build'); }
});
server.listen(port, '127.0.0.1', () => console.log(`PaperBridge http://127.0.0.1:${port}`));
