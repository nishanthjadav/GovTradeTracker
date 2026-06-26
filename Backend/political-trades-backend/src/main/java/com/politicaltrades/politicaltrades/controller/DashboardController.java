package com.politicaltrades.politicaltrades.controller;

import com.politicaltrades.politicaltrades.entity.Trade;
import com.politicaltrades.politicaltrades.repository.PoliticianRepository;
import com.politicaltrades.politicaltrades.repository.TradeRepository;
import org.springframework.web.bind.annotation.*;
import org.springframework.data.domain.*;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class DashboardController {

    private final TradeRepository tradeRepository;
    private final PoliticianRepository politicianRepository;

    public DashboardController(TradeRepository tradeRepository, PoliticianRepository politicianRepository) {
        this.tradeRepository = tradeRepository;
        this.politicianRepository = politicianRepository;
    }

    @GetMapping("/politicians")
    public List<Map<String, Object>> getPoliticians() {
        return politicianRepository.findAll().stream().map(p -> {
            List<Trade> trades = tradeRepository.findByPoliticianId(p.getId());
            long buys = trades.stream().filter(t -> "buy".equalsIgnoreCase(t.getTradeType())).count();
            long sells = trades.stream().filter(t -> "sell".equalsIgnoreCase(t.getTradeType())).count();

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.getId());
            m.put("name", p.getName());
            m.put("party", p.getParty());
            m.put("chamber", p.getChamber());
            m.put("state", p.getState());
            m.put("totalTrades", trades.size());
            m.put("buys", buys);
            m.put("sells", sells);
            return m;
        }).sorted((a, b) -> ((Number) b.get("totalTrades")).intValue() - ((Number) a.get("totalTrades")).intValue())
          .collect(Collectors.toList());
    }

    @GetMapping("/trades/recent")
    public List<Map<String, Object>> getRecentTrades(@RequestParam(defaultValue = "50") int limit) {
        Pageable pageable = PageRequest.of(0, limit, Sort.by("publishedDate").descending());
        return tradeRepository.findAll(pageable).getContent().stream()
            .map(this::toTradeMap)
            .collect(Collectors.toList());
    }

    // score is descriptive (filing lateness, size, cluster density) — not an accusation
    @GetMapping("/trades/anomalies")
    public List<Map<String, Object>> getAnomalousTrades(
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0.8") double minScore) {
        Pageable pageable = PageRequest.of(0, Math.min(limit, 500));
        BigDecimal min = BigDecimal.valueOf(minScore);
        return tradeRepository.findTopAnomalies(min, pageable).stream()
            .map(this::toTradeMap)
            .collect(Collectors.toList());
    }

    @GetMapping("/politicians/{id}/trades")
    public List<Map<String, Object>> getTradesByPolitician(@PathVariable String id) {
        return tradeRepository.findByPoliticianId(id).stream()
            .sorted(Comparator.comparing(Trade::getPublishedDate, Comparator.nullsLast(Comparator.reverseOrder())))
            .map(t -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", t.getId());
                m.put("issuerName", t.getIssuerName());
                m.put("ticker", t.getTicker());
                m.put("tradeType", t.getTradeType());
                m.put("tradeDate", t.getTradeDate());
                m.put("publishedDate", t.getPublishedDate());
                m.put("filedAfterDays", t.getFiledAfterDays());
                m.put("sizeMin", t.getSizeMin());
                m.put("sizeMax", t.getSizeMax());
                m.put("owner", t.getOwner());
                m.put("anomalyScore", t.getAnomalyScore());
                m.put("anomalyReason", t.getAnomalyReason());
                return m;
            }).collect(Collectors.toList());
    }

    private Map<String, Object> toTradeMap(Trade t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("capitolTradesId", t.getCapitolTradesId());
        m.put("politicianId", t.getPolitician().getId());
        m.put("politicianName", t.getPolitician().getName());
        m.put("party", t.getPolitician().getParty());
        m.put("issuerName", t.getIssuerName());
        m.put("ticker", t.getTicker());
        m.put("tradeType", t.getTradeType());
        m.put("tradeDate", t.getTradeDate());
        m.put("publishedDate", t.getPublishedDate());
        m.put("filedAfterDays", t.getFiledAfterDays());
        m.put("sizeMin", t.getSizeMin());
        m.put("sizeMax", t.getSizeMax());
        m.put("owner", t.getOwner());
        m.put("anomalyScore", t.getAnomalyScore());
        m.put("anomalyReason", t.getAnomalyReason());
        return m;
    }
}
