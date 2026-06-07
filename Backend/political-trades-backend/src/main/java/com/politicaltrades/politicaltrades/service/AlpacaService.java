package com.politicaltrades.politicaltrades.service;

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

    @Value("${alpaca.api.key:}")
    private String apiKey;

    @Value("${alpaca.api.secret:}")
    private String apiSecret;

    @Value("${alpaca.base.url:https://paper-api.alpaca.markets/v2}")
    private String baseUrl;

    public String placeMarketOrder(String ticker, String side, BigDecimal notional) {
        try {
            String url = baseUrl + "/orders";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("APCA-API-KEY-ID", apiKey);
            headers.set("APCA-API-SECRET-KEY", apiSecret);

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

    public BigDecimal fetchLatestPrice(String ticker) {
        try {
            String url = "https://data.alpaca.markets/v2/stocks/" + ticker + "/quotes/latest";
            HttpHeaders headers = new HttpHeaders();
            headers.set("APCA-API-KEY-ID", apiKey);
            headers.set("APCA-API-SECRET-KEY", apiSecret);
            HttpEntity<Void> req = new HttpEntity<>(headers);
            ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, req, Map.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                Map<String, Object> data = (Map<String, Object>) resp.getBody().get("quote");
                if (data == null) data = (Map) resp.getBody().get("data");
                if (data != null) {
                    Object ap = data.get("ap"); // ask price
                    Object bp = data.get("bp"); // bid price
                    Object p = data.get("p");
                    // prefer p, fallback to ap
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
