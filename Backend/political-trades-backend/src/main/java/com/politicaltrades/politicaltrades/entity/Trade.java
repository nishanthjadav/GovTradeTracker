package com.politicaltrades.politicaltrades.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "trades")
public class Trade {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "capitol_trades_id", unique = true, nullable = false)
    private String capitolTradesId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "politician_id", nullable = false)
    private Politician politician;

    @Column(name = "issuer_name")
    private String issuerName;

    @Column(name = "ticker")
    private String ticker;

    @Column(name = "published_date")
    private LocalDate publishedDate;

    @Column(name = "trade_date")
    private LocalDate tradeDate;

    @Column(name = "filed_after_days")
    private Integer filedAfterDays;

    @Column(name = "owner")
    private String owner;

    @Column(name = "trade_type", nullable = false)
    private String tradeType;

    @Column(name = "size_min")
    private Long sizeMin;

    @Column(name = "size_max")
    private Long sizeMax;

    @Column(name = "price", precision = 10, scale = 2)
    private BigDecimal price;

    @Column(name = "scraped_at")
    private LocalDateTime scrapedAt;

    // populated weekly by the ml/anomaly python job, null until first scoring run
    @Column(name = "anomaly_score", precision = 5, scale = 4)
    private BigDecimal anomalyScore;

    @Column(name = "anomaly_reason", length = 120)
    private String anomalyReason;

    @PrePersist
    protected void onCreate() {
        this.scrapedAt = LocalDateTime.now();
    }

    public Trade() {}

    public Long getId() { return id; }

    public String getCapitolTradesId() { return capitolTradesId; }
    public void setCapitolTradesId(String capitolTradesId) { this.capitolTradesId = capitolTradesId; }

    public Politician getPolitician() { return politician; }
    public void setPolitician(Politician politician) { this.politician = politician; }

    public String getIssuerName() { return issuerName; }
    public void setIssuerName(String issuerName) { this.issuerName = issuerName; }

    public String getTicker() { return ticker; }
    public void setTicker(String ticker) { this.ticker = ticker; }

    public LocalDate getPublishedDate() { return publishedDate; }
    public void setPublishedDate(LocalDate publishedDate) { this.publishedDate = publishedDate; }

    public LocalDate getTradeDate() { return tradeDate; }
    public void setTradeDate(LocalDate tradeDate) { this.tradeDate = tradeDate; }

    public Integer getFiledAfterDays() { return filedAfterDays; }
    public void setFiledAfterDays(Integer filedAfterDays) { this.filedAfterDays = filedAfterDays; }

    public String getOwner() { return owner; }
    public void setOwner(String owner) { this.owner = owner; }

    public String getTradeType() { return tradeType; }
    public void setTradeType(String tradeType) { this.tradeType = tradeType; }

    public Long getSizeMin() { return sizeMin; }
    public void setSizeMin(Long sizeMin) { this.sizeMin = sizeMin; }

    public Long getSizeMax() { return sizeMax; }
    public void setSizeMax(Long sizeMax) { this.sizeMax = sizeMax; }

    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }

    public LocalDateTime getScrapedAt() { return scrapedAt; }

    public BigDecimal getAnomalyScore() { return anomalyScore; }
    public void setAnomalyScore(BigDecimal anomalyScore) { this.anomalyScore = anomalyScore; }

    public String getAnomalyReason() { return anomalyReason; }
    public void setAnomalyReason(String anomalyReason) { this.anomalyReason = anomalyReason; }
}
