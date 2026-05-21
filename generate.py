from pathlib import Path
root = Path('/mnt/data/therapy-app')
files = {}

def add(path, content):
    files[path] = content.lstrip('\n')

add('README.md', '''
# Therapy Scheduling App

Monorepo MVP for a therapy/consulting scheduling platform.

## Stack
- Backend: Java 21, Spring Boot 3, Maven
- Frontend: React + Vite + TypeScript
- DB: PostgreSQL
- Auth: JWT + Google OAuth2 starter wiring
- Infra: Docker Compose

## What is included
- JWT login and `/me`
- Google OAuth2 wiring placeholder
- Role-based access control for `ADMIN` and `CONSULTANT`
- CRUD APIs for clients, consultants, spaces, session types, bookable slots, booked sessions, billing services and bills
- Settings API for toggling Spaces/Types and session length
- Weekly/daily calendar UI with session booking modal
- GDPR-oriented basics: soft operational hooks for delete/export, minimal logging of sensitive data, created/updated timestamps

## Important note on GDPR
No codebase alone makes a system "GDPR compliant". This starter includes technical support for privacy-by-design, but real compliance also needs:
- lawful basis and privacy notices
- retention policy
- DPA/subprocessor review
- access procedures
- backup/encryption/key management
- audit and incident handling

## Run
```bash
docker compose up --build
```

Frontend: http://localhost:3000
Backend: http://localhost:4000
Postgres: localhost:5432

Default admin seed:
- email: admin@example.com
- password: Admin123!

## Project structure
- `backend/` Spring Boot app
- `frontend/` React app
- `docker-compose.yml`
''')

add('.gitignore', '''
node_modules/
dist/
target/
.env
.idea/
.vscode/
''')

add('docker-compose.yml', '''
version: '3.9'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: therapy_app
      POSTGRES_USER: therapy
      POSTGRES_PASSWORD: therapy
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build:
      context: ./backend
    depends_on:
      - postgres
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/therapy_app
      SPRING_DATASOURCE_USERNAME: therapy
      SPRING_DATASOURCE_PASSWORD: therapy
      APP_JWT_SECRET: replace_this_with_a_long_random_secret_replace_in_prod
      APP_JWT_EXPIRATION_MS: 86400000
      APP_CORS_ALLOWED_ORIGINS: http://localhost:3000
      GOOGLE_CLIENT_ID: dummy-client-id
      GOOGLE_CLIENT_SECRET: dummy-client-secret
    ports:
      - "4000:4000"

  frontend:
    build:
      context: ./frontend
    depends_on:
      - backend
    ports:
      - "3000:3000"
    environment:
      VITE_API_URL: http://localhost:4000/api

volumes:
  postgres_data:
''')

# Backend files
add('backend/Dockerfile', '''
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/backend-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 4000
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
''')

add('backend/pom.xml', '''
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.4.4</version>
        <relativePath/>
    </parent>
    <groupId>com.example</groupId>
    <artifactId>backend</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>therapy-backend</name>
    <properties>
        <java.version>21</java.version>
        <jjwt.version>0.12.6</jjwt.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-oauth2-client</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-aop</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-api</artifactId>
            <version>${jjwt.version}</version>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-impl</artifactId>
            <version>${jjwt.version}</version>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-jackson</artifactId>
            <version>${jjwt.version}</version>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>2.8.5</version>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
''')

add('backend/src/main/resources/application.yml', '''
spring:
  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/therapy_app}
    username: ${SPRING_DATASOURCE_USERNAME:therapy}
    password: ${SPRING_DATASOURCE_PASSWORD:therapy}
  jpa:
    hibernate:
      ddl-auto: update
    open-in-view: false
    properties:
      hibernate:
        format_sql: true
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: ${GOOGLE_CLIENT_ID:}
            client-secret: ${GOOGLE_CLIENT_SECRET:}
            scope:
              - openid
              - profile
              - email
server:
  error:
    include-message: always

app:
  jwt:
    secret: ${APP_JWT_SECRET:dev-secret-change-me-dev-secret-change-me}
    expiration-ms: ${APP_JWT_EXPIRATION_MS:86400000}
  cors:
    allowed-origins: ${APP_CORS_ALLOWED_ORIGINS:http://localhost:3000}
''')

base_package = 'backend/src/main/java/com/example/app'

def j(path, content):
    add(f'{base_package}/{path}', content)

j('TherapyApplication.java', '''
package com.example.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class TherapyApplication {
    public static void main(String[] args) {
        SpringApplication.run(TherapyApplication.class, args);
    }
}
''')

j('common/BaseEntity.java', '''
package com.example.app.common;

import jakarta.persistence.Column;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@MappedSuperclass
public abstract class BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }
}
''')

j('user/Role.java', '''
package com.example.app.user;

public enum Role {
    ADMIN,
    CONSULTANT
}
''')

j('billing/TaxRate.java', '''
package com.example.app.billing;

import java.math.BigDecimal;

public enum TaxRate {
    VAT_0(new BigDecimal("0.00"), "0%"),
    VAT_9_5(new BigDecimal("0.095"), "9.5%"),
    VAT_22(new BigDecimal("0.22"), "22%"),
    NO_VAT(new BigDecimal("0.00"), "NO VAT");

    public final BigDecimal multiplier;
    public final String label;

    TaxRate(BigDecimal multiplier, String label) {
        this.multiplier = multiplier;
        this.label = label;
    }
}
''')

j('settings/SettingKey.java', '''
package com.example.app.settings;

public enum SettingKey {
    SPACES_ENABLED,
    TYPES_ENABLED,
    SESSION_LENGTH_MINUTES
}
''')

j('user/User.java', '''
package com.example.app.user;

import com.example.app.common.BaseEntity;
import com.example.app.session.Space;
import com.example.app.session.SessionType;
import jakarta.persistence.*;
import java.util.HashSet;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "users")
public class User extends BaseEntity {
    @Column(nullable = false)
    private String firstName;

    @Column(nullable = false)
    private String lastName;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(nullable = false)
    private boolean active = true;

    @ManyToMany
    @JoinTable(name = "user_spaces",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "space_id"))
    private Set<Space> spaces = new HashSet<>();

    @ManyToMany
    @JoinTable(name = "user_types",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "type_id"))
    private Set<SessionType> types = new HashSet<>();
}
''')

