package com.example.app.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.auth.LoginAccount;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

class WorkspaceSchedulingLockServiceTest {
    @Test
    void locksGlobalLoginIdentityAndDistinctSpacesInStableOrder() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UserRepository users = mock(UserRepository.class);
        User consultant = new User();
        LoginAccount account = new LoginAccount();
        account.setId(90L);
        consultant.setLoginAccount(account);
        when(users.findByIdAndCompanyId(7L, 3L)).thenReturn(Optional.of(consultant));

        new WorkspaceSchedulingLockService(jdbc, users).lock(3L, 7L, List.of(12L, 4L, 12L));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, org.mockito.Mockito.times(3)).execute(sql.capture());
        assertThat(sql.getAllValues()).containsExactly(
                "select pg_advisory_xact_lock(" + WorkspaceSchedulingLockService.key(0x11L << 56, 90L) + ")",
                "select pg_advisory_xact_lock(" + WorkspaceSchedulingLockService.key(0x12L << 56, 4L) + ")",
                "select pg_advisory_xact_lock(" + WorkspaceSchedulingLockService.key(0x12L << 56, 12L) + ")"
        );
    }

    @Test
    void ignoresMissingResources() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UserRepository users = mock(UserRepository.class);

        new WorkspaceSchedulingLockService(jdbc, users).lock(null, null, List.of());

        verify(jdbc, org.mockito.Mockito.never()).execute(org.mockito.ArgumentMatchers.anyString());
    }
}
