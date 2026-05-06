package com.toolbox.backend.repository;

import com.toolbox.backend.entity.ExecutionLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ExecutionLogRepository extends JpaRepository<ExecutionLog, Integer> {
    List<ExecutionLog> findByUserIdOrderByExecutionTimeDesc(Integer userId);
    List<ExecutionLog> findAllByOrderByExecutionTimeDesc();
    List<ExecutionLog> findByUserUsernameContainingIgnoreCaseOrderByExecutionTimeDesc(String username);
}
