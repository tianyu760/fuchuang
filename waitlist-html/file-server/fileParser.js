/**
 * 文件解析模块
 * 支持 PDF、Word、Excel、PPT、图片 OCR 等格式
 */

const fs = require('fs');
const path = require('path');

// 文件解析器
const fileParsers = {
  // PDF 解析
  async parsePDF(filePath) {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return {
        success: true,
        content: data.text,
        pages: data.numpages,
        info: data.info
      };
    } catch (error) {
      console.error('PDF 解析失败:', error);
      return {
        success: false,
        error: 'PDF 解析失败: ' + error.message
      };
    }
  },

  // Word 解析 (docx)
  async parseWord(filePath) {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return {
        success: true,
        content: result.value,
        messages: result.messages
      };
    } catch (error) {
      console.error('Word 解析失败:', error);
      return {
        success: false,
        error: 'Word 解析失败: ' + error.message
      };
    }
  },

  // Excel 解析
  async parseExcel(filePath) {
    try {
      const xlsx = require('xlsx');
      const workbook = xlsx.readFile(filePath);
      let content = '';
      
      workbook.SheetNames.forEach((sheetName, index) => {
        content += `=== 工作表: ${sheetName} ===\n`;
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        
        data.forEach(row => {
          content += row.join('\t') + '\n';
        });
        content += '\n';
      });
      
      return {
        success: true,
        content: content.trim()
      };
    } catch (error) {
      console.error('Excel 解析失败:', error);
      return {
        success: false,
        error: 'Excel 解析失败: ' + error.message
      };
    }
  },

  // CSV 解析
  async parseCSV(filePath) {
    try {
      const fs = require('fs');
      const content = fs.readFileSync(filePath, 'utf-8');
      return {
        success: true,
        content: content
      };
    } catch (error) {
      console.error('CSV 解析失败:', error);
      return {
        success: false,
        error: 'CSV 解析失败: ' + error.message
      };
    }
  },

  // PPT 解析
  async parsePPT(filePath) {
    try {
      // PPT 解析较复杂，这里返回基本信息
      const stats = fs.statSync(filePath);
      return {
        success: true,
        content: `[PPT 文件: ${path.basename(filePath)}]\n文件大小: ${(stats.size / 1024).toFixed(2)} KB\n注意：PPT 内容解析需要额外配置，当前仅支持文件上传。`,
        note: 'PPT 完整解析需要安装 python-pptx 或使用其他工具'
      };
    } catch (error) {
      console.error('PPT 解析失败:', error);
      return {
        success: false,
        error: 'PPT 解析失败: ' + error.message
      };
    }
  },

  // 图片 OCR 解析（简化版，返回文件信息）
  async parseImage(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return {
        success: true,
        content: `[图片文件: ${path.basename(filePath)}]\n文件大小: ${(stats.size / 1024).toFixed(2)} KB\n\n请描述该图片的内容或问题，AI 将基于您的描述进行回答。`
      };
    } catch (error) {
      return {
        success: false,
        error: '图片处理失败: ' + error.message
      };
    }
  },

  // 纯文本解析
  async parseText(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return {
        success: true,
        content: content
      };
    } catch (error) {
      console.error('文本解析失败:', error);
      return {
        success: false,
        error: '文本解析失败: ' + error.message
      };
    }
  }
};

/**
 * 根据文件扩展名获取解析器
 */
function getParserByExtension(filename) {
  const ext = path.extname(filename).toLowerCase();
  
  const parserMap = {
    '.pdf': fileParsers.parsePDF,
    '.docx': fileParsers.parseWord,
    '.doc': fileParsers.parseWord,
    '.xlsx': fileParsers.parseExcel,
    '.xls': fileParsers.parseExcel,
    '.csv': fileParsers.parseCSV,
    '.pptx': fileParsers.parsePPT,
    '.ppt': fileParsers.parsePPT,
    '.txt': fileParsers.parseText,
    '.jpg': fileParsers.parseImage,
    '.jpeg': fileParsers.parseImage,
    '.png': fileParsers.parseImage
  };
  
  return parserMap[ext] || fileParsers.parseText;
}

/**
 * 解析文件
 * @param {string} filePath - 文件路径
 * @param {string} originalName - 原始文件名
 * @returns {Promise<Object>} 解析结果
 */
async function parseFile(filePath, originalName) {
  console.log(`开始解析文件: ${originalName}`);
  
  const parser = getParserByExtension(originalName);
  const result = await parser(filePath);
  
  if (result.success) {
    console.log(`文件解析成功: ${originalName}, 内容长度: ${result.content.length}`);
  } else {
    console.error(`文件解析失败: ${originalName}, 错误: ${result.error}`);
  }
  
  return result;
}

module.exports = {
  parseFile,
  fileParsers
};
