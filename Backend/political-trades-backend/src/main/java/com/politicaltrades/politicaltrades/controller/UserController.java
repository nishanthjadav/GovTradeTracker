package com.politicaltrades.politicaltrades.controller;

import com.politicaltrades.politicaltrades.entity.User;
import com.politicaltrades.politicaltrades.repository.UserRepository;
import com.politicaltrades.politicaltrades.service.CryptoService;
import com.politicaltrades.politicaltrades.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/me")
public class UserController {

    private final UserRepository userRepository;
    private final UserService userService;
    private final CryptoService cryptoService;

    public UserController(UserRepository userRepository, UserService userService, CryptoService cryptoService) {
        this.userRepository = userRepository;
        this.userService = userService;
        this.cryptoService = cryptoService;
    }

    @GetMapping("/alpaca/status")
    public ResponseEntity<Map<String, Object>> status(@AuthenticationPrincipal OidcUser oidc) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        Map<String, Object> body = new HashMap<>();
        body.put("linked", user.isAlpacaLinked());
        body.put("linkedAt", user.getAlpacaLinkedAt() != null
            ? user.getAlpacaLinkedAt().format(DateTimeFormatter.ISO_DATE_TIME) : null);
        body.put("maskedKey", user.getAlpacaKeyLast4() != null
            ? "••••••••" + user.getAlpacaKeyLast4() : null);
        return ResponseEntity.ok(body);
    }

    @PutMapping("/alpaca")
    public ResponseEntity<Map<String, Object>> link(@AuthenticationPrincipal OidcUser oidc,
                                                    @RequestBody Map<String, String> body) {
        String apiKey = body.get("apiKey");
        String apiSecret = body.get("apiSecret");
        if (apiKey == null || apiKey.isBlank() || apiSecret == null || apiSecret.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "apiKey and apiSecret required"));
        }

        User user = userService.requireByGoogleSub(oidc.getSubject());
        user.setAlpacaKeyEncrypted(cryptoService.encrypt(apiKey.trim()));
        user.setAlpacaSecretEncrypted(cryptoService.encrypt(apiSecret.trim()));
        user.setAlpacaKeyLast4(apiKey.length() >= 4 ? apiKey.substring(apiKey.length() - 4) : apiKey);
        user.setAlpacaLinkedAt(LocalDateTime.now());
        userRepository.save(user);

        return status(oidc);
    }

    @DeleteMapping("/alpaca")
    public ResponseEntity<Void> unlink(@AuthenticationPrincipal OidcUser oidc) {
        User user = userService.requireByGoogleSub(oidc.getSubject());
        user.setAlpacaKeyEncrypted(null);
        user.setAlpacaSecretEncrypted(null);
        user.setAlpacaKeyLast4(null);
        user.setAlpacaLinkedAt(null);
        userRepository.save(user);
        return ResponseEntity.noContent().build();
    }
}
