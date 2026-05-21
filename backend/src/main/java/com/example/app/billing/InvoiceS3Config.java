package com.example.app.billing;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
public class InvoiceS3Config {

    @Bean
    @ConditionalOnProperty(prefix = "app.invoice-s3", name = "enabled", havingValue = "true")
    @ConditionalOnMissingBean(S3Client.class)
    public S3Client invoiceS3Client(@Value("${spring.cloud.aws.region.static:${AWS_REGION:eu-central-1}}") String region) {
        return S3Client.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }
}
