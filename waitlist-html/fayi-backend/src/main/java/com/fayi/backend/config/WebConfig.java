package com.fayi.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Web 配置 - 静态资源映射
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 映射 /uploads/** 到系统目录 ~/fayi-uploads/
        Path uploadPath = Paths.get(System.getProperty("user.home"), "fayi-uploads").toAbsolutePath().normalize();
        String uploadAbsolutePath = uploadPath.toUri().toString();
        
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(uploadAbsolutePath + "/")
                .setCachePeriod(3600); // 缓存 1 小时
    }
}
