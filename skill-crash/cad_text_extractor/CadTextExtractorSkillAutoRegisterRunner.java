package com.ai4kb.backend.skill.impl.cad_text_extractor;

import com.ai4kb.backend.skill.entity.DynamicSkillRegistry;
import com.ai4kb.backend.skill.service.DynamicSkillRegistryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
/**
 * CAD 技能协议自动注册器。
 * 应用启动后自动把 cad_text_extractor 写入动态技能注册表，避免手工初始化。
 */
public class CadTextExtractorSkillAutoRegisterRunner implements ApplicationRunner {

    private final DynamicSkillRegistryService dynamicSkillRegistryService;
    private final ObjectMapper objectMapper;

    @Value("${server.port:8083}")
    private String serverPort;

    @Value("${skill.protocol.host:http://127.0.0.1}")
    private String protocolHost;

    @Override
    public void run(ApplicationArguments args) {
        try {
            String baseUrl = protocolHost + ":" + serverPort + "/api/v1/skill/protocol/cad_text_extractor";
            DynamicSkillRegistry registry = new DynamicSkillRegistry();
            registry.setToolCode("cad_text_extractor_indicator_verification");
            registry.setToolName("cad_text_extractor 指标校核");
            registry.setDescription("基于 CAD 图纸执行指标校核并输出可下载结果文件");
            registry.setProtocolType("HTTP");
            registry.setInvokeUrl(baseUrl + "/invoke");
            registry.setManifestUrl(baseUrl + "/manifest");
            registry.setHealthUrl(baseUrl + "/health");
            registry.setTriggerKeywords("指标校核,指标核验,指标检查,cad_text_extractor");
            registry.setInputMode("FILE_AND_PARAMS");
            registry.setOutputMode("MIXED");
            registry.setUploadRequired(1);
            registry.setAcceptedFileTypes(".dxf");
            registry.setMaxFiles(200);
            registry.setParametersSchema(toJson(Map.of(
                    "type", "object",
                    "properties", Map.of(
                            "checker", Map.of("type", "string"),
                            "reviewer", Map.of("type", "string")
                    ),
                    "required", java.util.List.of()
            )));
            Map<String, Object> draftArgs = new LinkedHashMap<>();
            draftArgs.put("checker", "");
            draftArgs.put("reviewer", "");
            draftArgs.put("query", "");
            registry.setDraftArgsTemplate(toJson(draftArgs));
            registry.setStatus("ONLINE");
            dynamicSkillRegistryService.upsert(registry, 0L);
            log.info("cad_text_extractor_auto_register: success, invokeUrl={}", registry.getInvokeUrl());
        } catch (Exception ex) {
            log.warn("cad_text_extractor_auto_register: skipped, reason={}", ex.getMessage());
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }
}
