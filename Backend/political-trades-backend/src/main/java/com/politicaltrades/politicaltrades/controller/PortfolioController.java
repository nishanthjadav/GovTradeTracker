package com.politicaltrades.politicaltrades.controller;

import com.politicaltrades.politicaltrades.entity.ExecutedTrade;
import com.politicaltrades.politicaltrades.repository.ExecutedTradeRepository;
import com.politicaltrades.politicaltrades.service.AlpacaService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/api/portfolio")
public class PortfolioController {

    private final ExecutedTradeRepository executedTradeRepository;
    private final AlpacaService alpacaService;

    public PortfolioController(ExecutedTradeRepository executedTradeRepository, AlpacaService alpacaService) {
        this.executedTradeRepository = executedTradeRepository;
        this.alpacaService = alpacaService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> summary(@RequestParam String sessionId) {
        List<ExecutedTrade> trades = executedTradeRepository.findBySessionId(sessionId);

        List<Map<String, Object>> enriched = new ArrayList<>();

        BigDecimal totalInvested = BigDecimal.ZERO;
        BigDecimal totalCurrentValue = BigDecimal.ZERO;
        BigDecimal totalInvestedCounted = BigDecimal.ZERO;

        List<Map<String, Object>> tradePnls = new ArrayList<>();

        for (ExecutedTrade t : trades) {
            Map<String, Object> row = new HashMap<>();
            row.put("id", t.getId());
            row.put("politicianId", t.getPoliticianId());
            row.put("politicianName", t.getPoliticianName());
            row.put("ticker", t.getTicker());
            row.put("side", t.getSide());
            row.put("amountInvested", t.getAmountInvested());
            row.put("fillPrice", t.getFillPrice());
            row.put("status", t.getStatus());
            row.put("executedAt", t.getExecutedAt() != null ? t.getExecutedAt().format(DateTimeFormatter.ISO_DATE_TIME) : null);

            BigDecimal currentPrice = null;
            BigDecimal pnl = null;
            Double pnlPercent = null;

            try {
                currentPrice = alpacaService.fetchLatestPrice(t.getTicker());
            } catch (Exception ignored) {}

            if (currentPrice != null && t.getFillPrice() != null && t.getFillPrice().compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal shares = t.getAmountInvested().divide(t.getFillPrice(), 8, BigDecimal.ROUND_HALF_UP);
                pnl = currentPrice.subtract(t.getFillPrice()).multiply(shares);
                if (t.getFillPrice().compareTo(BigDecimal.ZERO) != 0) {
                    pnlPercent = currentPrice.subtract(t.getFillPrice()).divide(t.getFillPrice(), 8, BigDecimal.ROUND_HALF_UP).multiply(new BigDecimal(100)).doubleValue();
                }
                totalCurrentValue = totalCurrentValue.add(currentPrice.multiply(shares));
                totalInvestedCounted = totalInvestedCounted.add(t.getAmountInvested());
            }

            totalInvested = totalInvested.add(t.getAmountInvested() != null ? t.getAmountInvested() : BigDecimal.ZERO);

            row.put("currentPrice", currentPrice);
            row.put("pnl", pnl);
            row.put("pnlPercent", pnlPercent);

            enriched.add(row);
            tradePnls.add(row);
        }

        double overallReturnPercent = 0.0;
        if (totalInvestedCounted.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal diff = totalCurrentValue.subtract(totalInvestedCounted);
            overallReturnPercent = diff.divide(totalInvestedCounted, 8, BigDecimal.ROUND_HALF_UP).multiply(new BigDecimal(100)).doubleValue();
        }

        // best performing politician
        Map<String, BigDecimal> politicianPnl = new HashMap<>();
        Map<String, BigDecimal> politicianInvested = new HashMap<>();
        for (Map<String, Object> r : tradePnls) {
            String pid = (String) r.get("politicianId");
            BigDecimal invested = r.get("amountInvested") != null ? new BigDecimal(r.get("amountInvested").toString()) : BigDecimal.ZERO;
            BigDecimal pnl = r.get("pnl") != null ? new BigDecimal(r.get("pnl").toString()) : BigDecimal.ZERO;
            politicianPnl.put(pid, politicianPnl.getOrDefault(pid, BigDecimal.ZERO).add(pnl));
            politicianInvested.put(pid, politicianInvested.getOrDefault(pid, BigDecimal.ZERO).add(invested));
        }

        String bestPolitician = null;
        double bestPoliticianReturn = 0.0;
        for (String pid : politicianPnl.keySet()) {
            BigDecimal invested = politicianInvested.getOrDefault(pid, BigDecimal.ZERO);
            if (invested.compareTo(BigDecimal.ZERO) <= 0) continue;
            double pct = politicianPnl.get(pid).divide(invested, 8, BigDecimal.ROUND_HALF_UP).multiply(new BigDecimal(100)).doubleValue();
            if (bestPolitician == null || pct > bestPoliticianReturn) {
                bestPolitician = pid;
                bestPoliticianReturn = pct;
            }
        }

        // best single trade
        String bestTradeTicker = null;
        double bestTradeReturn = Double.NEGATIVE_INFINITY;
        for (Map<String, Object> r : tradePnls) {
            if (r.get("pnlPercent") == null) continue;
            double pct = ((Number) r.get("pnlPercent")).doubleValue();
            if (pct > bestTradeReturn) {
                bestTradeReturn = pct;
                bestTradeTicker = (String) r.get("ticker");
            }
        }

        Map<String, Object> summary = new HashMap<>();
        summary.put("totalInvested", totalInvested);
        summary.put("totalCurrentValue", totalCurrentValue);
        summary.put("overallReturnPercent", overallReturnPercent);
        summary.put("bestPolitician", bestPolitician);
        summary.put("bestPoliticianReturnPercent", bestPoliticianReturn);
        summary.put("bestTradeTicker", bestTradeTicker);
        summary.put("bestTradeReturnPercent", bestTradeReturn);

        Map<String, Object> resp = new HashMap<>();
        resp.put("summary", summary);
        resp.put("trades", enriched.stream().sorted((a,b)-> {
            String da = a.get("executedAt") == null ? "" : a.get("executedAt").toString();
            String db = b.get("executedAt") == null ? "" : b.get("executedAt").toString();
            return db.compareTo(da);
        }).collect(Collectors.toList()));

        return ResponseEntity.ok(resp);
    }

    @GetMapping("/executed-trades")
    public ResponseEntity<List<ExecutedTrade>> executedTrades(@RequestParam String sessionId) {
        List<ExecutedTrade> list = executedTradeRepository.findBySessionId(sessionId);
        list.sort(Comparator.comparing(ExecutedTrade::getExecutedAt, Comparator.nullsLast(Comparator.reverseOrder())));
        return ResponseEntity.ok(list);
    }
}
