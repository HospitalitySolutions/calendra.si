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
      --max-width: 1360px;
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
    }

    .register-flow { padding: 28px; }

    .register-flow .app {
      max-width: var(--max-width);
      margin: 0 auto;
      background: rgba(255,255,255,0.55);
      border: 1px solid rgba(223, 232, 247, 0.9);
      backdrop-filter: blur(14px);
      border-radius: 32px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .register-flow .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 22px 28px;
      border-bottom: 1px solid rgba(223, 232, 247, 0.75);
      background: rgba(255,255,255,0.38);
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
      padding: 30px 28px clamp(220px, 36vh, 340px);
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
      margin-bottom: 22px;
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

    .register-flow .recommendation {
      flex: 0 1 auto;
      min-width: 0;
      max-width: 100%;
      margin-left: auto;
      padding: 10px 18px;
      border: 1px solid #d4e1ff;
      background: linear-gradient(135deg, #eff5ff, #ffffff);
      border-radius: 999px;
      color: var(--blue-dark);
      font-weight: 900;
      font-size: 0.96rem;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .register-flow .layout {
      display: grid;
      grid-template-columns: minmax(350px, 0.96fr) minmax(500px, 1.28fr);
      gap: 22px;
      align-items: start;
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
    }

    .register-flow .right-panel {
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .register-flow .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--blue-soft);
      color: var(--blue);
      font-weight: 900;
      font-size: 0.86rem;
      margin-bottom: 14px;
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
      transform: translateX(3px);
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

    .register-flow .plan-desc {
      min-height: 66px;
      margin-bottom: 16px;
      color: var(--muted);
      line-height: 1.5;
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
      left: 28px;
      right: 28px;
      bottom: 0;
      width: auto;
      max-width: var(--max-width);
      margin-left: auto;
      margin-right: auto;
      z-index: 100;
      padding: 14px 22px calc(14px + env(safe-area-inset-bottom, 0px));
      background: rgba(255, 255, 255, 0.96);
      border-top: 1px solid rgba(223, 232, 247, 0.95);
      backdrop-filter: blur(16px);
      box-shadow: 0 -12px 40px rgba(42, 85, 165, 0.12);
      border-radius: 22px 22px 0 0;
    }

    .register-flow .register-fixed-footer.is-expanded {
      box-shadow: 0 -16px 48px rgba(42, 85, 165, 0.14);
    }

    .register-flow .register-fixed-footer-inner.register-footer-panel {
      max-width: var(--max-width);
      margin: 0 auto;
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
        align-items: center;
        gap: 12px 16px;
        flex-wrap: unset;
      }

      .register-flow .register-footer-back {
        justify-self: start;
      }

      .register-flow .register-footer-center-cluster {
        flex: unset;
        justify-self: center;
        max-width: min(100%, 960px);
      }

      .register-flow .register-footer-continue {
        justify-self: end;
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
      font-weight: 700;
      color: var(--muted);
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .register-flow .register-footer-total-block {
      flex: 0 1 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      min-width: 0;
      text-align: center;
    }

    .register-flow .register-footer-total-label {
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }

    .register-flow .register-footer-total-value {
      font-size: 1.25rem;
      font-weight: 900;
      letter-spacing: -0.04em;
      line-height: 1.1;
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

    @media (max-width: 1120px) {
      .register-flow .layout { grid-template-columns: 1fr; }
      .register-flow .left-panel { position: static; }
    }

    @media (max-width: 860px) {
      .register-flow { padding: 16px; }
      .register-flow .topbar, .register-flow .content { padding-left: 16px; padding-right: 16px; }
      .register-flow .register-fixed-footer {
        left: 16px;
        right: 16px;
        padding-left: 16px;
        padding-right: 16px;
      }
      .register-flow .register-stepper-row {
        flex-direction: column;
        align-items: stretch;
      }
      .register-flow .register-stepper-row .recommendation {
        max-width: none;
        margin-left: 0;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
      }
      .register-flow .plans-grid { grid-template-columns: 1fr; }
      .register-flow .plan-desc { min-height: auto; }
    }

    @media (max-width: 720px) {
      .register-flow .register-footer-toolbar {
        flex-direction: column;
        align-items: stretch;
      }
      .register-flow .register-footer-center-cluster {
        order: 2;
        flex: 0 0 auto;
        flex-direction: column;
        align-items: stretch;
        width: 100%;
      }
      .register-flow .register-footer-toolbar-mid {
        justify-content: stretch;
      }
      .register-flow .register-footer-pill {
        max-width: none;
        width: 100%;
      }
      .register-flow .register-footer-continue {
        order: 3;
        width: 100%;
      }
      .register-flow .register-footer-back {
        order: 1;
      }
    }

    @media (max-width: 560px) {
      .register-flow .register-footer-center-cluster {
        flex-direction: column;
        align-items: stretch;
      }
      .register-flow .register-footer-total-block {
        align-items: center;
        text-align: center;
      }
      .register-flow .content {
        padding-bottom: clamp(260px, 52vh, 420px);
      }
      .register-flow .app, .register-flow .panel { border-radius: 24px; }
      .register-flow .brand-logo { width: min(100%, 240px); max-height: 52px; }
      .register-flow .selected-box { flex-direction: column; align-items: flex-start; }
      .register-flow .selected-price-block { text-align: left; }
      .register-flow .continue-button, .register-flow .plan-button, .register-flow .billing-option { width: 100%; }
      .register-flow .billing-toggle {
        width: 100%;
        flex-direction: column;
        align-items: stretch;
        border-radius: 18px;
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

.register-flow .register-contact-modal-root {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
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

.register-flow .slider-value {
  white-space: nowrap;
  padding: 8px 11px;
  border-radius: 999px;
  background: var(--blue-soft);
  color: var(--blue);
  font-size: 0.82rem;
  font-weight: 900;
}

.register-flow .slider-input-wrap {
  display: grid;
  gap: 8px;
}

.register-flow .slider-input-wrap input[type="range"] {
  width: 100%;
  accent-color: var(--blue);
  cursor: pointer;
}

.register-flow .slider-scale {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 800;
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

  .register-flow .slider-value {
    justify-self: start;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.register-flow .feature-addon-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  background: white;
  border: 1px solid #e8eef9;
  border-radius: 16px;
}

.register-flow .feature-addon-card label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

.register-flow .feature-addon-card input {
  accent-color: var(--blue);
  margin-top: 2px;
}

@media (max-width: 860px) {
  .register-flow .feature-addons-list {
    grid-template-columns: 1fr;
  }
}

`
