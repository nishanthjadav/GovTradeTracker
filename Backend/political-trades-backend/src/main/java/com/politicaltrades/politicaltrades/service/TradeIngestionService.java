package com.politicaltrades.politicaltrades.service;

import com.politicaltrades.politicaltrades.entity.CopyConfig;
import com.politicaltrades.politicaltrades.entity.ExecutedTrade;
import com.politicaltrades.politicaltrades.entity.Politician;
import com.politicaltrades.politicaltrades.entity.Trade;
import com.politicaltrades.politicaltrades.entity.User;
import com.politicaltrades.politicaltrades.repository.CopyConfigRepository;
import com.politicaltrades.politicaltrades.repository.ExecutedTradeRepository;
import com.politicaltrades.politicaltrades.repository.PoliticianRepository;
import com.politicaltrades.politicaltrades.repository.TradeRepository;
import com.politicaltrades.politicaltrades.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Shared save-and-copy logic used by both CapitolTradesScraper (server-side parse)
 * and IngestController (GitHub Actions push).
 */
@Service
public class TradeIngestionService {

    private static final Logger log = LoggerFactory.getLogger(TradeIngestionService.class);

    private final TradeRepository tradeRepository;
    private final PoliticianRepository politicianRepository;
    private final CopyConfigRepository copyConfigRepository;
    private final ExecutedTradeRepository executedTradeRepository;
    private final UserRepository userRepository;
    private final AlpacaService alpacaService;

    public TradeIngestionService(TradeRepository tradeRepository,
                                 PoliticianRepository politicianRepository,
                                 CopyConfigRepository copyConfigRepository,
                                 ExecutedTradeRepository executedTradeRepository,
                                 UserRepository userRepository,
                                 AlpacaService alpacaService) {
        this.tradeRepository = tradeRepository;
        this.politicianRepository = politicianRepository;
        this.copyConfigRepository = copyConfigRepository;
        this.executedTradeRepository = executedTradeRepository;
        this.userRepository = userRepository;
        this.alpacaService = alpacaService;
    }

    public enum SaveResult { NEW, DUPLICATE }

    public Politician getOrCreatePolitician(String id, String name, String party, String chamber, String state) {
        return politicianRepository.findById(id).orElseGet(() -> {
            Politician p = new Politician(id, name != null ? name : "Unknown", party, chamber, state);
            return politicianRepository.save(p);
        });
    }

    /** Saves the trade if new, then fires copy orders. Returns DUPLICATE if already stored. */
    public SaveResult saveAndCopy(Trade trade, Politician politician) {
        String capitolTradesId = trade.getCapitolTradesId();

        if (tradeRepository.existsByCapitolTradesId(capitolTradesId)) {
            return SaveResult.DUPLICATE;
        }

        trade.setPolitician(politician);
        tradeRepository.save(trade);

        try {
            fireCopyOrders(trade, politician, capitolTradesId);
        } catch (Exception e) {
            log.warn("Error processing copy configs for {}: {}", capitolTradesId, e.getMessage());
        }

        return SaveResult.NEW;
    }

