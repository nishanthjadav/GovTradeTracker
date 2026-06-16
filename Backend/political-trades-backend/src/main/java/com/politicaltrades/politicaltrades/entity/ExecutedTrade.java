package com.politicaltrades.politicaltrades.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "executed_trades")
public class ExecutedTrade {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "politician_id")
    private String politicianId;

    @Column(name = "politician_name")
    private String politicianName;

    @Column(name = "ticker")
    private String ticker;

    @Column(name = "side")
    private String side;

    @Column(name = "amount_invested", precision = 14, scale = 2)
    private BigDecimal amountInvested;

    @Column(name = "fill_price", precision = 14, scale = 4)
    private BigDecimal fillPrice;

    @Column(name = "executed_at")
    private LocalDateTime executedAt;

    @Column(name = "alpaca_order_id")
    private String alpacaOrderId;

    @Column(name = "status")
    private String status; // pending, filled, failed

    public ExecutedTrade() {}

    // Getters and setters
    public Long getId() { return id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getPoliticianId() { return politicianId; }
    public void setPoliticianId(String politicianId) { this.politicianId = politicianId; }

    public String getPoliticianName() { return politicianName; }
    public void setPoliticianName(String politicianName) { this.politicianName = politicianName; }

    public String getTicker() { return ticker; }
    public void setTicker(String ticker) { this.ticker = ticker; }

    public String getSide() { return side; }
    public void setSide(String side) { this.side = side; }

    public BigDecimal getAmountInvested() { return amountInvested; }
    public void setAmountInvested(BigDecimal amountInvested) { this.amountInvested = amountInvested; }

    public BigDecimal getFillPrice() { return fillPrice; }
    public void setFillPrice(BigDecimal fillPrice) { this.fillPrice = fillPrice; }

    public LocalDateTime getExecutedAt() { return executedAt; }
    public void setExecutedAt(LocalDateTime executedAt) { this.executedAt = executedAt; }

    public String getAlpacaOrderId() { return alpacaOrderId; }
    public void setAlpacaOrderId(String alpacaOrderId) { this.alpacaOrderId = alpacaOrderId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
