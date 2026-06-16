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
        Object amtObj = body.get("amountPerTrade");
        java.math.BigDecimal amount = amtObj != null ? new java.math.BigDecimal(amtObj.toString()) : null;

        CopyConfig cfg = new CopyConfig();
        cfg.setUserId(user.getId());
        cfg.setPoliticianId(politicianId);
        cfg.setAmountPerTrade(amount);
        cfg.setActive(true);

        CopyConfig saved = copyConfigRepository.save(cfg);
        return ResponseEntity.ok(saved);
    }

    @GetMapping
    public ResponseEntity<List<CopyConfig>> list(@AuthenticationPrincipal OidcUser oidc) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        return ResponseEntity.ok(copyConfigRepository.findByUserId(user.getId()));
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
            if (body.containsKey("amountPerTrade") && body.get("amountPerTrade") != null) {
                cfg.setAmountPerTrade(new java.math.BigDecimal(body.get("amountPerTrade").toString()));
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
