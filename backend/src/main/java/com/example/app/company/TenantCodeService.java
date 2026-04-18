package com.example.app.company;

import java.util.Locale;
import org.springframework.stereotype.Service;

@Service
public class TenantCodeService {

    public String generate(Long companyId, String companyName) {
        if (companyId == null) {
            throw new IllegalArgumentException("companyId is required to generate tenant code");
        }
        String cleaned = companyName == null
                ? ""
                : companyName.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        String prefix = (cleaned + "XXX").substring(0, 3);
        return companyId + prefix;
    }
}
