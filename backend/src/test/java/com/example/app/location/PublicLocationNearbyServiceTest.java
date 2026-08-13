package com.example.app.location;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PublicLocationNearbyServiceTest {
    @Test
    void haversineDistanceBetweenMariborAndLjubljanaIsReasonable() {
        double km = PublicLocationNearbyService.haversineKm(46.5547, 15.6459, 46.0569, 14.5058);
        assertThat(km).isBetween(103.0, 107.0);
    }
}
