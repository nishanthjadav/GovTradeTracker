package com.politicaltrades.politicaltrades.controller;

import com.politicaltrades.politicaltrades.entity.User;
import com.politicaltrades.politicaltrades.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me(@AuthenticationPrincipal OidcUser oidc) {
        if (oidc == null) return ResponseEntity.status(401).build();
        User user = userService.requireByGoogleSub(oidc.getSubject());
        Map<String, Object> body = new HashMap<>();
        body.put("id", user.getId());
        body.put("email", user.getEmail());
        body.put("name", user.getName());
        body.put("avatarUrl", user.getAvatarUrl());
        body.put("alpacaLinked", user.isAlpacaLinked());
        return ResponseEntity.ok(body);
    }
}
