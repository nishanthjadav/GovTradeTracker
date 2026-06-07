package com.politicaltrades.politicaltrades.repository;

import com.politicaltrades.politicaltrades.entity.CopyConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CopyConfigRepository extends JpaRepository<CopyConfig, Long> {
    List<CopyConfig> findBySessionId(String sessionId);
    CopyConfig findBySessionIdAndPoliticianId(String sessionId, String politicianId);
    List<CopyConfig> findByPoliticianIdAndActiveTrue(String politicianId);
}
