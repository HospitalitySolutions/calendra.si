package com.example.app.admin;

import com.example.app.user.User;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * Lightweight staff-presence tracker used by Platform Admin tenant cards.
 *
 * <p>Presence is intentionally separate from authentication-session lifetime: a valid login can live for much
 * longer than an open/active Calendra browser. The frontend therefore sends a small heartbeat while the app shell
 * is mounted. Redis stores the latest heartbeat per login account and tenant, which works across multiple backend
 * nodes. A small in-memory fallback keeps local development usable when Redis is not running.</p>
 */
@Service
public class TenantPresenceService {
    private static final Logger log = LoggerFactory.getLogger(TenantPresenceService.class);

    /** A user is considered online if the latest heartbeat is newer than this. */
    public static final Duration ACTIVE_WINDOW = Duration.ofMinutes(2);
    private static final Duration REDIS_KEY_TTL = Duration.ofHours(24);
    private static final String REDIS_KEY_PREFIX = "calendra:presence:tenant:";

    private final ObjectProvider<StringRedisTemplate> redisProvider;
    private final Map<Long, Map<Long, Long>> localPresence = new ConcurrentHashMap<>();

    public TenantPresenceService(ObjectProvider<StringRedisTemplate> redisProvider) {
        this.redisProvider = redisProvider;
    }

    public void markActive(User user) {
        if (user == null || user.getCompany() == null || user.getCompany().getId() == null) {
            return;
        }
        Long companyId = user.getCompany().getId();
        Long userKey = user.getLoginAccount() != null && user.getLoginAccount().getId() != null
                ? user.getLoginAccount().getId()
                : user.getId();
        if (userKey == null) {
            return;
        }

        long now = Instant.now().toEpochMilli();
        localPresence.computeIfAbsent(companyId, ignored -> new ConcurrentHashMap<>()).put(userKey, now);
        pruneLocal(now - REDIS_KEY_TTL.toMillis());

        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null) {
            return;
        }
        try {
            String key = redisKey(companyId);
            redis.opsForZSet().add(key, Long.toString(userKey), now);
            redis.opsForZSet().removeRangeByScore(key, 0, now - REDIS_KEY_TTL.toMillis());
            redis.expire(key, REDIS_KEY_TTL);
        } catch (RuntimeException ex) {
            log.debug("Could not update Redis tenant presence; using local fallback. companyId={}", companyId, ex);
        }
    }

    public Map<Long, Integer> activeUserCounts(Collection<Long> companyIds) {
        if (companyIds == null || companyIds.isEmpty()) {
            return Collections.emptyMap();
        }

        long cutoff = Instant.now().minus(ACTIVE_WINDOW).toEpochMilli();
        Map<Long, Integer> counts = new HashMap<>();
        StringRedisTemplate redis = redisProvider.getIfAvailable();

        for (Long companyId : companyIds) {
            if (companyId == null) {
                continue;
            }
            Integer count = null;
            if (redis != null) {
                try {
                    Long redisCount = redis.opsForZSet().count(redisKey(companyId), cutoff, Double.MAX_VALUE);
                    if (redisCount != null) {
                        count = Math.toIntExact(redisCount);
                    }
                } catch (RuntimeException ex) {
                    log.debug("Could not read Redis tenant presence; using local fallback. companyId={}", companyId, ex);
                }
            }
            if (count == null) {
                count = localActiveCount(companyId, cutoff);
            }
            counts.put(companyId, count);
        }
        return counts;
    }

    private int localActiveCount(Long companyId, long cutoff) {
        Map<Long, Long> users = localPresence.get(companyId);
        if (users == null || users.isEmpty()) {
            return 0;
        }
        users.entrySet().removeIf(entry -> entry.getValue() == null || entry.getValue() < cutoff);
        if (users.isEmpty()) {
            localPresence.remove(companyId, users);
            return 0;
        }
        return users.size();
    }

    private void pruneLocal(long cutoff) {
        localPresence.forEach((companyId, users) -> {
            users.entrySet().removeIf(entry -> entry.getValue() == null || entry.getValue() < cutoff);
            if (users.isEmpty()) {
                localPresence.remove(companyId, users);
            }
        });
    }

    private String redisKey(Long companyId) {
        return REDIS_KEY_PREFIX + companyId;
    }
}
