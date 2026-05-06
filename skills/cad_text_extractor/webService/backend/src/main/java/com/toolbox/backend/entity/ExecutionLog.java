package com.toolbox.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "execution_logs")
public class ExecutionLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne
    @JoinColumn(name = "tool_id", nullable = false)
    private Tool tool;

    @Column(name = "data_name", nullable = false)
    private String dataName;

    @Column(name = "execution_time")
    private LocalDateTime executionTime;

    private String status;

    @Column(name = "error_message")
    private String errorMessage;
    
    // Explicit setter for executionTime if needed, though usually handled by DB default
    // But JPA might insert null if not careful. @DynamicInsert helps, or setting in @PrePersist
    @PrePersist
    protected void onCreate() {
        if (executionTime == null) {
            executionTime = LocalDateTime.now();
        }
    }
}
