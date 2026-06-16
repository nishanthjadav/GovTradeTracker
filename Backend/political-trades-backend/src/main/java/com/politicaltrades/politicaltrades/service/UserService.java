package com.politicaltrades.politicaltrades.service;

import com.politicaltrades.politicaltrades.entity.User;
import com.politicaltrades.politicaltrades.repository.UserRepository;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User findOrCreateFromOidc(OidcUser oidcUser) {
        String sub = oidcUser.getSubject();
        String email = oidcUser.getEmail();
        String name = oidcUser.getFullName();
        String picture = oidcUser.getPicture();

        User user = userRepository.findByGoogleSub(sub).orElseGet(() -> {
            User u = new User();
            u.setGoogleSub(sub);
            u.setEmail(email);
            u.setName(name);
            u.setAvatarUrl(picture);
            return u;
        });

        if (email != null && !email.equals(user.getEmail())) user.setEmail(email);
        if (name != null && !name.equals(user.getName())) user.setName(name);
        if (picture != null && !picture.equals(user.getAvatarUrl())) user.setAvatarUrl(picture);
        user.setLastLoginAt(LocalDateTime.now());

        return userRepository.save(user);
    }

    public User requireByGoogleSub(String sub) {
        return userRepository.findByGoogleSub(sub)
            .orElseThrow(() -> new IllegalStateException("Authenticated user not found in DB: " + sub));
    }
}
