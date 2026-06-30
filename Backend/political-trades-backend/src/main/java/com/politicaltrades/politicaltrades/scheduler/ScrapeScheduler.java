package com.politicaltrades.politicaltrades.scheduler;

import com.politicaltrades.politicaltrades.service.CapitolTradesScraper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

// Auto-scheduling disabled — the local Windows Task Scheduler job
// (run_scrape.bat → ml/scraper/scrape_and_push.py) is now the source of truth.
// The bean is still registered because ScrapeController injects it for the
// manual /api/scrape/backfill endpoint. To re-enable daily auto-scrapes,
// re-import jakarta.annotation.PostConstruct and add @PostConstruct back to
// scheduleNextRun() below.
@Component
public class ScrapeScheduler {

    private static final Logger log = LoggerFactory.getLogger(ScrapeScheduler.class);
    private static final int START_HOUR = 4;
    private static final int END_HOUR = 6;

    private final CapitolTradesScraper scraper;
    private final TaskScheduler taskScheduler;
    private final SecureRandom random = new SecureRandom();

    public ScrapeScheduler(CapitolTradesScraper scraper, TaskScheduler taskScheduler) {
        this.scraper = scraper;
        this.taskScheduler = taskScheduler;
    }

    public void scheduleNextRun() {
        Instant next = computeNextRunBetween(START_HOUR, END_HOUR);
        ZonedDateTime nextLocal = next.atZone(ZoneId.systemDefault());
        log.info("Next daily scrape scheduled at {} (local)",
            nextLocal.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z")));
        taskScheduler.schedule(this::runAndReschedule, next);
    }

    void runAndReschedule() {
        log.info("Starting daily scrape...");
        try {
            scraper.scrapePagesUntilDuplicate(1);
        } catch (Exception e) {
            log.error("Daily scrape failed: {}", e.getMessage(), e);
        } finally {
            scheduleNextRun();
        }
    }

    Instant computeNextRunBetween(int startHour, int endHour) {
        ZonedDateTime now = ZonedDateTime.now(ZoneId.systemDefault());
        int totalMinutes = (endHour - startHour) * 60;
        int offset = random.nextInt(totalMinutes);
        ZonedDateTime candidate = now.toLocalDate().atStartOfDay(now.getZone())
            .plusHours(startHour).plusMinutes(offset);
        if (!candidate.isAfter(now)) {
            candidate = candidate.plusDays(1);
            offset = random.nextInt(totalMinutes);
            candidate = candidate.toLocalDate().atStartOfDay(now.getZone())
                .plusHours(startHour).plusMinutes(offset);
        }
        return candidate.toInstant();
    }

    public void fullBackfill() {
        log.info("Starting full historical backfill (runs until no trades found)...");
        scraper.scrapePages(1, 500);
        log.info("Full backfill complete.");
    }
}
