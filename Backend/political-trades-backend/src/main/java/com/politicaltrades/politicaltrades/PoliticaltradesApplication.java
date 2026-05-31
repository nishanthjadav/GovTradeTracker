package com.politicaltrades.politicaltrades;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class PoliticaltradesApplication {

	public static void main(String[] args) {
		SpringApplication.run(PoliticaltradesApplication.class, args);
	}

}
