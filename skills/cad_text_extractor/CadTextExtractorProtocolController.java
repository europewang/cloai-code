package com.ai4kb.backend.skill.impl.cad_text_extractor;

import com.ai4kb.backend.skill.executor.impl.CadIndicatorVerificationSkillExecutor;
import com.ai4kb.backend.skill.model.SkillFileRecord;
import com.ai4kb.backend.skill.model.ToolExecutionRequest;
import com.ai4kb.backend.skill.model.ToolExecutionResult;
import com.ai4kb.backend.skill.model.ToolSpec;
import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/skill/protocol/cad_text_extractor")
@RequiredArgsConstructor
/**
 * CAD 文本提取技能协议控制器。
 * 对外暴露标准化 manifest/health/invoke 接口，供动态技能 HTTP 注册后调用。
 */
public class CadTextExtractorProtocolController {

    private final CadIndicatorVerificationSkillExecutor cadIndicatorVerificationSkillExecutor;

    /**
     * 获取协议元数据。
     */
    @GetMapping("/manifest")
    public Map<String, Object> manifest() {
        ToolSpec spec = cadIndicatorVerificationSkillExecutor.getToolSpec();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("tool_code", "cad_text_extractor_indicator_verification");
        payload.put("tool_name", "cad_text_extractor 指标校核");
        payload.put("description", spec.getDescription());
        payload.put("trigger_keywords", spec.getTriggerKeywords());
        payload.put("input_mode", spec.getInputMode());
        payload.put("output_mode", spec.getOutputMode());
        payload.put("upload_required", spec.isUploadRequired());
        payload.put("accepted_file_types", spec.getAcceptedFileTypes());
        payload.put("max_files", spec.getMaxFiles());
        payload.put("parameters_schema", spec.getParametersSchema());
        return payload;
    }

    /**
     * 健康检查。
     */
    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "UP", "timestamp", LocalDateTime.now().toString());
    }

    /**
     * 执行协议调用。
     */
    @PostMapping("/invoke")
    public Map<String, Object> invoke(@RequestBody InvokeRequest request) throws Exception {
        ToolExecutionRequest executeRequest = ToolExecutionRequest.builder()
                .conversationId(request.getConversationId())
                .toolCallId(request.getToolCallId())
                .userId(request.getUserId())
                .args(request.getArgs() == null ? new LinkedHashMap<>() : request.getArgs())
                .inputFiles(toSkillFileRecords(request.getInputFiles(), request.getToolCallId()))
                .build();
        ToolExecutionResult result = cadIndicatorVerificationSkillExecutor.execute(executeRequest);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("success", result.isSuccess());
        payload.put("summary", result.getSummary());
        payload.put("error_message", result.getErrorMessage());
        payload.put("structured_data", result.getStructuredData());
        payload.put("generated_files", convertFiles(result.getGeneratedFiles()));
        return payload;
    }

    private List<SkillFileRecord> toSkillFileRecords(List<InputFileRequest> files, String toolCallId) {
        if (files == null) {
            return List.of();
        }
        return files.stream().map(file -> SkillFileRecord.builder()
                .fileId(file.getFileId())
                .toolCallId(toolCallId)
                .fileName(file.getFileName())
                .contentType(file.getContentType())
                .size(file.getSize() == null ? 0L : file.getSize())
                .absolutePath(file.getAbsolutePath())
                .role("INPUT")
                .createdAt(LocalDateTime.now())
                .build()).toList();
    }

    private List<Map<String, Object>> convertFiles(List<ToolExecutionResult.GeneratedFile> files) {
        if (files == null) {
            return List.of();
        }
        return files.stream().map(file -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("absolute_path", file.getAbsolutePath());
            item.put("file_name", file.getFileName());
            item.put("size", file.getSize());
            return item;
        }).toList();
    }

    @Data
    /**
     * 协议 invoke 请求体。
     */
    public static class InvokeRequest {
        @JsonAlias("conversation_id")
        private String conversationId;
        @JsonAlias("tool_call_id")
        private String toolCallId;
        @JsonAlias("user_id")
        private Long userId;
        private Map<String, Object> args;
        @JsonAlias("input_files")
        private List<InputFileRequest> inputFiles;
    }

    @Data
    /**
     * 协议输入文件请求项。
     */
    public static class InputFileRequest {
        @JsonAlias("file_id")
        private String fileId;
        @JsonAlias("file_name")
        private String fileName;
        @JsonAlias("absolute_path")
        private String absolutePath;
        @JsonAlias("content_type")
        private String contentType;
        private Long size;
    }
}
