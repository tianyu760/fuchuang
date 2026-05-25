package com.fayi.backend.dto;

import lombok.Data;

@Data
public class CreateKnowledgeRequest {
    private String title;
    private String content;
    private String fileName;
    private String fileType;
    private String fileData; // base64编码
}
