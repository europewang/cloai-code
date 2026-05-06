package com.toolbox.backend.controller;

import com.toolbox.backend.entity.User;
import com.toolbox.backend.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*")
public class UserController {

    @Autowired
    private UserService userService;

    /**
     * 检查当前请求用户是否为管理员
     * @param userId 当前用户ID
     * @return true 如果是管理员
     */
    private boolean isAdmin(Integer userId) {
        if (userId == null) return false;
        User user = userService.getUserById(userId);
        return user != null && "ADMIN".equals(user.getRole());
    }

    /**
     * 获取所有用户列表 (仅管理员)
     */
    @GetMapping
    public ResponseEntity<?> getAllUsers(@RequestHeader(value = "X-Current-User-Id", required = false) Integer currentUserId) {
        if (!isAdmin(currentUserId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Access denied");
        }
        return ResponseEntity.ok(userService.getAllUsers());
    }

    /**
     * 创建新用户 (仅管理员)
     */
    @PostMapping
    public ResponseEntity<?> createUser(
            @RequestHeader(value = "X-Current-User-Id", required = false) Integer currentUserId,
            @RequestBody User user) {
        if (!isAdmin(currentUserId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Access denied");
        }
        try {
            return ResponseEntity.ok(userService.createUser(user));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * 删除用户 (仅管理员)
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteUser(
            @RequestHeader(value = "X-Current-User-Id", required = false) Integer currentUserId,
            @PathVariable Integer id) {
        if (!isAdmin(currentUserId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Access denied");
        }
        userService.deleteUser(id);
        return ResponseEntity.ok().build();
    }

    /**
     * 修改用户密码 (仅管理员)
     */
    @PutMapping("/{id}/password")
    public ResponseEntity<?> updateUserPassword(
            @RequestHeader(value = "X-Current-User-Id", required = false) Integer currentUserId,
            @PathVariable Integer id,
            @RequestBody Map<String, String> payload) {
        if (!isAdmin(currentUserId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Access denied");
        }
        String newPassword = payload.get("password");
        userService.updateUserPassword(id, newPassword);
        return ResponseEntity.ok().build();
    }
}
