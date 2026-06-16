package com.politicaltrades.politicaltrades.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "copy_configs")
public class CopyConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "politician_id", nullable = false)
    private String politicianId;

    @Column(name = "amount_per_trade", precision = 14, scale = 2)
    private BigDecimal amountPerTrade;

    @Column(name = "active")
    private Boolean active = true;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.active == null) this.active = true;
    }

    public CopyConfig() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getPoliticianId() { return politicianId; }
    public void setPoliticianId(String politicianId) { this.politicianId = politicianId; }

    public BigDecimal getAmountPerTrade() { return amountPerTrade; }
    public void setAmountPerTrade(BigDecimal amountPerTrade) { this.amountPerTrade = amountPerTrade; }

    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }

    public LocalDateTime getCreatedAt() { return createdAt; }
}
