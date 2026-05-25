package com.fayi.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class KnowledgeItemDto {
    private String id;
    private String title;
    private String content;
    private LocalDateTime createdAt;
    private String fileName;
    private String fileType;
    private boolean hasFile;
}
