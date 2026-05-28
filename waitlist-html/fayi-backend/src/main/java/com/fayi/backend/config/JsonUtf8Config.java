package com.fayi.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 所有 JSON 接口响应：application/json;charset=UTF-8
 */
@Configuration
public class JsonUtf8Config {

    @Bean
    public MappingJackson2HttpMessageConverter mappingJackson2HttpMessageConverter() {
        MappingJackson2HttpMessageConverter converter = new MappingJackson2HttpMessageConverter();
        converter.setDefaultCharset(StandardCharsets.UTF_8);
        MediaType jsonUtf8 = new MediaType("application", "json", StandardCharsets.UTF_8);
        converter.setSupportedMediaTypes(List.of(jsonUtf8, MediaType.APPLICATION_JSON));
        return converter;
    }
}
