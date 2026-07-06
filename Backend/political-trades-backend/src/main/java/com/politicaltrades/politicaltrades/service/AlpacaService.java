package com.politicaltrades.politicaltrades.service;

import com.politicaltrades.politicaltrades.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@Service
public class AlpacaService {

    private static final Logger log = LoggerFactory.getLogger(AlpacaService.class);

    // on rejection, errormessage carries alpaca's body so callers can persist why nothing happened
    public static class OrderResult {
        public final String orderId;
        public final String errorMessage;
        private OrderResult(String orderId, String errorMessage) {
            this.orderId = orderId;
            this.errorMessage = errorMessage;
        }
        public static OrderResult success(String id) { return new OrderResult(id, null); }
        public static OrderResult rejected(String msg) { return new OrderResult(null, msg); }
        public boolean isSuccess() { return orderId != null; }
    }

    private final RestTemplate restTemplate = new RestTemplate();
    private final CryptoService cryptoService;

    @Value("${alpaca.api.key:}")
    private String globalApiKey;

    @Value("${alpaca.api.secret:}")
    private String globalApiSecret;

    @Value("${alpaca.base.url:https://paper-api.alpaca.markets/v2}")
    private String baseUrl;

    public AlpacaService(CryptoService cryptoService) {
        this.cryptoService = cryptoService;
    }

    private String[] resolveCreds(User user) {
        if (user != null && user.isAlpacaLinked()) {
            try {
                return new String[] {
                    cryptoService.decrypt(user.getAlpacaKeyEncrypted()),
                    cryptoService.decrypt(user.getAlpacaSecretEncrypted())
                };
            } catch (Exception e) {
                log.warn("Failed to decrypt user Alpaca creds, falling back to global: {}", e.getMessage());
            }
        }
        return new String[] { globalApiKey, globalApiSecret };
    }

