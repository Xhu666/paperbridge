# PaperBridge · 论文桥

PaperBridge 是面向学术论文写作的本地工作台，集成论文加工、模拟审稿与审稿意见回复。前端使用 React、TypeScript 和 Vite，后端使用 Node.js，通过 OpenAI 兼容接口调用模型。

## 主要功能

- **论文加工**：中译英、术语一致性检查、摘要/关键词/结论生成、参考文献整理和全文 LaTeX 排版。支持核对原文位置、逐项接受修改及保存正文版本。
- **模拟审稿**：结合作者确认的期刊名称与官方投稿指南生成审稿意见，支持主要/次要意见筛选、调整、确认和 Markdown 导出。
- **审稿回复**：固定送审原稿，比较修改稿，拆分评论并逐条生成、编辑与确认回复。回复依据实际文本差异，缺失证据保留待确认标记。
- **文档与导出**：支持 TXT、Markdown、DOCX 和文本型 PDF；支持任务 JSON 备份、正文 TXT、审稿及回复 Markdown、LaTeX/BibTeX、PDF 和排版工程 ZIP。

DOCX 可提取嵌入图片、原生表格及支持的 OMML 公式；PDF 当前仅提取文字。复杂格式需要人工核对，扫描 PDF 需先完成 OCR。

## 快速启动

### Windows / macOS 双击启动

下载仓库并解压，或执行：

```bash
git clone https://github.com/Xhu666/paperbridge.git
cd paperbridge
```

- Windows 10/11 x64：双击 `Start-PaperBridge.bat`。
- macOS（Apple 芯片或 Intel）：双击 `Start-PaperBridge.command`。若文件没有执行权限，可在项目目录执行 `chmod +x Start-PaperBridge.command`。

启动器会检查 Node.js/npm、项目依赖及 PDF 排版环境，补齐缺失依赖，构建前端并打开浏览器。首次准备需要联网；Node.js 和 TinyTeX 安装在项目 `.cache/startup/`，JavaScript 依赖保存在 `node_modules/`。

默认访问地址为 <http://127.0.0.1:5190>，端口被占用时启动器会选择后续可用端口。保留启动窗口，按 `Ctrl+C` 停止服务。启动本身不会调用模型。

已有 Node.js 时也可执行：

```bash
npm run launch
# 启动服务但不自动打开浏览器
npm run launch -- --no-browser
```

### 手动构建运行

适用于已有 Node.js 环境的 Windows、macOS 或 Linux。要求 **Node.js 22.12 或以上**及 npm。

```bash
npm ci
npm run build
npm start
```

打开 <http://127.0.0.1:5190>。开发时运行 `npm run dev`，默认服务端口为 5190，热更新端口为 5191；切换运行方式前请停止旧进程。

手动运行时，PDF 编译需要额外安装 XeLaTeX、中文字体和所需宏包。Debian/Ubuntu 可安装：

```bash
sudo apt install texlive-xetex texlive-lang-chinese texlive-latex-extra
```

请确保 `xelatex` 位于 `PATH`。中文排版使用 TeX Live 提供的 Fandol 字体。未安装 TeX 时仍可使用其他功能；PDF 编译失败会保留源码并显示原因。

## 配置模型 API

启动后点击网页右上角的 API 设置，选择自定义 OpenAI 兼容接口，填写服务地址、模型 ID 和 API Key，再测试连接。

- 服务地址应保留提供商要求的路径，例如 `https://api.example.com/v1`；后端会追加 `/chat/completions` 或 `/models`。
- 若提供商不支持模型列表接口，直接填写模型 ID 即可。
- 自定义 Key 只保存在当前页面内存中，刷新后需重新输入，不写入任务保存或 JSON 备份。
- 请求由本地后端转发至所选提供商，连接测试和正文处理可能产生模型费用。

如需服务端默认配置，可在运行环境中设置 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`，也可自行创建本地 `.env` 文件。仓库不包含 API 配置文件或密钥，`.env` 及 `.env.*` 均已忽略。可用 `PORT` 环境变量调整端口。

## 使用流程

1. 上传论文或粘贴正文，确认提取结果。
2. 在“论文加工”中选择处理项目，核对结果后接受修改或保存新版本。
3. 需要模拟审稿时，填写并确认期刊全称，读取公开官网最终 URL 或粘贴官方指南，再生成审稿意见。
4. 需要回复时，固定送审原稿、导入审稿意见、提供修改稿，逐条检查并确认回复后导出。
5. 使用 JSON 备份迁移任务；在另一浏览器或设备预览原始 DOCX/PDF 时，需重新关联原文件。

任务保存在当前浏览器的 localStorage，原始 DOCX/PDF 预览文件另存于 IndexedDB。JSON 备份包含正文与提取的排版素材，不包含原始上传文件和 API Key。清除浏览器数据前请先备份。

## 项目结构

```text
paperbridge/
├── src/                       # React 界面、文档预览与任务状态
├── server/                    # API 转发、文件解析、差异比较及 LaTeX 编译
├── prompts/                   # 运行必需的审稿与回复提示词
├── templates/elsevier/         # elsarticle 模板、源码与许可说明
├── public/                    # 静态资源
├── scripts/                   # 环境检查与启动脚本
├── Start-PaperBridge.bat       # Windows 入口
├── Start-PaperBridge.command   # macOS 入口
├── index.html
├── package.json
├── package-lock.json
└── tsconfig.json
```

仓库仅保留构建、启动和运行所需文件及本 README。测试、案例、无关文档、API 配置、依赖目录、构建产物和运行缓存不上传。`prompts/` 中的 Markdown 是运行资源；Elsevier 模板的说明和源码用于排版工程导出及保留第三方许可信息。

## 使用边界

- 服务仅监听 `127.0.0.1`，适合本机使用；当前不提供账号、多人协作、云端同步或面向公网的部署配置。
- 单文件最大 20 MB，单次论文正文最大 15 万字符，实际能力还受模型上下文和输出上限影响。
- 只有执行相应智能处理时才将输入发送至所选模型服务。论文和审稿资料是否允许外发，由使用者自行确认。
- 官网读取仅支持公开文本网页；登录页、反爬或动态渲染页面可改为粘贴指南。未提供指南时仅作一般评审。
- 模型结果需人工核验，本工具不替代文献检索、实验执行或真实同行评审；缺失事实、数据、文献和页码不应由模型补造。
- 本地编译的临时文件位于 `.cache/latex/`。内置 Elsevier `elsarticle` 来自 [CTAN](https://ctan.org/pkg/elsarticle)，遵循 LPPL 1.3 或更新版本，详见模板目录说明。
