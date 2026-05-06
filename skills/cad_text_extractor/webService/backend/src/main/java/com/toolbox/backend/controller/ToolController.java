package com.toolbox.backend.controller;

import com.toolbox.backend.entity.Tool;
import com.toolbox.backend.service.ToolService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.util.List;

@RestController
@RequestMapping("/api/tools")
@CrossOrigin(origins = "*")
public class ToolController {

    @Autowired
    private ToolService toolService;

    @GetMapping
    public List<Tool> getAllTools() {
        return toolService.getAllTools();
    }

    @PostMapping("/cad-extractor/run")
    public ResponseEntity<?> runCadExtractor(
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "files", required = false) MultipartFile[] files,
            @RequestParam(value = "paths", required = false) List<String> paths,
            @RequestParam("userId") Integer userId,
            @RequestParam(value = "checker", required = false) String checker,
            @RequestParam(value = "reviewer", required = false) String reviewer
    ) {
        try {
            File zipFile;
            if (files != null && files.length > 0) {
                zipFile = toolService.executeCadExtractor(files, paths, userId, checker, reviewer);
            } else if (file != null) {
                zipFile = toolService.executeCadExtractor(file, userId, checker, reviewer);
            } else {
                throw new RuntimeException("No file provided");
            }
            FileSystemResource resource = new FileSystemResource(zipFile);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=result.zip")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(zipFile.length())
                    .body(resource);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().body("Error: " + e.getMessage());
        }
    }
}
