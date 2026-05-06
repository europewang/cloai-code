package com.toolbox.backend.service;

import com.toolbox.backend.entity.ExecutionLog;
import com.toolbox.backend.entity.Tool;
import com.toolbox.backend.entity.User;
import com.toolbox.backend.repository.ExecutionLogRepository;
import com.toolbox.backend.repository.ToolRepository;
import com.toolbox.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.apache.commons.io.FileUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class ToolService {

    @Autowired
    private ToolRepository toolRepository;

    private static final Logger LOGGER = LoggerFactory.getLogger(ToolService.class);

    @Autowired
    private ExecutionLogRepository logRepository;

    @Autowired
    private UserRepository userRepository;

    @Value("${app.python-script-path}")
    private String pythonScriptPath;

    @Value("${app.temp-dir}")
    private String tempDirBase;

    public List<Tool> getAllTools() {
        return toolRepository.findAll();
    }

    public File executeCadExtractor(MultipartFile file, Integer userId, String checker, String reviewer) throws Exception {
        String uuid = UUID.randomUUID().toString();
        Path workDir = Paths.get(tempDirBase, uuid);
        Path inputDir = workDir.resolve("input");
        Path outputDir = workDir.resolve("output");

        // Prepare directories
        Files.createDirectories(inputDir);
        Files.createDirectories(outputDir);

        // Save file
        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null) originalFilename = "input.dxf";
        File inputFile = inputDir.resolve(originalFilename).toFile();
        file.transferTo(inputFile);

        // Execute Python
        // Command: python3 <script> <input> <output> <checker> <reviewer>
        ProcessBuilder pb = new ProcessBuilder(
                "python3",
                pythonScriptPath,
                inputDir.toAbsolutePath().toString(),
                outputDir.toAbsolutePath().toString(),
                checker != null ? checker : "张三",
                reviewer != null ? reviewer : "李四"
        );
        pb.redirectErrorStream(true);
        Process process = pb.start();

        // Capture logs (optional, print to console for debug)
        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append('\n');
            }
        }

        int exitCode = process.waitFor();
        
        // Log execution
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        Tool tool = toolRepository.findByToolKey("cad_extractor").orElseThrow(() -> new RuntimeException("Tool not found"));

        ExecutionLog log = new ExecutionLog();
        log.setUser(user);
        log.setTool(tool);
        log.setDataName(originalFilename);
        log.setStatus(exitCode == 0 ? "SUCCESS" : "FAILED");
        if (exitCode != 0) {
            String msg = output.length() > 0 ? output.toString() : ("Python script exited with code " + exitCode);
            log.setErrorMessage(msg);
        }
        log.setExecutionTime(LocalDateTime.now());
        LOGGER.info("pre-save log dataName={} status={} execTime={}", originalFilename, log.getStatus(), log.getExecutionTime());
        ExecutionLog savedLog = logRepository.save(log);
        LOGGER.info("saved log id={} execTime={}", savedLog.getId(), savedLog.getExecutionTime());

        if (exitCode != 0) {
            throw new RuntimeException("Python execution failed");
        }

        // Zip output
        Path zipPath = workDir.resolve("result.zip");
        zipDirectory(outputDir, zipPath);

        // Cleanup input (keep zip? We return File object, controller will stream it. Cleanup later?)
        // For simplicity, we return the file. Spring can delete temp files on exit but this is manual.
        // Ideally, we schedule a cleanup job. For now, we won't delete immediately so the controller can read it.
        // TODO: Implement cleanup job.

        return zipPath.toFile();
    }

    public File executeCadExtractor(MultipartFile[] files, List<String> paths, Integer userId, String checker, String reviewer) throws Exception {
        String uuid = UUID.randomUUID().toString();
        Path workDir = Paths.get(tempDirBase, uuid);
        Path inputDir = workDir.resolve("input");
        Path outputDir = workDir.resolve("output");
        Files.createDirectories(inputDir);
        Files.createDirectories(outputDir);

        for (int i = 0; i < files.length; i++) {
            MultipartFile f = files[i];
            String name = f.getOriginalFilename();
            if (name == null) name = "file_" + i;
            Path target = inputDir.resolve(name);
            if (paths != null && paths.size() == files.length) {
                String rel = paths.get(i);
                if (rel != null && !rel.trim().isEmpty()) {
                    Path p = inputDir.resolve(rel).normalize();
                    if (!p.startsWith(inputDir)) {
                        throw new RuntimeException("Invalid path");
                    }
                    Files.createDirectories(p.getParent());
                    target = p;
                }
            }
            f.transferTo(target.toFile());
        }

        ProcessBuilder pb = new ProcessBuilder(
                "python3",
                pythonScriptPath,
                inputDir.toAbsolutePath().toString(),
                outputDir.toAbsolutePath().toString(),
                checker != null ? checker : "张三",
                reviewer != null ? reviewer : "李四"
        );
        pb.redirectErrorStream(true);
        Process process = pb.start();
        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append('\n');
            }
        }
        int exitCode = process.waitFor();
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        Tool tool = toolRepository.findByToolKey("cad_extractor").orElseThrow(() -> new RuntimeException("Tool not found"));
        ExecutionLog log = new ExecutionLog();
        log.setUser(user);
        log.setTool(tool);
        log.setDataName("folder_upload");
        log.setStatus(exitCode == 0 ? "SUCCESS" : "FAILED");
        if (exitCode != 0) {
            String msg = output.length() > 0 ? output.toString() : ("Python script exited with code " + exitCode);
            log.setErrorMessage(msg);
        }
        log.setExecutionTime(LocalDateTime.now());
        LOGGER.info("pre-save log dataName={} status={} execTime={}", "folder_upload", log.getStatus(), log.getExecutionTime());
        ExecutionLog savedLog2 = logRepository.save(log);
        LOGGER.info("saved log id={} execTime={}", savedLog2.getId(), savedLog2.getExecutionTime());
        if (exitCode != 0) {
            throw new RuntimeException("Python execution failed");
        }
        Path zipPath = workDir.resolve("result.zip");
        zipDirectory(outputDir, zipPath);
        return zipPath.toFile();
    }

    private void zipDirectory(Path sourceDirPath, Path zipFilePath) throws IOException {
        try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(zipFilePath.toFile()))) {
            Files.walkFileTree(sourceDirPath, new SimpleFileVisitor<Path>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Path targetFile = sourceDirPath.relativize(file);
                    zos.putNextEntry(new ZipEntry(targetFile.toString()));
                    Files.copy(file, zos);
                    zos.closeEntry();
                    return FileVisitResult.CONTINUE;
                }
            });
        }
    }
}
