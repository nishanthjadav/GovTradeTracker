package com.politicaltrades.politicaltrades.controller;

import com.politicaltrades.politicaltrades.scheduler.ScrapeScheduler;
import com.politicaltrades.politicaltrades.service.CapitolTradesScraper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/scrape")
public class ScrapeController {

    private final CapitolTradesScraper scraper;
    private final ScrapeScheduler scheduler;

    public ScrapeController(CapitolTradesScraper scraper, ScrapeScheduler scheduler) {
        this.scraper = scraper;
        this.scheduler = scheduler;
    }


    @PostMapping("/test")
    public ResponseEntity<String> testScrape() {
        new Thread(() -> scraper.scrapePages(1, 3)).start();
        return ResponseEntity.ok("Test scrape started (pages 1-3). Check logs.");
    }

 
    @PostMapping("/range")
    public ResponseEntity<String> scrapeRange(@RequestParam int start, @RequestParam int end) {
        new Thread(() -> scraper.scrapePages(start, end)).start();
        return ResponseEntity.ok(String.format("Scrape started for pages %d-%d. Check logs.", start, end));
    }


    @PostMapping("/backfill")
    public ResponseEntity<String> fullBackfill() {
        new Thread(scheduler::fullBackfill).start();
        return ResponseEntity.ok("Full backfill started in background (~2 hrs). Check logs for progress.");
    }
}
