package com.politicaltrades.politicaltrades.repository;

import com.politicaltrades.politicaltrades.entity.Trade;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TradeRepository extends JpaRepository<Trade, Long> {

    boolean existsByCapitolTradesId(String capitolTradesId);
}
