package com.politicaltrades.politicaltrades.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "google_sub", nullable = false, unique = true)
    private String googleSub;

    @Column(name = "email", nullable = false)
    private String email;

    @Column(name = "name")
    private String name;

    @Column(name = "avatar_url", length = 1024)
    private String avatarUrl;

    @Column(name = "alpaca_key_encrypted", length = 1024)
    private String alpacaKeyEncrypted;

    @Column(name = "alpaca_secret_encrypted", length = 1024)
    private String alpacaSecretEncrypted;

    @Column(name = "alpaca_key_last4", length = 8)
    private String alpacaKeyLast4;

    @Column(name = "alpaca_linked_at")
    private LocalDateTime alpacaLinkedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @PrePersist
    protected void onCreate() {
        if (this.createdAt == null) this.createdAt = LocalDateTime.now();
    }

    public User() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getGoogleSub() { return googleSub; }
    public void setGoogleSub(String googleSub) { this.googleSub = googleSub; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    public String getAlpacaKeyEncrypted() { return alpacaKeyEncrypted; }
    public void setAlpacaKeyEncrypted(String v) { this.alpacaKeyEncrypted = v; }

    public String getAlpacaSecretEncrypted() { return alpacaSecretEncrypted; }
    public void setAlpacaSecretEncrypted(String v) { this.alpacaSecretEncrypted = v; }

    public String getAlpacaKeyLast4() { return alpacaKeyLast4; }
    public void setAlpacaKeyLast4(String v) { this.alpacaKeyLast4 = v; }

    public LocalDateTime getAlpacaLinkedAt() { return alpacaLinkedAt; }
    public void setAlpacaLinkedAt(LocalDateTime v) { this.alpacaLinkedAt = v; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }

    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(LocalDateTime v) { this.lastLoginAt = v; }

    public boolean isAlpacaLinked() {
        return alpacaKeyEncrypted != null && !alpacaKeyEncrypted.isBlank();
    }
}
