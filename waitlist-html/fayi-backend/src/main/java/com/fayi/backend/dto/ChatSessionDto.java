package com.fayi.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
public class ChatSessionDto {
    private String sessionId;
    private String title;
    private LocalDateTime lastMessageAt;
    private long messageCount;
}
