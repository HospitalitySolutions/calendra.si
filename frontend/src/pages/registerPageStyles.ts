export const registerPageStyles = `
    .register-flow {
      --bg1: #f8fbff;
      --bg2: #eef4ff;
      --panel: rgba(255,255,255,0.78);
      --panel-strong: #ffffff;
      --border: #dfe8f7;
      --text: #17253d;
      --muted: #6f7f98;
      --blue: #2f6df6;
      --blue-dark: #2054d4;
      --blue-soft: #ebf2ff;
      --blue-pressed: #1f56d7;
      --gold-soft: #fff4d7;
      --gold-text: #8a6200;
      --green-soft: #eafaf0;
      --green-text: #1f8b4c;
      --disabled: #bcc7d8;
      --shadow: 0 16px 40px rgba(42, 85, 165, 0.12);
      --radius-xl: 28px;
      --radius-lg: 22px;
      --radius-md: 16px;
      --radius-sm: 12px;
      --transition: 180ms ease;
      /* Register shell max width on large screens. */
      --max-width: 1920px;
      --register-gutter: max(12px, env(safe-area-inset-left, 0px));
      --register-gutter-right: max(12px, env(safe-area-inset-right, 0px));
    }

    .register-flow * { box-sizing: border-box; }

    .register-flow {
      margin: 0;
      padding: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 15% 18%, rgba(74, 131, 255, 0.12), transparent 24%),
        radial-gradient(circle at 85% 55%, rgba(74, 131, 255, 0.10), transparent 20%),
        linear-gradient(180deg, var(--bg1), var(--bg2));
      min-height: 100vh;
      min-height: 100dvh;
      overflow-x: clip;
    }

    .register-flow {
      padding-top: 0;
      padding-right: var(--register-gutter-right);
      padding-bottom: max(28px, env(safe-area-inset-bottom, 0px));
      padding-left: var(--register-gutter);
    }

    /* Main column is not a separate card; panels carry their own surfaces. */
    .register-flow .app {
      width: 100%;
      max-width: var(--max-width);
      margin: 0 auto;
      background: transparent;
      border: 0;
      backdrop-filter: none;
      border-radius: 0;
      box-shadow: none;
      overflow: visible;
      min-width: 0;
    }

    .register-flow .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px 16px;
      padding: max(12px, calc(8px + env(safe-area-inset-top, 0px))) 0 10px;
      border-bottom: 1px solid rgba(223, 232, 247, 0.75);
      background: rgba(255, 255, 255, 0.42);
    }

    /* Flush upper panel (not the top cap of the main card); safe-area lives in topbar padding. */
    .register-flow > .topbar {
      width: 100%;
      max-width: var(--max-width);
      margin: 0 auto;
      flex-shrink: 0;
      border-radius: 0;
    }

    .register-flow > .topbar + .app {
      border-radius: 0;
      margin-top: 0;
    }

    .register-flow .topbar .brand {
      flex: 0 1 auto;
      min-width: 0;
    }

    .register-flow .register-brand-link {
      display: inline-flex;
      align-items: center;
      width: auto;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      box-shadow: none;
      cursor: pointer;
      transition: opacity var(--transition);
    }

    .register-flow .register-brand-link:hover,
    .register-flow .register-brand-link:active {
      background: transparent;
      box-shadow: none;
      transform: none;
      opacity: 0.9;
    }

    .register-flow .register-brand-link:focus-visible {
      outline: 3px solid rgba(47, 109, 246, 0.24);
      outline-offset: 4px;
      background: transparent;
      box-shadow: none;
    }

    .register-flow .brand-logo {
      display: block;
      width: min(100%, 360px);
      height: auto;
      max-height: 64px;
      object-fit: contain;
    }

    .register-flow .top-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .register-flow .lang-switch {
      display: inline-flex;
      align-items: stretch;
      padding: 3px;
      gap: 0;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.8) inset;
    }

    .register-flow .lang-switch-btn {
      margin: 0;
      border: none;
      background: transparent;
      padding: 7px 14px;
      border-radius: 999px;
      font: inherit;
      font-size: 0.9rem;
      font-weight: 800;
      color: var(--muted);
      cursor: pointer;
      transition: background var(--transition), color var(--transition);
    }

    .register-flow .lang-switch-btn:hover {
      color: var(--text);
    }

    .register-flow .lang-switch-btn:focus-visible {
      outline: 2px solid var(--blue);
      outline-offset: 2px;
    }

    .register-flow .lang-switch-btn.active {
      background: var(--blue-soft);
      color: var(--blue);
    }

    .register-flow .content {
      padding: 4px 0 clamp(200px, 32vh, 320px);
      min-width: 0;
    }

    .register-flow:has(.register-fixed-footer.is-expanded) .content {
      padding-bottom: clamp(320px, 58vh, 560px);
    }

    .register-flow .register-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .register-flow .register-stepper-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-start;
      gap: 10px 14px;
      margin-bottom: 4px;
    }

    @media (min-width: 900px) {
      .register-flow .register-stepper-row {
        flex-wrap: nowrap;
      }
    }

    .register-flow .stepper {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px;
      background: rgba(255,255,255,0.78);
      border: 1px solid var(--border);
      border-radius: 999px;
      flex: 0 0 auto;
    }

    .register-flow .step {
      padding: 10px 15px;
      border-radius: 999px;
      color: var(--muted);
      font-weight: 800;
      font-size: 0.95rem;
    }

    .register-flow .step.active {
      background: var(--blue-soft);
      color: var(--blue);
    }

    .register-flow .layout {
      display: grid;
      /* Packages/add-ons left (wider), “What’s included” right */
      grid-template-columns: minmax(0, 1.22fr) minmax(0, 1fr);
      grid-template-rows: auto auto;
      gap: 4px 22px;
      align-items: start;
      min-width: 0;
    }

    .register-flow .layout > .register-stepper-row {
      grid-column: 1 / -1;
      grid-row: 1;
      margin-bottom: 0;
    }

    .register-flow .layout > .left-panel {
      grid-column: 2;
      grid-row: 2;
    }

    .register-flow .layout > .right-panel {
      grid-column: 1;
      grid-row: 2;
    }

    .register-flow .panel {
      background: var(--panel);
      border: 1px solid rgba(223, 232, 247, 0.95);
      border-radius: var(--radius-xl);
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 28px rgba(58, 89, 150, 0.06);
    }

    .register-flow .left-panel {
      padding: 24px;
      position: sticky;
      top: 24px;
      min-width: 0;
    }

    .register-flow .right-panel {
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-width: 0;
    }

    .register-flow h2 {
      margin: 0 0 8px;
      font-size: 1.65rem;
      letter-spacing: -0.04em;
    }

    .register-flow .panel-copy {
      margin: 0 0 18px;
      color: var(--muted);
      line-height: 1.5;
    }

    .register-flow .billing-toggle-wrap {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px 10px;
      margin: 0;
    }

    .register-flow .billing-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.88);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.45);
    }

    .register-flow .billing-option {
      border: 0;
      background: transparent;
      color: var(--muted);
      border-radius: 999px;
      padding: 11px 16px;
      font-size: 0.95rem;
      font-weight: 900;
      cursor: pointer;
      transition: all var(--transition);
    }

    .register-flow .billing-option.active {
      background: linear-gradient(90deg, var(--blue), var(--blue-dark));
      color: #fff;
      box-shadow: 0 10px 22px rgba(47, 109, 246, 0.18);
    }

    .register-flow .annual-save {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--green-soft);
      color: var(--green-text);
      font-size: 0.84rem;
      font-weight: 900;
    }

    .register-flow .selected-box {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      background: var(--panel-strong);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px 18px;
      margin-bottom: 16px;
    }

    .register-flow .selected-box strong {
      display: block;
      font-size: 1.05rem;
      margin-bottom: 4px;
    }

    .register-flow .selected-meta {
      font-size: 0.92rem;
      color: var(--muted);
      line-height: 1.45;
    }

    .register-flow .selected-price-block {
      text-align: right;
      white-space: nowrap;
    }

    .register-flow .selected-price {
      font-size: 1.5rem;
      font-weight: 900;
      letter-spacing: -0.05em;
      color: var(--blue-dark);
      display: block;
    }

    .register-flow .selected-subprice {
      margin-top: 4px;
      color: var(--muted);
      font-size: 0.86rem;
      display: block;
    }

    .register-flow .feature-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 10px;
    }

    .register-flow .feature-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid #edf2fb;
      background: rgba(255,255,255,0.64);
      color: var(--disabled);
      transition: transform var(--transition), background var(--transition), border-color var(--transition), color var(--transition), box-shadow var(--transition);
    }

    .register-flow .feature-item .icon {
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: #f1f4fa;
      color: #aab5ca;
      font-size: 0.86rem;
      font-weight: 800;
      transition: inherit;
    }

    .register-flow .feature-item .meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .register-flow .feature-item .name {
      font-weight: 700;
      transition: inherit;
    }

    .register-flow .feature-item .desc {
      margin-top: 2px;
      font-size: 0.9rem;
      color: inherit;
      opacity: 0.95;
    }

    .register-flow .feature-item.enabled {
      color: var(--text);
      background: rgba(233, 241, 255, 0.88);
      border-color: #cfe0ff;
      box-shadow: 0 8px 20px rgba(47, 109, 246, 0.10);
    }

    @media (hover: hover) and (pointer: fine) {
      .register-flow .feature-item.enabled {
        transform: translateX(3px);
      }
    }

    .register-flow .feature-item.enabled .icon {
      background: rgba(47, 109, 246, 0.12);
      color: var(--blue);
    }

    .register-flow .feature-item.enabled .name {
      font-weight: 900;
    }

    .register-flow .plans-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }

    .register-flow .plan-card {
      position: relative;
      display: flex;
      flex-direction: column;
      min-height: 100%;
      padding: 22px 18px 18px;
      border-radius: 24px;
      border: 1px solid var(--border);
      background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(246,249,255,0.92));
      box-shadow: 0 10px 24px rgba(47, 109, 246, 0.06);
      cursor: pointer;
      transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition), background var(--transition);
    }

    .register-flow .plan-card:hover, .register-flow .plan-card:focus-visible, .register-flow .plan-card.active {
      transform: translateY(-4px);
      box-shadow: 0 18px 36px rgba(47, 109, 246, 0.16);
      border-color: #c7d8ff;
      outline: none;
    }

    .register-flow .plan-card.recommended {
      border: 1.5px solid #b7ceff;
      background: linear-gradient(180deg, #ffffff, #eef4ff);
    }

    .register-flow .plan-card.active {
      background: linear-gradient(180deg, #ffffff, #ebf2ff);
    }

    .register-flow .badge-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 12px;
      min-height: 28px;
      flex-wrap: wrap;
    }

    .register-flow .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 7px 11px;
      font-size: 0.82rem;
      font-weight: 900;
      line-height: 1;
    }

    .register-flow .badge.soft { background: var(--blue-soft); color: var(--blue); }
    .register-flow .badge.gold { background: var(--gold-soft); color: var(--gold-text); }
    .register-flow .badge.green { background: var(--green-soft); color: var(--green-text); }

    .register-flow .plan-name {
      margin: 0 0 8px;
      font-size: 1.65rem;
      font-weight: 900;
      letter-spacing: -0.05em;
    }

    .register-flow .price-stack {
      display: grid;
      gap: 6px;
      margin-bottom: 10px;
    }

    .register-flow .price-row {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      flex-wrap: wrap;
    }

    .register-flow .price {
      font-size: 2.35rem;
      font-weight: 900;
      letter-spacing: -0.07em;
      line-height: 0.95;
    }

    .register-flow .per {
      margin-bottom: 4px;
      color: var(--muted);
      font-weight: 800;
    }

    .register-flow .old-price {
      color: var(--muted);
      text-decoration: line-through;
      font-weight: 800;
      font-size: 1rem;
      margin-bottom: 4px;
    }

    .register-flow .price-note {
      min-height: 36px;
      color: var(--muted);
      font-size: 0.88rem;
      line-height: 1.35;
    }

    .register-flow .trial-note {
      color: var(--green-text);
      font-weight: 800;
    }

    .register-flow .mini-points {
      display: grid;
      gap: 10px;
      margin-bottom: 18px;
    }

    .register-flow .mini-points div {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #41516f;
    }

    .register-flow .check {
      width: 22px;
      height: 22px;
      flex: 0 0 22px;
      display: inline-grid;
      place-items: center;
      border-radius: 999px;
      background: #edf5ff;
      color: #1e9d55;
      font-size: 0.85rem;
      font-weight: 900;
    }

    .register-flow .spacer { flex: 1; }

    .register-flow .plan-button {
      width: 100%;
      border-radius: 16px;
      padding: 14px 16px;
      font-size: 1rem;
      font-weight: 900;
      cursor: pointer;
      margin-top: auto;
      transition: filter var(--transition), transform var(--transition), background var(--transition), color var(--transition), border-color var(--transition);
    }

    .register-flow .plan-button.unselected {
      background: #fff;
      color: var(--blue);
      border: 1px solid #cfe0ff;
    }

    .register-flow .plan-button.selected {
      background: linear-gradient(90deg, var(--blue-pressed), var(--blue-dark));
      color: white;
      border: 1px solid transparent;
      box-shadow: 0 12px 24px rgba(47, 109, 246, 0.2);
    }

    .register-flow .addons, .register-flow .summary {
      padding: 18px;
      border-radius: 22px;
    }

    .register-flow .addons {
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.74);
    }

    .register-flow .summary {
      border: 1px solid #cfe0ff;
      background: linear-gradient(180deg, #ffffff, #edf4ff);
    }

    .register-flow .addons h3, .register-flow .summary h3 {
      margin: 0 0 8px;
      font-size: 1.08rem;
      letter-spacing: -0.03em;
    }

    .register-flow .addons p, .register-flow .summary p {
      margin: 0 0 14px;
      color: var(--muted);
      line-height: 1.45;
      font-size: 0.95rem;
    }

    .register-flow .addon-list {
      display: grid;
      gap: 10px;
    }

    .register-flow .addon-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: white;
      border: 1px solid #e8eef9;
      border-radius: 16px;
    }

    .register-flow .addon-item label {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      flex: 1;
      min-width: 0;
    }

    .register-flow .addon-item input { accent-color: var(--blue); }

    .register-flow .addon-meta {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .register-flow .addon-name { font-weight: 800; }
    .register-flow .addon-desc { color: var(--muted); font-size: 0.88rem; }
    .register-flow .addon-price { color: var(--blue-dark); font-weight: 900; white-space: nowrap; }

    .register-flow .summary-list {
      display: grid;
      gap: 10px;
      margin: 14px 0;
    }

    .register-flow .summary-row, .register-flow .summary-total {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .register-flow .summary-row {
      color: #42506a;
      font-size: 0.97rem;
    }

    .register-flow .summary-total {
      margin-top: 12px;
      padding-top: 14px;
      border-top: 1px solid #d8e5ff;
      font-size: 1.2rem;
      font-weight: 900;
      letter-spacing: -0.03em;
      align-items: flex-start;
    }

    .register-flow .summary-total-values {
      display: grid;
      justify-items: end;
      gap: 4px;
      text-align: right;
    }

    .register-flow #totalSubprice {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--muted);
      letter-spacing: 0;
    }

    .register-flow .summary-note {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(255,255,255,0.86);
      border: 1px solid rgba(207, 224, 255, 0.9);
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.4;
    }

    .register-flow .register-fixed-footer {
      position: fixed;
      left: 50%;
      right: auto;
      bottom: 0;
      width: min(calc(100% - var(--register-gutter) - var(--register-gutter-right)), var(--max-width));
      max-width: var(--max-width);
      margin-left: auto;
      margin-right: auto;
      transform: translateX(-50%);
      z-index: 100;
      padding: 14px 0 calc(14px + env(safe-area-inset-bottom, 0px));
      background: rgba(255, 255, 255, 0.96);
      border-top: 1px solid rgba(223, 232, 247, 0.95);
      backdrop-filter: blur(16px);
      box-shadow: 0 -12px 40px rgba(42, 85, 165, 0.12);
      border-radius: 0;
    }

    .register-flow .register-fixed-footer.is-expanded {
      box-shadow: 0 -16px 48px rgba(42, 85, 165, 0.14);
    }

    .register-flow .register-fixed-footer-inner.register-footer-panel {
      max-width: none;
      margin: 0;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .register-flow .register-footer-toolbar {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px 14px;
      flex-wrap: wrap;
    }

    .register-flow .register-footer-back {
      flex: 0 0 auto;
      min-width: 0;
    }

    .register-flow .register-footer-toolbar-lead {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      flex: 0 1 auto;
      min-width: 0;
    }

    .register-flow .register-footer-center-cluster {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 14px 20px;
      min-width: 0;
      flex: 1 1 auto;
    }

    .register-flow .register-footer-toolbar-mid {
      flex: 0 1 auto;
      min-width: 0;
      display: flex;
      justify-content: center;
    }

    @media (min-width: 721px) {
      .register-flow .register-footer-toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        grid-template-rows: auto;
        align-items: center;
        gap: 12px 16px;
        flex-wrap: unset;
      }

      .register-flow .register-footer-toolbar-lead {
        grid-column: 1;
        grid-row: 1;
        flex-direction: column;
        align-items: flex-start;
        align-self: center;
        justify-self: start;
        gap: 8px;
      }

      .register-flow .register-footer-center-cluster {
        grid-column: 2;
        grid-row: 1;
        flex: unset;
        justify-self: center;
        align-self: center;
        max-width: min(100%, 960px);
      }

      .register-flow .register-footer-continue {
        grid-column: 3;
        grid-row: 1;
        justify-self: end;
        align-self: center;
        margin-right: 12px;
      }
    }

    @media (min-width: 900px) {
      .register-flow .register-footer-toolbar {
        gap: 14px 20px;
      }
    }

    .register-flow .register-footer-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      max-width: min(100%, 560px);
      min-width: 0;
      padding: 10px 12px 10px 12px;
      border-radius: 999px;
      border: 1px solid #e2e9f4;
      background: linear-gradient(180deg, #f7f9fd, #ffffff);
      cursor: pointer;
      text-align: left;
      transition: border-color var(--transition), box-shadow var(--transition), background var(--transition);
      font: inherit;
      color: inherit;
    }

    .register-flow .register-footer-pill:hover {
      border-color: #c7d8ff;
      box-shadow: 0 6px 18px rgba(47, 109, 246, 0.08);
    }

    .register-flow .register-footer-pill-icon {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: rgba(47, 109, 246, 0.1);
      color: var(--blue);
    }

    .register-flow .register-footer-pill-svg {
      display: block;
    }

    .register-flow .register-footer-pill-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1 1 auto;
    }

    .register-flow .register-footer-pill-chevron {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 4px;
      padding: 2px 0 2px 4px;
      color: var(--blue);
    }

    .register-flow .register-footer-pill-total-inline {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
      gap: 0;
      flex: 0 0 auto;
      margin-left: 8px;
      padding-left: 12px;
      border-left: 1px solid #e2e9f4;
      text-align: right;
      min-width: 0;
    }

    .register-flow .register-footer-pill-total-inline .register-footer-total-label {
      font-size: 0.65rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      line-height: 1.2;
    }

    .register-flow .register-footer-pill-total-inline .register-footer-total-value {
      font-size: 1.1rem;
      font-weight: 900;
      letter-spacing: -0.04em;
      line-height: 1.1;
      color: var(--text);
    }

    .register-flow .register-footer-pill-title {
      font-size: 0.95rem;
      font-weight: 900;
      letter-spacing: -0.02em;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .register-flow .register-footer-pill-sub {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--muted);
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .register-flow .register-footer-chevron-svg {
      display: block;
    }

    .register-flow .register-footer-continue {
      flex: 0 0 auto;
    }

    .register-flow .register-footer-expanded {
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: register-footer-expand-in 0.22s ease;
    }

    @keyframes register-footer-expand-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .register-flow .register-footer-peek {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 16px 24px;
      flex-wrap: wrap;
      padding: 12px 16px;
      border-radius: 16px;
      border: 1px dashed #cfe0ff;
      background: rgba(247, 250, 255, 0.9);
    }

    .register-flow .register-footer-peek-col {
      flex: 1 1 140px;
      min-width: 0;
      text-align: center;
    }

    .register-flow .register-footer-peek-label {
      display: block;
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .register-flow .register-footer-peek-name {
      display: block;
      font-size: 1rem;
      font-weight: 900;
      letter-spacing: -0.03em;
      margin-bottom: 2px;
    }

    .register-flow .register-footer-peek-value {
      font-size: 0.9rem;
      font-weight: 800;
      color: var(--blue-dark);
    }

    .register-flow .register-footer-peek-plus {
      flex: 0 0 auto;
      font-size: 1.4rem;
      font-weight: 900;
      color: #bcc7d8;
      line-height: 1;
    }

    .register-flow .register-footer-detail-card {
      border: 1px solid #d8e5ff;
      border-radius: 18px;
      background: linear-gradient(180deg, #ffffff, #f4f8ff);
      padding: 16px 18px 14px;
      max-height: min(48vh, 380px);
      overflow-y: auto;
    }

    .register-flow .register-footer-detail-title {
      margin: 0 0 12px;
      font-size: 0.95rem;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: var(--text);
    }

    .register-flow .register-footer-detail-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .register-flow .register-footer-detail-row {
      display: grid;
      grid-template-columns: 22px 1fr auto;
      align-items: center;
      gap: 10px 12px;
      font-size: 0.92rem;
    }

    .register-flow .register-footer-detail-check {
      width: 22px;
      height: 22px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: var(--green-soft);
      color: var(--green-text);
      font-size: 0.75rem;
      font-weight: 900;
    }

    .register-flow .register-footer-detail-label {
      color: #42506a;
      min-width: 0;
    }

    .register-flow .register-footer-detail-price {
      font-weight: 900;
      color: var(--text);
      white-space: nowrap;
    }

    .register-flow .register-footer-detail-foot {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid #d8e5ff;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
    }

    .register-flow .register-footer-detail-total {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      text-align: right;
    }

    .register-flow .register-footer-detail-total-label {
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }

    .register-flow .register-footer-detail-total-value {
      font-size: 1.35rem;
      font-weight: 900;
      letter-spacing: -0.04em;
    }

    .register-flow .register-footer-save-badge {
      display: inline-flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--green-soft);
      color: var(--green-text);
      font-size: 0.82rem;
      font-weight: 900;
    }

    .register-flow .register-footer-hide-link {
      align-self: center;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 0;
      background: transparent;
      color: var(--blue);
      font-weight: 900;
      font-size: 0.92rem;
      cursor: pointer;
      font-family: inherit;
    }

    .register-flow .register-footer-hide-link:hover {
      text-decoration: underline;
    }

    .register-flow .back-link {
      border: 0;
      background: transparent;
      color: var(--muted);
      font-weight: 800;
      cursor: pointer;
      padding: 10px 0;
    }

    .register-flow .continue-button {
      border: 0;
      border-radius: 16px;
      padding: 15px 22px;
      background: linear-gradient(90deg, var(--blue), var(--blue-dark));
      color: white;
      font-weight: 900;
      font-size: 1rem;
      cursor: pointer;
      box-shadow: 0 12px 28px rgba(47, 109, 246, 0.18);
    }

    .register-flow .continue-button-scroll-hint {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 48px;
    }

    .register-flow .continue-button-scroll-hint .continue-button-scroll-chevron {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
    }

    .register-flow .continue-button-scroll-hint-text {
      font-weight: 900;
      font-size: 0.95rem;
      letter-spacing: -0.02em;
    }

    .register-flow .continue-button,
    .register-flow .plan-button,
    .register-flow .register-footer-pill,
    .register-flow .back-link,
    .register-flow .billing-option,
    .register-flow .lang-switch-btn {
      touch-action: manipulation;
    }

    @media (max-width: 1024px) {
      .register-flow {
        padding-top: 0;
        padding-right: var(--register-gutter-right);
        padding-bottom: max(16px, env(safe-area-inset-bottom, 0px));
        padding-left: var(--register-gutter);
      }

      .register-flow .topbar {
        padding-left: 0;
        padding-right: 0;
        padding-top: max(14px, calc(8px + env(safe-area-inset-top, 0px)));
        padding-bottom: 14px;
      }

      .register-flow .content {
        padding-left: 0;
        padding-right: 0;
      }

      .register-flow .register-plan-page-stack {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .register-flow .layout {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .register-flow .register-stepper-row {
        display: none;
      }

      .register-flow .left-panel {
        position: static;
        scroll-margin-top: 20px;
        width: 100%;
        max-width: none;
        box-sizing: border-box;
        padding-left: 0;
        padding-right: 0;
      }

      .register-flow .feature-list {
        width: 100%;
        max-width: none;
        grid-template-columns: minmax(0, 1fr);
      }

      .register-flow .feature-item {
        width: 100%;
        max-width: none;
        box-sizing: border-box;
      }

      .register-flow .feature-item .meta {
        flex: 1 1 auto;
        min-width: 0;
      }
    }

    @media (max-width: 960px) {
      .register-flow .plans-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 860px) {
      .register-flow {
        padding-top: 0;
        padding-right: var(--register-gutter-right);
        padding-bottom: max(8px, env(safe-area-inset-bottom, 0px));
        padding-left: var(--register-gutter);
      }

      .register-flow .app {
        max-width: none;
        width: 100%;
        margin: 0;
        border-radius: 0;
        border: 0;
        box-shadow: none;
        background: transparent;
        backdrop-filter: none;
      }

      .register-flow > .topbar {
        border-radius: 0;
      }

      .register-flow > .topbar + .app {
        border-radius: 0;
        margin-top: 0;
      }

      .register-flow .topbar {
        padding-left: 0;
        padding-right: 0;
        padding-top: max(12px, calc(6px + env(safe-area-inset-top, 0px)));
        padding-bottom: 12px;
      }

      .register-flow .content {
        padding-left: 0;
        padding-right: 0;
      }

      .register-flow .layout {
        gap: 0;
      }

      .register-flow .panel {
        border-radius: 0;
        border: 0;
        border-top: 1px solid rgba(223, 232, 247, 0.75);
        background: transparent;
        box-shadow: none;
        backdrop-filter: none;
      }

      .register-flow .right-panel {
        padding: 18px 0 20px;
        border-top: 0;
      }

      .register-flow .left-panel {
        padding-top: 16px;
        padding-bottom: 22px;
        padding-left: 0;
        padding-right: 0;
      }

      .register-flow .slider-section {
        margin-left: 0;
        margin-right: 0;
        padding-left: 0;
        padding-right: 0;
        border-radius: 0;
        border-left: 0;
        border-right: 0;
        background: rgba(255, 255, 255, 0.38);
        border-color: rgba(223, 232, 247, 0.85);
      }

      .register-flow .plans-grid {
        padding-left: 0;
        padding-right: 0;
      }

      .register-flow .billing-toggle-wrap {
        padding-left: 0;
        padding-right: 0;
        flex-direction: column;
        align-items: stretch;
      }

      .register-flow .billing-toggle {
        flex-direction: row;
        flex-wrap: nowrap;
        width: 100%;
        max-width: 100%;
      }

      .register-flow .billing-option {
        flex: 1 1 0;
        min-width: 0;
        width: auto;
      }

      .register-flow .right-panel .custom-cta--inline {
        display: none;
      }

      .register-flow .custom-cta--footer-toolbar {
        display: block;
        width: 100%;
        margin-left: 0;
        margin-right: 0;
        margin-top: 0;
        margin-bottom: 0;
        flex-shrink: 0;
      }

      .register-flow .selected-box {
        display: none;
      }

      .register-flow .feature-addons-section {
        padding-left: 0;
        padding-right: 0;
      }

      .register-flow .register-fixed-footer {
        left: 50%;
        right: auto;
        width: calc(100% - var(--register-gutter) - var(--register-gutter-right));
        max-width: none;
        margin-left: auto;
        margin-right: auto;
        transform: translateX(-50%);
        border-radius: 0;
        padding-left: 0;
        padding-right: 0;
        padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      }
      .register-flow .register-footer-back {
        display: none;
      }

      .register-flow .register-footer-toolbar {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
      }

      .register-flow .register-footer-toolbar-lead {
        width: 100%;
        flex-direction: column;
        align-items: stretch;
      }

      .register-flow .register-footer-center-cluster {
        flex-direction: row;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: stretch;
        width: 100%;
        gap: 0;
      }

      .register-flow .register-footer-toolbar-mid {
        flex: 1 1 auto;
        min-width: 0;
        justify-content: stretch;
      }

      .register-flow .register-footer-pill {
        width: 100%;
        max-width: none;
        flex-wrap: nowrap;
        box-sizing: border-box;
        padding-left: 10px;
        padding-right: 10px;
      }

      .register-flow .register-footer-pill-icon {
        margin-right: 0;
      }

      .register-flow .register-footer-pill-chevron {
        margin-left: 2px;
        padding-left: 2px;
        padding-right: 0;
        margin-right: 0;
      }

      .register-flow .register-footer-pill-total-inline {
        margin-left: 6px;
        padding-left: 10px;
      }

      .register-flow .register-footer-continue {
        width: 100%;
      }
    }

    @media (max-width: 560px) {
      .register-flow .content {
        padding-bottom: clamp(260px, 52vh, 420px);
      }
      .register-flow .panel {
        border-radius: 0;
      }
      .register-flow .brand-logo { width: min(100%, 240px); max-height: 52px; }
      .register-flow .selected-box { flex-direction: column; align-items: flex-start; }
      .register-flow .selected-price-block { text-align: left; }
      .register-flow .continue-button,
      .register-flow .plan-button {
        width: 100%;
      }

      .register-flow .billing-toggle {
        width: 100%;
        max-width: 100%;
        flex-direction: row;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: center;
      }

      .register-flow .billing-option {
        width: auto;
        flex: 1 1 0;
        min-width: 0;
        text-align: center;
      }
    }

    @media (max-width: 520px) {
      .register-flow .topbar {
        padding: 16px max(12px, env(safe-area-inset-right, 0px)) 16px max(12px, env(safe-area-inset-left, 0px));
      }
      .register-flow .content {
        padding-top: 22px;
        padding-bottom: clamp(200px, 42vh, 320px);
      }
    }

    @media (max-width: 480px) {
      .register-flow h2 {
        font-size: 1.28rem;
        letter-spacing: -0.03em;
      }
      .register-flow .plan-name {
        font-size: 1.32rem;
      }
      .register-flow .price {
        font-size: 1.9rem;
      }
      .register-flow .right-panel {
        padding: 16px 0 18px;
      }

      .register-flow .left-panel {
        padding-top: 14px;
        padding-bottom: 18px;
        padding-left: 0;
        padding-right: 0;
      }
      .register-flow .step {
        font-size: 0.8rem;
        padding: 8px 10px;
      }
      .register-flow .stepper {
        gap: 4px;
        padding: 4px;
      }
      .register-flow .register-footer-pill-title {
        font-size: 0.84rem;
      }
      .register-flow .register-footer-pill-sub {
        font-size: 0.72rem;
      }
      .register-flow .register-footer-pill-total-inline {
        margin-left: 6px;
        padding-left: 8px;
      }
      .register-flow .register-footer-pill-total-inline .register-footer-total-value {
        font-size: 0.98rem;
      }
      .register-flow .register-footer-pill-icon {
        width: 34px;
        height: 34px;
      }
      .register-flow .plan-card {
        padding: 16px 14px 14px;
        border-radius: 18px;
      }
      .register-flow .continue-button-scroll-hint-text {
        font-size: 0.84rem;
      }
      .register-flow .continue-button {
        font-size: 0.92rem;
        padding: 14px 16px;
      }
      .register-flow .annual-save {
        width: 100%;
        justify-content: center;
        text-align: center;
      }
      .register-flow .billing-toggle-wrap {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }
      .register-flow .feature-item .desc {
        font-size: 0.82rem;
      }
      .register-flow .slider-section {
        padding: 14px;
        border-radius: 18px;
      }
    }

    @media (max-width: 380px) {
      .register-flow .step {
        font-size: 0.72rem;
        padding: 7px 8px;
      }
      .register-flow .continue-button-scroll-hint {
        flex-direction: column;
        gap: 4px;
        min-height: auto;
        padding-top: 12px;
        padding-bottom: 12px;
      }
    }

    @media (hover: none) and (pointer: coarse) {
      .register-flow .plan-card:hover {
        transform: none;
        box-shadow: 0 10px 24px rgba(47, 109, 246, 0.06);
      }
      .register-flow .plan-card.active {
        box-shadow: 0 14px 30px rgba(47, 109, 246, 0.14);
      }
    }
  

.register-flow .custom-cta {
  display: block;
  width: 100%;
  text-align: center;
  padding: 12px 16px;
  margin-bottom: 14px;
  border-radius: 14px;
  border: 1px dashed #cfe0ff;
  background: linear-gradient(90deg, #f5f9ff, #ffffff);
  color: #2054d4;
  font-weight: 900;
  font-size: 0.95rem;
  text-decoration: none;
  transition: all 180ms ease;
  cursor: pointer;
  font-family: inherit;
}
.register-flow .custom-cta:hover {
  background: linear-gradient(90deg, #ebf2ff, #ffffff);
  border-color: #b7ceff;
  transform: translateY(-1px);
}

@media (max-width: 860px) {
  .register-flow .custom-cta.custom-cta--footer-toolbar {
    margin-bottom: 0;
  }
}

@media (min-width: 861px) {
  .register-flow .custom-cta--footer-toolbar {
    display: none;
  }

  .register-flow .register-footer-back {
    display: none;
  }

  .register-flow .register-footer-pill-icon {
    display: none;
  }
}

.register-flow .register-contact-modal-root {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
  box-sizing: border-box;
}

.register-flow .register-contact-modal-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  padding: 0;
  margin: 0;
  background: rgba(23, 37, 61, 0.48);
  cursor: pointer;
}

.register-flow .register-contact-modal-dialog {
  position: relative;
  z-index: 1;
  width: min(100%, 440px);
  max-height: min(92vh, 640px);
  overflow: auto;
  padding: 22px 22px 18px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: #ffffff;
  box-shadow: 0 24px 64px rgba(42, 85, 165, 0.22);
}

.register-flow .register-addons-modal-root {
  z-index: 230;
}

.register-flow .register-addons-modal-dialog {
  width: min(100%, 520px);
  max-height: min(92dvh, 720px);
}

.register-flow .register-addons-modal-dialog .slider-section,
.register-flow .register-addons-page .slider-section {
  margin: 0 0 4px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  gap: 12px;
}

.register-flow .register-addons-modal-dialog .slider-stack,
.register-flow .register-addons-page .slider-stack {
  gap: 20px;
}

.register-flow .register-addons-modal-dialog .slider-card,
.register-flow .register-addons-page .slider-card {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  gap: 12px;
}

.register-flow .register-addons-modal-dialog .slider-card .slider-price-note,
.register-flow .register-addons-page .slider-card .slider-price-note {
  padding-top: 6px;
  border-top: 0;
}

.register-flow .register-addons-modal-dialog .slider-stack > .slider-card:first-child .slider-price-note,
.register-flow .register-addons-page .slider-stack > .slider-card:first-child .slider-price-note {
  justify-content: flex-end;
}

.register-flow .register-addons-page {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding-left: max(12px, env(safe-area-inset-left, 0px));
  padding-right: max(12px, env(safe-area-inset-right, 0px));
  padding-bottom: clamp(200px, 42vh, 360px);
}

.register-flow .register-feature-addons-end-sentinel {
  width: 100%;
  height: 1px;
  margin: 0;
  pointer-events: none;
}

.register-flow .register-addons-page #register-feature-add-ons {
  scroll-margin-top: 12px;
}

.register-flow .register-addons-page .feature-addons-list {
  grid-template-columns: 1fr;
}

.register-flow .register-addons-page .feature-addon-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: center;
  gap: 0;
}

.register-flow .register-addons-page .feature-addon-card-label {
  width: 100%;
  text-align: center;
  grid-template-columns: 1fr auto auto 1fr;
}

.register-flow .register-addons-page .feature-addon-card-label > input[type="checkbox"] {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
}

.register-flow .register-addons-page .feature-addon-card-label > .addon-price {
  grid-column: 3;
  grid-row: 1;
  justify-self: start;
}

.register-flow .register-addons-page .feature-addon-card-label > .addon-meta {
  grid-column: 1 / -1;
  grid-row: 2;
  justify-self: center;
}

.register-flow .register-addons-page .feature-addon-card .addon-meta {
  align-items: center;
  text-align: center;
}

.register-flow .register-addons-page .feature-addon-card .addon-price {
  margin: 0;
}

.register-flow .register-addons-back {
  display: inline-flex;
  margin: 0 0 18px;
  font-weight: 800;
}

@media (max-width: 1024px) {
  .register-flow .register-addons-back {
    display: none;
  }
}

.register-flow .register-contact-modal-title {
  margin: 0 0 8px;
  font-size: 1.35rem;
  font-weight: 900;
  letter-spacing: -0.04em;
  color: var(--text);
}

.register-flow .register-contact-modal-intro {
  margin: 0 0 16px;
  font-size: 0.92rem;
  line-height: 1.45;
  color: var(--muted);
}

.register-flow .register-contact-form.stack {
  display: flex;
  flex-direction: column;
}

.register-flow .register-contact-form.gap-md {
  gap: 12px;
}

.register-flow .register-contact-error {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 800;
  color: #b42318;
}

.register-flow .register-contact-modal-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.register-flow .register-contact-cancel {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--muted);
  font-weight: 800;
  padding: 10px 16px;
  border-radius: 12px;
  cursor: pointer;
  font-family: inherit;
}

.register-flow .register-contact-submit {
  border: 0;
  border-radius: 12px;
  padding: 10px 18px;
  background: linear-gradient(90deg, var(--blue), var(--blue-dark));
  color: #fff;
  font-weight: 900;
  cursor: pointer;
  font-family: inherit;
}

.register-flow .slider-section {
  display: grid;
  gap: 14px;
  width: 100%;
  padding: 18px;
  margin-bottom: 8px;
  border-radius: 22px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.74);
}

.register-flow .section-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.register-flow .section-divider::before, .register-flow .section-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: #dfe8f7;
}

.register-flow .slider-stack {
  display: grid;
  gap: 12px;
}

.register-flow .slider-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid #e8eef9;
  background: #ffffff;
}

.register-flow .slider-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
}

.register-flow .slider-meta {
  display: grid;
  gap: 4px;
}

.register-flow .slider-meta strong {
  font-size: 1rem;
  letter-spacing: -0.02em;
}

.register-flow .slider-meta span {
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.register-flow .slider-input-wrap {
  display: grid;
  gap: 8px;
}

.register-flow .slider-input-wrap input[type="range"] {
  --fill-pct: 0;
  --slider-track-h: 8px;
  --slider-thumb: 20px;
  --slider-thumb-r: calc(var(--slider-thumb) / 2);
  width: 100%;
  height: 28px;
  margin: 0;
  padding: 0;
  cursor: pointer;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
}

.register-flow .slider-input-wrap input[type="range"]::-webkit-slider-runnable-track {
  height: var(--slider-track-h);
  border-radius: 999px;
  border: none;
  background: linear-gradient(
    to right,
    var(--blue) 0,
    var(--blue) max(0px, calc(var(--fill-pct) * 1% - var(--slider-thumb-r))),
    #e8eef9 max(0px, calc(var(--fill-pct) * 1% - var(--slider-thumb-r))),
    #e8eef9 100%
  );
}

.register-flow .slider-input-wrap input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: var(--slider-thumb);
  height: var(--slider-thumb);
  margin-top: calc((var(--slider-track-h) - var(--slider-thumb)) / 2);
  border-radius: 50%;
  border: 2px solid #dbe4f5;
  background: #fff;
  box-shadow: 0 1px 3px rgba(23, 37, 61, 0.12);
  box-sizing: border-box;
}

.register-flow .slider-input-wrap input[type="range"]:focus-visible {
  outline: none;
}

.register-flow .slider-input-wrap input[type="range"]:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 3px rgba(47, 109, 246, 0.35), 0 1px 3px rgba(23, 37, 61, 0.12);
}

.register-flow .slider-input-wrap input[type="range"]::-moz-range-track {
  height: var(--slider-track-h);
  border-radius: 999px;
  border: none;
  background: linear-gradient(
    to right,
    var(--blue) 0,
    var(--blue) max(0px, calc(var(--fill-pct) * 1% - var(--slider-thumb-r))),
    #e8eef9 max(0px, calc(var(--fill-pct) * 1% - var(--slider-thumb-r))),
    #e8eef9 100%
  );
}

.register-flow .slider-input-wrap input[type="range"]::-moz-range-progress {
  height: var(--slider-track-h);
  border-radius: 999px;
  background: transparent;
}

.register-flow .slider-input-wrap input[type="range"]::-moz-range-thumb {
  width: var(--slider-thumb);
  height: var(--slider-thumb);
  border-radius: 50%;
  border: 2px solid #dbe4f5;
  background: #fff;
  box-shadow: 0 1px 3px rgba(23, 37, 61, 0.12);
  box-sizing: border-box;
  cursor: pointer;
}

.register-flow .slider-input-wrap input[type="range"]:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 3px rgba(47, 109, 246, 0.35), 0 1px 3px rgba(23, 37, 61, 0.12);
}

.register-flow .slider-scale {
  position: relative;
  min-height: 26px;
  margin-top: 2px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 800;
}

.register-flow .slider-scale-thumb {
  position: absolute;
  bottom: 0;
  z-index: 1;
  padding: 4px 9px;
  border-radius: 10px;
  background: rgba(47, 109, 246, 0.12);
  color: var(--blue);
  font-size: 0.74rem;
  font-weight: 900;
  white-space: nowrap;
  pointer-events: none;
  line-height: 1.2;
}

.register-flow .slider-price-note {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid #edf2fb;
}

.register-flow .slider-price-note span {
  color: var(--muted);
  font-size: 0.86rem;
  line-height: 1.4;
}

.register-flow .slider-price-note strong {
  color: var(--blue-dark);
  font-size: 0.95rem;
  white-space: nowrap;
}

.register-flow .addons-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0 2px;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.register-flow .addons-divider::before, .register-flow .addons-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: #dfe8f7;
}

@media (max-width: 560px) {
  .register-flow .slider-head, .register-flow .slider-price-note {
    grid-template-columns: 1fr;
    display: grid;
  }
}


.register-flow .total-note {
  font-weight: 500;
  color: var(--muted);
  margin-left: 4px;
}


.register-flow .feature-addons-section {
  display: grid;
  gap: 10px;
  width: 100%;
  margin-top: 6px;
  margin-bottom: 10px;
}

.register-flow .feature-addons-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 12px;
}

.register-flow .feature-addon-card {
  padding: 14px;
  background: white;
  border: 1px solid #e8eef9;
  border-radius: 16px;
  min-width: 0;
}

/* Checkbox + price on row 1 (grid columns keep price tight to checkbox); meta full width row 2. */
.register-flow .feature-addon-card-label {
  display: grid;
  grid-template-columns: auto minmax(0, max-content);
  grid-template-rows: auto auto;
  column-gap: 10px;
  row-gap: 12px;
  align-items: start;
  cursor: pointer;
  margin: 0;
  min-width: 0;
}

.register-flow .feature-addon-card-label > input[type="checkbox"] {
  grid-column: 1;
  grid-row: 1;
  justify-self: start;
  align-self: center;
}

.register-flow .feature-addon-card-label > .addon-price {
  grid-column: 2;
  grid-row: 1;
  justify-self: start;
  align-self: center;
  margin: 0;
}

.register-flow .feature-addon-card-label > .addon-meta {
  grid-column: 1 / -1;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
}

/* Custom add-on checkboxes: white fill when checked, blue border + blue tick (all viewports). */
.register-flow .feature-addon-card input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 2px solid #b8cce8;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;
}

.register-flow .feature-addon-card input[type="checkbox"]:hover {
  border-color: var(--blue);
}

.register-flow .feature-addon-card input[type="checkbox"]:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.28);
}

.register-flow .feature-addon-card input[type="checkbox"]:checked {
  background-color: #fff;
  border-color: var(--blue);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath stroke='%232f6df6' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M3.5 8.2 6.5 11.2 12.5 4.5'/%3E%3C/svg%3E");
  background-size: 16px 16px;
  background-position: center;
  background-repeat: no-repeat;
}

.register-flow .feature-addon-card input[type="checkbox"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 860px) {
  .register-flow .feature-addons-list {
    grid-template-columns: 1fr;
  }

  .register-flow .feature-addon-card-label {
    text-align: center;
    grid-template-columns: 1fr auto auto 1fr;
  }

  .register-flow .feature-addon-card-label > input[type="checkbox"] {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }

  .register-flow .feature-addon-card-label > .addon-price {
    grid-column: 3;
    grid-row: 1;
    justify-self: start;
  }

  .register-flow .feature-addon-card-label > .addon-meta {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-self: center;
    align-items: center;
    text-align: center;
  }
}


/* --------------------------------------------------------------------------
   Plan selection — modern Calendra registration layout
   Scoped so the account and billing steps keep their existing form styling.
   -------------------------------------------------------------------------- */
.register-flow.register-plan-selection-page {
  --max-width: 1280px;
  --register-gutter: max(20px, env(safe-area-inset-left, 0px));
  --register-gutter-right: max(20px, env(safe-area-inset-right, 0px));
  --panel: #ffffff;
  --border: #e3eaf5;
  --text: #14213a;
  --muted: #73819a;
  --blue: #2463eb;
  --blue-dark: #174dca;
  --blue-soft: #edf4ff;
  min-height: 100dvh;
  background:
    radial-gradient(circle at 9% 18%, rgba(59, 130, 246, 0.09), transparent 23%),
    radial-gradient(circle at 91% 72%, rgba(59, 130, 246, 0.07), transparent 24%),
    linear-gradient(180deg, #fbfdff 0%, #f4f8ff 100%);
}

.register-flow.register-plan-selection-page .topbar {
  min-height: 68px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(222, 231, 244, 0.85);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(16px);
}

.register-flow.register-plan-selection-page .brand-logo {
  width: 154px;
  max-height: 48px;
  object-position: left center;
}

.register-flow.register-plan-selection-page .content {
  padding: 12px 0 138px;
}

.register-flow.register-plan-selection-page .register-plan-page-stack {
  width: 100%;
}

.register-flow.register-plan-selection-page .layout {
  grid-template-columns: minmax(0, 2.05fr) minmax(330px, 0.95fr);
  grid-template-rows: auto auto;
  gap: 14px 24px;
  align-items: start;
  align-content: start;
  min-height: 0;
  height: auto;
}

.register-flow.register-plan-selection-page .layout > .register-stepper-row {
  grid-column: 1 / -1;
  justify-content: center;
  margin: 0 0 2px;
}

.register-flow.register-plan-selection-page .layout > .right-panel {
  grid-column: 1;
  grid-row: 2;
}

.register-flow.register-plan-selection-page .layout > .left-panel {
  grid-column: 2;
  grid-row: 2;
}

.register-flow.register-plan-selection-page .stepper {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  width: min(100%, 560px);
  gap: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.register-flow.register-plan-selection-page .stepper::before {
  content: "";
  position: absolute;
  top: 16px;
  left: 16.666%;
  right: 16.666%;
  height: 1px;
  background: #dbe4f1;
  z-index: 0;
}

.register-flow.register-plan-selection-page .step {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 3px 10px 8px;
  border-radius: 0;
  color: #8793a8;
  font-size: 0.84rem;
  font-weight: 700;
  background: transparent;
}

.register-flow.register-plan-selection-page .step.active {
  color: var(--blue);
  background: transparent;
}

.register-flow.register-plan-selection-page .step-number {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: 999px;
  border: 1px solid #d8e1ee;
  background: #fff;
  color: #7c899d;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
  font-size: 0.78rem;
  font-weight: 900;
}

.register-flow.register-plan-selection-page .step.active .step-number {
  border-color: var(--blue);
  background: var(--blue);
  color: #fff;
  box-shadow: 0 5px 14px rgba(36, 99, 235, 0.25);
}

.register-flow.register-plan-selection-page .step-label {
  background: #f8fbff;
  padding: 2px 5px;
  white-space: nowrap;
}

.register-flow.register-plan-selection-page .panel {
  border: 1px solid rgba(222, 231, 244, 0.98);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 16px 42px rgba(55, 83, 134, 0.08);
  backdrop-filter: blur(12px);
}

.register-flow.register-plan-selection-page .right-panel {
  padding: 18px;
  gap: 16px;
}

.register-flow.register-plan-selection-page .left-panel {
  top: 16px;
  padding: 20px;
}

.register-flow.register-plan-selection-page .plan-preview-heading {
  margin-bottom: 12px;
  font-size: 1.15rem;
  letter-spacing: -0.025em;
}

.register-flow.register-plan-selection-page .billing-toggle-wrap {
  gap: 10px;
}

.register-flow.register-plan-selection-page .billing-toggle {
  gap: 2px;
  padding: 3px;
  border-color: #dfe7f2;
  box-shadow: none;
}

.register-flow.register-plan-selection-page .billing-option {
  padding: 9px 16px;
  font-size: 0.84rem;
}

.register-flow.register-plan-selection-page .billing-option.active {
  box-shadow: 0 6px 16px rgba(36, 99, 235, 0.2);
}

.register-flow.register-plan-selection-page .annual-save {
  padding: 7px 11px;
  font-size: 0.75rem;
}

.register-flow.register-plan-selection-page .plans-grid {
  gap: 12px;
}

.register-flow.register-plan-selection-page .plan-card {
  min-height: 292px;
  padding: 16px 14px 14px;
  border-radius: 16px;
  border-color: #e2e9f3;
  background: #fff;
  box-shadow: 0 5px 16px rgba(45, 72, 120, 0.05);
  transform: none;
}

.register-flow.register-plan-selection-page .plan-card:hover,
.register-flow.register-plan-selection-page .plan-card:focus-visible {
  transform: translateY(-2px);
  border-color: #b9cdf9;
  box-shadow: 0 12px 25px rgba(36, 99, 235, 0.11);
}

.register-flow.register-plan-selection-page .plan-card.recommended {
  border: 1px solid #9eb9ff;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
}

.register-flow.register-plan-selection-page .plan-card.active {
  transform: none;
  border: 1.5px solid var(--blue);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(36, 99, 235, 0.08), 0 12px 26px rgba(36, 99, 235, 0.12);
}

.register-flow.register-plan-selection-page .badge-row {
  min-height: 22px;
  margin-bottom: 8px;
}

.register-flow.register-plan-selection-page .badge {
  padding: 5px 9px;
  font-size: 0.68rem;
}

.register-flow.register-plan-selection-page .plan-name {
  margin-bottom: 7px;
  font-size: 1.12rem;
  letter-spacing: -0.025em;
}

.register-flow.register-plan-selection-page .price-stack {
  gap: 4px;
  margin-bottom: 10px;
}

.register-flow.register-plan-selection-page .price {
  font-size: 1.8rem;
  letter-spacing: -0.055em;
}

.register-flow.register-plan-selection-page .per {
  margin-bottom: 2px;
  font-size: 0.78rem;
}

.register-flow.register-plan-selection-page .old-price {
  font-size: 0.8rem;
}

.register-flow.register-plan-selection-page .price-note {
  min-height: 39px;
  font-size: 0.77rem;
  line-height: 1.42;
}

.register-flow.register-plan-selection-page .mini-points {
  gap: 7px;
  margin-bottom: 14px;
}

.register-flow.register-plan-selection-page .mini-points div {
  gap: 7px;
  font-size: 0.79rem;
  line-height: 1.35;
}

.register-flow.register-plan-selection-page .check {
  width: 18px;
  height: 18px;
  flex-basis: 18px;
  background: #eefbf3;
  font-size: 0.7rem;
}

.register-flow.register-plan-selection-page .plan-button {
  min-height: 38px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 0.79rem;
}

.register-flow.register-plan-selection-page .plan-button.unselected {
  border-color: #cbdaf7;
}

.register-flow.register-plan-selection-page .plan-button.selected {
  background: linear-gradient(90deg, #2868ef, #1d55d6);
  box-shadow: 0 7px 17px rgba(36, 99, 235, 0.22);
}

.register-flow.register-plan-selection-page .custom-cta--inline {
  position: relative;
  margin: -2px 0 0;
  padding: 10px 14px;
  border-style: solid;
  border-color: #e0e8f4;
  border-radius: 11px;
  background: #fbfdff;
  font-size: 0.78rem;
}

.register-flow.register-plan-selection-page .custom-cta--inline::before {
  content: "◫";
  margin-right: 8px;
  color: #687893;
}

.register-flow.register-plan-selection-page .selected-box {
  gap: 12px;
  padding: 13px 14px;
  margin-bottom: 12px;
  border-color: #dfe7f3;
  border-radius: 12px;
  background: #fbfdff;
}

.register-flow.register-plan-selection-page .selected-box strong {
  font-size: 0.92rem;
}

.register-flow.register-plan-selection-page .selected-meta {
  font-size: 0.74rem;
  line-height: 1.45;
}

.register-flow.register-plan-selection-page .selected-price {
  font-size: 1.12rem;
  letter-spacing: -0.035em;
}

.register-flow.register-plan-selection-page .selected-subprice {
  font-size: 0.7rem;
}

.register-flow.register-plan-selection-page .feature-list {
  gap: 0;
}

.register-flow.register-plan-selection-page .feature-item,
.register-flow.register-plan-selection-page .feature-item.enabled {
  gap: 11px;
  padding: 10px 4px;
  border: 0;
  border-bottom: 1px solid #edf1f6;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform: none;
}

.register-flow.register-plan-selection-page .feature-item:last-child {
  border-bottom: 0;
}

.register-flow.register-plan-selection-page .feature-item .icon {
  width: 34px;
  height: 34px;
  flex-basis: 34px;
  border: 1px solid #e6ebf3;
  background: #f7f9fc;
}

.register-flow.register-plan-selection-page .feature-item .icon svg {
  width: 17px;
  height: 17px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.register-flow.register-plan-selection-page .feature-item.enabled .icon {
  border-color: #d8e6ff;
  background: #edf4ff;
  color: var(--blue);
}

.register-flow.register-plan-selection-page .feature-item .name {
  font-size: 0.78rem;
}

.register-flow.register-plan-selection-page .feature-item .desc {
  margin-top: 1px;
  font-size: 0.68rem;
  line-height: 1.35;
}

.register-flow.register-plan-selection-page .slider-section {
  gap: 12px;
  padding: 16px;
  margin: 0;
  border-radius: 15px;
  border-color: #e3eaf4;
  background: #fcfdff;
}

.register-flow.register-plan-selection-page .section-divider,
.register-flow.register-plan-selection-page .addons-divider {
  font-size: 0.67rem;
  letter-spacing: 0.08em;
}

.register-flow.register-plan-selection-page .slider-stack {
  gap: 0;
  border: 1px solid #e7edf6;
  border-radius: 13px;
  overflow: hidden;
  background: #fff;
}

.register-flow.register-plan-selection-page .slider-card {
  gap: 10px;
  padding: 14px;
  border: 0;
  border-bottom: 1px solid #edf1f6;
  border-radius: 0;
  background: #fff;
}

.register-flow.register-plan-selection-page .slider-card:last-child {
  border-bottom: 0;
}

.register-flow .slider-heading-group {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  min-width: 0;
}

.register-flow .register-usage-icon,
.register-flow .register-addon-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 10px;
  background: #edf4ff;
  color: var(--blue);
}

.register-flow .register-usage-icon {
  width: 36px;
  height: 36px;
}

.register-flow .register-addon-icon {
  width: 34px;
  height: 34px;
}

.register-flow .register-usage-icon svg,
.register-flow .register-addon-icon svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.register-flow .register-quantity-control {
  display: inline-grid;
  grid-template-columns: 30px minmax(34px, auto) 30px;
  align-items: center;
  border: 1px solid #dfe7f2;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  flex: 0 0 auto;
}

.register-flow .register-quantity-control button {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #64748b;
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.register-flow .register-quantity-control button:hover:not(:disabled) {
  background: #f3f7ff;
  color: var(--blue);
}

.register-flow .register-quantity-control button:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: -2px;
}

.register-flow .register-quantity-control button:disabled {
  color: #c9d1dd;
  cursor: not-allowed;
}

.register-flow .register-quantity-control strong {
  display: grid;
  place-items: center;
  min-height: 30px;
  border-left: 1px solid #edf1f6;
  border-right: 1px solid #edf1f6;
  font-size: 0.78rem;
  color: var(--text);
}

.register-flow.register-plan-selection-page .slider-meta {
  gap: 2px;
}

.register-flow.register-plan-selection-page .slider-meta strong {
  font-size: 0.82rem;
}

.register-flow.register-plan-selection-page .slider-meta span {
  font-size: 0.7rem;
  line-height: 1.35;
}

.register-flow.register-plan-selection-page .slider-input-wrap {
  gap: 4px;
}

.register-flow.register-plan-selection-page .slider-input-wrap input[type="range"] {
  --slider-track-h: 5px;
  --slider-thumb: 16px;
  height: 20px;
}

.register-flow.register-plan-selection-page .slider-scale {
  min-height: 21px;
  font-size: 0.68rem;
}

.register-flow.register-plan-selection-page .slider-scale-thumb {
  padding: 3px 7px;
  border-radius: 7px;
  font-size: 0.62rem;
}

.register-flow.register-plan-selection-page .slider-price-note {
  padding-top: 7px;
}

.register-flow.register-plan-selection-page .slider-price-note span {
  font-size: 0.67rem;
}

.register-flow.register-plan-selection-page .slider-price-note strong {
  font-size: 0.76rem;
}

.register-flow.register-plan-selection-page .feature-addons-section {
  gap: 8px;
  margin: 0;
}

.register-flow.register-plan-selection-page .feature-addons-list {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.register-flow.register-plan-selection-page .feature-addon-card {
  padding: 12px;
  border-radius: 13px;
  border-color: #e3eaf4;
  transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition);
}

.register-flow.register-plan-selection-page .feature-addon-card:hover {
  transform: translateY(-1px);
  border-color: #c9d8f6;
  box-shadow: 0 8px 18px rgba(45, 72, 120, 0.07);
}

.register-flow.register-plan-selection-page .feature-addon-card:has(input:checked) {
  border-color: #9eb9ff;
  background: #fbfdff;
  box-shadow: 0 0 0 2px rgba(36, 99, 235, 0.07);
}

.register-flow.register-plan-selection-page .feature-addon-card-label {
  grid-template-columns: 34px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 10px;
  row-gap: 3px;
  align-items: center;
}

.register-flow.register-plan-selection-page .feature-addon-card-label > .register-addon-icon {
  grid-column: 1;
  grid-row: 1 / 3;
}

.register-flow.register-plan-selection-page .feature-addon-card-label > .addon-meta {
  grid-column: 2;
  grid-row: 1;
  gap: 2px;
}

.register-flow.register-plan-selection-page .feature-addon-card-label > .addon-price {
  grid-column: 2;
  grid-row: 2;
  justify-self: start;
  font-size: 0.72rem;
}

.register-flow.register-plan-selection-page .feature-addon-card-label > input[type="checkbox"] {
  grid-column: 3;
  grid-row: 1 / 3;
  justify-self: end;
  align-self: start;
  width: 21px;
  height: 21px;
  border-width: 1.5px;
  border-radius: 6px;
}

.register-flow.register-plan-selection-page .addon-name {
  font-size: 0.76rem;
}

.register-flow.register-plan-selection-page .addon-desc {
  font-size: 0.65rem;
  line-height: 1.35;
}

.register-flow.register-plan-selection-page .register-fixed-footer {
  bottom: 12px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.register-flow.register-plan-selection-page .register-fixed-footer.is-expanded {
  box-shadow: none;
}

.register-flow.register-plan-selection-page .register-fixed-footer-inner.register-footer-panel {
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid rgba(219, 228, 241, 0.98);
  border-radius: 17px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 16px 42px rgba(32, 57, 102, 0.16);
  backdrop-filter: blur(16px);
}

.register-flow.register-plan-selection-page .register-footer-toolbar {
  min-height: 56px;
}

.register-flow.register-plan-selection-page .register-footer-center-cluster {
  width: 100%;
  max-width: none;
}

.register-flow.register-plan-selection-page .register-footer-toolbar-mid {
  width: 100%;
}

.register-flow.register-plan-selection-page .register-footer-pill {
  width: 100%;
  max-width: none;
  min-height: 48px;
  padding: 7px 10px;
  border: 0;
  border-radius: 11px;
  background: #f8faff;
}

.register-flow.register-plan-selection-page .register-footer-pill:hover {
  border-color: transparent;
  background: #f3f7ff;
  box-shadow: none;
}

.register-flow.register-plan-selection-page .register-footer-pill-title {
  font-size: 0.8rem;
}

.register-flow.register-plan-selection-page .register-footer-pill-sub {
  font-size: 0.66rem;
}

.register-flow.register-plan-selection-page .register-footer-pill-total-inline {
  min-width: 128px;
}

.register-flow.register-plan-selection-page .register-footer-pill-total-inline .register-footer-total-value {
  font-size: 1rem;
}

.register-flow.register-plan-selection-page .continue-button {
  min-height: 46px;
  min-width: 230px;
  padding: 12px 18px;
  border-radius: 11px;
  font-size: 0.8rem;
  box-shadow: 0 8px 20px rgba(36, 99, 235, 0.23);
}

.register-flow.register-plan-selection-page .register-footer-continue .continue-button:not(.continue-button-scroll-hint)::after {
  content: "→";
  margin-left: 12px;
  font-size: 1.05rem;
}

@media (max-width: 1180px) {
  .register-flow.register-plan-selection-page {
    --max-width: 1080px;
  }

  .register-flow.register-plan-selection-page .layout {
    grid-template-columns: minmax(0, 1.75fr) minmax(300px, 0.9fr);
    gap: 14px 18px;
  }

  .register-flow.register-plan-selection-page .right-panel,
  .register-flow.register-plan-selection-page .left-panel {
    padding: 16px;
  }

  .register-flow.register-plan-selection-page .plan-card {
    padding-left: 12px;
    padding-right: 12px;
  }
}

@media (max-width: 1024px) {
  .register-flow.register-plan-selection-page {
    --register-gutter: max(14px, env(safe-area-inset-left, 0px));
    --register-gutter-right: max(14px, env(safe-area-inset-right, 0px));
  }

  .register-flow.register-plan-selection-page .content {
    padding-bottom: 180px;
  }

  .register-flow.register-plan-selection-page .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .register-flow.register-plan-selection-page .layout > .register-stepper-row,
  .register-flow.register-plan-selection-page .layout > .right-panel,
  .register-flow.register-plan-selection-page .layout > .left-panel {
    grid-column: 1;
  }

  .register-flow.register-plan-selection-page .layout > .register-stepper-row {
    grid-row: 1;
  }

  .register-flow.register-plan-selection-page .layout > .right-panel {
    grid-row: 2;
  }

  .register-flow.register-plan-selection-page .layout > .left-panel {
    grid-row: 3;
  }

  .register-flow.register-plan-selection-page .panel {
    border: 1px solid rgba(222, 231, 244, 0.98);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 12px 30px rgba(55, 83, 134, 0.07);
  }

  .register-flow.register-plan-selection-page .right-panel {
    padding: 16px;
  }

  .register-flow.register-plan-selection-page .left-panel {
    position: static;
    padding: 16px;
  }

  .register-flow.register-plan-selection-page .stepper {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
  }

  .register-flow.register-plan-selection-page .step {
    padding-left: 4px;
    padding-right: 4px;
  }

  .register-flow.register-plan-selection-page .step-label {
    font-size: 0.72rem;
  }

  .register-flow.register-plan-selection-page .selected-box {
    display: flex;
  }

  .register-flow.register-plan-selection-page .feature-addons-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .register-flow.register-plan-selection-page .register-fixed-footer {
    bottom: 8px;
    width: calc(100% - var(--register-gutter) - var(--register-gutter-right));
  }

  .register-flow.register-plan-selection-page .register-footer-toolbar {
    flex-direction: row;
    align-items: center;
  }

  .register-flow.register-plan-selection-page .register-footer-toolbar-lead {
    display: none;
  }

  .register-flow.register-plan-selection-page .register-footer-center-cluster {
    flex: 1 1 auto;
    min-width: 0;
  }

  .register-flow.register-plan-selection-page .register-footer-continue {
    flex: 0 0 auto;
    margin: 0;
  }

  .register-flow.register-plan-selection-page .continue-button {
    min-width: 190px;
  }
}

@media (max-width: 760px) {
  .register-flow.register-plan-selection-page .topbar {
    min-height: 60px;
  }

  .register-flow.register-plan-selection-page .brand-logo {
    width: 132px;
  }

  .register-flow.register-plan-selection-page .stepper::before {
    left: 13%;
    right: 13%;
  }

  .register-flow.register-plan-selection-page .step {
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }

  .register-flow.register-plan-selection-page .step-label {
    white-space: normal;
    line-height: 1.2;
  }

  .register-flow.register-plan-selection-page .plans-grid {
    grid-template-columns: 1fr;
  }

  .register-flow.register-plan-selection-page .plan-card {
    min-height: 0;
  }

  .register-flow.register-plan-selection-page .billing-toggle-wrap {
    align-items: stretch;
  }

  .register-flow.register-plan-selection-page .billing-toggle {
    width: 100%;
  }

  .register-flow.register-plan-selection-page .billing-option {
    flex: 1 1 0;
  }

  .register-flow.register-plan-selection-page .annual-save {
    justify-content: center;
    width: 100%;
  }

  .register-flow.register-plan-selection-page .feature-addons-list {
    grid-template-columns: 1fr;
  }

  .register-flow.register-plan-selection-page .feature-addon-card-label {
    grid-template-columns: 34px minmax(0, 1fr) auto;
    text-align: left;
  }

  .register-flow.register-plan-selection-page .feature-addon-card-label > .register-addon-icon {
    grid-column: 1;
  }

  .register-flow.register-plan-selection-page .feature-addon-card-label > .addon-meta,
  .register-flow.register-plan-selection-page .feature-addon-card-label > .addon-price {
    grid-column: 2;
    justify-self: start;
    align-items: flex-start;
    text-align: left;
  }

  .register-flow.register-plan-selection-page .feature-addon-card-label > input[type="checkbox"] {
    grid-column: 3;
    justify-self: end;
  }

  .register-flow.register-plan-selection-page .register-footer-pill-total-inline {
    display: none;
  }

  .register-flow.register-plan-selection-page .continue-button {
    min-width: 0;
    padding-left: 14px;
    padding-right: 14px;
  }
}

@media (max-width: 560px) {
  .register-flow.register-plan-selection-page .content {
    padding-top: 8px;
    padding-bottom: 196px;
  }

  .register-flow.register-plan-selection-page .register-stepper-row {
    margin-bottom: 0;
  }

  .register-flow.register-plan-selection-page .step-number {
    width: 28px;
    height: 28px;
    flex-basis: 28px;
  }

  .register-flow.register-plan-selection-page .stepper::before {
    top: 14px;
  }

  .register-flow.register-plan-selection-page .right-panel,
  .register-flow.register-plan-selection-page .left-panel {
    padding: 13px;
    border-radius: 15px;
  }

  .register-flow.register-plan-selection-page .slider-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .register-flow.register-plan-selection-page .slider-price-note {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .register-flow.register-plan-selection-page .register-fixed-footer-inner.register-footer-panel {
    padding: 8px;
    border-radius: 14px;
  }

  .register-flow.register-plan-selection-page .register-footer-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .register-flow.register-plan-selection-page .register-footer-center-cluster,
  .register-flow.register-plan-selection-page .register-footer-continue {
    width: auto;
  }

  .register-flow.register-plan-selection-page .register-footer-pill {
    min-height: 44px;
    padding: 5px 8px;
  }

  .register-flow.register-plan-selection-page .register-footer-pill-title {
    font-size: 0.72rem;
  }

  .register-flow.register-plan-selection-page .register-footer-pill-sub {
    font-size: 0.61rem;
  }

  .register-flow.register-plan-selection-page .continue-button {
    min-height: 44px;
    font-size: 0.72rem;
  }

  .register-flow.register-plan-selection-page .register-footer-continue .continue-button:not(.continue-button-scroll-hint)::after {
    display: none;
  }
}

`
