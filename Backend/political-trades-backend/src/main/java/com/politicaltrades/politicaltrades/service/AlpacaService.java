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

    // on rejection, errorMessage carries alpaca's body so callers can persist why nothing happened
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
        } catch (Exception ignored) { /* fall through to raw body */ }
        return body.length() > 200 ? body.substring(0, 200) : body;
    }

    public BigDecimal getAccountEquity(User user) {
        String[] creds = resolveCreds(user);
        if (creds[0] == null || creds[0].isBlank()) return null;
        try {
            String url = baseUrl + "/account";
            HttpHeaders headers = new HttpHeaders();
            headers.set("APCA-API-KEY-ID", creds[0]);
            headers.set("APCA-API-SECRET-KEY", creds[1]);
            HttpEntity<Void> req = new HttpEntity<>(headers);
            ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, req, Map.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                Object equity = resp.getBody().get("equity");
                if (equity != null) return new BigDecimal(equity.toString());
            }
        } catch (Exception e) {
            log.warn("Failed to fetch account equity: {}", e.getMessage());
        }
        return null;
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
            // no position — expected
        } catch (Exception e) {
            log.warn("Failed to fetch position for {}: {}", ticker, e.getMessage());
        }
        return null;
    }

    public BigDecimal fetchLatestPrice(User user, String ticker) {
        Map<String, BigDecimal> prices = fetchLatestPrices(user, java.util.Collections.singletonList(ticker));
        return prices.get(ticker);
    }

    // bulk quotes endpoint — one http call for all tickers, keeps portfolio page under the 200 req/min limit
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
                            catch (NumberFormatException nfe) { /* ignore bad quote */ }
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

    // polls for up to ~5s waiting for a terminal state — market orders typically fill in 1-2s
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
        // out of patience — return whatever we last saw
        return getOrder(user, orderId);
    }
}
