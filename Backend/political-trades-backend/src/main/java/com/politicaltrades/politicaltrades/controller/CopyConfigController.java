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
        java.math.BigDecimal percent = clampPercent(amtObj != null ? new java.math.BigDecimal(amtObj.toString()) : new java.math.BigDecimal("5"));
        Object mfdObj = body.get("maxFiledDays");
        Integer maxFiledDays = parseMaxFiledDays(mfdObj);
        // honor an explicit active flag (frontend creates a 0% newcomer paused);
        // default to active when unspecified.
        boolean active = body.get("active") != null
                ? Boolean.valueOf(body.get("active").toString())
                : true;

        // upsert to prevent strictmode/double-submit dupes
        CopyConfig existing = copyConfigRepository.findByUserIdAndPoliticianId(user.getId(), politicianId);
        if (existing != null) {
            return ResponseEntity.ok(existing);
        }

        CopyConfig cfg = new CopyConfig();
        cfg.setUserId(user.getId());
        cfg.setPoliticianId(politicianId);
        cfg.setPortfolioPercent(percent);
        cfg.setActive(active);
        cfg.setMaxFiledDays(maxFiledDays);

        try {
            CopyConfig saved = copyConfigRepository.save(cfg);
            return ResponseEntity.ok(saved);
        } catch (org.springframework.dao.DataIntegrityViolationException dup) {
            // lost the race, unique constraint kicked in, return the winner
            CopyConfig winner = copyConfigRepository.findByUserIdAndPoliticianId(user.getId(), politicianId);
            if (winner != null) return ResponseEntity.ok(winner);
            throw dup;
        }
    }

    @GetMapping
    public ResponseEntity<List<CopyConfig>> list(@AuthenticationPrincipal OidcUser oidc) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        List<CopyConfig> configs = copyConfigRepository.findByUserId(user.getId());

        // keep newest if dupes exist, legacy data from before the upsert fix
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
                cfg.setPortfolioPercent(clampPercent(new java.math.BigDecimal(body.get("portfolioPercent").toString())));
            }
            if (body.containsKey("active") && body.get("active") != null) {
                cfg.setActive(Boolean.valueOf(body.get("active").toString()));
            }
            if (body.containsKey("maxFiledDays")) {
                // explicit null clears the cap
                cfg.setMaxFiledDays(parseMaxFiledDays(body.get("maxFiledDays")));
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

    // never persist a negative allocation. 0 is allowed (paused semantics),
    // negatives are nonsense and would break the sum-to-100 invariant.
    private static java.math.BigDecimal clampPercent(java.math.BigDecimal pct) {
        if (pct == null) return new java.math.BigDecimal("5");
        return pct.compareTo(java.math.BigDecimal.ZERO) < 0 ? java.math.BigDecimal.ZERO : pct;
    }

    private static Integer parseMaxFiledDays(Object raw) {        if (raw == null) return null;
        String s = raw.toString().trim();
        if (s.isEmpty() || s.equalsIgnoreCase("null")) return null;
        try {
            int n = Integer.parseInt(s);
            if (n <= 0) return null;
            return Math.min(n, 365);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
