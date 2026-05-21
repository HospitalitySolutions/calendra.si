package com.example.app.fiscal;

import java.io.InputStream;
import java.net.http.HttpClient;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.time.Duration;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

@Component
public class FiscalHttpClientConfig {
    private final ResourceLoader resourceLoader;
    private final FiscalCertificateRepository certificates;
    private final String trustCertificateLocations;

    public FiscalHttpClientConfig(
            ResourceLoader resourceLoader,
            FiscalCertificateRepository certificates,
            @Value("${app.fiscal.trust-certificate-locations:classpath:fiscal-certs/si-trust-root.crt,classpath:fiscal-certs/sigov-ca2.xcert.crt,classpath:fiscal-certs/blagajne-test.fu.gov.si.cer}")
            String trustCertificateLocations
    ) {
        this.resourceLoader = resourceLoader;
        this.certificates = certificates;
        this.trustCertificateLocations = trustCertificateLocations;
    }

    public HttpClient buildClient(Long companyId, String certificatePassword) {
        try {
            TrustManagerFactory trustManagerFactory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            trustManagerFactory.init(buildTrustStore());

            KeyManagerFactory keyManagerFactory = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            keyManagerFactory.init(buildClientKeyStore(companyId, certificatePassword), certificatePassword.toCharArray());

            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(keyManagerFactory.getKeyManagers(), trustManagerFactory.getTrustManagers(), new SecureRandom());

            return HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(15))
                    .sslContext(sslContext)
                    .version(HttpClient.Version.HTTP_1_1)
                    .build();
        } catch (Exception e) {
            throw new IllegalStateException("Unable to initialize fiscal HTTPS mTLS client.", e);
        }
    }

    private KeyStore buildClientKeyStore(Long companyId, String certificatePassword) throws Exception {
        if (certificatePassword == null || certificatePassword.isBlank()) {
            throw new IllegalStateException("Fiscal certificate password is missing.");
        }
        var cert = certificates.findByCompanyId(companyId)
                .orElseThrow(() -> new IllegalStateException("Fiscal certificate is not uploaded."));
        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        keyStore.load(new java.io.ByteArrayInputStream(cert.getCertificateData()), certificatePassword.toCharArray());
        return keyStore;
    }

    private KeyStore buildTrustStore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KeyStore.getDefaultType());
        keyStore.load(null, null);
        CertificateFactory certificateFactory = CertificateFactory.getInstance("X.509");

        int aliasIndex = 0;
        for (String location : trustCertificateLocations.split(",")) {
            String trimmedLocation = location == null ? "" : location.trim();
            if (trimmedLocation.isBlank()) {
                continue;
            }
            Resource resource = resourceLoader.getResource(trimmedLocation);
            if (!resource.exists()) {
                throw new IllegalStateException("Fiscal trust certificate not found: " + trimmedLocation);
            }
            try (InputStream in = resource.getInputStream()) {
                Certificate certificate = certificateFactory.generateCertificate(in);
                keyStore.setCertificateEntry("fiscal-ca-" + aliasIndex++, certificate);
            }
        }
        if (aliasIndex == 0) {
            throw new IllegalStateException("No fiscal trust certificates configured.");
        }
        return keyStore;
    }
}
