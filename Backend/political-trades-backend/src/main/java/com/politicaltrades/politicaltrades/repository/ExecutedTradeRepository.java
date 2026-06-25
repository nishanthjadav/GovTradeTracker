package com.politicaltrades.politicaltrades.repository;

import com.politicaltrades.politicaltrades.entity.ExecutedTrade;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ExecutedTradeRepository extends JpaRepository<ExecutedTrade, Long> {
    List<ExecutedTrade> findByUserId(Long userId);
    List<ExecutedTrade> findByUserIdAndTicker(Long userId, String ticker);
    boolean existsByUserIdAndCapitolTradesId(Long userId, String capitolTradesId);
}
