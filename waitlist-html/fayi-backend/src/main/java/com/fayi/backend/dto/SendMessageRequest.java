package com.fayi.backend.dto;

import lombok.Data;

@Data
public class SendMessageRequest {
    private String content;
    private String sessionId; // null = 新建会话
    private String aiResponse; // AI 回复内容（可选，前端调用外部 API 后传入）
}
