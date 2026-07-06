package com.politicaltrades.politicaltrades.controller;

import com.politicaltrades.politicaltrades.entity.ExecutedTrade;
import com.politicaltrades.politicaltrades.entity.User;
import com.politicaltrades.politicaltrades.repository.ExecutedTradeRepository;
import com.politicaltrades.politicaltrades.repository.PoliticianRepository;
import com.politicaltrades.politicaltrades.service.AlpacaService;
import com.politicaltrades.politicaltrades.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/portfolio")
public class PortfolioController {

    private final ExecutedTradeRepository executedTradeRepository;
    private final AlpacaService alpacaService;
    private final UserService userService;
    private final PoliticianRepository politicianRepository;

    public PortfolioController(ExecutedTradeRepository executedTradeRepository,
                               AlpacaService alpacaService,
                               UserService userService,
                               PoliticianRepository politicianRepository) {
        this.executedTradeRepository = executedTradeRepository;
        this.alpacaService = alpacaService;
        this.userService = userService;
        this.politicianRepository = politicianRepository;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> summary(@AuthenticationPrincipal OidcUser oidc) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        List<ExecutedTrade> trades = executedTradeRepository.findByUserId(user.getId());

        List<Map<String, Object>> enriched = new ArrayList<>();

        // prefetch politician names to avoid n+1 and fix stale ids in politician_name
        Map<String, String> politicianNameCache = new HashMap<>();
        politicianRepository.findAll().forEach(p -> politicianNameCache.put(p.getId(), p.getName()));

        // batch prices in one alpaca call — per-trade would blow the 200 req/min limit
        Set<String> tickers = trades.stream()
            .map(ExecutedTrade::getTicker)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        Map<String, BigDecimal> priceByTicker;
        try {
            priceByTicker = alpacaService.fetchLatestPrices(user, tickers);
        } catch (Exception e) {
            priceByTicker = new HashMap<>();
        }

        BigDecimal totalInvested = BigDecimal.ZERO;
        BigDecimal totalCurrentValue = BigDecimal.ZERO;
        BigDecimal totalInvestedCounted = BigDecimal.ZERO;

        List<Map<String, Object>> tradePnls = new ArrayList<>();

        for (ExecutedTrade t : trades) {
            Map<String, Object> row = new HashMap<>();
            row.put("id", t.getId());
            row.put("politicianId", t.getPoliticianId());
            String resolvedName = politicianNameCache.getOrDefault(t.getPoliticianId(), t.getPoliticianName());
            row.put("politicianName", resolvedName);
            row.put("ticker", t.getTicker());
            row.put("side", t.getSide());
            row.put("amountInvested", t.getAmountInvested());
            row.put("fillPrice", t.getFillPrice());
            row.put("status", t.getStatus());
            row.put("executedAt", t.getExecutedAt() != null ? t.getExecutedAt().format(DateTimeFormatter.ISO_DATE_TIME) : null);

            BigDecimal currentPrice = priceByTicker.get(t.getTicker());
            BigDecimal pnl = null;
            Double pnlPercent = null;

            // only buys count as money invested, sells are exits
            boolean isBuy = "buy".equalsIgnoreCase(t.getSide());
            // only count filled rows, pending may never fill and would inflate totals
            boolean isFilled = t.getStatus() != null
                && ("filled".equalsIgnoreCase(t.getStatus())
                    || "partially_filled".equalsIgnoreCase(t.getStatus()));

            if (isBuy && isFilled
                    && currentPrice != null
                    && t.getFillPrice() != null && t.getFillPrice().compareTo(BigDecimal.ZERO) > 0
                    && t.getAmountInvested() != null) {
                BigDecimal shares = t.getAmountInvested().divide(t.getFillPrice(), 8, java.math.RoundingMode.HALF_UP);
                pnl = currentPrice.subtract(t.getFillPrice()).multiply(shares);
                pnlPercent = currentPrice.subtract(t.getFillPrice()).divide(t.getFillPrice(), 8, java.math.RoundingMode.HALF_UP).multiply(new BigDecimal(100)).doubleValue();
                totalCurrentValue = totalCurrentValue.add(currentPrice.multiply(shares));
                totalInvestedCounted = totalInvestedCounted.add(t.getAmountInvested());
            }

            if (isBuy && isFilled && t.getAmountInvested() != null) {
                totalInvested = totalInvested.add(t.getAmountInvested());
            }

            row.put("currentPrice", currentPrice);
            row.put("pnl", pnl);
            row.put("pnlPercent", pnlPercent);

            enriched.add(row);
            tradePnls.add(row);
        }

        double overallReturnPercent = 0.0;
        if (totalInvestedCounted.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal diff = totalCurrentValue.subtract(totalInvestedCounted);
            overallReturnPercent = diff.divide(totalInvestedCounted, 8, java.math.RoundingMode.HALF_UP).multiply(new BigDecimal(100)).doubleValue();
        }

        Map<String, BigDecimal> politicianPnl = new HashMap<>();
        Map<String, BigDecimal> politicianInvested = new HashMap<>();
        Map<String, String> politicianNames = new HashMap<>();
        for (Map<String, Object> r : tradePnls) {
            String pid = (String) r.get("politicianId");
            BigDecimal invested = r.get("amountInvested") != null ? new BigDecimal(r.get("amountInvested").toString()) : BigDecimal.ZERO;
            BigDecimal pnl = r.get("pnl") != null ? new BigDecimal(r.get("pnl").toString()) : BigDecimal.ZERO;
            politicianPnl.put(pid, politicianPnl.getOrDefault(pid, BigDecimal.ZERO).add(pnl));
            politicianInvested.put(pid, politicianInvested.getOrDefault(pid, BigDecimal.ZERO).add(invested));
            politicianNames.putIfAbsent(pid, (String) r.get("politicianName"));
        }

        String bestPolitician = null;
        double bestPoliticianReturn = Double.NEGATIVE_INFINITY;
        for (String pid : politicianPnl.keySet()) {
            BigDecimal invested = politicianInvested.getOrDefault(pid, BigDecimal.ZERO);
            if (invested.compareTo(BigDecimal.ZERO) <= 0) continue;
            double pct = politicianPnl.get(pid).divide(invested, 8, java.math.RoundingMode.HALF_UP).multiply(new BigDecimal(100)).doubleValue();
            if (bestPolitician == null || pct > bestPoliticianReturn) {
                bestPolitician = politicianNames.get(pid);
                bestPoliticianReturn = pct;
            }
        }
        // leave best return blank rather than showing -Infinity when no qualifying rows
        Double bestPoliticianReturnOut = bestPolitician == null ? null : bestPoliticianReturn;

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
        Double bestTradeReturnOut = bestTradeTicker == null ? null : bestTradeReturn;

        Map<String, Object> summary = new HashMap<>();
        summary.put("totalInvested", totalInvested);
        summary.put("totalCurrentValue", totalCurrentValue);
        summary.put("overallReturnPercent", overallReturnPercent);
        summary.put("bestPolitician", bestPolitician);
        summary.put("bestPoliticianReturnPercent", bestPoliticianReturnOut);
        summary.put("bestTradeTicker", bestTradeTicker);
        summary.put("bestTradeReturnPercent", bestTradeReturnOut);

        // pull once — Alpaca /account is one request and gives us both. Failures
        // return nulls; the chart falls back to a $0 baseline when cash is null.
        try {
            var snapshot = alpacaService.getAccountSnapshot(user);
            summary.put("cashBalance", snapshot.cash());
            summary.put("equity", snapshot.equity());
        } catch (Exception e) {
            summary.put("cashBalance", null);
            summary.put("equity", null);
        }

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
    public ResponseEntity<List<ExecutedTrade>> executedTrades(@AuthenticationPrincipal OidcUser oidc) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        List<ExecutedTrade> list = executedTradeRepository.findByUserId(user.getId());
        list.sort(Comparator.comparing(ExecutedTrade::getExecutedAt, Comparator.nullsLast(Comparator.reverseOrder())));
        return ResponseEntity.ok(list);
    }

