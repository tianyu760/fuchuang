# PDF 中文字体目录

请将以下字体文件放入本目录，用于 `legal_pdf` 模式导出时嵌入 PDF：

- `SourceHanSerifCN-Regular.ttf`
- `NotoSansSC-Regular.ttf`
- `NotoSerifSC-Regular.ttf`

说明：

- 系统会按以上顺序自动尝试加载并嵌入字体。
- 若字体缺失，PDF正文仍使用高分辨率图像渲染，避免中文乱码；页码会降级为英文 `Page x / y`。
