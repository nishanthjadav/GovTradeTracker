package com.politicaltrades.politicaltrades.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.politicaltrades.politicaltrades.model.Trade;

@Repository
public interface TradeRepository extends JpaRepository<Trade, Long> {
    boolean existsByTradeHash(String tradeHash);
    List<Trade> findAllByOrderByDisclosureDateDesc();
    List<Trade> findByRepresentativeNameContainingIgnoreCaseOrderByDisclosureDateDesc(String name);
    List<Trade> findByExecutedFalseAndTickerIsNotNullOrderByDisclosureDateDesc();
}