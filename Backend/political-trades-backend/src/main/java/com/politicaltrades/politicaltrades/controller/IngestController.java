package com.politicaltrades.politicaltrades.controller;

import com.politicaltrades.politicaltrades.entity.Politician;
import com.politicaltrades.politicaltrades.entity.Trade;
import com.politicaltrades.politicaltrades.service.TradeIngestionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ingest")
public class IngestController {

    private static final Logger log = LoggerFactory.getLogger(IngestController.class);

    private final TradeIngestionService ingestionService;

    @Value("${app.ingest.secret}")
    private String ingestSecret;

    public IngestController(TradeIngestionService ingestionService) {
        this.ingestionService = ingestionService;
    }

    /**
     * Called by the GitHub Actions scraper workflow.
     * Each item in the array is a flat map with both politician and trade fields.
     * Auth: X-Ingest-Secret header must match the INGEST_SECRET env var.
     */
    @PostMapping("/trades")
    public ResponseEntity<Map<String, Integer>> ingestTrades(
            @RequestHeader(value = "X-Ingest-Secret", required = false) String secret,
            @RequestBody List<Map<String, Object>> payload) {

        if (ingestSecret == null || !ingestSecret.equals(secret)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        int saved = 0;
        int skipped = 0;
        int errors = 0;

        for (Map<String, Object> item : payload) {
            try {
                String politicianId   = str(item, "politicianId");
                String politicianName = str(item, "politicianName");
                String party          = str(item, "party");
                String chamber        = str(item, "chamber");
                String state          = str(item, "state");

                if (politicianId == null) { errors++; continue; }

                Politician politician = ingestionService.getOrCreatePolitician(
                        politicianId, politicianName, party, chamber, state);

                Trade trade = new Trade();
                trade.setCapitolTradesId(str(item, "capitolTradesId"));
                trade.setIssuerName(str(item, "issuerName"));
                trade.setTicker(str(item, "ticker"));
                trade.setPublishedDate(parseDate(item, "publishedDate"));
                trade.setTradeDate(parseDate(item, "tradeDate"));
                trade.setFiledAfterDays(parseInt(item, "filedAfterDays"));
                trade.setOwner(str(item, "owner"));
                trade.setTradeType(str(item, "tradeType"));
                trade.setSizeMin(parseLong(item, "sizeMin"));
                trade.setSizeMax(parseLong(item, "sizeMax"));
                trade.setPrice(parseDecimal(item, "price"));

                if (trade.getCapitolTradesId() == null || trade.getTradeType() == null) {
                    errors++;
                    continue;
                }

                TradeIngestionService.SaveResult result = ingestionService.saveAndCopy(trade, politician);
                if (result == TradeIngestionService.SaveResult.NEW) saved++;
                else skipped++;

            } catch (Exception e) {
                errors++;
                log.warn("Failed to ingest trade item: {}", e.getMessage());
            }
        }

        log.info("Ingest complete — saved: {}, skipped: {}, errors: {}", saved, skipped, errors);
        return ResponseEntity.ok(Map.of("saved", saved, "skipped", skipped, "errors", errors));
    }

    private String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v != null ? v.toString().strip() : null;
    }

    private LocalDate parseDate(Map<String, Object> m, String key) {
        String s = str(m, key);
        if (s == null || s.isEmpty()) return null;
        try { return LocalDate.parse(s); } catch (Exception e) { return null; }
    }

    private Integer parseInt(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) return null;
        try { return Integer.parseInt(v.toString()); } catch (Exception e) { return null; }
    }

    private Long parseLong(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) return null;
        try { return Long.parseLong(v.toString()); } catch (Exception e) { return null; }
    }

    private BigDecimal parseDecimal(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) return null;
        try { return new BigDecimal(v.toString()); } catch (Exception e) { return null; }
    }
}
