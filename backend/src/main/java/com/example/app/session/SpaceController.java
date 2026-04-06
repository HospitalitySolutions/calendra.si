package com.example.app.session;

import com.example.app.user.User;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/spaces")
public class SpaceController {
    private final SpaceRepository repo;
    public SpaceController(SpaceRepository repo) { this.repo = repo; }
    @GetMapping public List<Space> list(@AuthenticationPrincipal User me) {
        return repo.findAllByCompanyId(me.getCompany().getId());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public Space create(@RequestBody Space s, @AuthenticationPrincipal User me) {
        s.setCompany(me.getCompany());
        return repo.save(s);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    public Space update(@PathVariable Long id, @RequestBody Space s, @AuthenticationPrincipal User me) {
        var existing = repo.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        existing.setName(s.getName());
        existing.setDescription(s.getDescription());
        return repo.save(existing);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var existing = repo.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        repo.delete(existing);
    }
}
