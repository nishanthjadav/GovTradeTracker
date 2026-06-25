package com.politicaltrades.politicaltrades.service;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.politicaltrades.politicaltrades.entity.Politician;
import com.politicaltrades.politicaltrades.entity.Trade;
import com.politicaltrades.politicaltrades.entity.User;
import com.politicaltrades.politicaltrades.repository.PoliticianRepository;
import com.politicaltrades.politicaltrades.repository.TradeRepository;
import com.politicaltrades.politicaltrades.repository.CopyConfigRepository;
import com.politicaltrades.politicaltrades.repository.ExecutedTradeRepository;
import com.politicaltrades.politicaltrades.repository.UserRepository;
import com.politicaltrades.politicaltrades.entity.CopyConfig;
import com.politicaltrades.politicaltrades.entity.ExecutedTrade;
import java.time.LocalDateTime;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class CapitolTradesScraper {

    private static final Logger log = LoggerFactory.getLogger(CapitolTradesScraper.class);
    private static final String BASE_URL = "https://www.capitoltrades.com/trades?page=";
    private static final int REQUEST_DELAY_MS = 2000;

    private static final Pattern SIZE_PATTERN = Pattern.compile("([\\d.]+)(K|M)?[–-]([\\d.]+)(K|M)?|([\\d.]+)(K|M)?\\+");
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private final PoliticianRepository politicianRepository;
    private final TradeRepository tradeRepository;
    private final CopyConfigRepository copyConfigRepository;
    private final AlpacaService alpacaService;
    private final ExecutedTradeRepository executedTradeRepository;
    private final UserRepository userRepository;

    public CapitolTradesScraper(PoliticianRepository politicianRepository,
                               TradeRepository tradeRepository,
                               CopyConfigRepository copyConfigRepository,
                               AlpacaService alpacaService,
                               ExecutedTradeRepository executedTradeRepository,
                               UserRepository userRepository) {
        this.politicianRepository = politicianRepository;
        this.tradeRepository = tradeRepository;
        this.copyConfigRepository = copyConfigRepository;
        this.alpacaService = alpacaService;
        this.executedTradeRepository = executedTradeRepository;
        this.userRepository = userRepository;
    }

    public void scrapePages(int startPage, int endPage) {
        scrapePages(startPage, endPage, false);
    }

    public void scrapePagesUntilDuplicate(int startPage) {
        scrapePages(startPage, Integer.MAX_VALUE, true);
    }

    private void scrapePages(int startPage, int endPage, boolean stopOnDuplicatePage) {
        int newTrades = 0;
        int skipped = 0;

        try (Playwright playwright = Playwright.create()) {
            Browser browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true));
            Page page = browser.newPage();

            for (int pageNum = startPage; pageNum <= endPage; pageNum++) {
                String targetUrl = BASE_URL + pageNum;
                log.info("Scraping page {}/{}: {}", pageNum, endPage, targetUrl);

                try {
                    page.navigate(targetUrl);
                    // Wait for the trades table to appear, up to 15 seconds
                    page.waitForSelector("table tbody tr", new Page.WaitForSelectorOptions().setTimeout(15000));

                    String html = page.content();

                    if (html.contains("Just a moment") || html.contains("cf-browser-verification")) {
                        log.error("Cloudflare challenge on page {} — stopping.", pageNum);
                        break;
                    }

                    Document doc = Jsoup.parse(html);
                    Elements rows = doc.select("table tbody tr");

                    if (rows.isEmpty()) {
                        log.info("No rows found on page {} — assuming end of data, stopping.", pageNum);
                        break;
                    }

                    for (Element row : rows) {
                        try {
                            int result = processRow(row);
                            if (result == 1) newTrades++;
                            else skipped++;
                        } catch (Exception e) {
                            log.warn("Failed to parse row on page {}: {}", pageNum, e.getMessage());
                        }
                    }

                    if (stopOnDuplicatePage && newTrades == 0 && skipped > 0) {
                        log.info("Page {} had no new trades — caught up to existing data, stopping.", pageNum);
                        break;
                    }

                    Thread.sleep(REQUEST_DELAY_MS);

                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    log.error("Scraping interrupted at page {}", pageNum);
                    break;
                } catch (Exception e) {
                    log.error("Error fetching page {}: {}", pageNum, e.getMessage());
                }
            }

            browser.close();
        }

        log.info("Scrape complete. New trades saved: {}, Already existed (skipped): {}", newTrades, skipped);
    }

    public void scrapeLatest() {
        scrapePages(1, 1);
    }



    private int processRow(Element row) {
        Elements cells = row.select("td");
        if (cells.size() < 8) return 0;

        String tradeDetailUrl = row.select("a[href*='/trades/']").last() != null
                ? row.select("a[href*='/trades/']").last().attr("href")
                : null;
        String capitolTradesId = extractTradeId(tradeDetailUrl);
        if (capitolTradesId == null) return 0;

        if (tradeRepository.existsByCapitolTradesId(capitolTradesId)) return 0;

        Element politicianCell = cells.get(0);
        String politicianName = politicianCell.select("a").first() != null
                ? politicianCell.select("a").first().text().trim()
                : null;
        String politicianUrl = politicianCell.select("a[href*='/politicians/']").attr("href");
        String politicianId = extractPoliticianId(politicianUrl);
        String[] partyAndRest = parsePoliticianMeta(politicianCell);

        Politician politician = getOrCreatePolitician(politicianId, politicianName,
                partyAndRest[0], partyAndRest[1], partyAndRest[2]);

        Element issuerCell = cells.get(1);
        String issuerName = issuerCell.select("a").first() != null
                ? issuerCell.select("a").first().text().trim()
                : issuerCell.text().trim();
        String ticker = extractTicker(issuerCell.text());

        LocalDate publishedDate = parseSplitDate(cells.get(2));

        LocalDate tradeDate = parseSplitDate(cells.get(3));

        Integer filedAfterDays = parseFiledDaysCell(cells.get(4));

        Element ownerCell = cells.get(5);
        Element ownerLabel = ownerCell.selectFirst(".q-label");
        String owner = ownerLabel != null ? ownerLabel.text().trim() : ownerCell.text().trim();

        String tradeType = cells.get(6).selectFirst(".tx-type") != null
                ? cells.get(6).selectFirst(".tx-type").text().trim().toLowerCase()
                : cells.get(6).text().trim().toLowerCase();

        Element sizeCell = cells.get(7);
        Element sizeText = sizeCell.selectFirst(".mt-1");
        long[] sizeRange = parseSize(sizeText != null ? sizeText.text() : sizeCell.text());

        BigDecimal price = cells.size() > 8 ? parsePrice(cells.get(8).text()) : null;

        Trade trade = new Trade();
        trade.setCapitolTradesId(capitolTradesId);
        trade.setPolitician(politician);
        trade.setIssuerName(issuerName);
        trade.setTicker(ticker);
        trade.setPublishedDate(publishedDate);
        trade.setTradeDate(tradeDate);
        trade.setFiledAfterDays(filedAfterDays);
        trade.setOwner(owner);
        trade.setTradeType(tradeType);
        trade.setSizeMin(sizeRange[0]);
        trade.setSizeMax(sizeRange[1]);
        trade.setPrice(price);

        tradeRepository.save(trade);
        // After saving a new trade, check for active copy configs and fire copy orders
        try {
            String polId = politician.getId();
            java.util.List<CopyConfig> configs = copyConfigRepository.findByPoliticianIdAndActiveTrue(polId);
            if (configs != null && !configs.isEmpty() && trade.getTicker() != null) {
                boolean isSell = "sell".equalsIgnoreCase(trade.getTradeType());
                boolean isBuy  = "buy".equalsIgnoreCase(trade.getTradeType());
                for (CopyConfig cfg : configs) {
                    try {
                        // Enforce maxFiledDays cap: if the user only wants to copy
                        // trades filed within N days, skip stale disclosures.
                        Integer mfd = cfg.getMaxFiledDays();
                        if (mfd != null && mfd > 0 && trade.getFiledAfterDays() != null
                                && trade.getFiledAfterDays() > mfd) {
                            log.info("Skipping copy for user {} on {} {} — filed after {} days exceeds cap of {}.",
                                    cfg.getUserId(), trade.getTicker(), trade.getTradeType(),
                                    trade.getFiledAfterDays(), mfd);
                            continue;
                        }

                        User cfgUser = userRepository.findById(cfg.getUserId()).orElse(null);
                        String orderId = null;
                        BigDecimal orderAmount = null;

                        if (isBuy) {
                            BigDecimal equity = alpacaService.getAccountEquity(cfgUser);
                            if (equity == null || equity.compareTo(BigDecimal.ZERO) <= 0) {
                                log.warn("Could not fetch account equity for user {} — skipping buy.", cfg.getUserId());
                                continue;
                            }
                            BigDecimal pct = cfg.getPortfolioPercent() != null ? cfg.getPortfolioPercent() : new BigDecimal("5");
                            orderAmount = equity.multiply(pct).divide(new BigDecimal("100"), 2, BigDecimal.ROUND_HALF_UP);
                            orderId = alpacaService.placeMarketOrder(cfgUser, trade.getTicker(), "buy", orderAmount);
                        } else if (isSell) {
                            BigDecimal positionQty = alpacaService.getPositionQty(cfgUser, trade.getTicker());
                            if (positionQty == null || positionQty.compareTo(BigDecimal.ZERO) <= 0) {
                                log.info("No position in {} for user {} — skipping sell copy.", trade.getTicker(), cfg.getUserId());
                                continue;
                            }

                            // Estimate sell proportion from politician's trade size vs their total buys of this ticker
                            BigDecimal sellQty = computeSellQty(positionQty, polId, trade);
                            orderId = alpacaService.placeMarketOrderByQty(cfgUser, trade.getTicker(), "sell", sellQty);
                            orderAmount = sellQty; // store qty in amountInvested for sells
                        } else {
                            log.info("Unknown trade type '{}' — skipping copy.", trade.getTradeType());
                            continue;
                        }

                        ExecutedTrade et = new ExecutedTrade();
                        et.setUserId(cfg.getUserId());
                        et.setPoliticianId(polId);
                        et.setPoliticianName(politician.getName());
                        et.setTicker(trade.getTicker());
                        et.setSide(trade.getTradeType());
                        et.setAmountInvested(orderAmount);
                        et.setFillPrice(null);
                        et.setExecutedAt(LocalDateTime.now());
                        et.setAlpacaOrderId(orderId);
                        et.setStatus(orderId != null ? "pending" : "failed");
                        executedTradeRepository.save(et);
                    } catch (Exception e) {
                        log.warn("Failed to execute copy for politician {}: {}", polId, e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Error processing copy configs: {}", e.getMessage());
        }
        return 1;
    }

    /**
     * Computes how many shares to sell proportionally.
     * Uses the midpoint of the politician's sell size vs their total known buy size for this ticker.
     * Falls back to selling the full position if proportion can't be determined.
     */
    private BigDecimal computeSellQty(BigDecimal positionQty, String politicianId, Trade sellTrade) {
        // Sum the politician's total known buys for this ticker (use sizeMin+sizeMax midpoint)
        java.util.List<Trade> politicianTrades = tradeRepository.findByPoliticianId(politicianId);
        long totalBuyMidpoint = politicianTrades.stream()
            .filter(t -> "buy".equalsIgnoreCase(t.getTradeType())
                      && sellTrade.getTicker().equalsIgnoreCase(t.getTicker()))
            .mapToLong(t -> {
                long max = t.getSizeMax() == Long.MAX_VALUE ? t.getSizeMin() * 2 : t.getSizeMax();
                return (t.getSizeMin() + max) / 2;
            })
            .sum();

        if (totalBuyMidpoint <= 0) {
            // Can't determine proportion — sell everything we have
            log.info("No buy history for {}/{} — selling full position ({} shares).", politicianId, sellTrade.getTicker(), positionQty);
            return positionQty;
        }

        long sellMax = sellTrade.getSizeMax() == Long.MAX_VALUE ? sellTrade.getSizeMin() * 2 : sellTrade.getSizeMax();
        long sellMidpoint = (sellTrade.getSizeMin() + sellMax) / 2;

        BigDecimal proportion = new BigDecimal(sellMidpoint)
            .divide(new BigDecimal(totalBuyMidpoint), 8, BigDecimal.ROUND_HALF_UP)
            .min(BigDecimal.ONE);

        BigDecimal sellQty = positionQty.multiply(proportion).setScale(8, BigDecimal.ROUND_HALF_DOWN);
        // Alpaca requires qty > 0
        if (sellQty.compareTo(BigDecimal.ZERO) <= 0) sellQty = positionQty;

        log.info("Sell copy {}: proportion={}, positionQty={}, sellQty={}", sellTrade.getTicker(), proportion, positionQty, sellQty);
        return sellQty;
    }

    private String extractTradeId(String url) {
        if (url == null) return null;
        Pattern p = Pattern.compile("/trades/(\\d+)");
        Matcher m = p.matcher(url);
        return m.find() ? m.group(1) : null;
    }

    private String extractPoliticianId(String url) {
        if (url == null || url.isBlank()) return "UNKNOWN";
        Pattern p = Pattern.compile("/politicians/([A-Z0-9]+)", Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(url);
        return m.find() ? m.group(1).toUpperCase() : "UNKNOWN";
    }


private String[] parsePoliticianMeta(Element politicianCell) {
    String party = null, chamber = null, state = null;

    Element partyEl = politicianCell.selectFirst(".party");
    if (partyEl != null) party = partyEl.text().trim();

    Element chamberEl = politicianCell.selectFirst(".chamber");
    if (chamberEl != null) chamber = chamberEl.text().trim();

    Element stateEl = politicianCell.selectFirst("[class*=us-state-compact--]");
    if (stateEl != null) state = stateEl.text().trim();

    return new String[]{party, chamber, state};
}

  
    private String extractTicker(String text) {
        Pattern p = Pattern.compile("([A-Z]{1,5}):[A-Z]{2}");
        Matcher m = p.matcher(text);
        return m.find() ? m.group(1) : null;
    }

 
    private LocalDate parseDate(String text) {
        if (text == null || text.isBlank()) return null;
        text = text.trim();

        text = text.replaceAll("^\\d{1,2}:\\d{2}\\s*", "").trim();

        if (text.equalsIgnoreCase("Yesterday")) return LocalDate.now().minusDays(1);
        if (text.equalsIgnoreCase("Today")) return LocalDate.now();


        try {
            return LocalDate.parse(text, DATE_FORMATTER);
        } catch (DateTimeParseException ignored) {}

        try {
            return LocalDate.parse("1 " + text, DATE_FORMATTER);
        } catch (DateTimeParseException ignored) {}

        log.debug("Could not parse date: '{}'", text);
        return null;
    }

    // Date cells now render as two stacked divs: e.g. "26 May" + "2026", or "11:15" + "Today"
    private LocalDate parseSplitDate(Element cell) {
        Elements divs = cell.select("div > div");
        if (divs.size() >= 2) {
            String part1 = divs.get(0).text().trim(); // e.g. "11:15" or "26 May"
            String part2 = divs.get(1).text().trim(); // e.g. "Today" or "2026"
            // published date: part1=time, part2=relative label ("Today"/"Yesterday") or month+year
            if (part2.equalsIgnoreCase("Today")) return LocalDate.now();
            if (part2.equalsIgnoreCase("Yesterday")) return LocalDate.now().minusDays(1);
            // trade date: part1="26 May", part2="2026"
            LocalDate d = parseDate(part1 + " " + part2);
            if (d != null) return d;
        }
        return parseDate(cell.text());
    }

    // Filed-days cell: .q-value holds the number, .q-label holds "days"
    private Integer parseFiledDaysCell(Element cell) {
        Element valueEl = cell.selectFirst(".q-value");
        if (valueEl != null) return parseFiledDays(valueEl.text());
        return parseFiledDays(cell.text());
    }


    private Integer parseFiledDays(String text) {
        if (text == null) return null;
        Pattern p = Pattern.compile("(\\d+)");
        Matcher m = p.matcher(text);
        return m.find() ? Integer.parseInt(m.group(1)) : null;
    }

 
    private long[] parseSize(String text) {
        if (text == null || text.isBlank()) return new long[]{0, 0};
        Matcher m = SIZE_PATTERN.matcher(text.trim());
        if (!m.find()) return new long[]{0, 0};

        if (m.group(5) != null) {
            long min = parseAmount(m.group(5), m.group(6));
            return new long[]{min, Long.MAX_VALUE};
        } else {
            long min = parseAmount(m.group(1), m.group(2));
            long max = parseAmount(m.group(3), m.group(4));
            return new long[]{min, max};
        }
    }

    private long parseAmount(String num, String unit) {
        double val = Double.parseDouble(num);
        if ("K".equals(unit)) val *= 1_000;
        else if ("M".equals(unit)) val *= 1_000_000;
        return (long) val;
    }


    private BigDecimal parsePrice(String text) {
        if (text == null || text.isBlank() || text.equalsIgnoreCase("N/A")) return null;
        try {
            return new BigDecimal(text.replace("$", "").replace(",", "").trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Politician getOrCreatePolitician(String id, String name, String party, String chamber, String state) {
        return politicianRepository.findById(id).orElseGet(() -> {
            Politician p = new Politician(id, name != null ? name : "Unknown", party, chamber, state);
            return politicianRepository.save(p);
        });
    }
}