j('client/Client.java', '''
package com.example.app.client;

import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "clients")
public class Client extends BaseEntity {
    @Column(nullable = false)
    private String firstName;
    @Column(nullable = false)
    private String lastName;
    private String email;
    private String phone;

    @ManyToOne(optional = false)
    private User assignedTo;

    @OneToMany(mappedBy = "client", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PreferredSlot> preferredSlots = new ArrayList<>();
}
''')

j('client/PreferredSlot.java', '''
package com.example.app.client;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.ManyToOne;
import java.time.DayOfWeek;
import java.time.LocalTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
public class PreferredSlot extends BaseEntity {
    @ManyToOne(optional = false)
    private Client client;

    @Enumerated(EnumType.STRING)
    private DayOfWeek dayOfWeek;

    private LocalTime startTime;
    private LocalTime endTime;
}
''')

j('session/Space.java', '''
package com.example.app.session;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
public class Space extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String name;
    private String description;
}
''')

j('session/SessionType.java', '''
package com.example.app.session;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
public class SessionType extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String name;
    private String description;
}
''')

j('session/BookableSlot.java', '''
package com.example.app.session;

import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
public class BookableSlot extends BaseEntity {
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DayOfWeek dayOfWeek;

    @Column(nullable = false)
    private LocalTime startTime;

    @Column(nullable = false)
    private LocalTime endTime;

    @ManyToOne(optional = false)
    private User consultant;

    @Column(nullable = false)
    private boolean indefinite = true;

    private LocalDate startDate;
    private LocalDate endDate;
}
''')

j('session/SessionBooking.java', '''
package com.example.app.session;

import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
public class SessionBooking extends BaseEntity {
    @ManyToOne(optional = false)
    private Client client;

    @ManyToOne(optional = false)
    private User consultant;

    @Column(nullable = false)
    private LocalDateTime startTime;

    @Column(nullable = false)
    private LocalDateTime endTime;

    @ManyToOne
    private Space space;

    @ManyToOne
    private SessionType type;

    @Column(length = 1000)
    private String notes;
}
''')

j('billing/TransactionService.java', '''
package com.example.app.billing;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
public class TransactionService extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String code;
    @Column(nullable = false)
    private String description;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TaxRate taxRate;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal netPrice;
}
''')

j('billing/Bill.java', '''
package com.example.app.billing;

import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "bills")
public class Bill extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String billNumber;
    @ManyToOne(optional = false)
    private Client client;
    @ManyToOne(optional = false)
    private User consultant;
    @Column(nullable = false)
    private LocalDate issueDate;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal totalNet;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal totalGross;

    @OneToMany(mappedBy = "bill", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<BillItem> items = new ArrayList<>();
}
''')

j('billing/BillItem.java', '''
package com.example.app.billing;

import com.example.app.common.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
public class BillItem extends BaseEntity {
    @ManyToOne(optional = false)
    private Bill bill;
    @ManyToOne(optional = false)
    private TransactionService transactionService;
    @Column(nullable = false)
    private Integer quantity;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal netPrice;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal grossPrice;
}
''')

j('settings/AppSetting.java', '''
package com.example.app.settings;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "app_settings")
public class AppSetting extends BaseEntity {
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, unique = true)
    private SettingKey key;
    @Column(nullable = false)
    private String value;
}
''')

# Repositories
for name, pkg, entity in [
    ('UserRepository','user','User'),('ClientRepository','client','Client'),('SpaceRepository','session','Space'),
    ('SessionTypeRepository','session','SessionType'),('BookableSlotRepository','session','BookableSlot'),('SessionBookingRepository','session','SessionBooking'),
    ('TransactionServiceRepository','billing','TransactionService'),('BillRepository','billing','Bill'),('AppSettingRepository','settings','AppSetting')
]:
    extra=''
    if name=='UserRepository':
        extra='\n    Optional<User> findByEmailIgnoreCase(String email);\n'
    if name=='AppSettingRepository':
        extra='\n    Optional<AppSetting> findByKey(SettingKey key);\n'
    if name=='ClientRepository':
        extra='\n    List<Client> findByAssignedToId(Long userId);\n'
    if name=='BookableSlotRepository':
        extra='\n    List<BookableSlot> findByConsultantId(Long consultantId);\n'
    if name=='SessionBookingRepository':
        extra='\n    List<SessionBooking> findByConsultantId(Long consultantId);\n'
    imports = 'import java.util.List;\nimport java.util.Optional;\n' if 'Optional' in extra or 'List' in extra else ''
    if name=='AppSettingRepository':
        imports += 'import com.example.app.settings.SettingKey;\n'
    j(f'{pkg}/{name}.java', f'''
package com.example.app.{pkg};

import org.springframework.data.jpa.repository.JpaRepository;
{imports}
public interface {name} extends JpaRepository<{entity}, Long> {{{extra}}}
''')

# DTOs and mapper-ish simple responses
j('auth/AuthDtos.java', '''
package com.example.app.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public class AuthDtos {
    public record LoginRequest(@Email String email, @NotBlank String password) {}
    public record AuthResponse(String token, UserMeResponse user) {}
    public record UserMeResponse(Long id, String firstName, String lastName, String email, String role) {}
}
''')

j('security/JwtService.java', '''
package com.example.app.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.security.Key;
import java.util.Date;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
    @Value("${app.jwt.secret}")
    private String secret;

    @Value("${app.jwt.expiration-ms}")
    private long expirationMs;

    private Key signingKey() {
        byte[] keyBytes = secret.length() >= 32 ? secret.getBytes() : Decoders.BASE64.decode("ZmFrZWtleWZha2VrZXlmYWtla2V5ZmFrZWtleTEyMzQ1Njc4OTA=");
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateToken(String subject, String role) {
        var now = new Date();
        return Jwts.builder()
                .subject(subject)
                .claim("role", role)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expirationMs))
                .signWith(signingKey())
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser().verifyWith((javax.crypto.SecretKey) signingKey()).build().parseSignedClaims(token).getPayload();
    }
}
''')

