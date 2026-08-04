package com.example.app.security;

import com.example.app.auth.LoginAccount;
import com.example.app.company.Company;
import com.example.app.user.User;
import com.example.app.workspace.Workspace;
import jakarta.servlet.http.HttpServletRequest;

public record UnitContext(LoginAccount loginAccount, User membership, Company unit, Workspace workspace) {
    public static final String REQUEST_ATTRIBUTE = UnitContext.class.getName();

    public static UnitContext from(HttpServletRequest request) {
        Object value = request.getAttribute(REQUEST_ATTRIBUTE);
        return value instanceof UnitContext context ? context : null;
    }
}
