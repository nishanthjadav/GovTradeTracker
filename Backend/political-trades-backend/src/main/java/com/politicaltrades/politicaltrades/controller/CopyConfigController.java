package com.politicaltrades.politicaltrades.controller;

import com.politicaltrades.politicaltrades.entity.CopyConfig;
import com.politicaltrades.politicaltrades.repository.CopyConfigRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/api/copy-configs")
public class CopyConfigController {

    private final CopyConfigRepository copyConfigRepository;

    public CopyConfigController(CopyConfigRepository copyConfigRepository) {
        this.copyConfigRepository = copyConfigRepository;
    }

    @PostMapping
    public ResponseEntity<CopyConfig> create(@RequestBody Map<String, Object> body) {
        String sessionId = (String) body.get("sessionId");
        String politicianId = (String) body.get("politicianId");
        Object amtObj = body.get("amountPerTrade") != null ? body.get("amountPerTrade") : body.get("amountPerTrade") ;
        java.math.BigDecimal amount = amtObj != null ? new java.math.BigDecimal(amtObj.toString()) : null;

        CopyConfig cfg = new CopyConfig();
        cfg.setSessionId(sessionId);
        cfg.setPoliticianId(politicianId);
        cfg.setAmountPerTrade(amount);
        cfg.setActive(true);

        CopyConfig saved = copyConfigRepository.save(cfg);
        return ResponseEntity.ok(saved);
    }

    @GetMapping
    public ResponseEntity<List<CopyConfig>> list(@RequestParam String sessionId) {
        List<CopyConfig> list = copyConfigRepository.findBySessionId(sessionId);
        return ResponseEntity.ok(list);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<CopyConfig> patch(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        return copyConfigRepository.findById(id).map(cfg -> {
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
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!copyConfigRepository.existsById(id)) return ResponseEntity.notFound().build();
        copyConfigRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
