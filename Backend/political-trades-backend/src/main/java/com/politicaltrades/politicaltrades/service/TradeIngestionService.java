package com.politicaltrades.politicaltrades.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.DigestUtils;
import org.springframework.web.client.RestTemplate;

import com.politicaltrades.politicaltrades.dto.HouseTradeDTO;
import com.politicaltrades.politicaltrades.dto.SenateTradeDTO;
import com.politicaltrades.politicaltrades.model.Trade;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.politicaltrades.politicaltrades.repository.TradeRepository;

@Service
@Slf4j
@RequiredArgsConstructor
public class TradeIngestionService {

    private static final String HOUSE_URL  = "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json";
    private static final String SENATE_URL = "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json";

    private static final List<DateTimeFormatter> FORMATTERS = List.of(
        DateTimeFormatter.ofPattern("yyyy-MM-dd"),
        DateTimeFormatter.ofPattern("MM/dd/yyyy"),
        DateTimeFormatter.ofPattern("M/d/yyyy")
    );

    private final TradeRepository tradeRepository;
    private final RestTemplate restTemplate;

    @Transactional
    public int ingestHouseTrades() {
        log.info("Fetching house trades...");
        try {
            List<HouseTradeDTO> dtos = restTemplate.exchange(
                HOUSE_URL, HttpMethod.GET, null,
                new ParameterizedTypeReference<List<HouseTradeDTO>>() {}
            ).getBody();

            if (dtos == null) return 0;
            int count = 0;

            for (HouseTradeDTO dto : dtos) {
                try {
                    String hash = hash(dto.getRepresentative(), dto.getTicker(), dto.getTransactionDate(), dto.getType());
                    if (tradeRepository.existsByTradeHash(hash)) continue;

                    tradeRepository.save(Trade.builder()
                        .representativeName(dto.getRepresentative())
                        .party(dto.getParty())
                        .chamber(Trade.Chamber.HOUSE)
                        .ticker(cleanTicker(dto.getTicker()))
                        .assetDescription(dto.getAssetDescription())
                        .tradeType(dto.getType())
                        .amount(dto.getAmount())
                        .transactionDate(parseDate(dto.getTransactionDate()))
                        .disclosureDate(parseDate(dto.getDisclosureDate()))
                        .tradeHash(hash)
                        .build());
                    count++;
                } catch (Exception e) {
                    log.warn("Skipping house trade: {}", e.getMessage());
                }
            }
            log.info("Ingested {} new house trades", count);
            return count;
        } catch (Exception e) {
            log.error("Failed to fetch house trades", e);
            return 0;
        }
    }

    @Transactional
    public int ingestSenateTrades() {
        log.info("Fetching senate trades...");
        try {
            List<SenateTradeDTO> dtos = restTemplate.exchange(
                SENATE_URL, HttpMethod.GET, null,
                new ParameterizedTypeReference<List<SenateTradeDTO>>() {}
            ).getBody();

            if (dtos == null) return 0;
            int count = 0;

            for (SenateTradeDTO dto : dtos) {
                try {
                    String hash = hash(dto.getSenator(), dto.getTicker(), dto.getTransactionDate(), dto.getType());
                    if (tradeRepository.existsByTradeHash(hash)) continue;

                    tradeRepository.save(Trade.builder()
                        .representativeName(dto.getSenator())
                        .chamber(Trade.Chamber.SENATE)
                        .ticker(cleanTicker(dto.getTicker()))
                        .assetDescription(dto.getAssetDescription())
                        .tradeType(dto.getType())
                        .amount(dto.getAmount())
                        .transactionDate(parseDate(dto.getTransactionDate()))
                        .disclosureDate(parseDate(dto.getDisclosureDate()))
                        .tradeHash(hash)
                        .build());
                    count++;
                } catch (Exception e) {
                    log.warn("Skipping senate trade: {}", e.getMessage());
                }
            }
            log.info("Ingested {} new senate trades", count);
            return count;
        } catch (Exception e) {
            log.error("Failed to fetch senate trades", e);
            return 0;
        }
    }

    private String hash(String name, String ticker, String date, String type) {
        String raw = String.join("|",
            name   == null ? "" : name.toLowerCase().trim(),
            ticker == null ? "" : ticker.toLowerCase().trim(),
            date   == null ? "" : date.trim(),
            type   == null ? "" : type.toLowerCase().trim()
        );
        return DigestUtils.md5DigestAsHex(raw.getBytes());
    }

    private LocalDate parseDate(String s) {
        if (s == null || s.isBlank()) return null;
        for (DateTimeFormatter f : FORMATTERS) {
            try { return LocalDate.parse(s.trim(), f); }
            catch (DateTimeParseException ignored) {}
        }
        log.warn("Unparseable date: {}", s);
        return null;
    }

    private String cleanTicker(String ticker) {
        if (ticker == null) return null;
        String t = ticker.trim().toUpperCase();
        return (t.equals("--") || t.length() > 5) ? null : t;
    }
}
