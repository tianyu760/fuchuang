package com.fayi.backend.controller;

import com.fayi.backend.dto.ApiResponse;
import com.fayi.backend.service.ChatService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/fagui")
public class FaguiController {

    private final ChatService chatService;

    public FaguiController(ChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping("/search")
    public ResponseEntity<ApiResponse<String>> search(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, String> body) {
        String query = body.get("query");
        if (query == null || query.isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("检索词不能为空"));
        }
        String result = chatService.searchFagui(query.trim());
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}
