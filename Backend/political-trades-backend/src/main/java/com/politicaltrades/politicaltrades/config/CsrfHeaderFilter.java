package com.politicaltrades.politicaltrades.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Lightweight CSRF defense: state-changing requests against authenticated
 * /api/ routes must include the X-Requested-With header. Cross-site attacker
 * pages cannot set custom headers without triggering a CORS preflight, and
 * our CorsConfigurationSource only allows the configured frontend origin —
 * so the only way this header lands on a request is if it originated from
 * our own frontend.
 */
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
        // Only enforce on our own authenticated API routes. OAuth callback
        // and logout have their own auth flow and shouldn't be blocked here.
        return path.startsWith("/api/copy-configs")
            || path.startsWith("/api/portfolio")
            || path.startsWith("/api/me")
            || path.startsWith("/api/scrape");
    }
}