j('security/JwtAuthenticationFilter.java', '''
package com.example.app.security;

import com.example.app.user.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        var header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith("Bearer ")) {
            try {
                var token = header.substring(7);
                var claims = jwtService.parse(token);
                var email = claims.getSubject();
                var user = userRepository.findByEmailIgnoreCase(email).orElse(null);
                if (user != null) {
                    var auth = new UsernamePasswordAuthenticationToken(
                            user,
                            null,
                            java.util.List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
                    );
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            } catch (Exception ignored) {
            }
        }
        filterChain.doFilter(request, response);
    }
}
''')

j('security/SecurityConfig.java', '''
package com.example.app.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(Customizer.withDefaults())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**", "/swagger-ui/**", "/v3/api-docs/**", "/actuator/health").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2Login(Customizer.withDefaults())
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        var config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
''')

j('config/DataSeeder.java', '''
package com.example.app.config;

import com.example.app.billing.TaxRate;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataSeeder implements CommandLineRunner {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AppSettingRepository settings;
    private final SessionTypeRepository types;
    private final TransactionServiceRepository txServices;

    public DataSeeder(UserRepository users, PasswordEncoder encoder, AppSettingRepository settings,
                      SessionTypeRepository types, TransactionServiceRepository txServices) {
        this.users = users;
        this.encoder = encoder;
        this.settings = settings;
        this.types = types;
        this.txServices = txServices;
    }

    @Override
    public void run(String... args) {
        users.findByEmailIgnoreCase("admin@example.com").orElseGet(() -> {
            var u = new User();
            u.setFirstName("System");
            u.setLastName("Admin");
            u.setEmail("admin@example.com");
            u.setPasswordHash(encoder.encode("Admin123!"));
            u.setRole(Role.ADMIN);
            return users.save(u);
        });
        seedSetting(SettingKey.SPACES_ENABLED, "true");
        seedSetting(SettingKey.TYPES_ENABLED, "true");
        seedSetting(SettingKey.SESSION_LENGTH_MINUTES, "60");
        if (types.findAll().stream().noneMatch(t -> t.getName().equalsIgnoreCase("THERAPY"))) {
            var type = new SessionType();
            type.setName("THERAPY");
            type.setDescription("Default therapy type");
            types.save(type);
        }
        if (txServices.findAll().isEmpty()) {
            var s = new TransactionService();
            s.setCode("CONSULT-001");
            s.setDescription("Consultation");
            s.setTaxRate(TaxRate.VAT_22);
            s.setNetPrice(new java.math.BigDecimal("50.00"));
            txServices.save(s);
        }
    }

    private void seedSetting(SettingKey key, String value) {
        if (settings.findByKey(key).isEmpty()) {
            var s = new AppSetting();
            s.setKey(key);
            s.setValue(value);
            settings.save(s);
        }
    }
}
''')

j('auth/AuthController.java', '''
package com.example.app.auth;

import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.security.JwtService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthController(UserRepository users, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @PostMapping("/login")
    public AuthDtos.AuthResponse login(@Valid @RequestBody AuthDtos.LoginRequest request) {
        var user = users.findByEmailIgnoreCase(request.email())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        return toAuthResponse(user);
    }

    @GetMapping("/me")
    public AuthDtos.UserMeResponse me(@AuthenticationPrincipal User user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return new AuthDtos.UserMeResponse(user.getId(), user.getFirstName(), user.getLastName(), user.getEmail(), user.getRole().name());
    }

    private AuthDtos.AuthResponse toAuthResponse(User user) {
        var token = jwtService.generateToken(user.getEmail(), user.getRole().name());
        return new AuthDtos.AuthResponse(token,
                new AuthDtos.UserMeResponse(user.getId(), user.getFirstName(), user.getLastName(), user.getEmail(), user.getRole().name()));
    }
}
''')

# helper/security current user util
j('security/SecurityUtils.java', '''
package com.example.app.security;

import com.example.app.user.Role;
import com.example.app.user.User;

public final class SecurityUtils {
    private SecurityUtils() {}

    public static boolean isAdmin(User user) {
        return user != null && user.getRole() == Role.ADMIN;
    }
}
''')

# Generic controllers for entities with simple DTOs omitted, direct entity exposure for MVP
j('settings/SettingsController.java', '''
package com.example.app.settings;

import java.util.Arrays;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {
    private final AppSettingRepository repository;

    public SettingsController(AppSettingRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public Map<String, String> all() {
        return repository.findAll().stream().collect(java.util.stream.Collectors.toMap(s -> s.getKey().name(), AppSetting::getValue));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping
    public Map<String, String> save(@RequestBody Map<String, String> payload) {
        Arrays.stream(SettingKey.values()).forEach(key -> {
            if (payload.containsKey(key.name())) {
                var s = repository.findByKey(key).orElseGet(AppSetting::new);
                s.setKey(key);
                s.setValue(payload.get(key.name()));
                repository.save(s);
            }
        });
        return all();
    }
}
''')

