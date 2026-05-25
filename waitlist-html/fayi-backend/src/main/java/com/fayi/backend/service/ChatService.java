package com.fayi.backend.service;

import com.fayi.backend.dto.ChatMessageDto;
import com.fayi.backend.dto.ChatSessionDto;
import com.fayi.backend.entity.ChatMessage;
import com.fayi.backend.entity.User;
import com.fayi.backend.repository.ChatMessageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final ChatMessageRepository chatMessageRepository;
    private final RestTemplate restTemplate;

    @Value("${fayi.ai.url}")
    private String aiUrl;

    @Value("${fayi.ai.key}")
    private String aiKey;

    @Value("${fayi.ai.assistant-id}")
    private String aiAssistantId;

    public ChatService(ChatMessageRepository chatMessageRepository) {
        this.chatMessageRepository = chatMessageRepository;
        this.restTemplate = new RestTemplate();
    }

    // ---- 会话相关 ----

    public List<ChatSessionDto> getSessions(User user) {
        List<ChatMessage> allMessages = chatMessageRepository.findByUserOrderByCreatedAtAsc(user);
        Map<String, List<ChatMessage>> sessionMap = new LinkedHashMap<>();
        for (ChatMessage m : allMessages) {
            String sid = m.getSessionId() != null ? m.getSessionId() : "__legacy__";
            sessionMap.computeIfAbsent(sid, k -> new ArrayList<>()).add(m);
        }
        return sessionMap.entrySet().stream()
            .map(e -> {
                List<ChatMessage> msgs = e.getValue();
                String title = msgs.stream()
                    .filter(m -> "user".equals(m.getRole()))
                    .findFirst()
                    .map(m -> {
                        String c = m.getContent();
                        return c.length() > 30 ? c.substring(0, 30) + "…" : c;
                    })
                    .orElse("空对话");
                LocalDateTime lastAt = msgs.stream()
                    .map(ChatMessage::getCreatedAt)
                    .filter(Objects::nonNull)
                    .max(Comparator.naturalOrder())
                    .orElse(null);
                return new ChatSessionDto(e.getKey(), title, lastAt, msgs.size());
            })
            .sorted(Comparator.comparing(ChatSessionDto::getLastMessageAt,
                Comparator.nullsLast(Comparator.reverseOrder())))
            .collect(Collectors.toList());
    }

    public String createSession() {
        return "sess_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }

    public List<ChatMessageDto> getMessages(User user) {
        return chatMessageRepository.findByUserOrderByCreatedAtAsc(user)
                .stream().map(this::toDto).collect(Collectors.toList());
    }

    public List<ChatMessageDto> getMessagesBySession(User user, String sessionId) {
        if ("__legacy__".equals(sessionId)) {
            return chatMessageRepository.findByUserAndSessionIdOrderByCreatedAtAsc(user, null)
                    .stream().map(this::toDto).collect(Collectors.toList());
        }
        return chatMessageRepository.findByUserAndSessionIdOrderByCreatedAtAsc(user, sessionId)
                .stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional
    public List<ChatMessageDto> sendMessage(User user, String content, String sessionId) {
        return sendMessage(user, content, sessionId, null);
    }

    @Transactional
    public List<ChatMessageDto> sendMessage(User user, String content, String sessionId, String aiResponse) {
        if (sessionId == null || sessionId.isBlank()) {
            sessionId = createSession();
        }
        // 保存用户消息
        ChatMessage userMsg = new ChatMessage();
        userMsg.setUser(user);
        userMsg.setRole("user");
        userMsg.setContent(content);
        userMsg.setSessionId(sessionId);
        chatMessageRepository.save(userMsg);

        String aiReply;
        if (aiResponse != null && !aiResponse.isBlank()) {
            // 使用前端传入的 AI 回复（来自腾讯元器智能体）
            aiReply = aiResponse;
        } else {
            // 获取本会话历史（最近 20 条）
            List<ChatMessage> history = chatMessageRepository
                    .findByUserAndSessionIdOrderByCreatedAtAsc(user, sessionId);
            int start = Math.max(0, history.size() - 20);
            List<ChatMessage> context = history.subList(start, history.size());
            // 调用 AI（不使用本地提示词，依赖腾讯元器平台配置）
            aiReply = callAi(context, "");
        }

        // 保存 AI 回复
        ChatMessage aiMsg = new ChatMessage();
        aiMsg.setUser(user);
        aiMsg.setRole("assistant");
        aiMsg.setContent(aiReply);
        aiMsg.setSessionId(sessionId);
        chatMessageRepository.save(aiMsg);

        return List.of(toDto(userMsg), toDto(aiMsg));
    }

    @Transactional
    public void deleteSession(User user, String sessionId) {
        if ("__legacy__".equals(sessionId)) {
            // 删除所有 sessionId 为 null 的消息
            List<ChatMessage> legacyMsgs = chatMessageRepository
                    .findByUserAndSessionIdOrderByCreatedAtAsc(user, null);
            chatMessageRepository.deleteAll(legacyMsgs);
        } else {
            chatMessageRepository.deleteByUserAndSessionId(user, sessionId);
        }
    }

    @Transactional
    public void clearMessages(User user) {
        chatMessageRepository.deleteByUser(user);
    }

    // ---- 文书与材料专用 ----
    public String askWenshi(String question) {
        List<ChatMessage> msgs = new ArrayList<>();
        ChatMessage q = new ChatMessage();
        q.setRole("user"); q.setContent(question);
        msgs.add(q);
        return callAi(msgs, "");
    }

    // ---- 法规与案例检索专用 ----
    public String searchFagui(String query) {
        List<ChatMessage> msgs = new ArrayList<>();
        ChatMessage q = new ChatMessage();
        q.setRole("user"); q.setContent(query);
        msgs.add(q);
        return callAi(msgs, "");
    }

    // ---- 内部：调用腾讯元器智能体接口 ----
    String callAi(List<ChatMessage> history, String systemPrompt) {
        if (!hasValidApiKey()) {
            return buildMockReply(history.isEmpty() ? "" : history.get(history.size() - 1).getContent());
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(aiKey);
            headers.set("X-Source", "openapi");

            List<Map<String, String>> messages = new ArrayList<>();
            // 仅当systemPrompt非空时才添加system消息（完全依赖腾讯元器平台配置）
            if (systemPrompt != null && !systemPrompt.isEmpty()) {
                messages.add(Map.of("role", "system", "content", systemPrompt));
            }
            for (ChatMessage m : history) {
                messages.add(Map.of("role", m.getRole(), "content", m.getContent()));
            }

            Map<String, Object> body = new HashMap<>();
            body.put("assistant_id", aiAssistantId);
            body.put("messages", messages);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.postForEntity(aiUrl, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> choices = (List<Map<String, Object>>) response.getBody().get("choices");
                if (choices != null && !choices.isEmpty()) {
                    @SuppressWarnings("unchecked")
                    Map<String, String> message = (Map<String, String>) choices.get(0).get("message");
                    return message.getOrDefault("content", buildMockReply(""));
                }
            }
        } catch (Exception e) {
            log.warn("腾讯元器接口调用失败，降级为 mock 回复: {}", e.getMessage());
        }
        String lastUserContent = history.stream()
                .filter(m -> "user".equals(m.getRole()))
                .reduce((a, b) -> b)
                .map(ChatMessage::getContent)
                .orElse("");
        return buildMockReply(lastUserContent);
    }

    private boolean hasValidApiKey() {
        return aiKey != null && !aiKey.isBlank();
    }

    private String buildMockReply(String userText) {
        String preview = userText.length() > 200 ? userText.substring(0, 200) + "…" : userText;
        return "【法绎提示】本回复由大语言模型生成，仅供参考，不构成律师意见或任何法律效力上的承诺。涉及诉讼、仲裁、刑事或重大财产处分的，请咨询执业律师。\n\n" +
                "您提到的问题摘要：「" + preview + "」\n\n" +
                "建议您补充：事实经过、争议焦点、所在地区及是否已收到司法机关或对方送达的文书，以便做更有针对性的检索与梳理。" +
                "您也可以在「个人资料库」中保存常用材料与备注，便于下次对话引用。\n\n" +
                "(当前腾讯元器 API 调用异常，请检查网络连接或 API Key 配置。）";
    }

    private ChatMessageDto toDto(ChatMessage msg) {
        return new ChatMessageDto(msg.getId(), msg.getRole(), msg.getContent(),
                msg.getCreatedAt(), msg.getSessionId());
    }
}
