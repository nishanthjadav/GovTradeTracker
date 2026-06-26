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

    private static final int MAX_CONSECUTIVE_ERRORS = 5;

    private enum RowResult { NEW, DUPLICATE, UNPARSEABLE }

    private void scrapePages(int startPage, int endPage, boolean stopOnDuplicatePage) {
        int newTrades = 0;
        int skipped = 0;
        int consecutiveErrors = 0;

        try (Playwright playwright = Playwright.create()) {
            Browser browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true));
            Page page = browser.newPage();
            page.setDefaultNavigationTimeout(30000);

            for (int pageNum = startPage; pageNum <= endPage; pageNum++) {
                String targetUrl = BASE_URL + pageNum;
                log.info("Scraping page {}/{}: {}", pageNum, endPage, targetUrl);

                try {
                    page.navigate(targetUrl);
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

                    consecutiveErrors = 0;

                    int pageNewTrades = 0;
                    int pageDuplicates = 0;
                    int pageUnparseable = 0;
                    for (Element row : rows) {
                        try {
                            RowResult result = processRow(row);
                            switch (result) {
                                case NEW -> { newTrades++; pageNewTrades++; }
                                case DUPLICATE -> { skipped++; pageDuplicates++; }
                                case UNPARSEABLE -> { skipped++; pageUnparseable++; }
                            }
                        } catch (Exception e) {
                            pageUnparseable++;
                            log.warn("Failed to parse row on page {}: {}", pageNum, e.getMessage());
                        }
                    }

                    if (pageUnparseable > 0) {
                        log.warn("Page {}: {} row(s) failed to parse — possible layout change on Capitol Trades.", pageNum, pageUnparseable);
                    }

                    if (stopOnDuplicatePage && pageNewTrades == 0 && pageDuplicates > 0) {
                        log.info("Page {} had no new trades — caught up to existing data, stopping.", pageNum);
                        break;
                    }

                    Thread.sleep(REQUEST_DELAY_MS);

                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    log.error("Scraping interrupted at page {}", pageNum);
                    break;
                } catch (Exception e) {
                    consecutiveErrors++;
                    log.error("Error fetching page {} ({}/{} consecutive errors): {}", pageNum, consecutiveErrors, MAX_CONSECUTIVE_ERRORS, e.getMessage());
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        log.error("SCRAPE_ABORTED: reached {} consecutive errors on page {} — Capitol Trades is likely rate-limiting or has changed layout. Aborting to avoid endless timeout loop.",
                                MAX_CONSECUTIVE_ERRORS, pageNum);
                        break;
                    }
                    // back off so we don't confirm bot behavior by hammering: 15s, 30s, 60s, 60s, 60s
                    long backoffMs = Math.min(60_000L, 15_000L * (1L << Math.min(consecutiveErrors - 1, 2)));
                    log.info("Backing off {}ms before retrying.", backoffMs);
                    try {
                        Thread.sleep(backoffMs);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }

            browser.close();
        }

        log.info("Scrape complete. New trades saved: {}, Already existed (skipped): {}", newTrades, skipped);
    }

    public void scrapeLatest() {
        scrapePages(1, 1);
    }



    private RowResult processRow(Element row) {
        Elements cells = row.select("td");
        if (cells.size() < 8) return RowResult.UNPARSEABLE;

        String tradeDetailUrl = row.select("a[href*='/trades/']").last() != null
                ? row.select("a[href*='/trades/']").last().attr("href")
                : null;
        String capitolTradesId = extractTradeId(tradeDetailUrl);
        if (capitolTradesId == null) return RowResult.UNPARSEABLE;

        if (tradeRepository.existsByCapitolTradesId(capitolTradesId)) return RowResult.DUPLICATE;

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
        try {
            String polId = politician.getId();
            java.util.List<CopyConfig> configs = copyConfigRepository.findByPoliticianIdAndActiveTrue(polId);
            if (configs != null && !configs.isEmpty() && trade.getTicker() != null) {
                boolean isSell = "sell".equalsIgnoreCase(trade.getTradeType());
                boolean isBuy  = "buy".equalsIgnoreCase(trade.getTradeType());
                if (!isBuy && !isSell) {
                    log.info("Unknown trade type '{}' — skipping copy.", trade.getTradeType());
                    return RowResult.NEW;
                }
                for (CopyConfig cfg : configs) {
                    try {
                        // skip historical trades published before the user activated this config — otherwise backfills retroactively fire orders
                        if (cfg.getCreatedAt() != null && trade.getPublishedDate() != null
                                && trade.getPublishedDate().isBefore(cfg.getCreatedAt().toLocalDate())) {
                            log.info("Skipping copy for user {} on {} {} — trade published {} predates config createdAt {}.",
                                    cfg.getUserId(), trade.getTicker(), trade.getTradeType(),
                                    trade.getPublishedDate(), cfg.getCreatedAt());
                            continue;
                        }

                        // skip stale disclosures past the user's maxFiledDays cap
                        Integer mfd = cfg.getMaxFiledDays();
                        if (mfd != null && mfd > 0 && trade.getFiledAfterDays() != null
                                && trade.getFiledAfterDays() > mfd) {
                            log.info("Skipping copy for user {} on {} {} — filed after {} days exceeds cap of {}.",
                                    cfg.getUserId(), trade.getTicker(), trade.getTradeType(),
                                    trade.getFiledAfterDays(), mfd);
                            continue;
                        }

                        User cfgUser = userRepository.findById(cfg.getUserId()).orElse(null);

                        // skip if we already processed this disclosure for this user
                        if (executedTradeRepository.existsByUserIdAndCapitolTradesId(
                                cfg.getUserId(), capitolTradesId)) {
                            log.info("Already executed copy for user {} on capitol trade {} — skipping.",
                                    cfg.getUserId(), capitolTradesId);
                            continue;
                        }

                        AlpacaService.OrderResult orderResult = null;
                        BigDecimal dollarAmount = null;
                        BigDecimal sharesQty = null;

                        if (isBuy) {
                            BigDecimal equity = alpacaService.getAccountEquity(cfgUser);
                            if (equity == null || equity.compareTo(BigDecimal.ZERO) <= 0) {
                                log.warn("Could not fetch account equity for user {} — skipping buy.", cfg.getUserId());
                                continue;
                            }
                            BigDecimal pct = cfg.getPortfolioPercent() != null ? cfg.getPortfolioPercent() : new BigDecimal("5");
                            BigDecimal notional = equity.multiply(pct).divide(new BigDecimal("100"), 2, BigDecimal.ROUND_HALF_UP);
                            orderResult = alpacaService.placeMarketOrder(cfgUser, trade.getTicker(), "buy", notional);
                            dollarAmount = notional;
                        } else {
                            BigDecimal positionQty = alpacaService.getPositionQty(cfgUser, trade.getTicker());
                            if (positionQty == null || positionQty.compareTo(BigDecimal.ZERO) <= 0) {
                                log.info("No position in {} for user {} — skipping sell copy.", trade.getTicker(), cfg.getUserId());
                                continue;
                            }

                            // returns null if we can't compute proportion — skip rather than dump the whole position on a weak signal
                            sharesQty = computeSellQty(positionQty, polId, trade);
                            if (sharesQty == null) {
                                log.info("Cannot determine sell proportion for {}/{} — skipping (refusing to liquidate full position on weak signal).",
                                        polId, trade.getTicker());
                                continue;
                            }
                            orderResult = alpacaService.placeMarketOrderByQty(cfgUser, trade.getTicker(), "sell", sharesQty);
                        }

                        if (orderResult == null || !orderResult.isSuccess()) {
                            // persist a rejection row so the user can see what alpaca refused — no amountInvested so it doesn't pollute totals
                            String errMsg = orderResult != null ? orderResult.errorMessage : "Unknown error";
                            log.warn("Alpaca rejected {} order for user {} on {}: {}",
                                    trade.getTradeType(), cfg.getUserId(), trade.getTicker(), errMsg);

                            ExecutedTrade rej = new ExecutedTrade();
                            rej.setUserId(cfg.getUserId());
                            rej.setCapitolTradesId(capitolTradesId);
                            rej.setPoliticianId(polId);
                            rej.setPoliticianName(politician.getName());
                            rej.setTicker(trade.getTicker());
                            rej.setSide(trade.getTradeType());
                            rej.setExecutedAt(LocalDateTime.now());
                            rej.setStatus("rejected");
                            rej.setErrorMessage(errMsg);
                            try { executedTradeRepository.save(rej); }
                            catch (org.springframework.dao.DataIntegrityViolationException dup) {
                                // lost the race to a concurrent attempt — fine
                            }
                            continue;
                        }

                        String orderId = orderResult.orderId;

                        // poll a few seconds for fill — pnl math needs the actual fill price
                        java.util.Map<String, Object> filled = alpacaService.waitForOrderFill(cfgUser, orderId);
                        BigDecimal fillPrice = null;
                        BigDecimal filledQty = null;
                        String fillStatus = "pending";
                        if (filled != null) {
                            Object fap = filled.get("filled_avg_price");
                            Object fq = filled.get("filled_qty");
                            Object st = filled.get("status");
                            if (fap != null) {
                                try { fillPrice = new BigDecimal(fap.toString()); } catch (NumberFormatException ignored) {}
                            }
                            if (fq != null) {
                                try { filledQty = new BigDecimal(fq.toString()); } catch (NumberFormatException ignored) {}
                            }
                            if (st != null) fillStatus = st.toString();
                        }

                        // amountInvested: prefer actual filled qty * price, fall back to requested notional for buys
                        BigDecimal amountInvested = null;
                        if (filledQty != null && fillPrice != null) {
                            amountInvested = filledQty.multiply(fillPrice).setScale(2, BigDecimal.ROUND_HALF_UP);
                        } else if (isBuy) {
                            amountInvested = dollarAmount;
                        } else if (sharesQty != null && fillPrice != null) {
                            amountInvested = sharesQty.multiply(fillPrice).setScale(2, BigDecimal.ROUND_HALF_UP);
                        }

                        ExecutedTrade et = new ExecutedTrade();
                        et.setUserId(cfg.getUserId());
                        et.setCapitolTradesId(capitolTradesId);
                        et.setPoliticianId(polId);
                        et.setPoliticianName(politician.getName());
                        et.setTicker(trade.getTicker());
                        et.setSide(trade.getTradeType());
                        et.setAmountInvested(amountInvested);
                        et.setFillPrice(fillPrice);
                        et.setExecutedAt(LocalDateTime.now());
                        et.setAlpacaOrderId(orderId);
                        et.setStatus(fillStatus);
                        try { executedTradeRepository.save(et); }
                        catch (org.springframework.dao.DataIntegrityViolationException dup) {
                            log.warn("Race detected on ExecutedTrade for user {} capitol {} — another worker beat us. " +
                                    "Note: this means an Alpaca order was placed but the row was not saved. orderId={}",
                                    cfg.getUserId(), capitolTradesId, orderId);
                        }
                    } catch (Exception e) {
                        log.warn("Failed to execute copy for politician {}: {}", polId, e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Error processing copy configs: {}", e.getMessage());
        }
        return RowResult.NEW;
    }

    // returns null if we can't compute proportion — caller skips rather than dumping the whole position
    private BigDecimal computeSellQty(BigDecimal positionQty, String politicianId, Trade sellTrade) {
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
            // no known buy history — can't compute proportion, refuse
            return null;
        }

        long sellMax = sellTrade.getSizeMax() == Long.MAX_VALUE ? sellTrade.getSizeMin() * 2 : sellTrade.getSizeMax();
        long sellMidpoint = (sellTrade.getSizeMin() + sellMax) / 2;

        if (sellMidpoint <= 0) {
            return null;
        }

        BigDecimal proportion = new BigDecimal(sellMidpoint)
            .divide(new BigDecimal(totalBuyMidpoint), 8, java.math.RoundingMode.HALF_UP)
            .min(BigDecimal.ONE);

        BigDecimal sellQty = positionQty.multiply(proportion).setScale(8, java.math.RoundingMode.HALF_DOWN);
        if (sellQty.compareTo(BigDecimal.ZERO) <= 0) {
            // rounded down to 0 — don't fall back to full liquidation
            return null;
        }

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

    // date cells render as two stacked divs: e.g. "26 May" + "2026", or "11:15" + "Today"
    private LocalDate parseSplitDate(Element cell) {
        Elements divs = cell.select("div > div");
        if (divs.size() >= 2) {
            String part1 = divs.get(0).text().trim();
            String part2 = divs.get(1).text().trim();
            if (part2.equalsIgnoreCase("Today")) return LocalDate.now();
            if (part2.equalsIgnoreCase("Yesterday")) return LocalDate.now().minusDays(1);
            LocalDate d = parseDate(part1 + " " + part2);
            if (d != null) return d;
        }
        return parseDate(cell.text());
    }

    // .q-value holds the number, .q-label holds "days"
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
