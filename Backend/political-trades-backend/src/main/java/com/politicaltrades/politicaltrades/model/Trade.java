
package com.politicaltrades.politicaltrades.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "trades")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Trade {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String representativeName;
    private String party;

    @Enumerated(EnumType.STRING)
    private Chamber chamber;

    private String ticker;
    private String assetDescription;
    private String tradeType;   
    private String amount;      

    private LocalDate transactionDate;
    private LocalDate disclosureDate;

    @Builder.Default
    private boolean executed = false;

    @Column(unique = true, nullable = false)
    private String tradeHash;   // for deduplication

    @CreationTimestamp
    private LocalDateTime createdAt;

    public enum Chamber { HOUSE, SENATE }
}