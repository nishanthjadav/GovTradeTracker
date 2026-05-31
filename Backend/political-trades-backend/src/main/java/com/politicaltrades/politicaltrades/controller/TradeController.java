package com.politicaltrades.politicaltrades.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.politicaltrades.politicaltrades.model.Trade;
import com.politicaltrades.politicaltrades.repository.TradeRepository;
import com.politicaltrades.politicaltrades.service.TradeIngestionService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/trades")
@RequiredArgsConstructor
@CrossOrigin(origins = "http://localhost:5173")
public class TradeController {

    private final TradeRepository tradeRepository;
    private final TradeIngestionService tradeIngestionService;

    @GetMapping
    public List<Trade> getAll() {
        return tradeRepository.findAllByOrderByDisclosureDateDesc();
    }

    @GetMapping("/politician/{name}")
    public List<Trade> getByPolitician(@PathVariable String name) {
        return tradeRepository.findByRepresentativeNameContainingIgnoreCaseOrderByDisclosureDateDesc(name);
    }

    @GetMapping("/unexecuted")
    public List<Trade> getUnexecuted() {
        return tradeRepository.findByExecutedFalseAndTickerIsNotNullOrderByDisclosureDateDesc();
    }

    @PostMapping("/ingest")
    public ResponseEntity<Map<String, Integer>> triggerIngest() {
        return ResponseEntity.ok(Map.of(
            "house",  tradeIngestionService.ingestHouseTrades(),
            "senate", tradeIngestionService.ingestSenateTrades()
        ));
    }
}
