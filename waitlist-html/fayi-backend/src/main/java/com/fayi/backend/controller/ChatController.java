package com.fayi.backend.controller;

import com.fayi.backend.dto.ApiResponse;
import com.fayi.backend.dto.ChatMessageDto;
import com.fayi.backend.dto.ChatSessionDto;
import com.fayi.backend.dto.SendMessageRequest;
import com.fayi.backend.entity.User;
import com.fayi.backend.service.AuthService;
import com.fayi.backend.service.ChatService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;
    private final AuthService authService;

    public ChatController(ChatService chatService, AuthService authService) {
        this.chatService = chatService;
        this.authService = authService;
    }

    @GetMapping("/sessions")
    public ResponseEntity<ApiResponse<List<ChatSessionDto>>> getSessions(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = authService.getUserEntity(userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success(chatService.getSessions(user)));
    }

    @PostMapping("/sessions")
    public ResponseEntity<ApiResponse<String>> createSession(
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.success(chatService.createSession()));
    }

    @GetMapping("/messages")
    public ResponseEntity<ApiResponse<List<ChatMessageDto>>> getMessages(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam(required = false) String sessionId) {
        User user = authService.getUserEntity(userDetails.getUsername());
        List<ChatMessageDto> messages = sessionId != null && !sessionId.isBlank()
                ? chatService.getMessagesBySession(user, sessionId)
                : chatService.getMessages(user);
        return ResponseEntity.ok(ApiResponse.success(messages));
    }

    @PostMapping("/messages")
    public ResponseEntity<ApiResponse<List<ChatMessageDto>>> sendMessage(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody SendMessageRequest req) {
        if (req.getContent() == null || req.getContent().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("消息内容不能为空"));
        }
        User user = authService.getUserEntity(userDetails.getUsername());
        List<ChatMessageDto> result = chatService.sendMessage(
            user, req.getContent().trim(), req.getSessionId(), req.getAiResponse());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<ApiResponse<Void>> deleteSession(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String sessionId) {
        User user = authService.getUserEntity(userDetails.getUsername());
        chatService.deleteSession(user, sessionId);
        return ResponseEntity.ok(ApiResponse.success("已删除", null));
    }

    @DeleteMapping("/messages")
    public ResponseEntity<ApiResponse<Void>> clearMessages(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = authService.getUserEntity(userDetails.getUsername());
        chatService.clearMessages(user);
        return ResponseEntity.ok(ApiResponse.success("会话已清空", null));
    }
}
