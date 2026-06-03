package com.politicaltrades.politicaltrades.scheduler;

import com.politicaltrades.politicaltrades.service.CapitolTradesScraper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ScrapeScheduler {

    private static final Logger log = LoggerFactory.getLogger(ScrapeScheduler.class);

    private final CapitolTradesScraper scraper;

    public ScrapeScheduler(CapitolTradesScraper scraper) {
        this.scraper = scraper;
    }

    /**
     * Runs daily at 8 AM ET — scrapes only the first 2 pages (most recent trades).
     * Deduplication in the scraper ensures no double-inserts.
     */
    @Scheduled(cron = "0 0 8 * * *", zone = "America/New_York")
    public void dailyScrape() {
        log.info("Starting daily scrape (latest trades)...");
        scraper.scrapePages(1, 2);
    }

    /**
     * Full historical backfill — call this ONCE manually via the REST endpoint below.
     * Capitol Trades has ~2899 pages. This will take a while (~2 hrs with 1.5s delay).
     * Run it overnight.
     */
    public void fullBackfill() {
        log.info("Starting full historical backfill (pages 1–2899)...");
        scraper.scrapePages(1, 2899);
        log.info("Full backfill complete.");
    }
}
