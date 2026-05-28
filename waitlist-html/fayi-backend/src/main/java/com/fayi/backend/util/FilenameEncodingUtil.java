package com.fayi.backend.util;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/**
 * 上传文件名 UTF-8 修复（multer / multipart 乱码）
 */
public final class FilenameEncodingUtil {

    private FilenameEncodingUtil() {}

    public static String fixOriginalFilename(String name) {
        if (name == null || name.isBlank()) {
            return "未命名文件";
        }
        String raw = name.trim();
        if (containsCjk(raw)) {
            return raw;
        }
        try {
            byte[] latin1 = raw.getBytes(StandardCharsets.ISO_8859_1);
            String fromLatin = new String(latin1, StandardCharsets.UTF_8);
            if (containsCjk(fromLatin)) {
                return fromLatin;
            }
        } catch (Exception ignored) {
            // fall through
        }
        try {
            String decoded = URLDecoder.decode(raw, StandardCharsets.UTF_8);
            if (!decoded.isEmpty() && !decoded.contains("\uFFFD")) {
                return decoded;
            }
        } catch (Exception ignored) {
            // fall through
        }
        return raw;
    }

    private static boolean containsCjk(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= 0x3400 && c <= 0x9FFF) return true;
            if (c >= 0xF900 && c <= 0xFAFF) return true;
        }
        return false;
    }
}