j('user/UserController.java', '''
package com.example.app.user;

import com.example.app.security.SecurityUtils;
import com.example.app.session.SessionBookingRepository;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserRepository repository;
    private final PasswordEncoder encoder;
    private final SessionBookingRepository bookings;

    public UserController(UserRepository repository, PasswordEncoder encoder, SessionBookingRepository bookings) {
        this.repository = repository;
        this.encoder = encoder;
        this.bookings = bookings;
    }

    public record UserRequest(String firstName, String lastName, @Email String email, String password, Role role) {}

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping
    public List<User> list() { return repository.findAll(); }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public User create(@RequestBody UserRequest req) {
        var u = new User();
        u.setFirstName(req.firstName());
        u.setLastName(req.lastName());
        u.setEmail(req.email());
        u.setPasswordHash(encoder.encode(req.password() == null || req.password().isBlank() ? "ChangeMe123!" : req.password()));
        u.setRole(req.role() == null ? Role.CONSULTANT : req.role());
        return repository.save(u);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    public User update(@PathVariable Long id, @RequestBody UserRequest req) {
        var u = repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        u.setFirstName(req.firstName());
        u.setLastName(req.lastName());
        u.setEmail(req.email());
        if (req.password() != null && !req.password().isBlank()) u.setPasswordHash(encoder.encode(req.password()));
        if (req.role() != null) u.setRole(req.role());
        return repository.save(u);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) { repository.deleteById(id); }

    @GetMapping("/{id}/bookings")
    public List<?> bookings(@PathVariable Long id, @AuthenticationPrincipal User me) {
        if (!SecurityUtils.isAdmin(me) && !me.getId().equals(id)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return bookings.findByConsultantId(id);
    }
}
''')

j('client/ClientController.java', '''
package com.example.app.client;

import com.example.app.security.SecurityUtils;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/clients")
public class ClientController {
    private final ClientRepository repository;
    private final UserRepository users;
    private final SessionBookingRepository bookings;

    public ClientController(ClientRepository repository, UserRepository users, SessionBookingRepository bookings) {
        this.repository = repository;
        this.users = users;
        this.bookings = bookings;
    }

    public record PreferredSlotRequest(DayOfWeek dayOfWeek, LocalTime startTime, LocalTime endTime) {}
    public record ClientRequest(String firstName, String lastName, String email, String phone, Long assignedToId, List<PreferredSlotRequest> preferredSlots) {}

    @GetMapping
    public List<Client> list(@AuthenticationPrincipal User me) {
        return SecurityUtils.isAdmin(me) ? repository.findAll() : repository.findByAssignedToId(me.getId());
    }

    @PostMapping
    public Client create(@RequestBody ClientRequest req, @AuthenticationPrincipal User me) {
        var c = new Client();
        apply(c, req, me);
        return repository.save(c);
    }

    @PutMapping("/{id}")
    public Client update(@PathVariable Long id, @RequestBody ClientRequest req, @AuthenticationPrincipal User me) {
        var c = repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !c.getAssignedTo().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        apply(c, req, me);
        return repository.save(c);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var c = repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !c.getAssignedTo().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        repository.delete(c);
    }

    @GetMapping("/{id}/bookings")
    public List<?> clientBookings(@PathVariable Long id) {
        return bookings.findAll().stream().filter(b -> b.getClient().getId().equals(id)).toList();
    }

    private void apply(Client c, ClientRequest req, User me) {
        c.setFirstName(req.firstName());
        c.setLastName(req.lastName());
        c.setEmail(req.email());
        c.setPhone(req.phone());
        var assigned = SecurityUtils.isAdmin(me)
                ? users.findById(req.assignedToId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant"))
                : me;
        c.setAssignedTo(assigned);
        c.getPreferredSlots().clear();
        if (req.preferredSlots() != null) {
            req.preferredSlots().forEach(ps -> {
                var slot = new PreferredSlot();
                slot.setClient(c);
                slot.setDayOfWeek(ps.dayOfWeek());
                slot.setStartTime(ps.startTime());
                slot.setEndTime(ps.endTime());
                c.getPreferredSlots().add(slot);
            });
        }
    }
}
''')

j('session/SpaceController.java', '''
package com.example.app.session;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/spaces")
public class SpaceController {
    private final SpaceRepository repo;
    public SpaceController(SpaceRepository repo) { this.repo = repo; }
    @GetMapping public List<Space> list() { return repo.findAll(); }
    @PreAuthorize("hasRole('ADMIN')") @PostMapping public Space create(@RequestBody Space s) { return repo.save(s); }
    @PreAuthorize("hasRole('ADMIN')") @PutMapping("/{id}") public Space update(@PathVariable Long id, @RequestBody Space s) { s.setId(id); return repo.save(s); }
    @PreAuthorize("hasRole('ADMIN')") @DeleteMapping("/{id}") public void delete(@PathVariable Long id) { repo.deleteById(id); }
}
''')

j('session/SessionTypeController.java', '''
package com.example.app.session;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/types")
public class SessionTypeController {
    private final SessionTypeRepository repo;
    public SessionTypeController(SessionTypeRepository repo) { this.repo = repo; }
    @GetMapping public List<SessionType> list() { return repo.findAll(); }
    @PreAuthorize("hasRole('ADMIN')") @PostMapping public SessionType create(@RequestBody SessionType s) { return repo.save(s); }
    @PreAuthorize("hasRole('ADMIN')") @PutMapping("/{id}") public SessionType update(@PathVariable Long id, @RequestBody SessionType s) { s.setId(id); return repo.save(s); }
    @PreAuthorize("hasRole('ADMIN')") @DeleteMapping("/{id}") public void delete(@PathVariable Long id) { repo.deleteById(id); }
}
''')

j('session/BookableSlotController.java', '''
package com.example.app.session;

import com.example.app.security.SecurityUtils;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/bookable-slots")
public class BookableSlotController {
    private final BookableSlotRepository repo;
    private final UserRepository users;

    public BookableSlotController(BookableSlotRepository repo, UserRepository users) {
        this.repo = repo;
        this.users = users;
    }

    public record Request(DayOfWeek dayOfWeek, LocalTime startTime, LocalTime endTime, Long consultantId, boolean indefinite, LocalDate startDate, LocalDate endDate) {}

    @GetMapping
    public List<BookableSlot> list(@AuthenticationPrincipal User me) {
        return SecurityUtils.isAdmin(me) ? repo.findAll() : repo.findByConsultantId(me.getId());
    }

    @PostMapping
    public BookableSlot create(@RequestBody Request req, @AuthenticationPrincipal User me) {
        var s = new BookableSlot();
        apply(s, req, me);
        return repo.save(s);
    }

    @PutMapping("/{id}")
    public BookableSlot update(@PathVariable Long id, @RequestBody Request req, @AuthenticationPrincipal User me) {
        var s = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !s.getConsultant().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        apply(s, req, me);
        return repo.save(s);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var s = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !s.getConsultant().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        repo.delete(s);
    }

    private void apply(BookableSlot s, Request req, User me) {
        s.setDayOfWeek(req.dayOfWeek());
        s.setStartTime(req.startTime());
        s.setEndTime(req.endTime());
        s.setIndefinite(req.indefinite());
        s.setStartDate(req.startDate());
        s.setEndDate(req.endDate());
        var consultant = SecurityUtils.isAdmin(me)
                ? users.findById(req.consultantId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST))
                : me;
        s.setConsultant(consultant);
    }
}
''')

