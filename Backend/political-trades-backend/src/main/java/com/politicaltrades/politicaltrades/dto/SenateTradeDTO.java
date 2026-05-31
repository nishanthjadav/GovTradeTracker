package com.politicaltrades.politicaltrades.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class SenateTradeDTO {
    @JsonProperty("senator")        private String senator;
    @JsonProperty("ticker")         private String ticker;
    @JsonProperty("asset_description") private String assetDescription;
    @JsonProperty("type")           private String type;
    @JsonProperty("amount")         private String amount;
    @JsonProperty("transaction_date") private String transactionDate;
    @JsonProperty("disclosure_date")  private String disclosureDate;
}
