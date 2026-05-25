package com.fayi.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileUploadResponse {
    private String fileId;
    private String fileName;
    private String fileType;
    private long fileSize;
    private String status;  // uploading, parsing, completed, error
    private String content; // 解析后的文本内容
    private String error;
    private String url;     // 文件访问 URL
    private LocalDateTime uploadedAt;
}
