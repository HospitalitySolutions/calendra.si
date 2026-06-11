package com.example.app;

import com.example.app.course.BunnyProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableConfigurationProperties(BunnyProperties.class)
@EnableScheduling
public class CalendraApplication {
    public static void main(String[] args) {
        DotenvLoader.load();
        SpringApplication.run(CalendraApplication.class, args);
    }
}
