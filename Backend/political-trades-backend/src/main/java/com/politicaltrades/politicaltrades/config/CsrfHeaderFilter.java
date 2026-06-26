package com.politicaltrades.politicaltrades.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

// custom header forces a preflight, so cross-site forgeries get blocked by cors
@Component
public class CsrfHeaderFilter extends OncePerRequestFilter {

    private static final Set<String> MUTATING_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final String HEADER = "X-Requested-With";

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {

        if (requiresCheck(req) && req.getHeader(HEADER) == null) {
            res.setStatus(HttpServletResponse.SC_FORBIDDEN);
            res.setContentType("application/json");
            res.getWriter().write("{\"error\":\"missing_csrf_header\"}");
            return;
        }
        chain.doFilter(req, res);
    }

    private boolean requiresCheck(HttpServletRequest req) {
        if (!MUTATING_METHODS.contains(req.getMethod())) return false;
        String path = req.getRequestURI();
        if (path == null) return false;
        // oauth callback and logout have their own auth flow, don't block those
        return path.startsWith("/api/copy-configs")
            || path.startsWith("/api/portfolio")
            || path.startsWith("/api/me")
            || path.startsWith("/api/scrape");
    }
}