j('session/SessionBookingController.java', '''
package com.example.app.session;

import com.example.app.client.ClientRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/bookings")
public class SessionBookingController {
    private final SessionBookingRepository repo;
    private final ClientRepository clients;
    private final UserRepository users;
    private final SpaceRepository spaces;
    private final SessionTypeRepository types;
    private final BookableSlotRepository bookableSlots;

    public SessionBookingController(SessionBookingRepository repo, ClientRepository clients, UserRepository users,
                                    SpaceRepository spaces, SessionTypeRepository types, BookableSlotRepository bookableSlots) {
        this.repo = repo;
        this.clients = clients;
        this.users = users;
        this.spaces = spaces;
        this.types = types;
        this.bookableSlots = bookableSlots;
    }

    public record BookingRequest(Long clientId, Long consultantId, LocalDateTime startTime, LocalDateTime endTime, Long spaceId, Long typeId, String notes) {}

    @GetMapping
    public List<SessionBooking> list(@AuthenticationPrincipal User me) {
        return SecurityUtils.isAdmin(me) ? repo.findAll() : repo.findByConsultantId(me.getId());
    }

    @PostMapping
    public SessionBooking create(@RequestBody BookingRequest req, @AuthenticationPrincipal User me) {
        validateNoConflict(req.spaceId(), req.startTime(), req.endTime(), null);
        var booking = new SessionBooking();
        apply(booking, req, me);
        return repo.save(booking);
    }

    @PutMapping("/{id}")
    public SessionBooking update(@PathVariable Long id, @RequestBody BookingRequest req, @AuthenticationPrincipal User me) {
        var booking = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !booking.getConsultant().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        validateNoConflict(req.spaceId(), req.startTime(), req.endTime(), id);
        apply(booking, req, me);
        return repo.save(booking);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var booking = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !booking.getConsultant().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        repo.delete(booking);
    }

    @GetMapping("/calendar")
    public Map<String, Object> calendar(@RequestParam LocalDate from, @RequestParam LocalDate to, @AuthenticationPrincipal User me) {
        var result = new HashMap<String, Object>();
        var bookings = list(me).stream().filter(b -> !b.getStartTime().toLocalDate().isBefore(from) && !b.getStartTime().toLocalDate().isAfter(to)).toList();
        var slots = (SecurityUtils.isAdmin(me) ? bookableSlots.findAll() : bookableSlots.findByConsultantId(me.getId())).stream()
                .filter(s -> s.isIndefinite() || (s.getStartDate() != null && s.getEndDate() != null && !(to.isBefore(s.getStartDate()) || from.isAfter(s.getEndDate()))))
                .toList();
        result.put("booked", bookings);
        result.put("bookable", slots);
        return result;
    }

    private void validateNoConflict(Long spaceId, LocalDateTime start, LocalDateTime end, Long excludeId) {
        if (spaceId == null) return;
        boolean conflict = repo.findAll().stream().anyMatch(existing ->
            existing.getSpace() != null
                && existing.getSpace().getId().equals(spaceId)
                && (excludeId == null || !existing.getId().equals(excludeId))
                && start.isBefore(existing.getEndTime())
                && end.isAfter(existing.getStartTime())
        );
        if (conflict) throw new ResponseStatusException(HttpStatus.CONFLICT, "A session already exists in this space at that time");
    }

    private void apply(SessionBooking booking, BookingRequest req, User me) {
        booking.setClient(clients.findById(req.clientId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid client")));
        booking.setConsultant(SecurityUtils.isAdmin(me)
                ? users.findById(req.consultantId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant"))
                : me);
        booking.setStartTime(req.startTime());
        booking.setEndTime(req.endTime());
        booking.setSpace(req.spaceId() == null ? null : spaces.findById(req.spaceId()).orElse(null));
        booking.setType(req.typeId() == null ? null : types.findById(req.typeId()).orElse(null));
        booking.setNotes(req.notes());
    }
}
''')

