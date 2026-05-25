package com.fayi.backend.controller;

import com.fayi.backend.dto.ApiResponse;
import com.fayi.backend.service.AuthService;
import com.fayi.backend.service.PufaService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/pufa")
public class PufaController {

    private final PufaService pufaService;
    private final AuthService authService;

    public PufaController(PufaService pufaService, AuthService authService) {
        this.pufaService = pufaService;
        this.authService = authService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRecommendations(
            @AuthenticationPrincipal UserDetails userDetails) {
        String persona = authService.getProfile(userDetails.getUsername()).getPersona();
        Map<String, Object> data = pufaService.getRecommendations(persona);
        return ResponseEntity.ok(ApiResponse.success(data));
    }
}
