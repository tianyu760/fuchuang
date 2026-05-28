package com.fayi.backend.controller;

import com.fayi.backend.dto.ApiResponse;
import com.fayi.backend.dto.FileUploadResponse;
import com.fayi.backend.service.FileParserService;
import com.fayi.backend.util.FilenameEncodingUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 文件上传控制器
 */
@Slf4j
@RestController
@RequestMapping("/api/upload")
@RequiredArgsConstructor
public class FileUploadController {

    private final FileParserService fileParserService;

    // 上传目录（用户主目录下 fayi-uploads，确保可写）
    private static final String UPLOAD_DIR = System.getProperty("user.home") + "/fayi-uploads/";

    // 内存中缓存已解析结果（供 /status 查询，可选）
    private final Map<String, FileUploadResponse> fileStatusMap = new ConcurrentHashMap<>();

    /**
     * 上传并同步解析文件，立即返回解析结果
     */
    @PostMapping
    public ResponseEntity<ApiResponse<FileUploadResponse>> uploadFile(
            @RequestParam("file") MultipartFile file) {

        if (file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error(400, "请选择要上传的文件"));
        }
        if (file.getSize() > 50 * 1024 * 1024) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error(400, "文件大小不能超过 50MB"));
        }

        String fileId = UUID.randomUUID().toString();
        String originalFilename = FilenameEncodingUtil.fixOriginalFilename(file.getOriginalFilename());
        log.info("上传文件: {}, size: {} bytes", originalFilename, file.getSize());

        try {
            // 1. 保存文件到磁盘（timestamp_uuid.ext，不使用中文磁盘名）
            Path uploadPath = Paths.get(UPLOAD_DIR);
            if (!Files.exists(uploadPath)) {
                Files.createDirectories(uploadPath);
            }
            String extension = getFileExtension(originalFilename);
            String savedFilename = System.currentTimeMillis() + "_"
                    + fileId.replace("-", "").substring(0, 12)
                    + (extension.isEmpty() ? "" : "." + extension);
            Path filePath = uploadPath.resolve(savedFilename);
            file.transferTo(filePath.toFile());

            // 2. 构建访问 URL
            String fileUrl = "/uploads/" + savedFilename;

            // 3. 同步解析内容（快，通常 < 500ms）
            String content = "";
            try {
                content = fileParserService.parseFileFromPath(filePath, originalFilename);
            } catch (Exception e) {
                log.warn("文件解析异常（不影响上传）: {}", e.getMessage());
                content = "[文件内容解析失败: " + e.getMessage() + "]";
            }

            // 4. 构建响应
            FileUploadResponse response = FileUploadResponse.builder()
                    .fileId(fileId)
                    .fileName(originalFilename)
                    .fileType(file.getContentType())
                    .fileSize(file.getSize())
                    .status("completed")
                    .url(fileUrl)
                    .content(content)
                    .uploadedAt(LocalDateTime.now())
                    .build();

            fileStatusMap.put(fileId, response);
            log.info("上传完成: {}, 内容长度: {}", fileId, content.length());

            return ResponseEntity.ok(ApiResponse.success(response));

        } catch (IOException e) {
            log.error("文件上传失败: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(ApiResponse.error(500, "文件上传失败: " + e.getMessage()));
        }
    }

    /**
     * 查询文件状态（兼容旧轮询逻辑）
     */
    @GetMapping("/{fileId}/status")
    public ResponseEntity<ApiResponse<FileUploadResponse>> getFileStatus(
            @PathVariable String fileId) {
        FileUploadResponse response = fileStatusMap.get(fileId);
        if (response == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * 获取文件内容
     */
    @GetMapping("/{fileId}/content")
    public ResponseEntity<ApiResponse<String>> getFileContent(
            @PathVariable String fileId) {
        FileUploadResponse response = fileStatusMap.get(fileId);
        if (response == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(ApiResponse.success(response.getContent()));
    }

    /**
     * 删除文件
     */
    @DeleteMapping("/{fileId}")
    public ResponseEntity<ApiResponse<Void>> deleteFile(@PathVariable String fileId) {
        FileUploadResponse response = fileStatusMap.remove(fileId);
        if (response == null) {
            return ResponseEntity.notFound().build();
        }
        try {
            String storedName = response.getUrl();
            if (storedName != null && storedName.contains("/")) {
                storedName = storedName.substring(storedName.lastIndexOf('/') + 1);
            } else {
                String extension = getFileExtension(response.getFileName());
                storedName = fileId + (extension.isEmpty() ? "" : "." + extension);
            }
            Path filePath = Paths.get(UPLOAD_DIR, storedName);
            Files.deleteIfExists(filePath);
        } catch (IOException e) {
            log.warn("删除物理文件失败: {}", e.getMessage());
        }
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    private String getFileExtension(String filename) {
        if (filename == null || !filename.contains(".")) return "";
        return filename.substring(filename.lastIndexOf(".") + 1).toLowerCase();
    }
}
