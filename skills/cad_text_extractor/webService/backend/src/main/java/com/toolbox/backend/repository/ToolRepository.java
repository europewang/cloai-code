package com.toolbox.backend.repository;

import com.toolbox.backend.entity.Tool;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface ToolRepository extends JpaRepository<Tool, Integer> {
    Optional<Tool> findByToolKey(String toolKey);
}
