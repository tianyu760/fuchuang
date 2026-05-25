package com.fayi.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "knowledge_items")
@Data
@NoArgsConstructor
public class KnowledgeItem {

    @Id
    @Column(length = 50)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 300)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(length = 255)
    private String fileName;

    @Column(length = 50)
    private String fileType;

    @Column(columnDefinition = "TEXT")
    private String fileData;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (this.id == null) {
            this.id = "kb_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        }
        this.createdAt = LocalDateTime.now();
    }
}
