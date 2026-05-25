package com.fayi.backend.repository;

import com.fayi.backend.entity.KnowledgeItem;
import com.fayi.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface KnowledgeItemRepository extends JpaRepository<KnowledgeItem, String> {
    List<KnowledgeItem> findByUserOrderByCreatedAtDesc(User user);
    Optional<KnowledgeItem> findByIdAndUser(String id, User user);
}
