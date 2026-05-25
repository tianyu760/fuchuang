package com.fayi.backend.service;

import com.fayi.backend.dto.CreateKnowledgeRequest;
import com.fayi.backend.dto.KnowledgeItemDto;
import com.fayi.backend.entity.KnowledgeItem;
import com.fayi.backend.entity.User;
import com.fayi.backend.repository.KnowledgeItemRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class KnowledgeService {

    private final KnowledgeItemRepository knowledgeItemRepository;

    public KnowledgeService(KnowledgeItemRepository knowledgeItemRepository) {
        this.knowledgeItemRepository = knowledgeItemRepository;
    }

    public List<KnowledgeItemDto> getItems(User user) {
        return knowledgeItemRepository.findByUserOrderByCreatedAtDesc(user)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public KnowledgeItemDto createItem(User user, CreateKnowledgeRequest req) {
        if (req.getTitle() == null || req.getTitle().isBlank()) {
            throw new IllegalArgumentException("标题不能为空");
        }
        String content = (req.getContent() != null) ? req.getContent().trim() : "";
        KnowledgeItem item = new KnowledgeItem();
        item.setUser(user);
        item.setTitle(req.getTitle().trim());
        item.setContent(content);
        if (req.getFileName() != null) item.setFileName(req.getFileName());
        if (req.getFileType() != null) item.setFileType(req.getFileType());
        if (req.getFileData() != null) item.setFileData(req.getFileData());
        knowledgeItemRepository.save(item);
        return toDto(item);
    }

    public void deleteItem(User user, String id) {
        KnowledgeItem item = knowledgeItemRepository.findByIdAndUser(id, user)
                .orElseThrow(() -> new IllegalArgumentException("条目不存在或无权限删除"));
        knowledgeItemRepository.delete(item);
    }

    private KnowledgeItemDto toDto(KnowledgeItem item) {
        return new KnowledgeItemDto(
                item.getId(),
                item.getTitle(),
                item.getContent(),
                item.getCreatedAt(),
                item.getFileName(),
                item.getFileType(),
                item.getFileData() != null
        );
    }
}