    // intraday/historical equity samples, straight from alpaca. range: 1D, 1M, 1Y, ALL.
    @GetMapping("/history")
    public ResponseEntity<Map<String, Object>> history(
            @AuthenticationPrincipal OidcUser oidc,
            @RequestParam(defaultValue = "1D") String range) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        AlpacaService.PortfolioHistory h = alpacaService.getPortfolioHistory(user, range);
        Map<String, Object> body = new HashMap<>();
        body.put("range", range);
        body.put("timestamps", h.timestamps());
        body.put("equity", h.equity());
        body.put("timeframe", h.timeframe());
        body.put("baseValue", h.baseValue());
        body.put("windowStart", h.windowStart());
        body.put("windowEnd", h.windowEnd());
        return ResponseEntity.ok(body);
    }

    @DeleteMapping("/executed-trades")
    public ResponseEntity<Map<String, Object>> clearExecutedTrades(@AuthenticationPrincipal OidcUser oidc) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        List<ExecutedTrade> trades = executedTradeRepository.findByUserId(user.getId());
        int count = trades.size();
        if (!trades.isEmpty()) {
            executedTradeRepository.deleteAll(trades);
        }
        Map<String, Object> resp = new HashMap<>();
        resp.put("deleted", count);
        return ResponseEntity.ok(resp);
    }
}
