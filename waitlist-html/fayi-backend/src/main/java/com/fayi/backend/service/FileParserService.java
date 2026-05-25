package com.fayi.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * 文件解析服务
 * 支持 PDF、Word、Excel、PPT、图片 OCR 等格式
 */
@Slf4j
@Service
public class FileParserService {

    /**
     * 从文件路径解析文件内容
     */
    public String parseFileFromPath(Path filePath, String originalFilename) throws Exception {
        String extension = getFileExtension(originalFilename).toLowerCase();
        
        log.info("开始解析文件: {}, 类型: {}", originalFilename, extension);

        switch (extension) {
            case "pdf":
                return parsePdfFromPath(filePath);
            case "doc":
            case "docx":
                return parseWordFromPath(filePath);
            case "xls":
            case "xlsx":
            case "csv":
                return parseExcelFromPath(filePath);
            case "ppt":
            case "pptx":
                return parsePptFromPath(filePath);
            case "txt":
                return parseTextFromPath(filePath);
            case "jpg":
            case "jpeg":
            case "png":
                return parseImageFromPath(filePath, originalFilename);
            default:
                return parseAsTextFromPath(filePath);
        }
    }

    /**
     * 解析 PDF 文件（Path 版本）
     */
    private String parsePdfFromPath(Path filePath) throws Exception {
        try (org.apache.pdfbox.pdmodel.PDDocument document =
                     org.apache.pdfbox.Loader.loadPDF(filePath.toFile())) {
            org.apache.pdfbox.text.PDFTextStripper stripper = new org.apache.pdfbox.text.PDFTextStripper();
            String text = stripper.getText(document);
            return cleanText(text);
        }
    }

    /**
     * 解析 Word 文档（Path 版本）
     */
    private String parseWordFromPath(Path filePath) throws Exception {
        StringBuilder content = new StringBuilder();
        
        try (InputStream is = Files.newInputStream(filePath);
             XWPFDocument document = new XWPFDocument(is)) {
            
            List<XWPFParagraph> paragraphs = document.getParagraphs();
            for (XWPFParagraph paragraph : paragraphs) {
                String text = paragraph.getText();
                if (text != null && !text.trim().isEmpty()) {
                    content.append(text).append("\n");
                }
            }
        }
        
        return cleanText(content.toString());
    }

    /**
     * 解析 Excel 文件（Path 版本）
     */
    private String parseExcelFromPath(Path filePath) throws Exception {
        StringBuilder content = new StringBuilder();
        String filename = filePath.getFileName().toString();
        String extension = getFileExtension(filename).toLowerCase();
        
        if ("csv".equals(extension)) {
            // 解析 CSV
            try (BufferedReader reader = Files.newBufferedReader(filePath)) {
                String line;
                while ((line = reader.readLine()) != null) {
                    content.append(line).append("\n");
                }
            }
        } else {
            // 解析 Excel
            try (InputStream is = Files.newInputStream(filePath);
                 Workbook workbook = extension.equals("xls") 
                    ? new org.apache.poi.hssf.usermodel.HSSFWorkbook(is)
                    : new XSSFWorkbook(is)) {
                
                for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
                    Sheet sheet = workbook.getSheetAt(i);
                    content.append("=== 工作表: ").append(sheet.getSheetName()).append(" ===\n");
                    
                    for (Row row : sheet) {
                        StringBuilder rowContent = new StringBuilder();
                        for (Cell cell : row) {
                            String cellValue = getCellValue(cell);
                            if (!cellValue.isEmpty()) {
                                rowContent.append(cellValue).append("\t");
                            }
                        }
                        if (rowContent.length() > 0) {
                            content.append(rowContent.toString().trim()).append("\n");
                        }
                    }
                    content.append("\n");
                }
            }
        }
        
        return cleanText(content.toString());
    }

    /**
     * 获取单元格值
     */
    private String getCellValue(Cell cell) {
        if (cell == null) return "";
        
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getDateCellValue().toString();
                }
                return String.valueOf(cell.getNumericCellValue());
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            case FORMULA:
                return cell.getCellFormula();
            default:
                return "";
        }
    }

    /**
     * 解析 PPT 文件（Path 版本）
     */
    private String parsePptFromPath(Path filePath) throws Exception {
        StringBuilder content = new StringBuilder();
        
        try (InputStream is = Files.newInputStream(filePath);
             XMLSlideShow ppt = new XMLSlideShow(is)) {
            
            List<XSLFSlide> slides = ppt.getSlides();
            for (int i = 0; i < slides.size(); i++) {
                XSLFSlide slide = slides.get(i);
                content.append("=== 第 ").append(i + 1).append(" 页 ===\n");
                
                for (XSLFShape shape : slide.getShapes()) {
                    if (shape instanceof XSLFTextShape) {
                        XSLFTextShape textShape = (XSLFTextShape) shape;
                        String text = textShape.getText();
                        if (text != null && !text.trim().isEmpty()) {
                            content.append(text).append("\n");
                        }
                    }
                }
                content.append("\n");
            }
        }
        
        return cleanText(content.toString());
    }

    /**
     * 解析纯文本文件（Path 版本）
     */
    private String parseTextFromPath(Path filePath) throws Exception {
        return parseAsTextFromPath(filePath);
    }

    /**
     * 通用文本解析（Path 版本）
     */
    private String parseAsTextFromPath(Path filePath) throws Exception {
        StringBuilder content = new StringBuilder();
        try (BufferedReader reader = Files.newBufferedReader(filePath)) {
            String line;
            while ((line = reader.readLine()) != null) {
                content.append(line).append("\n");
            }
        }
        return cleanText(content.toString());
    }

    /**
     * 解析图片（直接返回描述，不调用 OCR 避免卡顿）
     */
    private String parseImageFromPath(Path filePath, String originalFilename) throws Exception {
        long size = Files.size(filePath);
        return "[图片文件: " + originalFilename + "]\n" +
               "文件大小: " + formatFileSize(size) + "\n" +
               "图片内容已上传，可在对话中将图片内容表述后进行分析。";
    }

    /**
     * 获取文件扩展名
     */
    private String getFileExtension(String filename) {
        if (filename == null || !filename.contains(".")) {
            return "";
        }
        return filename.substring(filename.lastIndexOf(".") + 1);
    }

    /**
     * 格式化文件大小
     */
    private String formatFileSize(long size) {
        if (size < 1024) return size + " B";
        if (size < 1024 * 1024) return String.format("%.2f KB", size / 1024.0);
        return String.format("%.2f MB", size / (1024.0 * 1024));
    }

    /**
     * 清理文本内容
     */
    private String cleanText(String text) {
        if (text == null) return "";
        // 移除多余的空行
        return text.replaceAll("\n{3,}", "\n\n").trim();
    }
}
