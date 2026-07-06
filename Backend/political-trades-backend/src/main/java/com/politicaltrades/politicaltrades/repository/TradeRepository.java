package com.politicaltrades.politicaltrades.repository;

import com.politicaltrades.politicaltrades.entity.Trade;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;

@Repository
public interface TradeRepository extends JpaRepository<Trade, Long> {

    boolean existsByCapitolTradesId(String capitolTradesId);
    List<Trade> findByPoliticianId(String politicianId);

    // Politician is fetched eagerly for the recent-trades feed so serializing to JSON
    // doesn't trigger one SELECT per row (N+1). Without this, /trades/recent?limit=500
    // fires 500+ round trips to Neon which is what makes the initial page load slow.
    @EntityGraph(attributePaths = {"politician"})
    Page<Trade> findAll(Pageable pageable);

    @EntityGraph(attributePaths = {"politician"})
    @Query("SELECT t FROM Trade t WHERE t.anomalyScore >= :minScore ORDER BY t.anomalyScore DESC")
    List<Trade> findTopAnomalies(@Param("minScore") BigDecimal minScore, Pageable pageable);

    // One aggregation query instead of 91 findByPoliticianId calls on /api/politicians.
    // Returns rows of [politicianId, totalTrades, buys, sells] as Object[] projections.
    @Query("SELECT t.politician.id, COUNT(t), " +
           "SUM(CASE WHEN LOWER(t.tradeType) = 'buy' THEN 1 ELSE 0 END), " +
           "SUM(CASE WHEN LOWER(t.tradeType) = 'sell' THEN 1 ELSE 0 END) " +
           "FROM Trade t GROUP BY t.politician.id")
    List<Object[]> aggregateCountsByPolitician();
}
