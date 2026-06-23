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

    @Column(name = "portfolio_percent", precision = 7, scale = 4)
    private BigDecimal portfolioPercent;

    @Column(name = "active")
    private Boolean active = true;

    @Column(name = "max_filed_days")
    private Integer maxFiledDays;

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

    public BigDecimal getPortfolioPercent() { return portfolioPercent; }
    public void setPortfolioPercent(BigDecimal portfolioPercent) { this.portfolioPercent = portfolioPercent; }

    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }

    public Integer getMaxFiledDays() { return maxFiledDays; }
    public void setMaxFiledDays(Integer maxFiledDays) { this.maxFiledDays = maxFiledDays; }

    public LocalDateTime getCreatedAt() { return createdAt; }
}