j('billing/BillingController.java', '''
package com.example.app.billing;

import com.example.app.client.ClientRepository;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/billing")
public class BillingController {
    private final TransactionServiceRepository txRepo;
    private final BillRepository billRepo;
    private final ClientRepository clients;
    private final UserRepository users;

    public BillingController(TransactionServiceRepository txRepo, BillRepository billRepo, ClientRepository clients, UserRepository users) {
        this.txRepo = txRepo;
        this.billRepo = billRepo;
        this.clients = clients;
        this.users = users;
    }

    public record BillItemRequest(Long transactionServiceId, Integer quantity, BigDecimal netPrice) {}
    public record BillRequest(Long clientId, Long consultantId, List<BillItemRequest> items) {}

    @GetMapping("/services") public List<TransactionService> services() { return txRepo.findAll(); }
    @PreAuthorize("hasRole('ADMIN')") @PostMapping("/services") public TransactionService createService(@RequestBody TransactionService s) { return txRepo.save(s); }
    @PreAuthorize("hasRole('ADMIN')") @PutMapping("/services/{id}") public TransactionService updateService(@PathVariable Long id, @RequestBody TransactionService s) { s.setId(id); return txRepo.save(s); }
    @PreAuthorize("hasRole('ADMIN')") @DeleteMapping("/services/{id}") public void deleteService(@PathVariable Long id) { txRepo.deleteById(id); }

    @GetMapping("/bills") public List<Bill> bills() { return billRepo.findAll(); }

    @PostMapping("/bills")
    public Bill createBill(@RequestBody BillRequest request, @AuthenticationPrincipal User me) {
        var bill = new Bill();
        bill.setBillNumber("INV-" + System.currentTimeMillis());
        bill.setClient(clients.findById(request.clientId()).orElseThrow());
        bill.setConsultant(request.consultantId() != null ? users.findById(request.consultantId()).orElseThrow() : me);
        bill.setIssueDate(LocalDate.now());

        BigDecimal totalNet = BigDecimal.ZERO;
        BigDecimal totalGross = BigDecimal.ZERO;
        for (var req : request.items()) {
            var tx = txRepo.findById(req.transactionServiceId()).orElseThrow();
            var item = new BillItem();
            item.setBill(bill);
            item.setTransactionService(tx);
            item.setQuantity(req.quantity());
            var net = req.netPrice() == null ? tx.getNetPrice() : req.netPrice();
            item.setNetPrice(net);
            var grossSingle = net.add(net.multiply(tx.getTaxRate().multiplier)).setScale(2, RoundingMode.HALF_UP);
            item.setGrossPrice(grossSingle.multiply(BigDecimal.valueOf(req.quantity())));
            totalNet = totalNet.add(net.multiply(BigDecimal.valueOf(req.quantity())));
            totalGross = totalGross.add(item.getGrossPrice());
            bill.getItems().add(item);
        }
        bill.setTotalNet(totalNet);
        bill.setTotalGross(totalGross);
        return billRepo.save(bill);
    }

    @GetMapping(value = "/bills/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> billPdf(@PathVariable Long id) {
        var bill = billRepo.findById(id).orElseThrow();
        String content = "Bill " + bill.getBillNumber() + "\\nClient: " + bill.getClient().getFirstName() + " " + bill.getClient().getLastName() + "\\nTotal gross: " + bill.getTotalGross();
        return ResponseEntity.ok(content.getBytes());
    }
}
''')

j('common/GlobalExceptionHandler.java', '''
package com.example.app.common;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> validation(MethodArgumentNotValidException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "Validation failed"));
    }
}
''')

# Frontend
add('frontend/Dockerfile', '''
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
''')

add('frontend/package.json', '''
{
  "name": "therapy-frontend",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@fullcalendar/core": "^6.1.17",
    "@fullcalendar/daygrid": "^6.1.17",
    "@fullcalendar/interaction": "^6.1.17",
    "@fullcalendar/react": "^6.1.17",
    "@fullcalendar/timegrid": "^6.1.17",
    "@tanstack/react-query": "^5.76.1",
    "axios": "^1.8.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.5.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.8.3",
    "vite": "^6.2.5"
  }
}
''')

add('frontend/tsconfig.json', '''
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
''')

add('frontend/vite.config.ts', '''
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: '0.0.0.0' }
})
''')

fsrc='frontend/src'

def f(path, content): add(f'{fsrc}/{path}', content)

f('main.tsx', '''
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

const qc = new QueryClient()
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
''')

f('api.ts', '''
import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
''')

f('auth.ts', '''
export type User = { id: number; firstName: string; lastName: string; email: string; role: 'ADMIN' | 'CONSULTANT' }
export const getStoredUser = (): User | null => {
  const raw = localStorage.getItem('user')
  return raw ? JSON.parse(raw) : null
}
''')

f('App.tsx', '''
import { Navigate, Route, Routes } from 'react-router-dom'
import { getStoredUser } from './auth'
import { LoginPage } from './pages/LoginPage'
import { Shell } from './components/Shell'
import { CalendarPage } from './pages/CalendarPage'
import { CrudPage } from './pages/CrudPage'
import { SettingsPage } from './pages/SettingsPage'
import { BillingPage } from './pages/BillingPage'

export default function App() {
  const user = getStoredUser()
  if (!user) return <LoginPage />

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/calendar" replace />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/sessions/booked" element={<CrudPage title="Booked Sessions" endpoint="/bookings" />} />
        <Route path="/sessions/bookable" element={<CrudPage title="Bookable Sessions" endpoint="/bookable-slots" />} />
        <Route path="/sessions/spaces" element={<CrudPage title="Spaces" endpoint="/spaces" />} />
        <Route path="/sessions/types" element={<CrudPage title="Types" endpoint="/types" />} />
        <Route path="/clients" element={<CrudPage title="Clients" endpoint="/clients" />} />
        <Route path="/consultants" element={<CrudPage title="Consultants" endpoint="/users" adminOnly />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Shell>
  )
}
''')

f('components/Shell.tsx', '''
import { PropsWithChildren, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'

export function Shell({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const user = getStoredUser()!
  const [settings, setSettings] = useState<Record<string, string>>({})

  useEffect(() => {
    api.get('/settings').then((r) => setSettings(r.data))
  }, [])

  const logout = () => {
    localStorage.clear()
    navigate('/')
    window.location.reload()
  }

  const showSpaces = settings.SPACES_ENABLED !== 'false'
  const showTypes = settings.TYPES_ENABLED !== 'false'

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>Calendra</h2>
        <p>{user.firstName} {user.lastName}<br />{user.role}</p>
        <nav>
          <NavLink to="/calendar">Calendar</NavLink>
          <div className="section">Sessions</div>
          <NavLink to="/sessions/booked">Booked</NavLink>
          <NavLink to="/sessions/bookable">Bookable</NavLink>
          {showSpaces && <NavLink to="/sessions/spaces">Spaces</NavLink>}
          {showTypes && <NavLink to="/sessions/types">Types</NavLink>}
          <NavLink to="/clients">Clients</NavLink>
          {user.role === 'ADMIN' && <NavLink to="/consultants">Consultants</NavLink>}
          <NavLink to="/billing">Billing</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <button onClick={logout}>Logout</button>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}
''')

