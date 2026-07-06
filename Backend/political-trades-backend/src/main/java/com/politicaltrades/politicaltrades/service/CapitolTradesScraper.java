package com.politicaltrades.politicaltrades.service;

import com.politicaltrades.politicaltrades.entity.Politician;
import com.politicaltrades.politicaltrades.entity.Trade;
import com.politicaltrades.politicaltrades.repository.TradeRepository;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
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
    private static final int REQUEST_DELAY_MS = 4500;
    private static final int REQUEST_JITTER_MS = 1500;
    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

    private static final Pattern SIZE_PATTERN = Pattern.compile("([\\d.]+)(K|M)?[–-]([\\d.]+)(K|M)?|([\\d.]+)(K|M)?\\+");
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private final TradeRepository tradeRepository;
    private final TradeIngestionService ingestionService;

    public CapitolTradesScraper(TradeRepository tradeRepository,
                                TradeIngestionService ingestionService) {
        this.tradeRepository = tradeRepository;
        this.ingestionService = ingestionService;
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

        // plain httpclient instead of playwright — playwright's headless chromium
        // gets fingerprinted by vercel's bot protection even with automationcontrolled off,
        // but a bare curl with a real ua and cookie jar sails through
        CookieManager cookieJar = new CookieManager();
        cookieJar.setCookiePolicy(CookiePolicy.ACCEPT_ALL);
        HttpClient http = HttpClient.newBuilder()
                .cookieHandler(cookieJar)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(15))
                .build();

        // warm-up hit on / so vercel sets its session cookie before we touch /trades,
        // going cold to /trades triggers the security checkpoint
        try {
            HttpResponse<String> warmup = http.send(
                    buildRequest(URI.create("https://www.capitoltrades.com/")),
                    HttpResponse.BodyHandlers.ofString());
            log.info("Warm-up GET / -> {} ({} bytes, cookies now: {})",
                    warmup.statusCode(), warmup.body().length(), cookieJar.getCookieStore().getCookies().size());
            Thread.sleep(1500 + (long)(Math.random() * 1500));
        } catch (Exception e) {
            log.warn("Warm-up navigation failed (continuing anyway): {}", e.getMessage());
        }

        for (int pageNum = startPage; pageNum <= endPage; pageNum++) {
            String targetUrl = BASE_URL + pageNum;
            log.info("Scraping page {}/{}: {}", pageNum, endPage, targetUrl);

            try {
                HttpResponse<String> resp = http.send(
                        buildRequest(URI.create(targetUrl)),
                        HttpResponse.BodyHandlers.ofString());

                int status = resp.statusCode();
                String html = resp.body();

                if (status == 429) {
                    log.error("HTTP 429 (rate-limited) on page {} — aborting; will retry on next scheduled run.", pageNum);
                    break;
                }
                if (status >= 500) {
                    throw new RuntimeException("Upstream " + status + " on page " + pageNum);
                }
                if (status != 200) {
                    throw new RuntimeException("Unexpected status " + status + " on page " + pageNum);
                }

                if (html.contains("Vercel Security Checkpoint") || html.contains("_vcrcs")) {
                    log.error("Vercel Security Checkpoint served on page {} — blocked as a bot. Aborting.", pageNum);
                    break;
                }
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

                // jitter the delay so the request pattern doesn't look mechanical to vercel
                Thread.sleep(REQUEST_DELAY_MS + (long)(Math.random() * REQUEST_JITTER_MS));

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
                // back off so we don't confirm bot behavior: 15s, 30s, 60s, 60s, 60s
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

        log.info("Scrape complete. New trades saved: {}, Already existed (skipped): {}", newTrades, skipped);
    }

    // browser-shaped headers — vercel challenges requests missing accept-language / sec-fetch-*
    private HttpRequest buildRequest(URI uri) {
        return HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(20))
                .header("User-Agent", USER_AGENT)
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
                .header("Accept-Language", "en-US,en;q=0.9")
                .header("Accept-Encoding", "identity")
                .header("Sec-Ch-Ua", "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"")
                .header("Sec-Ch-Ua-Mobile", "?0")
                .header("Sec-Ch-Ua-Platform", "\"Windows\"")
                .header("Sec-Fetch-Dest", "document")
                .header("Sec-Fetch-Mode", "navigate")
                .header("Sec-Fetch-Site", "none")
                .header("Sec-Fetch-User", "?1")
                .header("Upgrade-Insecure-Requests", "1")
                .GET()
                .build();
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

        Politician politician = ingestionService.getOrCreatePolitician(politicianId, politicianName,
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

        return ingestionService.saveAndCopy(trade, politician) == TradeIngestionService.SaveResult.NEW
                ? RowResult.NEW : RowResult.DUPLICATE;
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

    // date cells render as two stacked divs: e.g. "26 May" + "2026", or "11:15" + "today"
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
}
