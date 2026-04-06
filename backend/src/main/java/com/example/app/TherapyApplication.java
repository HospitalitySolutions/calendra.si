package com.example.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class TherapyApplication {
    public static void main(String[] args) {
        DotenvLoader.load();
        SpringApplication.run(TherapyApplication.class, args);
    }
}
