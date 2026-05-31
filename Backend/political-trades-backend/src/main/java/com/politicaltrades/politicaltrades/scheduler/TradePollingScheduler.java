package com.politicaltrades.politicaltrades.scheduler;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.politicaltrades.politicaltrades.service.TradeIngestionService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
@RequiredArgsConstructor
public class TradePollingScheduler {

    private final TradeIngestionService tradeIngestionService;

    @Scheduled(initialDelay = 0, fixedDelay = 3_600_000) // runs on startup, then hourly
    public void poll() {
        log.info("Polling for new trades...");
        tradeIngestionService.ingestHouseTrades();
        tradeIngestionService.ingestSenateTrades();
    }
}