    public OrderResult placeMarketOrder(User user, String ticker, String side, BigDecimal notional) {
        String[] creds = resolveCreds(user);
        if (creds[0] == null || creds[0].isBlank()) {
            log.warn("No Alpaca credentials available; skipping order for {}", ticker);
            return OrderResult.rejected("No Alpaca credentials configured");
        }
        try {
            String url = baseUrl + "/orders";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("APCA-API-KEY-ID", creds[0]);
            headers.set("APCA-API-SECRET-KEY", creds[1]);

            Map<String, Object> body = new HashMap<>();
            body.put("symbol", ticker);
            body.put("side", side);
            body.put("type", "market");
            body.put("time_in_force", "day");
            body.put("notional", notional.toPlainString());

            HttpEntity<Map<String, Object>> req = new HttpEntity<>(body, headers);
            ResponseEntity<Map> resp = restTemplate.postForEntity(url, req, Map.class);

            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                Object id = resp.getBody().get("id");
                if (id != null) return OrderResult.success(id.toString());
            }
            log.warn("Alpaca order returned non-success: status {}", resp.getStatusCode().value());
            return OrderResult.rejected("Unexpected response: " + resp.getStatusCode().value());
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            String msg = extractAlpacaError(e);
            log.warn("Alpaca rejected {} order for {}: {} — {}", side, ticker, e.getStatusCode().value(), msg);
            return OrderResult.rejected(msg);
        } catch (org.springframework.web.client.HttpServerErrorException e) {
            log.error("Alpaca server error placing order for {}: {} — {}", ticker, e.getStatusCode().value(), e.getResponseBodyAsString());
            return OrderResult.rejected("Alpaca server error: " + e.getStatusCode().value());
        } catch (Exception e) {
            log.error("Error placing alpaca order: {}", e.getMessage());
            return OrderResult.rejected("Network/IO error: " + e.getMessage());
        }
    }

    // alpaca rejects notional sells for fractional shares, so sells must use qty
    public OrderResult placeMarketOrderByQty(User user, String ticker, String side, BigDecimal qty) {
        String[] creds = resolveCreds(user);
        if (creds[0] == null || creds[0].isBlank()) {
            log.warn("No Alpaca credentials available; skipping order for {}", ticker);
            return OrderResult.rejected("No Alpaca credentials configured");
        }
        try {
            String url = baseUrl + "/orders";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("APCA-API-KEY-ID", creds[0]);
            headers.set("APCA-API-SECRET-KEY", creds[1]);

            Map<String, Object> body = new HashMap<>();
            body.put("symbol", ticker);
            body.put("side", side);
            body.put("type", "market");
            body.put("time_in_force", "day");
            body.put("qty", qty.toPlainString());

            HttpEntity<Map<String, Object>> req = new HttpEntity<>(body, headers);
            ResponseEntity<Map> resp = restTemplate.postForEntity(url, req, Map.class);

            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                Object id = resp.getBody().get("id");
                if (id != null) return OrderResult.success(id.toString());
            }
            log.warn("Alpaca order returned non-success: status {}", resp.getStatusCode().value());
            return OrderResult.rejected("Unexpected response: " + resp.getStatusCode().value());
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            String msg = extractAlpacaError(e);
            log.warn("Alpaca rejected {} order for {}: {} — {}", side, ticker, e.getStatusCode().value(), msg);
            return OrderResult.rejected(msg);
        } catch (org.springframework.web.client.HttpServerErrorException e) {
            log.error("Alpaca server error placing order for {}: {} — {}", ticker, e.getStatusCode().value(), e.getResponseBodyAsString());
            return OrderResult.rejected("Alpaca server error: " + e.getStatusCode().value());
        } catch (Exception e) {
            log.error("Error placing alpaca order: {}", e.getMessage());
            return OrderResult.rejected("Network/IO error: " + e.getMessage());
        }
    }

    private String extractAlpacaError(org.springframework.web.client.HttpClientErrorException e) {
        String body = e.getResponseBodyAsString();
        if (body == null || body.isBlank()) return e.getStatusText();
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, Object> parsed = mapper.readValue(body, Map.class);
            Object msg = parsed.get("message");
            if (msg != null) return msg.toString();
        } catch (Exception ignored) { }
        return body.length() > 200 ? body.substring(0, 200) : body;
    }

    public record AccountSnapshot(BigDecimal cash, BigDecimal equity) {}

    public AccountSnapshot getAccountSnapshot(User user) {
        String[] creds = resolveCreds(user);
        if (creds[0] == null || creds[0].isBlank()) return new AccountSnapshot(null, null);
        try {
            String url = baseUrl + "/account";
            HttpHeaders headers = new HttpHeaders();
            headers.set("APCA-API-KEY-ID", creds[0]);
            headers.set("APCA-API-SECRET-KEY", creds[1]);
            HttpEntity<Void> req = new HttpEntity<>(headers);
            ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, req, Map.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                Object cash = resp.getBody().get("cash");
                Object equity = resp.getBody().get("equity");
                return new AccountSnapshot(
                    cash != null ? new BigDecimal(cash.toString()) : null,
                    equity != null ? new BigDecimal(equity.toString()) : null
                );
            }
        } catch (Exception e) {
            log.warn("Failed to fetch account snapshot: {}", e.getMessage());
        }
        return new AccountSnapshot(null, null);
    }

    public BigDecimal getAccountEquity(User user) {
        return getAccountSnapshot(user).equity();
    }

    public record PortfolioHistory(long[] timestamps, double[] equity, String timeframe, Double baseValue, Long windowStart, Long windowEnd) {}

    // proxies /v2/account/portfolio/history. every range is a trailing window
    // ending at "now": 1D=24h, 1M=30d, 1Y=365d, ALL=5y. we request a slightly
    // wider window from alpaca (they only serve market-hours data) then slice
    // to the exact trailing window on our end, padding the front with base
    // value if the account is younger than the window.
    public PortfolioHistory getPortfolioHistory(User user, String range) {
        String[] creds = resolveCreds(user);
        if (creds[0] == null || creds[0].isBlank()) {
            return new PortfolioHistory(new long[0], new double[0], null, null, null, null);
        }

        // alpacaPeriod is what we ASK alpaca for (usually a bit wider than we want,
        // to be safe). windowMs is the exact trailing window we'll slice to.
        String alpacaPeriod, timeframe;
        long windowMs;
        switch (range == null ? "1D" : range.toUpperCase()) {
            case "1M" -> { alpacaPeriod = "1M"; timeframe = "1D"; windowMs = 30L * 86_400_000L; }
            case "1Y" -> { alpacaPeriod = "1A"; timeframe = "1D"; windowMs = 365L * 86_400_000L; }
            case "ALL" -> { alpacaPeriod = "5A"; timeframe = "1D"; windowMs = 5L * 365L * 86_400_000L; }
            default -> { alpacaPeriod = "1W"; timeframe = "5Min"; windowMs = 86_400_000L; }
        }

        long nowMs = System.currentTimeMillis();
        long windowStart = nowMs - windowMs;
        long windowEnd = nowMs;

        try {
            // intraday_reporting=continuous: gives 24/7 samples (off-hours valued
            // at close price) instead of market-hours only. lets 1D show a real
            // trailing-24h window instead of just the trading session.
            String url = baseUrl + "/account/portfolio/history?period=" + alpacaPeriod
                + "&timeframe=" + timeframe
                + "&intraday_reporting=continuous";
            HttpHeaders headers = new HttpHeaders();
            headers.set("APCA-API-KEY-ID", creds[0]);
            headers.set("APCA-API-SECRET-KEY", creds[1]);
            HttpEntity<Void> req = new HttpEntity<>(headers);
            ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, req, Map.class);
            log.info("portfolio history {} url={}", range, url);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                Object tsRaw = resp.getBody().get("timestamp");
                Object eqRaw = resp.getBody().get("equity");
                Object baseRaw = resp.getBody().get("base_value");
                Object tfRaw = resp.getBody().get("timeframe");
                if (tsRaw instanceof java.util.List<?> tsList && eqRaw instanceof java.util.List<?> eqList) {
                    int n = Math.min(tsList.size(), eqList.size());
                    log.info("portfolio history {}: alpaca returned {} samples, base={}, timeframe={}",
                        range, n, baseRaw, tfRaw);
                    long[] tsAll = new long[n];
                    double[] eqAll = new double[n];
                    for (int i = 0; i < n; i++) {
                        Object t = tsList.get(i);
                        Object e = eqList.get(i);
                        tsAll[i] = t == null ? 0L : ((Number) t).longValue() * 1000L;
                        eqAll[i] = e == null ? 0.0 : ((Number) e).doubleValue();
                    }
                    Double base = baseRaw == null ? null : ((Number) baseRaw).doubleValue();
                    String tf = tfRaw == null ? timeframe : tfRaw.toString();

                    // slice to the trailing window. also drop samples with
                    // no equity (alpaca pads pre-market with 0s or nulls).
                    int keepStart = -1, keepEnd = -1;
                    for (int i = 0; i < n; i++) {
                        if (tsAll[i] <= 0 || eqAll[i] <= 0) continue;
                        if (tsAll[i] < windowStart) continue;
                        if (tsAll[i] > windowEnd) break;
                        if (keepStart == -1) keepStart = i;
                        keepEnd = i;
                    }

                    long[] ts;
                    double[] eq;
                    if (keepStart == -1) {
                        log.info("portfolio history {}: no samples in trailing window ({}→{}), falling back",
                            range, windowStart, windowEnd);
                        int lastReal = -1;
                        for (int i = n - 1; i >= 0; i--) {
                            if (tsAll[i] > 0 && eqAll[i] > 0) { lastReal = i; break; }
                        }
                        if (lastReal == -1) {
                            log.warn("portfolio history {}: no real samples at all in {} returned rows, synthesizing flat line from base_value={}", range, n, base);
                            // alpaca returned only zero-equity samples (common for
                            // paper accounts that haven't traded). synthesize a flat
                            // line at base_value across the window so the chart shows
                            // the current cash balance instead of nothing.
                            double flatValue = base != null && base > 0 ? base : 0;
                            if (flatValue <= 0) {
                                return new PortfolioHistory(new long[0], new double[0], tf, base, windowStart, windowEnd);
                            }
                            long[] tsFlat = new long[] { windowStart, windowEnd };
                            double[] eqFlat = new double[] { flatValue, flatValue };
                            return new PortfolioHistory(tsFlat, eqFlat, tf, base, windowStart, windowEnd);
                        }
                        // include a reasonable trailing chunk (up to timeframe granularity * ~78 samples)
                        int backfillStart = Math.max(0, lastReal - 78);
                        int m = lastReal - backfillStart + 1;
                        ts = new long[m];
                        eq = new double[m];
                        int j = 0;
                        for (int i = backfillStart; i <= lastReal; i++) {
                            if (tsAll[i] <= 0 || eqAll[i] <= 0) continue;
                            ts[j] = tsAll[i];
                            eq[j] = eqAll[i];
                            j++;
                        }
                        if (j < ts.length) {
                            long[] ts3 = new long[j]; double[] eq3 = new double[j];
                            System.arraycopy(ts, 0, ts3, 0, j);
                            System.arraycopy(eq, 0, eq3, 0, j);
                            ts = ts3; eq = eq3;
                        }
                    } else {
                        int m = keepEnd - keepStart + 1;
                        ts = new long[m];
                        eq = new double[m];
                        int j = 0;
                        for (int i = keepStart; i <= keepEnd; i++) {
                            if (tsAll[i] <= 0 || eqAll[i] <= 0) continue;
                            ts[j] = tsAll[i];
                            eq[j] = eqAll[i];
                            j++;
                        }
                        if (j < ts.length) {
                            long[] ts3 = new long[j]; double[] eq3 = new double[j];
                            System.arraycopy(ts, 0, ts3, 0, j);
                            System.arraycopy(eq, 0, eq3, 0, j);
                            ts = ts3; eq = eq3;
                        }
                    }

                    // pad the front if the account is younger than the window.
                    // for 1D we skip padding — trailing 24h of a fresh account
                    // is just whatever we've got, no synthetic history needed.
                    if (windowMs > 86_400_000L && ts.length > 0) {
                        long firstTs = ts[0];
                        double padValue = base != null && base > 0 ? base : eq[0];
                        if (firstTs - windowStart > 86_400_000L) {
                            long padEnd = firstTs - 60_000L;
                            long[] ts2 = new long[ts.length + 2];
                            double[] eq2 = new double[eq.length + 2];
                            ts2[0] = windowStart; eq2[0] = padValue;
                            ts2[1] = padEnd;      eq2[1] = padValue;
                            System.arraycopy(ts, 0, ts2, 2, ts.length);
                            System.arraycopy(eq, 0, eq2, 2, eq.length);
                            ts = ts2; eq = eq2;
                        }
                    }

                    return new PortfolioHistory(ts, eq, tf, base, windowStart, windowEnd);
                }
            }
        } catch (org.springframework.web.client.HttpStatusCodeException e) {
            log.warn("portfolio history {}: alpaca returned {} — {}", range,
                e.getStatusCode().value(), e.getResponseBodyAsString());
        } catch (Exception e) {
            log.warn("portfolio history {}: request failed: {}", range, e.getMessage());
        }
        return new PortfolioHistory(new long[0], new double[0], null, null, windowStart, windowEnd);
    }

    public BigDecimal getPositionQty(User user, String ticker) {
        String[] creds = resolveCreds(user);
        if (creds[0] == null || creds[0].isBlank()) return null;
        try {
            String url = baseUrl + "/positions/" + ticker;
            HttpHeaders headers = new HttpHeaders();
            headers.set("APCA-API-KEY-ID", creds[0]);
            headers.set("APCA-API-SECRET-KEY", creds[1]);
            HttpEntity<Void> req = new HttpEntity<>(headers);
            ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, req, Map.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                Object qty = resp.getBody().get("qty");
                if (qty != null) return new BigDecimal(qty.toString());
            }
        } catch (org.springframework.web.client.HttpClientErrorException.NotFound e) {
            // no position, expected
        } catch (Exception e) {
            log.warn("Failed to fetch position for {}: {}", ticker, e.getMessage());
        }
        return null;
    }

    public BigDecimal fetchLatestPrice(User user, String ticker) {
        Map<String, BigDecimal> prices = fetchLatestPrices(user, java.util.Collections.singletonList(ticker));
        return prices.get(ticker);
    }

    // bulk quotes endpoint — one http call keeps the portfolio page under the 200 req/min limit
    public Map<String, BigDecimal> fetchLatestPrices(User user, java.util.Collection<String> tickers) {
        Map<String, BigDecimal> result = new HashMap<>();
        if (tickers == null || tickers.isEmpty()) return result;

        java.util.Set<String> unique = new java.util.LinkedHashSet<>();
        for (String t : tickers) {
            if (t != null && !t.isBlank()) unique.add(t.trim());
        }
        if (unique.isEmpty()) return result;

        String[] creds = resolveCreds(user);
        if (creds[0] == null || creds[0].isBlank()) return result;

        try {
            String symbols = String.join(",", unique);
            String url = "https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=" + symbols;
            HttpHeaders headers = new HttpHeaders();
            headers.set("APCA-API-KEY-ID", creds[0]);
            headers.set("APCA-API-SECRET-KEY", creds[1]);
            HttpEntity<Void> req = new HttpEntity<>(headers);
            ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, req, Map.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                Map<String, Object> quotes = (Map<String, Object>) resp.getBody().get("quotes");
                if (quotes != null) {
                    for (Map.Entry<String, Object> e : quotes.entrySet()) {
                        Map<String, Object> q = (Map<String, Object>) e.getValue();
                        if (q == null) continue;
                        Object ap = q.get("ap");
                        Object bp = q.get("bp");
                        Object p = q.get("p");
                        Object priceObj = p != null ? p : ap != null ? ap : bp;
                        if (priceObj != null) {
                            try { result.put(e.getKey(), new BigDecimal(priceObj.toString())); }
                            catch (NumberFormatException nfe) { }
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to fetch batch prices for {} tickers: {}", unique.size(), e.getMessage());
        }
        return result;
    }

    public Map<String, Object> getOrder(User user, String orderId) {
        String[] creds = resolveCreds(user);
        if (creds[0] == null || creds[0].isBlank()) return null;
        try {
            String url = baseUrl + "/orders/" + orderId;
            HttpHeaders headers = new HttpHeaders();
            headers.set("APCA-API-KEY-ID", creds[0]);
            headers.set("APCA-API-SECRET-KEY", creds[1]);
            HttpEntity<Void> req = new HttpEntity<>(headers);
            ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, req, Map.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                return (Map<String, Object>) resp.getBody();
            }
        } catch (Exception e) {
            log.warn("Failed to fetch order {}: {}", orderId, e.getMessage());
        }
        return null;
    }

    // polls up to ~5s for a terminal state, market orders typically fill in 1-2s
    public Map<String, Object> waitForOrderFill(User user, String orderId) {
        for (int i = 0; i < 10; i++) {
            Map<String, Object> order = getOrder(user, orderId);
            if (order == null) return null;
            Object status = order.get("status");
            if (status != null) {
                String s = status.toString();
                if ("filled".equals(s) || "partially_filled".equals(s)
                        || "canceled".equals(s) || "rejected".equals(s)
                        || "expired".equals(s)) {
                    return order;
                }
            }
            try { Thread.sleep(500); } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return order;
            }
        }
        // out of patience, return whatever we last saw
        return getOrder(user, orderId);
    }
}
