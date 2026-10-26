import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { delimiter, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { resolveAssets } from './docx.mjs';

const exec = promisify(execFile);
const cache = fileURLToPath(new URL('../.cache/latex/', import.meta.url));
const template = fileURLToPath(new URL('../templates/elsevier/', import.meta.url));

async function filesFor(text, assets) {
  const files = { 'manuscript.tex': resolveAssets(text, assets) };
  for (const asset of assets) {
    if (asset.kind !== 'image') continue;
    if (!['png', 'jpg', 'jpeg', 'pdf'].includes(asset.extension) || typeof asset.base64 !== 'string') throw Error('图片素材格式无效');
    files[`${asset.id}.${asset.extension}`] = Buffer.from(asset.base64, 'base64');
  }
  for (const name of ['elsarticle.cls', 'elsarticle.dtx', 'elsarticle.ins', 'README']) files[name] = await readFile(resolve(template, name));
  return files;
}

export async function sourceArchive(text, assets = []) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(await filesFor(text, assets))) zip.file(name, content);
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}

export async function compileLatex(text, assets = []) {
  if (typeof text !== 'string' || !text.trim()) throw Error('没有可编译的 LaTeX 源码');
  if (text.length > 500000) throw Error('LaTeX 源码不能超过 50 万字符');
  const directory = resolve(cache, randomUUID());
  await mkdir(directory, { recursive: true });
  for (const [name, content] of Object.entries(await filesFor(text, assets))) await writeFile(resolve(directory, name), content);
  const options = { cwd: directory, timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, PATH: [process.env.PATH, ...(process.platform === 'darwin' ? ['/Library/TeX/texbin'] : [])].filter(Boolean).join(delimiter), openin_any: 'p', openout_any: 'p', TEXMFOUTPUT: directory }, windowsHide: true };
  try {
    for (let pass = 0; pass < 2; pass++) await exec('xelatex', ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', 'manuscript.tex'], options);
    const target = resolve(directory, 'manuscript.pdf');
    if ((await stat(target)).size > 4 * 1024 * 1024) throw Error('编译后的 PDF 超过 4 MB，请减少嵌入内容');
    return { pdfBase64: (await readFile(target)).toString('base64') };
  } catch (error) {
    if (error.code === 'ENOENT') throw Error('未找到 XeLaTeX，请安装 TeX Live 或将 xelatex 加入 PATH');
    if (error.killed) throw Error('LaTeX 编译超时，请检查源码是否存在循环或过于复杂的排版');
    const lines = String(error.stdout || '').split('\n');
    const start = lines.findIndex(line => /(?:\.tex:\d+:|^!)/.test(line));
    throw Error(start >= 0 ? lines.slice(start, start + 7).join('\n').trim() : error.message.startsWith('编译后的') ? error.message : 'LaTeX 编译失败，请检查源码中的宏包、字体和语法');
  }
}
