package com.fayi.backend.controller;

import com.fayi.backend.dto.ApiResponse;
import com.fayi.backend.dto.CreateKnowledgeRequest;
import com.fayi.backend.dto.KnowledgeItemDto;
import com.fayi.backend.entity.User;
import com.fayi.backend.service.AuthService;
import com.fayi.backend.service.KnowledgeService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/knowledge")
public class KnowledgeController {

    private final KnowledgeService knowledgeService;
    private final AuthService authService;

    public KnowledgeController(KnowledgeService knowledgeService, AuthService authService) {
        this.knowledgeService = knowledgeService;
        this.authService = authService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<KnowledgeItemDto>>> list(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = authService.getUserEntity(userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success(knowledgeService.getItems(user)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<KnowledgeItemDto>> create(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody CreateKnowledgeRequest req) {
        try {
            User user = authService.getUserEntity(userDetails.getUsername());
            KnowledgeItemDto dto = knowledgeService.createItem(user, req);
            return ResponseEntity.ok(ApiResponse.success(dto));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String id) {
        try {
            User user = authService.getUserEntity(userDetails.getUsername());
            knowledgeService.deleteItem(user, id);
            return ResponseEntity.ok(ApiResponse.success("已删除", null));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        }
    }
}
