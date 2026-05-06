package com.toolbox.backend.controller;

import com.toolbox.backend.entity.ExecutionLog;
import com.toolbox.backend.entity.User;
import com.toolbox.backend.repository.ExecutionLogRepository;
import com.toolbox.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/logs")
@CrossOrigin(origins = "*")
public class LogController {

    @Autowired
    private ExecutionLogRepository logRepository;

    @Autowired
    private UserRepository userRepository;

    /**
     * 获取执行日志
     * 管理员: 可查看所有日志，可按 username 搜索
     * 普通用户: 只能查看自己的日志
     */
    @GetMapping
    public ResponseEntity<?> getLogs(
            @RequestHeader(value = "X-Current-User-Id", required = false) Integer currentUserId,
            @RequestParam(required = false) String username) {
        
        if (currentUserId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User ID header missing");
        }

        User currentUser = userRepository.findById(currentUserId).orElse(null);
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not found");
        }

        if ("ADMIN".equals(currentUser.getRole())) {
            if (username != null && !username.isEmpty()) {
                return ResponseEntity.ok(logRepository.findByUserUsernameContainingIgnoreCaseOrderByExecutionTimeDesc(username));
            } else {
                return ResponseEntity.ok(logRepository.findAllByOrderByExecutionTimeDesc());
            }
        } else {
            // Regular user: can only see their own logs
            return ResponseEntity.ok(logRepository.findByUserIdOrderByExecutionTimeDesc(currentUserId));
        }
    }
}