f('pages/LoginPage.tsx', '''
import { useState } from 'react'
import { api } from '../api'

export function LoginPage() {
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('Admin123!')
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { data } = await api.post('/auth/login', { email, password })
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      window.location.reload()
    } catch (e) {
      setError('Invalid credentials')
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>Login</h1>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
        {error && <div className="error">{error}</div>}
        <button type="submit">Sign in</button>
        <a className="google-btn" href="http://localhost:4000/oauth2/authorization/google">Continue with Google</a>
      </form>
    </div>
  )
}
''')

f('pages/CalendarPage.tsx', '''
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'

export function CalendarPage() {
  const user = getStoredUser()!
  const [calendarData, setCalendarData] = useState<any>({ booked: [], bookable: [] })
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState({ clients: [], users: [], spaces: [], types: [] } as any)
  const [selection, setSelection] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [showAll, setShowAll] = useState(true)

  const load = async () => {
    const from = new Date(); from.setDate(from.getDate() - 7)
    const to = new Date(); to.setDate(to.getDate() + 21)
    const [c, s, clients, users, spaces, types] = await Promise.all([
      api.get('/bookings/calendar', { params: { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) } }),
      api.get('/settings'),
      api.get('/clients'),
      api.get('/users').catch(() => ({ data: [] })),
      api.get('/spaces'),
      api.get('/types'),
    ])
    setCalendarData(c.data)
    setSettings(s.data)
    setMeta({ clients: clients.data, users: users.data, spaces: spaces.data, types: types.data })
  }

  useEffect(() => { load() }, [])

  const events = useMemo(() => {
    const booked = (showAll || user.role !== 'ADMIN' ? calendarData.booked : calendarData.booked.filter((b:any)=>b.consultant.id===user.id)).map((b: any) => ({
      id: `b-${b.id}`,
      title: `${b.client.firstName} ${b.client.lastName}`,
      start: b.startTime,
      end: b.endTime,
      color: 'red',
      extendedProps: { ...b, kind: 'booked' }
    }))
    const bookable = (showAll || user.role !== 'ADMIN' ? calendarData.bookable : calendarData.bookable.filter((s:any)=>s.consultant.id===user.id)).flatMap((s: any) => {
      const out = []
      const now = new Date()
      for (let i = 0; i < 21; i++) {
        const d = new Date(now)
        d.setDate(d.getDate() + i)
        if (d.getDay() === ([7,1,2,3,4,5,6][s.dayOfWeek === 'SUNDAY' ? 0 : ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'].indexOf(s.dayOfWeek)+1]) % 7) {
          const date = d.toISOString().slice(0,10)
          out.push({
            id: `s-${s.id}-${date}`,
            title: `Available - ${s.consultant.firstName}`,
            start: `${date}T${s.startTime}`,
            end: `${date}T${s.endTime}`,
            color: 'green',
            extendedProps: { ...s, kind: 'bookable', date }
          })
        }
      }
      return out
    })
    return [...booked, ...bookable]
  }, [calendarData, user, showAll])

  const sessionLength = Number(settings.SESSION_LENGTH_MINUTES || 60)

  const saveBooking = async () => {
    await api.post('/bookings', form)
    setSelection(null)
    await load()
  }

  return (
    <div>
      <div className="page-header">
        <h1>Calendar</h1>
        {user.role === 'ADMIN' && <label><input type="checkbox" checked={showAll} onChange={(e)=>setShowAll(e.target.checked)} /> All sessions</label>}
      </div>
      <div className="card">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: 'today prev,next', center: 'title', right: 'timeGridWeek,timeGridDay' }}
          slotDuration="00:30:00"
          selectable
          events={events}
          select={(info) => {
            const start = info.startStr
            const end = new Date(new Date(start).getTime() + sessionLength*60000).toISOString()
            setSelection({ start, end })
            setForm({
              clientId: meta.clients[0]?.id,
              consultantId: user.id,
              startTime: start,
              endTime: end,
              spaceId: meta.spaces[0]?.id,
              typeId: meta.types[0]?.id,
              notes: ''
            })
          }}
          eventClick={(info) => {
            alert(JSON.stringify(info.event.extendedProps, null, 2))
            if (info.event.extendedProps.kind === 'bookable') {
              const start = info.event.start?.toISOString()
              const end = info.event.end?.toISOString()
              setSelection({ start, end })
              setForm({
                clientId: meta.clients[0]?.id,
                consultantId: info.event.extendedProps.consultant.id,
                startTime: start,
                endTime: end,
                spaceId: meta.spaces[0]?.id,
                typeId: meta.types[0]?.id,
                notes: ''
              })
            }
          }}
        />
      </div>
      {selection && (
        <div className="modal-backdrop" onClick={() => setSelection(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Book session</h3>
            <label>Client</label>
            <select value={form.clientId} onChange={(e)=>setForm({...form, clientId: Number(e.target.value)})}>{meta.clients.map((c:any)=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</select>
            {user.role === 'ADMIN' && <><label>Consultant</label><select value={form.consultantId} onChange={(e)=>setForm({...form, consultantId: Number(e.target.value)})}>{meta.users.map((u:any)=><option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</select></>}
            <label>Start</label><input type="datetime-local" value={form.startTime?.slice(0,16)} onChange={(e)=>setForm({...form, startTime: new Date(e.target.value).toISOString()})} />
            <label>End</label><input type="datetime-local" value={form.endTime?.slice(0,16)} onChange={(e)=>setForm({...form, endTime: new Date(e.target.value).toISOString()})} />
            {settings.SPACES_ENABLED !== 'false' && <><label>Space</label><select value={form.spaceId} onChange={(e)=>setForm({...form, spaceId: Number(e.target.value)})}>{meta.spaces.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></>}
            {settings.TYPES_ENABLED !== 'false' && <><label>Type</label><select value={form.typeId} onChange={(e)=>setForm({...form, typeId: Number(e.target.value)})}>{meta.types.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></>}
            <label>Notes</label><textarea value={form.notes || ''} onChange={(e)=>setForm({...form, notes: e.target.value})} />
            <div className="row gap"><button onClick={saveBooking}>Book</button><button className="secondary" onClick={()=>setSelection(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
''')