    private void fireCopyOrders(Trade trade, Politician politician, String capitolTradesId) {
        if (trade.getTicker() == null) return;

        boolean isBuy  = "buy".equalsIgnoreCase(trade.getTradeType());
        boolean isSell = "sell".equalsIgnoreCase(trade.getTradeType());
        if (!isBuy && !isSell) {
            log.info("Unknown trade type '{}' for {} — skipping copy.", trade.getTradeType(), capitolTradesId);
            return;
        }

        String polId = politician.getId();
        List<CopyConfig> configs = copyConfigRepository.findByPoliticianIdAndActiveTrue(polId);
        if (configs == null || configs.isEmpty()) return;

        for (CopyConfig cfg : configs) {
            try {
                if (cfg.getCreatedAt() != null && trade.getPublishedDate() != null
                        && trade.getPublishedDate().isBefore(cfg.getCreatedAt().toLocalDate())) {
                    log.info("Skipping copy for user {} on {} {} — trade published {} predates config createdAt {}.",
                            cfg.getUserId(), trade.getTicker(), trade.getTradeType(),
                            trade.getPublishedDate(), cfg.getCreatedAt());
                    continue;
                }

                Integer mfd = cfg.getMaxFiledDays();
                if (mfd != null && mfd > 0 && trade.getFiledAfterDays() != null
                        && trade.getFiledAfterDays() > mfd) {
                    log.info("Skipping copy for user {} on {} {} — filed after {} days exceeds cap of {}.",
                            cfg.getUserId(), trade.getTicker(), trade.getTradeType(),
                            trade.getFiledAfterDays(), mfd);
                    continue;
                }

                if (executedTradeRepository.existsByUserIdAndCapitolTradesId(cfg.getUserId(), capitolTradesId)) {
                    log.info("Already executed copy for user {} on capitol trade {} — skipping.", cfg.getUserId(), capitolTradesId);
                    continue;
                }

                User cfgUser = userRepository.findById(cfg.getUserId()).orElse(null);

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
                    sharesQty = computeSellQty(positionQty, polId, trade);
                    if (sharesQty == null) {
                        log.info("Cannot determine sell proportion for {}/{} — skipping.", polId, trade.getTicker());
                        continue;
                    }
                    orderResult = alpacaService.placeMarketOrderByQty(cfgUser, trade.getTicker(), "sell", sharesQty);
                }

                if (orderResult == null || !orderResult.isSuccess()) {
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
                    catch (org.springframework.dao.DataIntegrityViolationException ignored) {}
                    continue;
                }

                java.util.Map<String, Object> filled = alpacaService.waitForOrderFill(cfgUser, orderResult.orderId);
                BigDecimal fillPrice = null;
                BigDecimal filledQty = null;
                String fillStatus = "pending";
                if (filled != null) {
                    Object fap = filled.get("filled_avg_price");
                    Object fq  = filled.get("filled_qty");
                    Object st  = filled.get("status");
                    if (fap != null) try { fillPrice  = new BigDecimal(fap.toString()); } catch (NumberFormatException ignored) {}
                    if (fq  != null) try { filledQty  = new BigDecimal(fq.toString());  } catch (NumberFormatException ignored) {}
                    if (st  != null) fillStatus = st.toString();
                }

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
                et.setAlpacaOrderId(orderResult.orderId);
                et.setStatus(fillStatus);
                try { executedTradeRepository.save(et); }
                catch (org.springframework.dao.DataIntegrityViolationException dup) {
                    log.warn("Race on ExecutedTrade for user {} capitol {} orderId={} — another worker beat us.",
                            cfg.getUserId(), capitolTradesId, orderResult.orderId);
                }

            } catch (Exception e) {
                log.warn("Failed to execute copy for politician {}: {}", polId, e.getMessage());
            }
        }
    }

    private BigDecimal computeSellQty(BigDecimal positionQty, String politicianId, Trade sellTrade) {
        List<Trade> politicianTrades = tradeRepository.findByPoliticianId(politicianId);
        long totalBuyMidpoint = politicianTrades.stream()
            .filter(t -> "buy".equalsIgnoreCase(t.getTradeType())
                      && sellTrade.getTicker().equalsIgnoreCase(t.getTicker()))
            .mapToLong(t -> {
                long max = t.getSizeMax() == Long.MAX_VALUE ? t.getSizeMin() * 2 : t.getSizeMax();
                return (t.getSizeMin() + max) / 2;
            })
            .sum();

        if (totalBuyMidpoint <= 0) return null;

        long sellMax = sellTrade.getSizeMax() == Long.MAX_VALUE ? sellTrade.getSizeMin() * 2 : sellTrade.getSizeMax();
        long sellMidpoint = (sellTrade.getSizeMin() + sellMax) / 2;
        if (sellMidpoint <= 0) return null;

        BigDecimal proportion = new BigDecimal(sellMidpoint)
            .divide(new BigDecimal(totalBuyMidpoint), 8, java.math.RoundingMode.HALF_UP)
            .min(BigDecimal.ONE);

        BigDecimal sellQty = positionQty.multiply(proportion).setScale(8, java.math.RoundingMode.HALF_DOWN);
        if (sellQty.compareTo(BigDecimal.ZERO) <= 0) return null;

        log.info("Sell copy {}: proportion={}, positionQty={}, sellQty={}",
                sellTrade.getTicker(), proportion, positionQty, sellQty);
        return sellQty;
    }
}
