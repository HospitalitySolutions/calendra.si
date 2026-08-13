export const registerOnboardingStyles = `
  .register-onboarding {
    --ro-bg: #f8faff;
    --ro-bg-soft: #f2f6fd;
    --ro-surface: rgba(255,255,255,.78);
    --ro-border: #dde5f2;
    --ro-border-strong: #cdd8e9;
    --ro-text: #111c31;
    --ro-muted: #6f7b91;
    --ro-blue: #1f6cf4;
    --ro-blue-dark: #1558d2;
    --ro-blue-soft: #eaf2ff;
    --ro-orange: #ff8a00;
    min-height: 100vh;
    min-height: 100dvh;
    background:
      radial-gradient(circle at 11% 16%, rgba(75,132,255,.055), transparent 25%),
      radial-gradient(circle at 88% 70%, rgba(75,132,255,.045), transparent 24%),
      linear-gradient(180deg, #fbfcff 0%, var(--ro-bg) 52%, #f7f9fd 100%);
    color: var(--ro-text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow-x: clip;
  }
  .register-onboarding * { box-sizing: border-box; }
  .register-onboarding button,
  .register-onboarding input { font: inherit; }
  .register-onboarding-shell {
    width: min(1560px, calc(100% - 64px));
    margin: 0 auto;
  }
  .register-onboarding-header {
    min-height: 104px;
    display: grid;
    grid-template-columns: minmax(210px,1fr) minmax(500px, 760px) minmax(210px,1fr);
    align-items: center;
    gap: 28px;
    border-bottom: 1px solid rgba(214,224,239,.8);
  }
  .register-onboarding-brand {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }
  .register-onboarding-brand img {
    width: 170px;
    max-width: 100%;
    height: auto;
    display: block;
  }
  .register-onboarding-steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-self: stretch;
  }
  .register-onboarding-step {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #8993a6;
    font-weight: 600;
    font-size: 1rem;
    min-width: 0;
  }
  .register-onboarding-step::after {
    content: "";
    position: absolute;
    height: 3px;
    left: 2px;
    right: 2px;
    bottom: 0;
    background: #e3e9f2;
    border-radius: 10px;
  }
  .register-onboarding-step.is-current,
  .register-onboarding-step.is-done { color: var(--ro-text); }
  .register-onboarding-step.is-current::after,
  .register-onboarding-step.is-done::after { background: var(--ro-blue); }
  .register-onboarding-step-circle {
    width: 38px;
    height: 38px;
    border: 1.5px solid #cbd5e4;
    border-radius: 999px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    font-weight: 700;
    background: rgba(255,255,255,.65);
  }
  .register-onboarding-step.is-current .register-onboarding-step-circle,
  .register-onboarding-step.is-done .register-onboarding-step-circle {
    color: #fff;
    background: linear-gradient(180deg, #3682ff, var(--ro-blue));
    border-color: transparent;
    box-shadow: 0 6px 16px rgba(31,108,244,.2);
  }
  .register-onboarding-continue {
    justify-self: end;
    min-width: 146px;
    height: 52px;
    padding: 0 24px;
    border: 0;
    border-radius: 14px;
    background: linear-gradient(180deg, #2f7cff, #1764ed);
    color: #fff;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(31,108,244,.18);
    transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
  }
  .register-onboarding-continue:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 11px 26px rgba(31,108,244,.24);
  }
  .register-onboarding-continue:disabled { opacity: .45; cursor: not-allowed; }
  .register-onboarding-main {
    padding: 70px 0 76px;
  }
  .register-onboarding-grid {
    display: grid;
    grid-template-columns: minmax(270px, .72fr) minmax(0, 1.75fr);
    gap: clamp(52px, 7vw, 118px);
    align-items: start;
  }
  .register-onboarding-intro { padding-top: 34px; }
  .register-onboarding-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--ro-blue);
    font-weight: 700;
    font-size: .84rem;
    letter-spacing: .08em;
    text-transform: uppercase;
    margin-bottom: 18px;
  }
  .register-onboarding-title {
    margin: 0;
    max-width: 520px;
    font-size: clamp(2.2rem, 3.25vw, 3.75rem);
    line-height: 1.08;
    letter-spacing: -.05em;
    font-weight: 720;
  }
  .register-onboarding-title::after {
    content: "";
    display: block;
    width: 48px;
    height: 4px;
    border-radius: 999px;
    background: var(--ro-blue);
    margin-top: 26px;
  }
  .register-onboarding-description {
    margin: 20px 0 0;
    color: var(--ro-muted);
    font-size: 1.08rem;
    line-height: 1.65;
    max-width: 450px;
  }
  .register-onboarding-info {
    margin-top: 34px;
    display: flex;
    gap: 13px;
    align-items: flex-start;
    padding: 17px 18px;
    max-width: 370px;
    border: 1px solid #dce6f6;
    border-radius: 16px;
    background: rgba(255,255,255,.42);
    color: #59677d;
    font-size: .94rem;
    line-height: 1.5;
  }
  .register-onboarding-info-icon {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 1.5px solid var(--ro-blue);
    border-radius: 999px;
    color: var(--ro-blue);
    font-weight: 750;
  }
  .register-onboarding-fields { min-width: 0; }
  .register-onboarding-section { margin-bottom: 40px; }
  .register-onboarding-label {
    display: block;
    margin-bottom: 12px;
    color: var(--ro-text);
    font-size: 1.05rem;
    font-weight: 650;
  }
  .register-onboarding-input {
    width: 100%;
    height: 66px;
    border: 1px solid #d7e0ec;
    border-radius: 15px;
    background: rgba(255,255,255,.65);
    color: var(--ro-text);
    padding: 0 20px;
    outline: none;
    box-shadow: 0 1px 0 rgba(255,255,255,.85) inset;
    transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
  }
  .register-onboarding-input::placeholder { color: #9aa5b7; }
  .register-onboarding-input:focus {
    border-color: rgba(31,108,244,.7);
    background: #fff;
    box-shadow: 0 0 0 4px rgba(31,108,244,.08);
  }
  .register-onboarding-error {
    margin-top: 10px;
    color: #c43b45;
    font-size: .9rem;
  }
  .register-user-slider-wrap { padding: 4px 14px 0; }
  .register-user-slider {
    --range-progress: 0%;
    width: 100%;
    height: 6px;
    appearance: none;
    -webkit-appearance: none;
    border-radius: 999px;
    outline: none;
    background: linear-gradient(90deg, var(--ro-blue) 0 var(--range-progress), #dce3ee var(--range-progress) 100%);
    cursor: pointer;
  }
  .register-user-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--ro-blue);
    border: 5px solid #fff;
    box-shadow: 0 0 0 2px var(--ro-blue), 0 4px 12px rgba(31,108,244,.18);
  }
  .register-user-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--ro-blue);
    border: 5px solid #fff;
    box-shadow: 0 0 0 2px var(--ro-blue), 0 4px 12px rgba(31,108,244,.18);
  }
  .register-user-slider-value {
    margin: 15px 0 0;
    color: var(--ro-blue);
    font-weight: 700;
    font-size: .98rem;
  }
  .register-user-slider-stops {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    margin-top: 14px;
    color: #5e687b;
    font-size: .82rem;
  }
  .register-user-slider-stops span { text-align: center; }
  .register-user-slider-stops span:first-child { text-align: left; }
  .register-user-slider-stops span:last-child { text-align: right; }
  .register-business-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0,1fr));
    gap: 16px;
  }
  .register-business-card,
  .register-addon-card {
    border: 1px solid var(--ro-border);
    background: rgba(255,255,255,.52);
    color: var(--ro-text);
    cursor: pointer;
    transition: border-color .15s ease, background .15s ease, box-shadow .15s ease, transform .15s ease;
  }
  .register-business-card:hover,
  .register-addon-card:hover { border-color: #b8c9e5; background: rgba(255,255,255,.82); }
  .register-business-card {
    min-height: 124px;
    border-radius: 16px;
    padding: 22px 24px;
    display: flex;
    align-items: center;
    gap: 20px;
    text-align: left;
    font-weight: 620;
    font-size: 1.02rem;
  }
  .register-business-card.is-selected,
  .register-addon-card.is-selected {
    border-color: var(--ro-blue);
    background: linear-gradient(180deg, rgba(242,247,255,.95), rgba(255,255,255,.9));
    box-shadow: 0 0 0 1px rgba(31,108,244,.08), 0 8px 24px rgba(31,108,244,.07);
  }
  .register-business-icon,
  .register-addon-icon-new {
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    color: var(--ro-blue);
  }
  .register-business-icon svg,
  .register-addon-icon-new svg { width: 100%; height: 100%; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; fill: none; }
  .register-onboarding-trust {
    margin-top: 52px;
    color: #8792a5;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: .92rem;
  }
  .register-onboarding-trust svg { width: 22px; height: 22px; color: var(--ro-blue); stroke: currentColor; fill: none; stroke-width: 1.8; }

  .register-addons-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .register-addon-card {
    min-height: 142px;
    border-radius: 17px;
    padding: 23px 24px;
    display: grid;
    grid-template-columns: 46px minmax(0,1fr) auto;
    gap: 18px;
    align-items: center;
    text-align: left;
  }
  .register-addon-card-title { display: block; font-size: 1.05rem; font-weight: 700; margin-bottom: 6px; }
  .register-addon-card-copy { display: block; color: var(--ro-muted); line-height: 1.45; font-size: .9rem; }
  .register-addon-switch {
    width: 48px;
    height: 28px;
    border-radius: 999px;
    background: #dce2ec;
    padding: 4px;
    transition: background .15s ease;
  }
  .register-addon-switch::after {
    content: "";
    display: block;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 2px 5px rgba(20,34,55,.15);
    transition: transform .15s ease;
  }
  .register-addon-card.is-selected .register-addon-switch { background: var(--ro-blue); }
  .register-addon-card.is-selected .register-addon-switch::after { transform: translateX(20px); }
  .register-addons-footer {
    margin-top: 34px;
    padding-top: 24px;
    border-top: 1px solid #dde5f0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    color: #7c879a;
    font-size: .91rem;
  }
  .register-addons-count {
    border: 1px solid #d9e2ee;
    border-radius: 13px;
    background: rgba(255,255,255,.5);
    padding: 13px 17px;
    color: #354157;
    font-weight: 620;
  }

  .register-account-layout {
    display: grid;
    grid-template-columns: minmax(0, .95fr) minmax(420px, .95fr);
    gap: clamp(70px, 9vw, 150px);
    align-items: start;
    padding-top: 12px;
  }
  .register-account-left { max-width: 670px; }
  .register-account-heading {
    margin: 0;
    font-size: clamp(2rem, 3vw, 3.1rem);
    line-height: 1.12;
    letter-spacing: -.045em;
  }
  .register-account-subtitle {
    margin: 15px 0 36px;
    color: var(--ro-muted);
    line-height: 1.6;
    max-width: 600px;
  }
  .register-account-field-new { margin-bottom: 20px; }
  .register-account-field-new label { display:block; margin-bottom: 10px; font-weight: 650; }
  .register-account-input-wrap { position: relative; }
  .register-account-input-wrap svg {
    position: absolute;
    width: 20px;
    height: 20px;
    left: 18px;
    top: 50%;
    transform: translateY(-50%);
    color: #7e8a9d;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
  }
  .register-account-input-wrap .register-onboarding-input { padding-left: 52px; }
  .register-account-primary {
    width: 100%;
    min-height: 58px;
    border: 0;
    border-radius: 14px;
    background: linear-gradient(180deg, #2e7dff, #1764ee);
    color: #fff;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(31,108,244,.16);
  }
  .register-account-primary:disabled { opacity: .5; cursor: not-allowed; }
  .register-account-divider-new {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 15px;
    color: #8792a3;
    font-size: .87rem;
    margin: 26px 0 20px;
  }
  .register-account-divider-new::before,
  .register-account-divider-new::after { content:""; height:1px; background:#dbe2ec; }
  .register-social-btn-new {
    width: 100%;
    min-height: 58px;
    border: 1px solid #d8e0eb;
    border-radius: 14px;
    background: rgba(255,255,255,.55);
    color: var(--ro-text);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 13px;
    font-weight: 650;
    cursor: pointer;
    margin-bottom: 14px;
    transition: background .15s ease, border-color .15s ease;
  }
  .register-social-btn-new:hover { background:#fff; border-color:#bdcbe0; }
  .register-social-btn-new svg { width: 20px; height: 20px; }
  .register-existing-account {
    margin-top: 26px;
    text-align: center;
    color: var(--ro-muted);
  }
  .register-existing-account button,
  .register-inline-link {
    border:0;
    background:transparent;
    color:var(--ro-blue);
    cursor:pointer;
    padding:0;
    font:inherit;
    text-decoration:none;
  }
  .register-account-legal {
    margin-top: 48px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    color: #8792a5;
    font-size: .88rem;
    line-height: 1.55;
  }
  .register-account-legal svg { width: 23px; height: 23px; flex:0 0 auto; color:var(--ro-blue); stroke:currentColor; fill:none; stroke-width:1.8; }
  .register-account-legal a { color:var(--ro-blue); text-decoration:none; }
  .register-account-right { padding-top: 10px; }
  .register-product-visual {
    position: relative;
    height: 350px;
    border-radius: 28px;
    overflow: hidden;
    background: radial-gradient(circle at 55% 60%, rgba(45,124,255,.19), transparent 36%);
  }
  .register-visual-calendar {
    position: absolute;
    width: 360px;
    height: 230px;
    left: 50%;
    top: 45%;
    transform: translate(-50%,-50%) rotate(5deg);
    border: 1px solid rgba(56,119,232,.19);
    border-radius: 18px;
    background: rgba(255,255,255,.58);
    box-shadow: 0 18px 48px rgba(47,111,222,.08);
    padding: 28px;
  }
  .register-visual-calendar::before {
    content:"";
    position:absolute;
    left:22px; right:22px; top:48px; bottom:22px;
    background:
      linear-gradient(90deg, transparent 18%, rgba(52,116,230,.08) 18% 20%, transparent 20% 38%, rgba(52,116,230,.08) 38% 40%, transparent 40% 58%, rgba(52,116,230,.08) 58% 60%, transparent 60% 78%, rgba(52,116,230,.08) 78% 80%, transparent 80%),
      linear-gradient(0deg, transparent 23%, rgba(52,116,230,.08) 23% 25%, transparent 25% 48%, rgba(52,116,230,.08) 48% 50%, transparent 50% 73%, rgba(52,116,230,.08) 73% 75%, transparent 75%);
  }
  .register-visual-chip {
    position:absolute;
    min-width: 142px;
    padding: 17px 18px;
    border:1px solid rgba(45,115,235,.18);
    border-radius:16px;
    background:rgba(255,255,255,.76);
    box-shadow:0 12px 28px rgba(47,111,222,.07);
  }
  .register-visual-chip strong { display:block; font-size:1.4rem; margin-bottom:4px; }
  .register-visual-chip span { color:#8792a5; font-size:.78rem; }
  .register-visual-chip--left { left:4%; bottom:52px; }
  .register-visual-chip--right { right:2%; top:124px; }
  .register-visual-check {
    position:absolute;
    left:56%; bottom:34px;
    width:68px; height:68px;
    border-radius:999px;
    display:grid; place-items:center;
    background:linear-gradient(180deg,#3b84ff,#1764ef);
    color:#fff;
    box-shadow:0 14px 32px rgba(31,108,244,.24);
    font-size:2rem;
    font-weight:800;
  }
  .register-benefits { margin-top: 8px; }
  .register-benefits h2 { margin:0 0 22px; font-size:1.22rem; letter-spacing:-.02em; }
  .register-benefit { display:grid; grid-template-columns:44px minmax(0,1fr); gap:14px; align-items:start; margin-bottom:20px; }
  .register-benefit-icon { width:42px; height:42px; display:grid; place-items:center; border-radius:999px; background:#eaf2ff; color:var(--ro-blue); }
  .register-benefit-icon svg { width:21px; height:21px; stroke:currentColor; fill:none; stroke-width:1.8; }
  .register-benefit strong { display:block; margin-bottom:3px; }
  .register-benefit p { margin:0; color:var(--ro-muted); font-size:.89rem; line-height:1.45; }
  .register-verification-box { margin-top: 24px; }
  .register-verification-pill {
    display:inline-flex; align-items:center; gap:9px; padding:10px 13px; border-radius:999px;
    background:#edf4ff; color:#2866cd; font-size:.9rem; margin-bottom:20px;
  }
  .register-verification-actions { display:grid; gap:12px; margin-top:18px; }
  .register-secondary-btn-new {
    width:100%; min-height:52px; border:1px solid #d8e0eb; border-radius:13px; background:rgba(255,255,255,.55); color:var(--ro-text); cursor:pointer; font-weight:620;
  }
  .register-form-error-new { margin:14px 0; padding:12px 14px; border-radius:12px; background:#fff0f1; border:1px solid #f1c8cd; color:#ad343e; font-size:.9rem; }

  @media (max-width: 1100px) {
    .register-onboarding-shell { width:min(100% - 40px, 1040px); }
    .register-onboarding-header { grid-template-columns: 160px 1fr 150px; gap:18px; }
    .register-onboarding-brand img { width:145px; }
    .register-onboarding-step { font-size:.9rem; gap:8px; }
    .register-onboarding-step-circle { width:32px; height:32px; }
    .register-onboarding-grid { grid-template-columns:1fr; gap:44px; }
    .register-onboarding-intro { padding-top:0; }
    .register-onboarding-title { max-width:720px; }
    .register-onboarding-description { max-width:720px; }
    .register-onboarding-info { max-width:520px; }
    .register-account-layout { grid-template-columns:1fr; gap:48px; }
    .register-account-left { max-width:760px; }
    .register-account-right { max-width:760px; width:100%; }
  }
  @media (max-width: 760px) {
    .register-onboarding-shell { width:min(100% - 28px, 720px); }
    .register-onboarding-header { min-height:auto; padding:15px 0 0; grid-template-columns:1fr auto; gap:14px; }
    .register-onboarding-brand img { width:132px; }
    .register-onboarding-continue { min-width:114px; height:46px; padding:0 16px; }
    .register-onboarding-steps { grid-column:1/-1; grid-row:2; min-height:62px; }
    .register-onboarding-step { font-size:.78rem; }
    .register-onboarding-step-circle { width:28px; height:28px; }
    .register-onboarding-main { padding:42px 0 56px; }
    .register-business-grid,
    .register-addons-grid { grid-template-columns:1fr; }
    .register-business-card { min-height:94px; }
    .register-addon-card { min-height:118px; }
    .register-user-slider-stops { font-size:.7rem; }
    .register-addons-footer { align-items:flex-start; flex-direction:column; }
    .register-product-visual { height:290px; }
    .register-visual-calendar { width:300px; height:190px; }
  }
  @media (max-width: 480px) {
    .register-onboarding-step-label { display:none; }
    .register-onboarding-steps { max-width:260px; justify-self:center; width:100%; }
    .register-onboarding-title { font-size:2.25rem; }
    .register-business-card { padding:18px; }
    .register-account-heading { font-size:2.1rem; }
    .register-visual-chip { min-width:115px; padding:12px; }
  }
`;
