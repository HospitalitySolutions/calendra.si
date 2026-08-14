package com.example.app.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class LocalTestUserBootstrapProductionProfileTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withInitializer(context -> context.getEnvironment().setActiveProfiles("production"))
            .withPropertyValues(
                    "spring.profiles.active=production",
                    "app.local-test-user.enabled=true"
            )
            .withUserConfiguration(LocalTestUserBootstrap.class);

    @Test
    void localTestUserBootstrapIsNotRegisteredWhenProductionProfileIsActive() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(LocalTestUserBootstrap.class);
        });
    }
}
