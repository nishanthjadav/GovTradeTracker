package com.politicaltrades.politicaltrades.repository;

import com.politicaltrades.politicaltrades.entity.Trade;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
 
import java.util.List;

@Repository
public interface TradeRepository extends JpaRepository<Trade, Long> {

    boolean existsByCapitolTradesId(String capitolTradesId);
    List<Trade> findByPoliticianId(String politicianId);
    Page<Trade> findAll(Pageable pageable);
}
