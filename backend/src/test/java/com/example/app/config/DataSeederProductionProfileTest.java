package com.example.app.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class DataSeederProductionProfileTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withInitializer(context -> context.getEnvironment().setActiveProfiles("production"))
            .withPropertyValues("spring.profiles.active=production")
            .withUserConfiguration(DataSeeder.class);

    @Test
    void dataSeederIsNotRegisteredWhenProductionProfileIsActive() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(DataSeeder.class);
        });
    }
}