f('pages/CrudPage.tsx', '''
import { useEffect, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'

export function CrudPage({ title, endpoint, adminOnly = false }: { title: string; endpoint: string; adminOnly?: boolean }) {
  const user = getStoredUser()!
  const [rows, setRows] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [json, setJson] = useState('{}')

  const load = async () => {
    if (adminOnly && user.role !== 'ADMIN') return
    const { data } = await api.get(endpoint)
    setRows(data)
  }
  useEffect(() => { load() }, [endpoint])

  if (adminOnly && user.role !== 'ADMIN') return <div className="card">Not allowed.</div>

  const filtered = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(query.toLowerCase()))

  const save = async () => {
    await api.post(endpoint, JSON.parse(json))
    setJson('{}')
    load()
  }

  return (
    <div>
      <div className="page-header"><h1>{title}</h1></div>
      <div className="grid-two">
        <div className="card">
          <input placeholder="Search/filter" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Data</th></tr></thead>
              <tbody>
                {filtered.map((r) => <tr key={r.id}><td>{r.id}</td><td><pre>{JSON.stringify(r, null, 2)}</pre></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Create item</h3>
          <p>For speed, this MVP uses JSON input. Replace with dedicated forms per entity.</p>
          <textarea rows={20} value={json} onChange={(e)=>setJson(e.target.value)} />
          <button onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
''')

f('pages/SettingsPage.tsx', '''
import { useEffect, useState } from 'react'
import { api } from '../api'

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  useEffect(() => { api.get('/settings').then((r)=>setSettings(r.data)) }, [])
  const save = async () => { const { data } = await api.put('/settings', settings); setSettings(data) }
  return (
    <div className="card settings-form">
      <h1>Settings</h1>
      <label><input type="checkbox" checked={settings.SPACES_ENABLED === 'true'} onChange={(e)=>setSettings({...settings, SPACES_ENABLED: String(e.target.checked)})} /> Spaces ON/OFF</label>
      <label><input type="checkbox" checked={settings.TYPES_ENABLED === 'true'} onChange={(e)=>setSettings({...settings, TYPES_ENABLED: String(e.target.checked)})} /> Types ON/OFF</label>
      <label>Session length (minutes)</label>
      <input type="number" value={settings.SESSION_LENGTH_MINUTES || '60'} onChange={(e)=>setSettings({...settings, SESSION_LENGTH_MINUTES: e.target.value})} />
      <button onClick={save}>Save</button>
    </div>
  )
}
''')

f('pages/BillingPage.tsx', '''
import { useEffect, useState } from 'react'
import { api } from '../api'

export function BillingPage() {
  const [services, setServices] = useState<any[]>([])
  const [bills, setBills] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [form, setForm] = useState<any>({ items: [] })

  const load = async () => {
    const [s, b, c, u] = await Promise.all([
      api.get('/billing/services'), api.get('/billing/bills'), api.get('/clients'), api.get('/users').catch(()=>({data:[]}))
    ])
    setServices(s.data); setBills(b.data); setClients(c.data); setUsers(u.data)
  }
  useEffect(() => { load() }, [])

  const createBill = async () => { await api.post('/billing/bills', form); load() }

  return (
    <div className="grid-two">
      <div className="card">
        <h1>Transaction services</h1>
        <pre>{JSON.stringify(services, null, 2)}</pre>
      </div>
      <div className="card">
        <h1>Create bill</h1>
        <label>Client</label>
        <select onChange={(e)=>setForm({...form, clientId: Number(e.target.value)})}><option>Select</option>{clients.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</select>
        <label>Consultant</label>
        <select onChange={(e)=>setForm({...form, consultantId: Number(e.target.value)})}><option>Select</option>{users.map(u=><option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</select>
        <label>Items JSON</label>
        <textarea rows={10} value={JSON.stringify(form.items || [], null, 2)} onChange={(e)=>setForm({...form, items: JSON.parse(e.target.value || '[]')})} />
        <button onClick={createBill}>Create bill</button>
      </div>
      <div className="card" style={{gridColumn: '1 / -1'}}>
        <h2>Bills</h2>
        <pre>{JSON.stringify(bills, null, 2)}</pre>
      </div>
    </div>
  )
}
''')

f('styles.css', '''
:root { font-family: Inter, Arial, sans-serif; color: #111827; background: #f3f4f6; }
* { box-sizing: border-box; }
body { margin: 0; }
a { color: inherit; text-decoration: none; }
.layout { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
.sidebar { background: #111827; color: white; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
.sidebar nav { display: flex; flex-direction: column; gap: 8px; }
.sidebar a { padding: 10px 12px; border-radius: 8px; color: #d1d5db; }
.sidebar a.active, .sidebar a:hover { background: #1f2937; color: white; }
.section { margin-top: 8px; font-size: 12px; text-transform: uppercase; color: #9ca3af; }
.content { padding: 24px; }
.card { background: white; border-radius: 16px; padding: 20px; box-shadow: 0 8px 28px rgba(0,0,0,0.06); }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.login-wrap { min-height: 100vh; display:flex; align-items:center; justify-content:center; }
.login { width: 360px; display:flex; flex-direction:column; gap: 12px; }
input, select, textarea, button { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px; font: inherit; }
button { background: #2563eb; color: white; cursor: pointer; border: none; }
button.secondary { background: #6b7280; }
.google-btn { display: inline-block; text-align: center; padding: 10px 12px; background: #fff; border: 1px solid #d1d5db; border-radius: 10px; }
.error { color: #b91c1c; }
.grid-two { display:grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.table-wrap { overflow: auto; max-height: 70vh; }
pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; background: #f9fafb; padding: 10px; border-radius: 10px; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; }
.modal { width: 420px; background:#fff; border-radius: 16px; padding: 20px; display:flex; flex-direction:column; gap:8px; }
.row.gap { display:flex; gap: 10px; }
.settings-form { max-width: 500px; display:flex; flex-direction:column; gap: 12px; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .grid-two { grid-template-columns: 1fr; } }
''')

for path, content in files.items():
    p = root / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)
print(f'Wrote {len(files)} files')
