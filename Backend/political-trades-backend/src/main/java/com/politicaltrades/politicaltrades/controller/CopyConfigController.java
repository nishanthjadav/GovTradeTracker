package com.politicaltrades.politicaltrades.controller;

import com.politicaltrades.politicaltrades.entity.CopyConfig;
import com.politicaltrades.politicaltrades.entity.User;
import com.politicaltrades.politicaltrades.repository.CopyConfigRepository;
import com.politicaltrades.politicaltrades.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/copy-configs")
public class CopyConfigController {

    private final CopyConfigRepository copyConfigRepository;
    private final UserService userService;

    public CopyConfigController(CopyConfigRepository copyConfigRepository, UserService userService) {
        this.copyConfigRepository = copyConfigRepository;
        this.userService = userService;
    }

    @PostMapping
    public ResponseEntity<CopyConfig> create(@AuthenticationPrincipal OidcUser oidc,
                                             @RequestBody Map<String, Object> body) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        String politicianId = (String) body.get("politicianId");
        Object amtObj = body.get("portfolioPercent");
        java.math.BigDecimal percent = amtObj != null ? new java.math.BigDecimal(amtObj.toString()) : new java.math.BigDecimal("5");

        // Upsert: if a config already exists for (user, politician), return it
        // instead of creating a duplicate row. Prevents StrictMode/double-submit
        // from creating ghost rows.
        CopyConfig existing = copyConfigRepository.findByUserIdAndPoliticianId(user.getId(), politicianId);
        if (existing != null) {
            return ResponseEntity.ok(existing);
        }

        CopyConfig cfg = new CopyConfig();
        cfg.setUserId(user.getId());
        cfg.setPoliticianId(politicianId);
        cfg.setPortfolioPercent(percent);
        cfg.setActive(true);

        CopyConfig saved = copyConfigRepository.save(cfg);
        return ResponseEntity.ok(saved);
    }

    @GetMapping
    public ResponseEntity<List<CopyConfig>> list(@AuthenticationPrincipal OidcUser oidc) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        List<CopyConfig> configs = copyConfigRepository.findByUserId(user.getId());

        // Defensive cleanup: if multiple configs exist for the same politician
        // (legacy data from before the upsert fix), keep the one with the highest
        // id and delete the rest.
        java.util.Map<String, CopyConfig> winners = new java.util.LinkedHashMap<>();
        java.util.List<CopyConfig> losers = new java.util.ArrayList<>();
        for (CopyConfig c : configs) {
            CopyConfig prev = winners.get(c.getPoliticianId());
            if (prev == null) {
                winners.put(c.getPoliticianId(), c);
            } else if (c.getId() > prev.getId()) {
                losers.add(prev);
                winners.put(c.getPoliticianId(), c);
            } else {
                losers.add(c);
            }
        }
        if (!losers.isEmpty()) {
            copyConfigRepository.deleteAll(losers);
        }
        return ResponseEntity.ok(new java.util.ArrayList<>(winners.values()));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<CopyConfig> patch(@AuthenticationPrincipal OidcUser oidc,
                                            @PathVariable Long id,
                                            @RequestBody Map<String, Object> body) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        return copyConfigRepository.findById(id).map(cfg -> {
            if (!cfg.getUserId().equals(user.getId())) {
                return ResponseEntity.status(403).<CopyConfig>build();
            }
            if (body.containsKey("portfolioPercent") && body.get("portfolioPercent") != null) {
                cfg.setPortfolioPercent(new java.math.BigDecimal(body.get("portfolioPercent").toString()));
            }
            if (body.containsKey("active") && body.get("active") != null) {
                cfg.setActive(Boolean.valueOf(body.get("active").toString()));
            }
            CopyConfig saved = copyConfigRepository.save(cfg);
            return ResponseEntity.ok(saved);
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal OidcUser oidc, @PathVariable Long id) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        return copyConfigRepository.findById(id).map(cfg -> {
            if (!cfg.getUserId().equals(user.getId())) {
                return ResponseEntity.status(403).<Void>build();
            }
            copyConfigRepository.deleteById(id);
            return ResponseEntity.noContent().<Void>build();
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }
}
