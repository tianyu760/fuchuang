package com.fayi.backend.controller;

import com.fayi.backend.dto.AuthResponse;
import com.fayi.backend.service.AuthService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * QQ OAuth 2.0 登录控制器
 *
 * 完整流程：
 *   1. GET /api/auth/qq/login         → 重定向到 QQ 授权页面
 *   2. QQ 回调 /api/auth/qq/callback  → 换取 token → 获取 openid → 获取用户信息 → 颁发 JWT → 重定向前端
 */
@RestController
@RequestMapping("/api/auth/qq")
public class QqOAuthController {

    private static final String QQ_AUTHORIZE_URL   = "https://graph.qq.com/oauth2.0/authorize";
    private static final String QQ_TOKEN_URL        = "https://graph.qq.com/oauth2.0/token";
    private static final String QQ_OPENID_URL       = "https://graph.qq.com/oauth2.0/me";
    private static final String QQ_USER_INFO_URL    = "https://graph.qq.com/user/get_user_info";

    @Value("${fayi.qq.client-id}")
    private String clientId;

    @Value("${fayi.qq.client-secret}")
    private String clientSecret;

    @Value("${fayi.qq.redirect-uri}")
    private String redirectUri;

    @Value("${fayi.qq.frontend-callback}")
    private String frontendCallback;

    private final AuthService authService;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public QqOAuthController(AuthService authService) {
        this.authService   = authService;
        this.restTemplate  = new RestTemplate();
        this.objectMapper  = new ObjectMapper();
    }

    /**
     * Step 1：重定向到 QQ 授权页面
     */
    @GetMapping("/login")
    public void qqLogin(HttpServletResponse response) throws IOException {
        String authorizeUrl = QQ_AUTHORIZE_URL
                + "?response_type=code"
                + "&client_id=" + encode(clientId)
                + "&redirect_uri=" + encode(redirectUri)
                + "&state=fayi_qq_login"
                + "&scope=get_user_info";
        response.sendRedirect(authorizeUrl);
    }

    /**
     * Step 2-5：QQ 回调，完成 OAuth 流程，颁发 JWT，重定向前端
     */
    @GetMapping("/callback")
    public void qqCallback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String error,
            HttpServletResponse response) throws IOException {

        // QQ 授权被拒绝
        if (error != null || code == null) {
            response.sendRedirect(frontendCallback + "?error=qq_denied");
            return;
        }

        try {
            // Step 2：用 code 换 access_token
            String tokenRaw = restTemplate.getForObject(
                    QQ_TOKEN_URL + "?grant_type=authorization_code"
                            + "&client_id=" + encode(clientId)
                            + "&client_secret=" + encode(clientSecret)
                            + "&code=" + encode(code)
                            + "&redirect_uri=" + encode(redirectUri),
                    String.class
            );
            Map<String, String> tokenParams = parseUrlEncoded(tokenRaw);
            String accessToken = tokenParams.get("access_token");
            if (accessToken == null || accessToken.isBlank()) {
                throw new RuntimeException("获取 access_token 失败: " + tokenRaw);
            }

            // Step 3：获取 openid（QQ 返回 JSONP 格式）
            String openidRaw = restTemplate.getForObject(
                    QQ_OPENID_URL + "?access_token=" + encode(accessToken),
                    String.class
            );
            String openId = parseOpenIdFromJsonp(openidRaw);

            // Step 4：获取用户基本信息
            String userInfoRaw = restTemplate.getForObject(
                    QQ_USER_INFO_URL + "?access_token=" + encode(accessToken)
                            + "&oauth_consumer_key=" + encode(clientId)
                            + "&openid=" + encode(openId),
                    String.class
            );
            JsonNode userInfo = objectMapper.readTree(userInfoRaw);
            String nickname  = userInfo.path("nickname").asText("QQ用户");
            // 优先使用 100×100 头像，不存在则用 40×40
            String avatarUrl = userInfo.path("figureurl_qq_2").asText("");
            if (avatarUrl.isBlank()) {
                avatarUrl = userInfo.path("figureurl_qq_1").asText("");
            }

            // Step 5：查找或自动注册账号，颁发 JWT
            AuthResponse authResp = authService.loginOrRegisterByQq(openId, nickname, avatarUrl);

            // Step 6：携带 token 重定向前端
            String redirectUrl = frontendCallback
                    + "?qq_token=" + encode(authResp.getToken())
                    + "&qq_name="  + encode(nickname)
                    + "&qq_avatar=" + encode(avatarUrl)
                    + "&qq_email=" + encode(authResp.getUser().getEmail());
            response.sendRedirect(redirectUrl);

        } catch (Exception e) {
            String redirectUrl = frontendCallback
                    + "?error=qq_failed"
                    + "&error_msg=" + encode(e.getMessage() != null ? e.getMessage() : "未知错误");
            response.sendRedirect(redirectUrl);
        }
    }

    // ==================== 私有工具方法 ====================

    /**
     * 解析 URL-encoded 字符串（QQ 返回 access_token 的格式）
     * 例：access_token=xxx&expires_in=7776000&refresh_token=xxx
     */
    private Map<String, String> parseUrlEncoded(String raw) {
        Map<String, String> map = new HashMap<>();
        if (raw == null || raw.isBlank()) return map;
        for (String pair : raw.split("&")) {
            int idx = pair.indexOf('=');
            if (idx > 0) {
                String key = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8);
                String val = URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8);
                map.put(key, val);
            }
        }
        return map;
    }

    /**
     * 从 JSONP 响应中解析 openid
     * QQ 返回格式：callback( {"client_id":"xxx","openid":"xxx"} );
     */
    private String parseOpenIdFromJsonp(String jsonp) throws Exception {
        if (jsonp == null) throw new RuntimeException("openid 响应为空");
        // 去掉 "callback( " 前缀和 " );" 后缀
        String json = jsonp.trim();
        int start = json.indexOf('{');
        int end   = json.lastIndexOf('}');
        if (start < 0 || end < 0) throw new RuntimeException("解析 openid 失败，响应：" + jsonp);
        json = json.substring(start, end + 1);
        JsonNode node = objectMapper.readTree(json);
        String openId = node.path("openid").asText("");
        if (openId.isBlank()) throw new RuntimeException("openid 为空，响应：" + jsonp);
        return openId;
    }

    private String encode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
