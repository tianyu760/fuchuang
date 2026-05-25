package com.fayi.backend.controller;

import com.fayi.backend.dto.ApiResponse;
import com.fayi.backend.service.ChatService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/wenshi")
public class WenshiController {

    private final ChatService chatService;

    public WenshiController(ChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping("/ask")
    public ResponseEntity<ApiResponse<String>> ask(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, String> body) {
        String question = body.get("question");
        if (question == null || question.isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("问题不能为空"));
        }
        String answer = chatService.askWenshi(question.trim());
        return ResponseEntity.ok(ApiResponse.success(answer));
    }
}
