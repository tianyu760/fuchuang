package com.fayi.backend.repository;

import com.fayi.backend.entity.ChatMessage;
import com.fayi.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    List<ChatMessage> findByUserOrderByCreatedAtAsc(User user);
    void deleteByUser(User user);
    List<ChatMessage> findByUserAndSessionIdOrderByCreatedAtAsc(User user, String sessionId);
    @Modifying
    void deleteByUserAndSessionId(User user, String sessionId);
}
