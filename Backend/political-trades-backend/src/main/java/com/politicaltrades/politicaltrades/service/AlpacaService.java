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

    public String placeMarketOrder(User user, String ticker, String side, BigDecimal notional) {
        String[] creds = resolveCreds(user);
        if (creds[0] == null || creds[0].isBlank()) {
            log.warn("No Alpaca credentials available; skipping order for {}", ticker);
            return null;
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
                return id != null ? id.toString() : null;
            }

            log.warn("Alpaca order failed: status {}", resp.getStatusCode().value());
            return null;
        } catch (Exception e) {
            log.error("Error placing alpaca order: {}", e.getMessage());
            return null;
        }
    }

    /** Sell by share quantity (required for sells — Alpaca rejects notional sells for fractional shares). */
    public String placeMarketOrderByQty(User user, String ticker, String side, BigDecimal qty) {
        String[] creds = resolveCreds(user);
        if (creds[0] == null || creds[0].isBlank()) {
            log.warn("No Alpaca credentials available; skipping order for {}", ticker);
            return null;
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
                return id != null ? id.toString() : null;
            }

            log.warn("Alpaca order failed: status {}", resp.getStatusCode().value());
            return null;
        } catch (Exception e) {
            log.error("Error placing alpaca order: {}", e.getMessage());
            return null;
        }
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

    /**
     * Returns the quantity of shares held for ticker, or null if no position exists.
     */
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
        String[] creds = resolveCreds(user);
        if (creds[0] == null || creds[0].isBlank()) return null;
        try {
            String url = "https://data.alpaca.markets/v2/stocks/" + ticker + "/quotes/latest";
            HttpHeaders headers = new HttpHeaders();
            headers.set("APCA-API-KEY-ID", creds[0]);
            headers.set("APCA-API-SECRET-KEY", creds[1]);
            HttpEntity<Void> req = new HttpEntity<>(headers);
            ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, req, Map.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                Map<String, Object> data = (Map<String, Object>) resp.getBody().get("quote");
                if (data == null) data = (Map) resp.getBody().get("data");
                if (data != null) {
                    Object ap = data.get("ap");
                    Object bp = data.get("bp");
                    Object p = data.get("p");
                    Object priceObj = p != null ? p : ap != null ? ap : bp;
                    if (priceObj != null) {
                        return new BigDecimal(priceObj.toString());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to fetch price for {}: {}", ticker, e.getMessage());
        }
        return null;
    }
}
